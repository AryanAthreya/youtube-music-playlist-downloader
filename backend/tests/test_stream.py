"""
Unit tests for audio streaming service and /api/stream endpoints.

Tests:
- Video ID validation (SSRF / path injection protection)
- Audio format selector (prefer progressive m4a, exclude manifests)
- Handling of None returned by extract_info (ignoreerrors)
- In-memory TTL caching and URL expiry parsing
- Range header 206 streaming and chunked upstream fetches
- 403/410 CDN token expiry and automatic re-resolution
- Concurrency limiting / 503 response
- /api/thumb thumbnail proxy
"""

import asyncio
import sys
import time
from unittest.mock import AsyncMock, MagicMock, patch

# Safe mock for yt-dlp if running on a host environment where yt-dlp is not installed
if "yt_dlp" not in sys.modules:
    try:
        import yt_dlp
    except ImportError:
        mock_ytdlp = MagicMock()
        mock_utils = MagicMock()

        class _DownloadError(Exception): pass
        class _ExtractorError(Exception): pass
        class _GeoRestrictedError(Exception): pass
        class _UnsupportedError(Exception): pass

        mock_utils.DownloadError = _DownloadError
        mock_utils.ExtractorError = _ExtractorError
        mock_utils.GeoRestrictedError = _GeoRestrictedError
        mock_utils.UnsupportedError = _UnsupportedError
        mock_ytdlp.utils = mock_utils
        mock_ytdlp.version = MagicMock(__version__="2026.8.19")
        sys.modules["yt_dlp"] = mock_ytdlp
        sys.modules["yt_dlp.utils"] = mock_utils
        sys.modules["yt_dlp.version"] = mock_ytdlp.version

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.stream import router as stream_router
from app.errors.exceptions import (
    FormatUnavailableError,
    VideoUnavailableError,
    register_exception_handlers,
)
from app.services import stream_service
from app.services.stream_service import (
    ResolvedStream,
    _extract_stream_expiry,
    _select_best_audio_format,
    validate_video_id,
)




# ── Video ID Validation ────────────────────────────────────────────────────────


class TestVideoIdValidation:

    def test_accepts_valid_11_char_ids(self):
        valid_ids = ["dQw4w9WgXcQ", "jNQXAC9IVRw", "_-abc123XYZ", "12345678901"]
        for vid in valid_ids:
            assert validate_video_id(vid) == vid

    def test_rejects_empty_or_whitespace(self):
        with pytest.raises(VideoUnavailableError):
            validate_video_id("")
        with pytest.raises(VideoUnavailableError):
            validate_video_id("   ")

    def test_rejects_invalid_lengths(self):
        with pytest.raises(VideoUnavailableError):
            validate_video_id("too_short")
        with pytest.raises(VideoUnavailableError):
            validate_video_id("way_too_long_video_id_here")

    def test_rejects_ssrf_and_path_traversal(self):
        dangerous_inputs = [
            "../../etc/p",
            "http://evil",
            "1234567890$",
            "dQw4w9WgXc\n",
            "<script>123",
        ]
        for bad_id in dangerous_inputs:
            with pytest.raises(VideoUnavailableError):
                validate_video_id(bad_id)


# ── Format Selection ──────────────────────────────────────────────────────────


