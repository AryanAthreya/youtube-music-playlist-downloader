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
    format_id: str | None = None
    ext: str = "m4a"
    quality: str = "auto"
    client_supports_opus: bool = True


# Bounded in-memory TTL cache: "{video_id}:{quality}" -> ResolvedStream
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


def _select_best_audio_format(
    formats: list[dict],
    quality: str = "auto",
    client_supports_opus: bool = True,
) -> tuple[dict, str]:
    """Select progressive audio stream based on quality mode and client codec support.

    Modes:
    - 'auto': Prefer itag 251 (opus ~160k) if client signals opus support.
              Otherwise itag 141 if present (Premium ~256k AAC), then 140 (m4a 128k).
    - 'compatible': m4a/AAC only (itag 141 if present, then 140, then any m4a).
    - 'saver': Lowest-bitrate m4a (itag 139 ~48k, then 140).

    Returns:
        tuple[dict, str]: (selected format dict, mime_type)
    """
    quality = quality.lower().strip() if quality else "auto"
    if quality not in ("auto", "compatible", "saver"):
        quality = "auto"

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

        fmt_id = str(fmt.get("format_id") or "")
        ext = (fmt.get("ext") or "").lower()
        abr = float(fmt.get("abr") or 0.0)
        filesize = fmt.get("filesize") or fmt.get("filesize_approx") or 0

        candidates.append({
            "fmt": fmt,
            "format_id": fmt_id,
            "ext": ext,
            "acodec": str(acodec).lower(),
            "abr": abr,
            "filesize": filesize,
        })

    if not candidates:
        raise FormatUnavailableError("No direct progressive audio stream available for this video.")

    selected_fmt = None
    selected_ext = "m4a"

    if quality == "saver":
        # Lowest-bitrate m4a: prefer itag 139, then lowest abr m4a, then 140
        itag_139 = next((c for c in candidates if c["format_id"] == "139"), None)
        if itag_139:
            selected_fmt = itag_139["fmt"]
            selected_ext = itag_139["ext"]
        else:
            m4a_candidates = [
                c for c in candidates
                if c["ext"] in ("m4a", "mp4") or "mp4a" in c["acodec"] or "aac" in c["acodec"]
            ]
            if m4a_candidates:
                m4a_candidates.sort(key=lambda c: (c["abr"] if c["abr"] > 0 else 9999, c["filesize"]))
                selected_fmt = m4a_candidates[0]["fmt"]
                selected_ext = m4a_candidates[0]["ext"]
            else:
                candidates.sort(key=lambda c: (c["abr"] if c["abr"] > 0 else 9999, c["filesize"]))
                selected_fmt = candidates[0]["fmt"]
                selected_ext = candidates[0]["ext"]

    elif quality == "compatible":
        # m4a/AAC only: prefer itag 141 (Premium), then 140, then highest abr m4a
        itag_141 = next((c for c in candidates if c["format_id"] == "141"), None)
        itag_140 = next((c for c in candidates if c["format_id"] == "140"), None)
        if itag_141:
            selected_fmt = itag_141["fmt"]
            selected_ext = itag_141["ext"]
        elif itag_140:
            selected_fmt = itag_140["fmt"]
            selected_ext = itag_140["ext"]
        else:
            m4a_candidates = [
                c for c in candidates
                if c["ext"] in ("m4a", "mp4") or "mp4a" in c["acodec"] or "aac" in c["acodec"]
            ]
            if m4a_candidates:
                m4a_candidates.sort(key=lambda c: (c["abr"], c["filesize"]), reverse=True)
                selected_fmt = m4a_candidates[0]["fmt"]
                selected_ext = m4a_candidates[0]["ext"]
            else:
                candidates.sort(key=lambda c: (c["abr"], c["filesize"]), reverse=True)
                selected_fmt = candidates[0]["fmt"]
                selected_ext = candidates[0]["ext"]

    else:  # quality == "auto"
        if client_supports_opus:
            # Prefer itag 251 (opus ~160k)
            itag_251 = next((c for c in candidates if c["format_id"] == "251"), None)
            if not itag_251:
                itag_251 = next((c for c in candidates if "opus" in c["acodec"] and c["abr"] >= 120), None)

            if itag_251:
                selected_fmt = itag_251["fmt"]
                selected_ext = itag_251["ext"]
            else:
                itag_141 = next((c for c in candidates if c["format_id"] == "141"), None)
                itag_140 = next((c for c in candidates if c["format_id"] == "140"), None)
                if itag_141:
                    selected_fmt = itag_141["fmt"]
                    selected_ext = itag_141["ext"]
                elif itag_140:
                    selected_fmt = itag_140["fmt"]
                    selected_ext = itag_140["ext"]
                else:
                    candidates.sort(key=lambda c: (c["abr"], c["filesize"]), reverse=True)
                    selected_fmt = candidates[0]["fmt"]
                    selected_ext = candidates[0]["ext"]
        else:
            itag_141 = next((c for c in candidates if c["format_id"] == "141"), None)
            itag_140 = next((c for c in candidates if c["format_id"] == "140"), None)
            if itag_141:
                selected_fmt = itag_141["fmt"]
                selected_ext = itag_141["ext"]
            elif itag_140:
                selected_fmt = itag_140["fmt"]
                selected_ext = itag_140["ext"]
            else:
                m4a_candidates = [
                    c for c in candidates
                    if c["ext"] in ("m4a", "mp4") or "mp4a" in c["acodec"] or "aac" in c["acodec"]
                ]
                if m4a_candidates:
                    m4a_candidates.sort(key=lambda c: (c["abr"], c["filesize"]), reverse=True)
                    selected_fmt = m4a_candidates[0]["fmt"]
                    selected_ext = m4a_candidates[0]["ext"]
                else:
                    candidates.sort(key=lambda c: (c["abr"], c["filesize"]), reverse=True)
                    selected_fmt = candidates[0]["fmt"]
                    selected_ext = candidates[0]["ext"]

    acodec_str = str(selected_fmt.get("acodec") or "").lower()
    if selected_ext in ("webm", "opus") or "opus" in acodec_str:
        mime_type = "audio/webm"
    elif selected_ext in ("m4a", "mp4") or "mp4a" in acodec_str or "aac" in acodec_str:
        mime_type = "audio/mp4"
    else:
        mime_type = "audio/mp4"

    return selected_fmt, mime_type


