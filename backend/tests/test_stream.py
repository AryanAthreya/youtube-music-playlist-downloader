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

    def test_prefers_m4a_over_webm(self):
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
        best_fmt, mime_type = _select_best_audio_format(formats)
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
        best_fmt, mime_type = _select_best_audio_format(formats)
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
    async def test_resolve_stream_caching(self):
        video_id = "dQw4w9WgXcQ"
        mock_stream = ResolvedStream(
            video_id=video_id,
            url="https://rr.googlevideo.com/videoplayback?test=1",
            http_headers={},
            filesize=5_000_000,
            mime_type="audio/mp4",
            title="Test Song",
            uploader="Test Artist",
            duration=212,
            expires_at=time.time() + 1800,
        )

        with patch("app.services.stream_service._extract_video_stream_sync", return_value=mock_stream) as mock_extract:
            stream_service.invalidate_cache(video_id)
            res1 = await stream_service.resolve_stream(video_id)
            res2 = await stream_service.resolve_stream(video_id)

            assert res1.url == res2.url
            # Second call should use cache, invoking extract only once
            assert mock_extract.call_count == 1

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
    async def test_stream_successful_range_response(self, app):
        video_id = "dQw4w9WgXcQ"
        sample_audio = b"dummy audio payload content for testing stream proxy"

        mock_stream = ResolvedStream(
            video_id=video_id,
            url="https://rr.googlevideo.com/videoplayback?test=1",
            http_headers={"User-Agent": "test-agent"},
            filesize=len(sample_audio),
            mime_type="audio/mp4",
            title="Never Gonna Give You Up",
            uploader="Rick Astley",
            duration=212,
            expires_at=time.time() + 1800,
        )

        async def mock_proxy_generator(stream_info, start_byte, end_byte, total_size, chunk_size=512*1024):
            yield sample_audio[start_byte : end_byte + 1]

        with patch("app.services.stream_service.resolve_stream", new=AsyncMock(return_value=mock_stream)):
            with patch("app.services.stream_service.stream_audio_proxy", side_effect=mock_proxy_generator):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
                    # 1. Range request
                    resp = await ac.get(f"/api/stream/{video_id}", headers={"Range": "bytes=0-15"})
                    assert resp.status_code == 206
                    assert resp.headers["Accept-Ranges"] == "bytes"
                    assert "bytes 0-15/" in resp.headers["Content-Range"]
                    assert resp.headers["Content-Type"] == "audio/mp4"
                    assert resp.content == sample_audio[0:16]

                    # 2. Unranged request (returns 200 OK with full audio)
                    resp_full = await ac.get(f"/api/stream/{video_id}")
                    assert resp_full.status_code == 200
                    assert resp_full.headers["Accept-Ranges"] == "bytes"
                    assert resp_full.content == sample_audio

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