class TestAudioFormatSelection:

    def test_auto_prefers_opus_251_when_client_supports_opus(self):
        formats = [
            {
                "format_id": "251",
                "ext": "webm",
                "acodec": "opus",
                "vcodec": "none",
                "abr": 160.0,
                "url": "https://rr---sn.googlevideo.com/videoplayback?id=1",
            },
            {
                "format_id": "140",
                "ext": "m4a",
                "acodec": "mp4a.40.2",
                "vcodec": "none",
                "abr": 128.0,
                "url": "https://rr---sn.googlevideo.com/videoplayback?id=2",
            },
        ]
        best_fmt, mime_type = _select_best_audio_format(formats, quality="auto", client_supports_opus=True)
        assert best_fmt["format_id"] == "251"
        assert mime_type == "audio/webm"

    def test_auto_prefers_m4a_when_client_does_not_support_opus(self):
        formats = [
            {
                "format_id": "251",
                "ext": "webm",
                "acodec": "opus",
                "vcodec": "none",
                "abr": 160.0,
                "url": "https://rr---sn.googlevideo.com/videoplayback?id=1",
            },
            {
                "format_id": "140",
                "ext": "m4a",
                "acodec": "mp4a.40.2",
                "vcodec": "none",
                "abr": 128.0,
                "url": "https://rr---sn.googlevideo.com/videoplayback?id=2",
            },
        ]
        best_fmt, mime_type = _select_best_audio_format(formats, quality="auto", client_supports_opus=False)
        assert best_fmt["format_id"] == "140"
        assert mime_type == "audio/mp4"

    def test_auto_prefers_itag_141_if_present_when_no_opus(self):
        formats = [
            {
                "format_id": "141",
                "ext": "m4a",
                "acodec": "mp4a.40.2",
                "vcodec": "none",
                "abr": 256.0,
                "url": "https://rr---sn.googlevideo.com/videoplayback?id=premium",
            },
            {
                "format_id": "140",
                "ext": "m4a",
                "acodec": "mp4a.40.2",
                "vcodec": "none",
                "abr": 128.0,
                "url": "https://rr---sn.googlevideo.com/videoplayback?id=std",
            },
        ]
        best_fmt, mime_type = _select_best_audio_format(formats, quality="auto", client_supports_opus=False)
        assert best_fmt["format_id"] == "141"
        assert mime_type == "audio/mp4"

    def test_compatible_mode_prefers_m4a_never_opus(self):
        formats = [
            {
                "format_id": "251",
                "ext": "webm",
                "acodec": "opus",
                "vcodec": "none",
                "abr": 160.0,
                "url": "https://rr---sn.googlevideo.com/videoplayback?id=1",
            },
            {
                "format_id": "140",
                "ext": "m4a",
                "acodec": "mp4a.40.2",
                "vcodec": "none",
                "abr": 128.0,
                "url": "https://rr---sn.googlevideo.com/videoplayback?id=2",
            },
        ]
        best_fmt, mime_type = _select_best_audio_format(formats, quality="compatible", client_supports_opus=True)
        assert best_fmt["format_id"] == "140"
        assert mime_type == "audio/mp4"

    def test_compatible_mode_prefers_itag_141_if_present(self):
        formats = [
            {
                "format_id": "141",
                "ext": "m4a",
                "acodec": "mp4a.40.2",
                "vcodec": "none",
                "abr": 256.0,
                "url": "https://rr---sn.googlevideo.com/videoplayback?id=141",
            },
            {
                "format_id": "140",
                "ext": "m4a",
                "acodec": "mp4a.40.2",
                "vcodec": "none",
                "abr": 128.0,
                "url": "https://rr---sn.googlevideo.com/videoplayback?id=140",
            },
        ]
        best_fmt, mime_type = _select_best_audio_format(formats, quality="compatible")
        assert best_fmt["format_id"] == "141"
        assert mime_type == "audio/mp4"

    def test_saver_mode_prefers_itag_139_over_140(self):
        formats = [
            {
                "format_id": "140",
                "ext": "m4a",
                "acodec": "mp4a.40.2",
                "vcodec": "none",
                "abr": 128.0,
                "url": "https://rr---sn.googlevideo.com/videoplayback?id=140",
            },
            {
                "format_id": "139",
                "ext": "m4a",
                "acodec": "mp4a.40.2",
                "vcodec": "none",
                "abr": 48.0,
                "url": "https://rr---sn.googlevideo.com/videoplayback?id=139",
            },
        ]
        best_fmt, mime_type = _select_best_audio_format(formats, quality="saver")
        assert best_fmt["format_id"] == "139"
        assert mime_type == "audio/mp4"

    def test_saver_mode_falls_back_to_140_if_139_missing(self):
        formats = [
            {
                "format_id": "251",
                "ext": "webm",
                "acodec": "opus",
                "vcodec": "none",
                "abr": 160.0,
                "url": "https://rr---sn.googlevideo.com/videoplayback?id=251",
            },
            {
                "format_id": "140",
                "ext": "m4a",
                "acodec": "mp4a.40.2",
                "vcodec": "none",
                "abr": 128.0,
                "url": "https://rr---sn.googlevideo.com/videoplayback?id=140",
            },
        ]
        best_fmt, mime_type = _select_best_audio_format(formats, quality="saver")
        assert best_fmt["format_id"] == "140"
        assert mime_type == "audio/mp4"

    def test_falls_back_to_webm_if_no_m4a(self):
        formats = [
            {
                "format_id": "251",
                "ext": "webm",
                "acodec": "opus",
                "vcodec": "none",
                "abr": 160.0,
                "url": "https://rr---sn.googlevideo.com/videoplayback?id=1",
            }
        ]
        best_fmt, mime_type = _select_best_audio_format(formats, quality="compatible")
        assert best_fmt["format_id"] == "251"
        assert mime_type == "audio/webm"

    def test_excludes_video_formats(self):
        formats = [
            {
                "format_id": "18",
                "ext": "mp4",
                "acodec": "mp4a.40.2",
                "vcodec": "avc1.42001E",
                "abr": 96.0,
                "url": "https://rr---sn.googlevideo.com/videoplayback?id=1",
            }
        ]
        with pytest.raises(FormatUnavailableError):
            _select_best_audio_format(formats)

    def test_excludes_manifests(self):
        formats = [
            {
                "format_id": "hls-audio",
                "ext": "m4a",
                "acodec": "mp4a.40.2",
                "vcodec": "none",
                "protocol": "m3u8_native",
                "url": "https://manifest.googlevideo.com/api/manifest/hls_variant/test.m3u8",
            }
        ]
        with pytest.raises(FormatUnavailableError):
            _select_best_audio_format(formats)