def _extract_video_stream_sync(
    video_id: str,
    quality: str = "auto",
    client_supports_opus: bool = True,
) -> ResolvedStream:
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

    best_fmt, mime_type = _select_best_audio_format(
        formats,
        quality=quality,
        client_supports_opus=client_supports_opus,
    )

    stream_url = best_fmt.get("url")
    if not stream_url:
        raise FormatUnavailableError("Resolved format has no direct stream URL.")

    # Collect custom HTTP headers returned by yt-dlp extractor for this format
    headers = best_fmt.get("http_headers") or info.get("http_headers") or {}
    safe_headers = {}
    for k, v in headers.items():
        if k.lower() in ("user-agent", "accept-language"):
            safe_headers[k] = v

    filesize = best_fmt.get("filesize") or best_fmt.get("filesize_approx") or 0
    expires_at = _extract_stream_expiry(stream_url)
    fmt_id = best_fmt.get("format_id")
    ext = best_fmt.get("ext") or ("webm" if mime_type == "audio/webm" else "m4a")

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
        format_id=fmt_id,
        ext=ext,
        quality=quality,
        client_supports_opus=client_supports_opus,
    )


async def resolve_stream(
    video_id: str,
    quality: str = "auto",
    client_supports_opus: bool = True,
    force_refresh: bool = False,
) -> ResolvedStream:
    """Resolve direct audio stream metadata with quality-aware caching and TTL check."""
    validate_video_id(video_id)
    quality = quality.lower().strip() if quality else "auto"
    if quality not in ("auto", "compatible", "saver"):
        quality = "auto"

    now = time.time()
    if quality == "auto":
        cache_quality = "auto_opus" if client_supports_opus else "auto_m4a"
    else:
        cache_quality = quality
    cache_key = f"{video_id}:{cache_quality}"

    if not force_refresh:
        cached = _STREAM_CACHE.get(cache_key)
        if cached and cached.expires_at > (now + 60):  # At least 60s valid
            return cached

    loop = asyncio.get_running_loop()
    resolved = await loop.run_in_executor(
        _stream_executor,
        _extract_video_stream_sync,
        video_id,
        quality,
        client_supports_opus,
    )

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

    _STREAM_CACHE[cache_key] = resolved
    return resolved


def invalidate_cache(video_id: str) -> None:
    """Invalidate cache entries for this video_id across all quality variants."""
    keys_to_remove = [k for k in list(_STREAM_CACHE.keys()) if k == video_id or k.startswith(f"{video_id}:")]
    for k in keys_to_remove:
        _STREAM_CACHE.pop(k, None)


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
                        # Re-resolve once preserving quality and opus capability
                        fresh = await resolve_stream(
                            stream_info.video_id,
                            quality=stream_info.quality,
                            client_supports_opus=stream_info.client_supports_opus,
                            force_refresh=True,
                        )
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
