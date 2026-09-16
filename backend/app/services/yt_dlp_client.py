"""
Thin wrapper around yt-dlp's YoutubeDL Python API.

NO FastAPI imports — this module is independently unit-testable.

All yt-dlp exceptions are caught here and re-raised as typed application
exceptions from app.errors.exceptions. Raw yt-dlp errors never propagate
to route handlers.

Deno is configured as the JS runtime for YouTube extraction (required for
yt-dlp >= 2025.11.12 with yt-dlp-ejs installed).
"""

import logging
import threading
from pathlib import Path
from typing import Any, Callable

import yt_dlp
from yt_dlp.utils import (
    DownloadError,
    ExtractorError,
    GeoRestrictedError,
    UnsupportedError,
)

from app.errors.exceptions import (
    ExtractionError,
    FormatUnavailableError,
    NetworkError,
    RegionRestrictedError,
    UnsupportedURLError,
    VideoUnavailableError,
)

logger = logging.getLogger(__name__)

# Type alias for yt-dlp progress hook callbacks
ProgressHook = Callable[[dict[str, Any]], None]


def _build_base_opts(
    socket_timeout: int = 30,
    retries: int = 3,
) -> dict[str, Any]:
    """Build the base yt-dlp options dict shared by all operations.

    Args:
        socket_timeout: Network socket timeout in seconds.
        retries: Number of retry attempts for failed downloads.

    Returns:
        dict: Base yt-dlp options dictionary.
    """
    return {
        # Timeouts and retries
        "socket_timeout": socket_timeout,
        "retries": retries,
        "fragment_retries": retries,
        # Logging: suppress yt-dlp's default stderr output; we handle logging
        "quiet": True,
        "no_warnings": False,
        "logger": _YtDlpLogger(logging.getLogger("yt_dlp")),
        # Never open a browser or prompt for user input
        "no_color": True,
        # Ensure filenames are safe for Windows host filesystem mounts
        "windowsfilenames": True,
    }


class _YtDlpLogger:
    """Adapts yt-dlp's logging interface to Python's standard logging module."""

    def __init__(self, logger: logging.Logger) -> None:
        self._logger = logger

    def debug(self, msg: str) -> None:
        self._logger.debug(msg)

    def info(self, msg: str) -> None:
        self._logger.info(msg)

    def warning(self, msg: str) -> None:
        self._logger.warning(msg)

    def error(self, msg: str) -> None:
        self._logger.error(msg)


def _map_yt_dlp_error(
    exc: Exception,
    url: str,
    job_id: str | None = None,
) -> Exception:
    """Map a raw yt-dlp exception to a typed application exception.

    Args:
        exc: The original yt-dlp exception.
        url: The URL being processed (for log context).
        job_id: Optional job ID for log correlation.

    Returns:
        Exception: A typed YTDLAppError subclass.
    """
    msg = str(exc).lower()

    if isinstance(exc, GeoRestrictedError):
        return RegionRestrictedError(
            "This video is not available in the server's region.",
            job_id=job_id,
            detail=str(exc),
        )

    if isinstance(exc, UnsupportedError):
        return UnsupportedURLError(
            "This URL is not supported by yt-dlp.",
            job_id=job_id,
            detail=str(exc),
        )

    # Check DownloadError messages for known patterns
    if isinstance(exc, (DownloadError, ExtractorError)):
        if any(kw in msg for kw in ("private", "unavailable", "deleted", "removed")):
            return VideoUnavailableError(
                "This video is unavailable (private, deleted, or removed).",
                job_id=job_id,
                detail=str(exc),
            )
        if "age" in msg and "restricted" in msg:
            return VideoUnavailableError(
                "This video is age-restricted and cannot be downloaded.",
                job_id=job_id,
                detail=str(exc),
            )
        if "geo" in msg or "region" in msg or "not available in your country" in msg:
            return RegionRestrictedError(
                "This video is not available in the server's region.",
                job_id=job_id,
                detail=str(exc),
            )
        if "requested format" in msg or "no video formats" in msg:
            return FormatUnavailableError(
                "The requested format is no longer available for this video.",
                job_id=job_id,
                detail=str(exc),
            )
        if any(kw in msg for kw in ("network", "timeout", "connection", "socket")):
            return NetworkError(
                "A network error occurred while contacting YouTube.",
                job_id=job_id,
                detail=str(exc),
            )

    return ExtractionError(
        "An unexpected error occurred while extracting video information.",
        job_id=job_id,
        detail=str(exc),
    )


def fetch_info(
    url: str,
    *,
    socket_timeout: int = 30,
    retries: int = 3,
) -> dict[str, Any]:
    """Fetch video or playlist metadata from yt-dlp without downloading.

    Calls yt-dlp in extract_info mode (download=False). For playlists,
    returns the full entry list. This is a blocking call — run it on a
    thread, not on the asyncio event loop.

    Args:
        url: Validated YouTube URL.
        socket_timeout: Network socket timeout in seconds.
        retries: Retry count for transient failures.

    Returns:
        dict: Raw yt-dlp info dictionary. Callers should use format_selector
              to extract structured format information from this dict.

    Raises:
        VideoUnavailableError: If the video is private, deleted, or age-restricted.
        RegionRestrictedError: If the video is geo-restricted.
        UnsupportedURLError: If yt-dlp cannot handle this URL type.
        ExtractionError: For unexpected yt-dlp failures.
        NetworkError: For network timeouts and connection failures.
    """
    from app.utils.url_validation import is_playlist_url

    opts = _build_base_opts(socket_timeout=socket_timeout, retries=retries)
    if is_playlist_url(url):
        opts.update({
            "extract_flat": "in_playlist",
            "skip_download": True,
            "noplaylist": False,
        })
    else:
        opts.update({
            "extract_flat": False,
            "skip_download": True,
            "noplaylist": True,
        })

    logger.info("Fetching info for URL: %s", url)
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if info is None:
                raise ExtractionError(
                    "yt-dlp returned no information for this URL.",
                    detail=f"extract_info returned None for {url}",
                )
            return info
    except (DownloadError, ExtractorError, GeoRestrictedError, UnsupportedError) as exc:
        raise _map_yt_dlp_error(exc, url) from exc
    except Exception as exc:
        logger.error("Unexpected yt-dlp error for %s: %s", url, exc, exc_info=True)
        raise ExtractionError(
            "An unexpected error occurred while fetching video information.",
            detail=str(exc),
        ) from exc