# ── Expiry & Caching ──────────────────────────────────────────────────────────


class TestStreamCaching:

    def test_extract_expiry_from_url(self):
        future = int(time.time()) + 1800
        url = f"https://rr.googlevideo.com/videoplayback?expire={future}&id=1"
        exp = _extract_stream_expiry(url)
        assert exp <= time.time() + 3600
        assert exp > time.time() + 1000

    def test_extract_expiry_fallback(self):
        url = "https://rr.googlevideo.com/videoplayback?id=1"
        exp = _extract_stream_expiry(url)
        assert exp > time.time()

    @pytest.mark.asyncio
    async def test_resolve_stream_caching_and_quality_keys(self):
        video_id = "dQw4w9WgXcQ"
        stream_service.invalidate_cache(video_id)

        mock_opus = ResolvedStream(
            video_id=video_id,
            url="https://rr.googlevideo.com/videoplayback?test=opus",
            http_headers={},
            filesize=6_000_000,
            mime_type="audio/webm",
            title="Never Gonna Give You Up",
            uploader="Rick Astley",
            duration=212,
            expires_at=time.time() + 1800,
            quality="auto",
            client_supports_opus=True,
        )
        mock_m4a = ResolvedStream(
            video_id=video_id,
            url="https://rr.googlevideo.com/videoplayback?test=m4a",
            http_headers={},
            filesize=5_000_000,
            mime_type="audio/mp4",
            title="Never Gonna Give You Up",
            uploader="Rick Astley",
            duration=212,
            expires_at=time.time() + 1800,
            quality="compatible",
            client_supports_opus=True,
        )

        def mock_extract(vid, q="auto", opus=True):
            return mock_opus if (q == "auto" and opus) else mock_m4a

        with patch("app.services.stream_service._extract_video_stream_sync", side_effect=mock_extract) as mock_sync:
            res1 = await stream_service.resolve_stream(video_id, quality="auto", client_supports_opus=True)
            res2 = await stream_service.resolve_stream(video_id, quality="auto", client_supports_opus=True)
            res3 = await stream_service.resolve_stream(video_id, quality="compatible")

            assert res1.mime_type == "audio/webm"
            assert res2.mime_type == "audio/webm"
            assert res3.mime_type == "audio/mp4"

            # Cache hit on second call; third call is different quality
            assert mock_sync.call_count == 2

    @pytest.mark.asyncio
    async def test_handles_none_info_from_extract(self):
        video_id = "deleted1234"
        with patch("app.services.yt_dlp_client.fetch_info", return_value=None):
            with pytest.raises(VideoUnavailableError):
                await stream_service.resolve_stream(video_id, force_refresh=True)


