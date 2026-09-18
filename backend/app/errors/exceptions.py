"""
Custom exception classes and FastAPI exception handler registration.

Defines a typed exception hierarchy so that route handlers and services
can raise specific, meaningful exceptions. A single registered handler
maps each type to the appropriate HTTP status code and clean JSON response.

Never lets raw yt-dlp or FFmpeg tracebacks reach the client.
All exceptions are logged server-side with job_id for correlation.
"""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Custom Exception Classes
# ─────────────────────────────────────────────────────────────────────────────


class YTDLAppError(Exception):
    """Base class for all application exceptions.

    Args:
        message: Human-readable error description for the API response.
        job_id: Optional job ID for log correlation.
        detail: Optional additional internal detail (logged, not sent to client).
    """

    http_status: int = 500
    error_code: str = "INTERNAL_ERROR"

    def __init__(
        self,
        message: str,
        *,
        job_id: str | None = None,
        detail: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.job_id = job_id
        self.detail = detail


class InvalidURLError(YTDLAppError):
    """Raised when the provided URL fails format/allowlist validation.

    HTTP 400 — client error, no retry possible without fixing the URL.
    """

    http_status = 400
    error_code = "INVALID_URL"


class UnsupportedURLError(YTDLAppError):
    """Raised when the URL is structurally valid but not a supported YouTube URL.

    HTTP 422 — the server understands the request but cannot process it.
    """

    http_status = 422
    error_code = "UNSUPPORTED_URL"


class VideoUnavailableError(YTDLAppError):
    """Raised when the video/playlist is private, deleted, or age-restricted.

    HTTP 404 for deleted/private; 403 for age-restricted/region-blocked.
    """

    http_status = 404
    error_code = "VIDEO_UNAVAILABLE"


class RegionRestrictedError(YTDLAppError):
    """Raised when the video is blocked in the server's region.

    HTTP 403.
    """

    http_status = 403
    error_code = "REGION_RESTRICTED"


class FormatUnavailableError(YTDLAppError):
    """Raised when the requested format/quality is not available for the video.

    HTTP 422. Can happen if formats expire between /info and /download.
    """

    http_status = 422
    error_code = "FORMAT_UNAVAILABLE"


class ExtractionError(YTDLAppError):
    """Raised when yt-dlp extraction fails for an unexpected reason.

    HTTP 502 — the upstream source (YouTube) returned something we can't handle.
    """

    http_status = 502
    error_code = "EXTRACTION_ERROR"


class MergeError(YTDLAppError):
    """Raised when FFmpeg fails to merge video+audio streams.

    HTTP 500 — internal processing failure.
    """

    http_status = 500
    error_code = "MERGE_ERROR"


class DiskSpaceError(YTDLAppError):
    """Raised when there is insufficient disk space to start/continue a download.

    HTTP 507 — Insufficient Storage.
    """

    http_status = 507
    error_code = "DISK_SPACE_ERROR"


class NetworkError(YTDLAppError):
    """Raised when a network timeout or connection failure occurs during download.

    HTTP 502 — bad gateway / upstream error.
    """

    http_status = 502
    error_code = "NETWORK_ERROR"


class JobNotFoundError(YTDLAppError):
    """Raised when a job_id is not found in the in-memory job store.

    HTTP 404. Includes a hint that the server may have restarted.
    """

    http_status = 404
    error_code = "JOB_NOT_FOUND"


class DuplicateJobError(YTDLAppError):
    """Raised when an identical (url, mode, quality) job is already in-flight.

    HTTP 409 — Conflict.
    """

    http_status = 409
    error_code = "DUPLICATE_JOB"


class CancelledError(YTDLAppError):
    """Raised when a job is cancelled by the user.

    HTTP 200 is returned from the DELETE endpoint; this is used internally.
    """

    http_status = 200
    error_code = "CANCELLED"


# ─────────────────────────────────────────────────────────────────────────────
# Exception → HTTP Status Mapping
# ─────────────────────────────────────────────────────────────────────────────

_EXCEPTION_STATUS_MAP: dict[type[YTDLAppError], int] = {
    InvalidURLError: 400,
    UnsupportedURLError: 422,
    VideoUnavailableError: 404,
    RegionRestrictedError: 403,
    FormatUnavailableError: 422,
    ExtractionError: 502,
    MergeError: 500,
    DiskSpaceError: 507,
    NetworkError: 502,
    JobNotFoundError: 404,
    DuplicateJobError: 409,
}


def _build_error_response(exc: YTDLAppError) -> dict[str, Any]:
    """Build a clean JSON error body from an application exception.

    Args:
        exc: The typed application exception.

    Returns:
        dict: JSON-serialisable error body with error_code, message, job_id.
    """
    body: dict[str, Any] = {
        "error": exc.error_code,
        "message": exc.message,
    }
    if exc.job_id:
        body["job_id"] = exc.job_id
    return body


# ─────────────────────────────────────────────────────────────────────────────
# Handler Registration
# ─────────────────────────────────────────────────────────────────────────────


def register_exception_handlers(app: FastAPI) -> None:
    """Register all custom exception handlers on the FastAPI app.

    Args:
        app: The FastAPI application instance.
    """

    @app.exception_handler(YTDLAppError)
    async def ytdl_app_error_handler(
        request: Request, exc: YTDLAppError
    ) -> JSONResponse:
        """Handle all YTDLAppError subclasses with typed JSON responses.

        Logs the full exception server-side (with job_id for correlation)
        but only returns a clean, typed message to the client.
        """
        status_code = _EXCEPTION_STATUS_MAP.get(type(exc), exc.http_status)
        log_extra = {"job_id": exc.job_id} if exc.job_id else {}

        if status_code >= 500:
            logger.error(
                "Internal error [%s]: %s | detail=%s",
                exc.error_code,
                exc.message,
                exc.detail,
                extra=log_extra,
                exc_info=True,
            )
        else:
            logger.warning(
                "Client error [%s]: %s",
                exc.error_code,
                exc.message,
                extra=log_extra,
            )

        origin = request.headers.get("origin")
        headers = {}
        if origin:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Credentials"] = "true"

        return JSONResponse(
            status_code=status_code,
            content=_build_error_response(exc),
            headers=headers,
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        """Catch-all for unexpected exceptions.

        Logs the full traceback but never exposes it to the client.
        """
        logger.critical(
            "Unhandled exception on %s %s",
            request.method,
            request.url.path,
            exc_info=True,
        )
        origin = request.headers.get("origin")
        headers = {}
        if origin:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Credentials"] = "true"

        return JSONResponse(
            status_code=500,
            content={
                "error": "INTERNAL_ERROR",
                "message": "An unexpected internal error occurred.",
            },
            headers=headers,
        )