def download_video(
    url: str,
    format_selector: str,
    output_template: str,
    progress_hooks: list[ProgressHook],
    cancel_event: threading.Event,
    postprocessors: list[dict[str, Any]] | None = None,
    *,
    socket_timeout: int = 30,
    retries: int = 3,
    job_id: str | None = None,
) -> None:
    """Download a video using yt-dlp with the given format selector.

    This is a blocking call designed to run inside a ThreadPoolExecutor worker.
    It respects the cancel_event and raises CancelledError if set during download.

    Args:
        url: Validated YouTube URL.
        format_selector: yt-dlp format string (e.g. 'bestvideo[height<=1080]+bestaudio/best').
        output_template: yt-dlp output template string (full path template).
        progress_hooks: List of callables called by yt-dlp during download.
                        These are called on the worker thread, not the event loop.
        cancel_event: threading.Event; download stops if this is set.
        postprocessors: Optional list of yt-dlp postprocessor dicts.
        socket_timeout: Network socket timeout in seconds.
        retries: Retry count for transient failures.
        job_id: Optional job ID for log correlation.

    Raises:
        FormatUnavailableError: If the requested format is not available.
        VideoUnavailableError: If the video is unavailable.
        NetworkError: For network failures during download.
        ExtractionError: For unexpected yt-dlp failures.
        MergeError: If FFmpeg merging fails.
    """
    from app.errors.exceptions import CancelledError, MergeError

    opts = _build_base_opts(socket_timeout=socket_timeout, retries=retries)
    opts.update({
        "format": format_selector,
        "outtmpl": output_template,
        "progress_hooks": progress_hooks,
        "merge_output_format": "mp4",
        # Use FFmpeg for merging (installed in Docker image)
        "prefer_ffmpeg": True,
        "noplaylist": True,
    })

    if postprocessors:
        opts["postprocessors"] = postprocessors

    logger.info("Starting download: job_id=%s url=%s format=%s", job_id, url, format_selector)

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            # Check cancellation before starting
            if cancel_event.is_set():
                raise CancelledError("Job was cancelled before download started.", job_id=job_id)

            ydl.download([url])

            # Check cancellation after completion (in case event was set right at the end)
            if cancel_event.is_set():
                raise CancelledError("Job was cancelled.", job_id=job_id)

    except CancelledError:
        raise
    except (DownloadError, ExtractorError, GeoRestrictedError, UnsupportedError) as exc:
        mapped = _map_yt_dlp_error(exc, url, job_id=job_id)
        logger.error("Download error job_id=%s: %s", job_id, exc, exc_info=True)
        raise mapped from exc
    except Exception as exc:
        err_msg = str(exc).lower()
        if "ffmpeg" in err_msg or "merge" in err_msg or "mux" in err_msg:
            raise MergeError(
                "FFmpeg failed to merge audio and video streams.",
                job_id=job_id,
                detail=str(exc),
            ) from exc
        logger.error("Unexpected download error job_id=%s: %s", job_id, exc, exc_info=True)
        raise ExtractionError(
            "An unexpected error occurred during download.",
            job_id=job_id,
            detail=str(exc),
        ) from exc


def get_yt_dlp_version() -> str:
    """Return the installed yt-dlp version string.

    Returns:
        str: Version string like '2026.8.19'.
    """
    return yt_dlp.version.__version__


def search_youtube(query: str, limit: int = 15) -> list[dict[str, Any]]:
    """Search YouTube for videos using keywords and return top results.

    Args:
        query: Keywords search string (e.g. 'anuv jain songs').
        limit: Number of results to return (default 15).

    Returns:
        list[dict]: List of video item dicts with id, title, uploader, duration, thumbnail.
    """
    limit = max(1, min(limit, 30))
    search_term = f"ytsearch{limit}:{query}"
    opts = _build_base_opts()
    opts.update({
        "extract_flat": True,
        "skip_download": True,
    })

    logger.info("Searching YouTube: '%s' (limit=%d)", query, limit)
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(search_term, download=False)
            if not info:
                return []
            entries = info.get("entries", []) or []
            results = []
            for entry in entries:
                if not entry:
                    continue
                vid_id = entry.get("id") or entry.get("url")
                if not vid_id or len(vid_id) < 5:
                    continue
                thumbnails = entry.get("thumbnails") or []
                thumbnail_url = entry.get("thumbnail") or (thumbnails[-1].get("url") if thumbnails else None)
                if not thumbnail_url and vid_id:
                    thumbnail_url = f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg"

                results.append({
                    "video_id": vid_id,
                    "url": f"https://www.youtube.com/watch?v={vid_id}",
                    "title": entry.get("title") or "Unknown Title",
                    "uploader": entry.get("uploader") or entry.get("channel") or "Unknown Artist",
                    "duration": entry.get("duration"),
                    "thumbnail": thumbnail_url,
                    "view_count": entry.get("view_count"),
                })
            return results
    except Exception as exc:
        logger.error("Error searching YouTube for '%s': %s", query, exc, exc_info=True)
        return []