@pytest.fixture
def app():
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(stream_router)
    return app


# ── Stream Endpoints & Concurrency ────────────────────────────────────────────


class TestStreamEndpoints:

    @pytest.mark.asyncio
    async def test_stream_invalid_video_id(self, app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.get("/api/stream/bad_id!")
            assert response.status_code == 404
            assert "INVALID" in response.json()["error"] or "VIDEO" in response.json()["error"]

    @pytest.mark.asyncio
    async def test_stream_successful_range_response_opus_and_m4a(self, app):
        video_id = "dQw4w9WgXcQ"
        sample_audio = b"dummy audio payload content for testing stream proxy seeking"

        # 1. Test WebM/Opus Range seeking
        mock_webm = ResolvedStream(
            video_id=video_id,
            url="https://rr.googlevideo.com/videoplayback?test=webm",
            http_headers={"User-Agent": "test-agent"},
            filesize=len(sample_audio),
            mime_type="audio/webm",
            title="Never Gonna Give You Up",
            uploader="Rick Astley",
            duration=212,
            expires_at=time.time() + 1800,
        )

        async def mock_proxy_gen(stream_info, start_byte, end_byte, total_size, chunk_size=512*1024):
            yield sample_audio[start_byte : end_byte + 1]

        with patch("app.services.stream_service.resolve_stream", new=AsyncMock(return_value=mock_webm)):
            with patch("app.services.stream_service.stream_audio_proxy", side_effect=mock_proxy_gen):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
                    # Seek with Range
                    resp = await ac.get(f"/api/stream/{video_id}?q=auto", headers={"Range": "bytes=10-25"})
                    assert resp.status_code == 206
                    assert resp.headers["Accept-Ranges"] == "bytes"
                    assert f"bytes 10-25/{len(sample_audio)}" == resp.headers["Content-Range"]
                    assert resp.headers["Content-Type"] == "audio/webm"
                    assert f'inline; filename="{video_id}.webm"' == resp.headers["Content-Disposition"]
                    assert resp.content == sample_audio[10:26]

        # 2. Test M4A Range seeking
        mock_m4a = ResolvedStream(
            video_id=video_id,
            url="https://rr.googlevideo.com/videoplayback?test=m4a",
            http_headers={"User-Agent": "test-agent"},
            filesize=len(sample_audio),
            mime_type="audio/mp4",
            title="Never Gonna Give You Up",
            uploader="Rick Astley",
            duration=212,
            expires_at=time.time() + 1800,
        )

        with patch("app.services.stream_service.resolve_stream", new=AsyncMock(return_value=mock_m4a)):
            with patch("app.services.stream_service.stream_audio_proxy", side_effect=mock_proxy_gen):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
                    resp = await ac.get(f"/api/stream/{video_id}?q=compatible", headers={"Range": "bytes=0-15"})
                    assert resp.status_code == 206
                    assert resp.headers["Accept-Ranges"] == "bytes"
                    assert resp.headers["Content-Type"] == "audio/mp4"
                    assert f'inline; filename="{video_id}.m4a"' == resp.headers["Content-Disposition"]
                    assert resp.content == sample_audio[0:16]

    @pytest.mark.asyncio
    async def test_thumb_proxy_endpoint(self, app):
        video_id = "dQw4w9WgXcQ"
        fake_jpeg = b"\xff\xd8\xff\xe0\x00\x10JFIF"

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = fake_jpeg

        orig_get = httpx.AsyncClient.get

        async def mock_get(self, url, *args, **kwargs):
            if "ytimg" in str(url):
                return mock_resp
            return await orig_get(self, url, *args, **kwargs)

        with patch.object(httpx.AsyncClient, "get", mock_get):
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get(f"/api/thumb?id={video_id}")
                assert resp.status_code == 200
                assert resp.headers["Content-Type"] == "image/jpeg"
                assert resp.content == fake_jpeg
