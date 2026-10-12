"""
Audio streaming service — on-demand audio URL resolution and proxying.

Features:
- Dedicated 2-worker ThreadPoolExecutor for yt-dlp metadata extraction
- In-memory bounded TTL cache for resolved YouTube CDN URLs
- Format selection favoring progressive m4a/AAC (iOS compatible, no transcoding)
- Upstream Range chunking via httpx.AsyncClient (bypasses YouTube CDN throttling)
- Upstream 403/410 expiry retry
- Client abort handling and concurrency limiting via Semaphore
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
import logging
from pathlib import Path
import re
import shutil
import time
from typing import AsyncGenerator
from urllib.parse import parse_qs, urlparse

import httpx

from app.config import get_settings
from app.errors.exceptions import (
    FormatUnavailableError,
    VideoUnavailableError,
)
from app.services import yt_dlp_client

logger = logging.getLogger(__name__)

# Strict 11-character YouTube video ID regex
VIDEO_ID_REGEX = re.compile(r"^[A-Za-z0-9_-]{11}$")

# Upstream chunk size for proxy streaming (512 KB)
# Keeps memory small while fetching enough data to avoid CDN stalls
_PROXY_CHUNK_SIZE = 512 * 1024

# Dedicated stream executor: separate from download executor to avoid blocking
_stream_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="ytdl-stream")

# Concurrency semaphore initialized lazily with config
_stream_semaphore: asyncio.Semaphore | None = None


@dataclass
class ResolvedStream:
    """Cached YouTube audio stream metadata."""

    video_id: str
    url: str
    http_headers: dict[str, str]
    filesize: int
    mime_type: str
    title: str
    uploader: str | None
    duration: int | None
    expires_at: float  # Unix timestamp


# Bounded in-memory TTL cache: video_id -> ResolvedStream
_STREAM_CACHE: dict[str, ResolvedStream] = {}
_MAX_CACHE_ENTRIES = 200
_DEFAULT_TTL_SECONDS = 1800  # 30 minutes fallback
_MAX_TTL_SECONDS = 3600  # 60 minutes hard cap


def get_stream_semaphore() -> asyncio.Semaphore:
    """Return the global stream concurrency semaphore."""
    global _stream_semaphore
    if _stream_semaphore is None:
        settings = get_settings()
        _stream_semaphore = asyncio.Semaphore(settings.max_concurrent_streams)
    return _stream_semaphore


def validate_video_id(video_id: str) -> str:
    """Strictly validate YouTube video ID format to prevent SSRF and injection."""
    if not video_id or not VIDEO_ID_REGEX.match(video_id):
        raise VideoUnavailableError(
            f"Invalid video_id: '{video_id}'. Must be an 11-character YouTube video ID."
        )
    return video_id


def _extract_stream_expiry(url: str) -> float:
    """Parse 'expire' timestamp from YouTube CDN query parameters."""
    try:
        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        if "expire" in params and params["expire"]:
            exp = float(params["expire"][0])
            now = time.time()
            # If the parsed expire time is in the future, respect it capped at max TTL
            if exp > now:
                return min(exp, now + _MAX_TTL_SECONDS)
    except Exception:
        pass
    return time.time() + _DEFAULT_TTL_SECONDS


def _select_best_audio_format(formats: list[dict]) -> tuple[dict, str]:
    """Select the best progressive audio stream.

    Preference order:
    1. Progressive HTTPS m4a (AAC) without video (format 140 or similar)
    2. Other progressive HTTPS audio-only formats (webm/opus)
    3. Exclude DASH / HLS manifests (protocol 'm3u8', 'http_dash_segments', etc.)

    Returns:
        tuple[dict, str]: (selected format dict, mime_type)
    """
    candidates = []
    for fmt in formats:
        # Must have an audio codec and no video
        vcodec = fmt.get("vcodec")
        acodec = fmt.get("acodec")
        if vcodec and vcodec != "none":
            continue
        if not acodec or acodec == "none":
            continue

        url = fmt.get("url")
        if not url or not url.startswith("https://"):
            continue

        protocol = fmt.get("protocol", "")
        # Exclude manifests
        if protocol in ("m3u8", "m3u8_native", "http_dash_segments"):
            continue
        if ".m3u8" in url or ".mpd" in url:
            continue

        ext = (fmt.get("ext") or "").lower()
        abr = fmt.get("abr") or 0.0
        filesize = fmt.get("filesize") or fmt.get("filesize_approx") or 0

        candidates.append((fmt, ext, abr, filesize))

    if not candidates:
        raise FormatUnavailableError("No direct progressive audio stream available for this video.")

    # Sort: prefer m4a over other formats, then by abr descending
    def sort_key(item):
        fmt, ext, abr, filesize = item
        ext_score = 2 if ext == "m4a" else (1 if ext in ("webm", "opus", "ogg") else 0)
        return (ext_score, abr, filesize)

    candidates.sort(key=sort_key, reverse=True)
    best_fmt, ext, _, _ = candidates[0]

    mime_type = "audio/mp4" if ext == "m4a" else ("audio/webm" if ext == "webm" else "audio/ogg")
    return best_fmt, mime_type


def _extract_video_stream_sync(video_id: str) -> ResolvedStream:
    """Synchronous extraction of video audio stream via yt-dlp."""
    settings = get_settings()
    url = f"https://www.youtube.com/watch?v={video_id}"

    info = yt_dlp_client.fetch_info(
        url,
        socket_timeout=settings.ytdlp_socket_timeout,
        retries=settings.ytdlp_retries,
    )

    # Handle ignoreerrors: True returning None
    if not info:
        raise VideoUnavailableError(f"Video {video_id} is unavailable, deleted, or private.")

    formats = info.get("formats", [])
    if not formats:
        raise FormatUnavailableError(f"No streams found for video {video_id}.")

    best_fmt, mime_type = _select_best_audio_format(formats)

    stream_url = best_fmt.get("url")
    if not stream_url:
        raise FormatUnavailableError("Resolved format has no direct stream URL.")

    # Collect custom HTTP headers returned by yt-dlp extractor for this format
    headers = best_fmt.get("http_headers") or info.get("http_headers") or {}
    # Keep only safe user headers (e.g. User-Agent)
    safe_headers = {}
    for k, v in headers.items():
        if k.lower() in ("user-agent", "accept-language"):
            safe_headers[k] = v

    filesize = best_fmt.get("filesize") or best_fmt.get("filesize_approx") or 0
    expires_at = _extract_stream_expiry(stream_url)

    return ResolvedStream(
        video_id=video_id,
        url=stream_url,
        http_headers=safe_headers,
        filesize=filesize,
        mime_type=mime_type,
        title=info.get("title") or "YouTube Audio",
        uploader=info.get("uploader") or info.get("channel"),
        duration=info.get("duration"),
        expires_at=expires_at,
    )


async def resolve_stream(video_id: str, force_refresh: bool = False) -> ResolvedStream:
    """Resolve direct audio stream metadata with caching and TTL check."""
    validate_video_id(video_id)
    now = time.time()

    if not force_refresh:
        cached = _STREAM_CACHE.get(video_id)
        if cached and cached.expires_at > (now + 60):  # At least 60s valid
            return cached

    loop = asyncio.get_running_loop()
    resolved = await loop.run_in_executor(_stream_executor, _extract_video_stream_sync, video_id)

    # Evict if cache exceeds max size
    if len(_STREAM_CACHE) >= _MAX_CACHE_ENTRIES:
        expired_keys = [k for k, v in _STREAM_CACHE.items() if v.expires_at <= now]
        if expired_keys:
            for k in expired_keys:
                _STREAM_CACHE.pop(k, None)
        else:
            # Drop oldest 20 entries
            for k in list(_STREAM_CACHE.keys())[:20]:
                _STREAM_CACHE.pop(k, None)

    _STREAM_CACHE[video_id] = resolved
    return resolved


def invalidate_cache(video_id: str) -> None:
    """Invalidate cache entry on 403 or 410 from upstream."""
    _STREAM_CACHE.pop(video_id, None)


async def stream_audio_proxy(
    stream_info: ResolvedStream,
    start_byte: int,
    end_byte: int,
    total_size: int,
    chunk_size: int = _PROXY_CHUNK_SIZE,
) -> AsyncGenerator[bytes, None]:
    """Stream audio from YouTube CDN in ranged chunks.

    Even if the client requested the whole file, this fetches upstream in
    sequential ranged chunks of size `chunk_size` to bypass YouTube's bandwidth
    throttling on unranged HTTP GETs.
    """
    headers = {
        "User-Agent": stream_info.http_headers.get(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
    }

    current_pos = start_byte

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=30.0)) as client:
        while current_pos <= end_byte:
            chunk_end = min(current_pos + chunk_size - 1, end_byte)
            range_header = f"bytes={current_pos}-{chunk_end}"
            req_headers = {**headers, "Range": range_header}

            try:
                async with client.stream("GET", stream_info.url, headers=req_headers) as response:
                    if response.status_code in (403, 410):
                        logger.warning(
                            "YouTube CDN token expired for video %s (%d). Triggering re-resolution.",
                            stream_info.video_id,
                            response.status_code,
                        )
                        invalidate_cache(stream_info.video_id)
                        # Re-resolve once
                        fresh = await resolve_stream(stream_info.video_id, force_refresh=True)
                        stream_info.url = fresh.url
                        # Retry current chunk with fresh URL
                        async with client.stream("GET", fresh.url, headers=req_headers) as retry_resp:
                            retry_resp.raise_for_status()
                            async for chunk in retry_resp.aiter_bytes():
                                yield chunk
                                current_pos += len(chunk)
                        continue

                    response.raise_for_status()
                    async for chunk in response.aiter_bytes():
                        yield chunk
                        current_pos += len(chunk)
            except asyncio.CancelledError:
                logger.debug("Client aborted stream playback for %s", stream_info.video_id)
                raise
            except Exception as exc:
                logger.error("Error streaming chunk %s for %s: %s", range_header, stream_info.video_id, exc)
                raise


def cleanup_stale_temp_files() -> int:
    """Clean up stale orphaned directories/files in downloads/temp on startup."""
    settings = get_settings()
    temp_dir = settings.temp_dir
    if not temp_dir.exists():
        return 0

    max_age_seconds = settings.temp_cleanup_hours * 3600
    now = time.time()
    deleted_count = 0

    for item in temp_dir.iterdir():
        try:
            mtime = item.stat().st_mtime
            if (now - mtime) > max_age_seconds:
                if item.is_dir():
                    shutil.rmtree(item, ignore_errors=True)
                else:
                    item.unlink(missing_ok=True)
                deleted_count += 1
        except Exception as exc:
            logger.warning("Failed to clean up stale temp item %s: %s", item, exc)

    if deleted_count > 0:
        logger.info("Cleaned up %d stale items in %s (>%dh old)", deleted_count, temp_dir, settings.temp_cleanup_hours)
    return deleted_count
