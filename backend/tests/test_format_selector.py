"""
Unit tests for format_selector.py.

Tests the pure format selection logic including:
- Extracting available video formats
- Extracting audio options
- Building format selectors with the fallback chain
- Edge cases: empty format lists, height mismatches, unknown format IDs
"""

import pytest

from app.errors.exceptions import FormatUnavailableError
from app.services.format_selector import (
    build_format_selector,
    extract_audio_options,
    extract_available_formats,
    get_format_estimated_size,
)

# ── Fixtures ──────────────────────────────────────────────────────────────────


def make_info(formats: list[dict]) -> dict:
    """Build a minimal yt-dlp info dict with the given formats."""
    return {"id": "test123", "title": "Test Video", "formats": formats}


def make_video_format(
    format_id: str = "137",
    height: int = 1080,
    width: int = 1920,
    ext: str = "mp4",
    vcodec: str = "avc1",
    acodec: str = "none",
    filesize: int | None = None,
) -> dict:
    return {
        "format_id": format_id,
        "height": height,
        "width": width,
        "ext": ext,
        "vcodec": vcodec,
        "acodec": acodec,
        "filesize": filesize,
        "tbr": 4000.0,
    }


def make_audio_format(
    format_id: str = "140",
    ext: str = "m4a",
    acodec: str = "mp4a.40.2",
    abr: float = 128.0,
    filesize: int | None = 5_000_000,
) -> dict:
    return {
        "format_id": format_id,
        "ext": ext,
        "vcodec": "none",
        "acodec": acodec,
        "abr": abr,
        "filesize": filesize,
    }


# ── extract_available_formats ────────────────────────────────────────────────


class TestExtractAvailableFormats:

    def test_returns_only_video_formats(self):
        """Audio-only formats must be excluded."""
        info = make_info([
            make_video_format("137", height=1080),
            make_audio_format("140"),  # audio-only
        ])
        result = extract_available_formats(info)
        assert len(result) == 1
        assert result[0].format_id == "137"

    def test_sorted_by_height_descending(self):
        """Formats are returned highest resolution first."""
        info = make_info([
            make_video_format("134", height=360),
            make_video_format("137", height=1080),
            make_video_format("135", height=480),
        ])
        result = extract_available_formats(info)
        heights = [f.height for f in result]
        assert heights == sorted(heights, reverse=True)

    def test_deduplicates_same_height(self):
        """Only one format per unique height is returned."""
        info = make_info([
            make_video_format("137", height=1080),
            make_video_format("248", height=1080, ext="webm", vcodec="vp9"),
        ])
        result = extract_available_formats(info)
        assert len(result) == 1
        assert result[0].height == 1080

    def test_empty_formats(self):
        """Empty format list returns empty result."""
        result = extract_available_formats(make_info([]))
        assert result == []

    def test_formats_without_height(self):
        """Formats with no height field are included but sorted last."""
        info = make_info([
            make_video_format("137", height=1080),
            {**make_video_format("sb3"), "height": None, "width": None},
        ])
        result = extract_available_formats(info)
        assert result[0].height == 1080


# ── extract_audio_options ────────────────────────────────────────────────────


class TestExtractAudioOptions:

    def test_returns_only_audio_formats(self):
        """Video formats must be excluded."""
        info = make_info([
            make_video_format("137", height=1080),
            make_audio_format("140"),
        ])
        result = extract_audio_options(info)
        assert len(result) == 1
        assert result[0].format_id == "140"

    def test_sorted_by_bitrate_descending(self):
        """Audio options are sorted by bitrate, highest first."""
        info = make_info([
            make_audio_format("251", abr=160.0, acodec="opus"),
            make_audio_format("140", abr=128.0, acodec="mp4a"),
            make_audio_format("250", abr=64.0, acodec="opus"),
        ])
        result = extract_audio_options(info)
        assert result[0].abr == 160.0
        assert result[-1].abr == 64.0

    def test_excludes_formats_with_video(self):
        """Formats with vcodec != 'none' are excluded."""
        info = make_info([
            {**make_video_format("137"), "acodec": "mp4a", "vcodec": "avc1"},
        ])
        result = extract_audio_options(info)
        assert result == []

    def test_empty_formats(self):
        info = make_info([])
        assert extract_audio_options(info) == []


# ── build_format_selector ────────────────────────────────────────────────────


class TestBuildFormatSelector:

    def test_video_exact_height_match(self):
        """Exact height match uses height= constraint in selector."""
        info = make_info([
            make_video_format("137", height=1080),
            make_audio_format("140"),
        ])
        selector = build_format_selector("video", "1080", info)
        assert "1080" in selector

    def test_video_fallback_to_lower_height(self):
        """When requested height is unavailable, falls back to next lower."""
        info = make_info([
            make_video_format("136", height=720),
            make_video_format("135", height=480),
            make_audio_format("140"),
        ])
        # Request 1080p which doesn't exist — should fall back
        selector = build_format_selector("video", "1080", info)
        assert selector  # Some selector is returned
        assert "bestvideo" in selector.lower() or "720" in selector

    def test_video_falls_back_to_best_when_nothing_below(self):
        """When only higher-res formats exist, uses bestvideo+bestaudio."""
        info = make_info([
            make_video_format("137", height=1080),
            make_audio_format("140"),
        ])
        # Request 360p which doesn't exist and no lower options
        selector = build_format_selector("video", "360", info)
        assert "bestvideo" in selector.lower()

    def test_video_format_id_passthrough(self):
        """A specific format_id is passed through to the selector."""
        info = make_info([
            make_video_format("137", height=1080),
            make_audio_format("140"),
        ])
        selector = build_format_selector("video", "137", info)
        assert "137" in selector

    def test_video_raises_when_no_formats(self):
        """Raises FormatUnavailableError if no video formats exist."""
        info = make_info([make_audio_format("140")])
        with pytest.raises(FormatUnavailableError):
            build_format_selector("video", "1080", info)

    def test_audio_format_id_passthrough(self):
        """A specific audio format_id is returned as-is."""
        info = make_info([make_audio_format("140")])
        selector = build_format_selector("audio", "140", info)
        assert selector == "140"

    def test_audio_falls_back_to_bestaudio(self):
        """If audio format_id not found, falls back to bestaudio."""
        info = make_info([make_audio_format("140")])
        selector = build_format_selector("audio", "999", info)
        assert "bestaudio" in selector

    def test_audio_raises_when_no_audio_formats(self):
        """Raises FormatUnavailableError if no audio formats exist at all."""
        info = make_info([make_video_format("137")])
        with pytest.raises(FormatUnavailableError):
            build_format_selector("audio", "140", info)


# ── get_format_estimated_size ─────────────────────────────────────────────────


class TestGetFormatEstimatedSize:

    def test_returns_filesize_by_format_id(self):
        info = make_info([make_video_format("137", height=1080, filesize=50_000_000)])
        size = get_format_estimated_size("137", info, "video")
        assert size == 50_000_000

    def test_returns_filesize_by_height(self):
        info = make_info([make_video_format("137", height=1080, filesize=50_000_000)])
        size = get_format_estimated_size("1080", info, "video")
        assert size == 50_000_000

    def test_returns_none_when_no_match(self):
        info = make_info([make_video_format("137", height=1080)])
        size = get_format_estimated_size("999", info, "video")
        assert size is None
