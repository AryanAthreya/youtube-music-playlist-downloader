"""
File serving routes:
  GET /api/download/{job_id}/file  -> serve completed file (Range-aware)
  GET /api/files                   -> list all files in completed/ (disk-backed)
  GET /api/files/{filename}        -> serve a file from completed/ by filename
"""

import logging
import mimetypes
import uuid
from pathlib import Path
from urllib.parse import quote

import aiofiles
from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from app.config import get_settings
from app.errors.exceptions import InvalidURLError, JobNotFoundError
from app.schemas.download import FilesListResponse
from app.services import job_manager
from app.services.file_manager import list_completed_files

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["files"])

# Chunk size for streaming file responses (256 KB)
_CHUNK_SIZE = 256 * 1024


def _validate_job_id(job_id: str) -> str:
    """Validate job_id as a UUID.

    Args:
        job_id: User-supplied string.

    Returns:
        str: The validated job ID.

    Raises:
        InvalidURLError: If not a valid UUID.
    """
    try:
        uuid.UUID(job_id)
    except ValueError as exc:
        raise InvalidURLError(
            f"Invalid job_id '{job_id}'. Must be a valid UUID."
        ) from exc
    return job_id


def _validate_filename(filename: str) -> str:
    """Validate a filename to prevent path traversal.

    Only allows filenames (no path separators or parent traversal).

    Args:
        filename: User-supplied filename.

    Returns:
        str: The validated filename.

    Raises:
        InvalidURLError: If the filename contains path separators or traversal.
    """
    if "/" in filename or "\\" in filename or ".." in filename:
        raise InvalidURLError(f"Invalid filename: '{filename}'. Path separators not allowed.")
    if not filename or filename.startswith("."):
        raise InvalidURLError(f"Invalid filename: '{filename}'.")
    return filename


async def _stream_file_range(
    file_path: Path,
    start: int,
    end: int,
    chunk_size: int = _CHUNK_SIZE,
):
    """Async generator that streams a byte range from a file.

    Args:
        file_path: Absolute path to the file.
        start: Start byte offset (inclusive).
        end: End byte offset (inclusive).
        chunk_size: Read chunk size in bytes.

    Yields:
        bytes: File data chunks.
    """
    async with aiofiles.open(file_path, "rb") as f:
        await f.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            read_size = min(chunk_size, remaining)
            chunk = await f.read(read_size)
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def _parse_range_header(
    range_header: str | None,
    file_size: int,
) -> tuple[int, int]:
    """Parse an HTTP Range header and return (start, end) byte offsets.

    Args:
        range_header: Value of the Range header (e.g. 'bytes=0-1023').
        file_size: Total file size in bytes.

    Returns:
        tuple[int, int]: (start, end) byte offsets, both inclusive.

    Raises:
        ValueError: If the Range header is malformed or out of bounds.
    """
    if not range_header:
        return 0, file_size - 1

    if not range_header.startswith("bytes="):
        raise ValueError(f"Unsupported Range unit: {range_header}")

    range_spec = range_header[6:]  # Remove 'bytes='
    parts = range_spec.split("-", 1)
    if len(parts) != 2:
        raise ValueError(f"Malformed Range header: {range_header}")

    start_str, end_str = parts

    if start_str and end_str:
        start, end = int(start_str), int(end_str)
    elif start_str:
        start = int(start_str)
        end = file_size - 1
    elif end_str:
        # Suffix range: last N bytes
        suffix = int(end_str)
        start = max(0, file_size - suffix)
        end = file_size - 1
    else:
        raise ValueError(f"Malformed Range header: {range_header}")

    if start < 0 or end >= file_size or start > end:
        raise ValueError(
            f"Range {start}-{end} is out of bounds for file size {file_size}"
        )

    return start, end


def _build_content_disposition(filename: str, disposition_type: str = "attachment") -> str:
    """Build an RFC 6266 / RFC 5987 compliant Content-Disposition header value.

    Avoids UnicodeEncodeError: 'latin-1' codec crashes in Starlette by stripping
    non-ASCII characters from the fallback filename, and encoding full UTF-8
    in the filename* parameter. Defaults to 'attachment' so browser triggers
    actual download instead of auto-playing the media.
    """
    # ASCII-only fallback filename
    ascii_name = filename.encode("ascii", "ignore").decode("ascii").strip()
    if not ascii_name:
        ext = filename.split(".")[-1] if "." in filename else "bin"
        ascii_name = f"download.{ext}"
    ascii_name = ascii_name.replace('"', '')
    # RFC 5987 / RFC 6266 encoded filename
    quoted_name = quote(filename, encoding="utf-8")
    return f"{disposition_type}; filename=\"{ascii_name}\"; filename*=UTF-8''{quoted_name}"


async def _serve_file(
    file_path: Path,
    range_header: str | None,
    disposition: str = "attachment",
) -> Response:
    """Build a Range-aware streaming response for a file.

    Args:
        file_path: Absolute path to the file to serve.
        range_header: Value of the HTTP Range header (or None for full file).
        disposition: 'attachment' (download file) or 'inline' (browser player stream).

    Returns:
        Response: A StreamingResponse with appropriate headers.
    """
    if not file_path.exists():
        raise JobNotFoundError(
            f"File no longer exists: {file_path.name}. It may have been deleted by the retention sweep.",
        )

    file_size = file_path.stat().st_size
    mime_type, _ = mimetypes.guess_type(str(file_path))
    mime_type = mime_type or "application/octet-stream"

    try:
        start, end = _parse_range_header(range_header, file_size)
    except ValueError:
        # Invalid range: return full file
        start, end = 0, file_size - 1

    content_length = end - start + 1
    is_partial = start != 0 or end != file_size - 1

    headers = {
        "Content-Disposition": _build_content_disposition(file_path.name, disposition),
        "Content-Length": str(content_length),
        "Accept-Ranges": "bytes",
        "Content-Range": f"bytes {start}-{end}/{file_size}",
    }

    status_code = 206 if is_partial else 200

    return StreamingResponse(
        _stream_file_range(file_path, start, end),
        status_code=status_code,
        media_type=mime_type,
        headers=headers,
    )


@router.get("/download/{job_id}/file")
async def serve_job_file(
    job_id: str,
    range: str | None = Header(default=None),
    stream: bool = False,
) -> Response:
    """Serve the completed download file for a job (Range-aware).

    Supports HTTP Range requests for resumable downloads and video seeking.
    The file path is resolved from the in-memory job record — never
    constructed from user-supplied input.

    Args:
        job_id: UUID string for the job.
        range: HTTP Range header value (optional).
        stream: If True, uses 'inline' Content-Disposition for browser playback;
                if False (default), uses 'attachment' to download to disk.

    Returns:
        Response: Streaming file response with Range support.

    Raises:
        JobNotFoundError: If the job or its file doesn't exist.
        InvalidURLError: If job_id is not a valid UUID.
    """
    _validate_job_id(job_id)
    job = job_manager.get_job(job_id)

    if not job.file_path:
        raise JobNotFoundError(
            f"Job {job_id} has no completed file yet (status: {job.status.value}).",
            job_id=job_id,
        )

    disposition = "inline" if stream else "attachment"
    return await _serve_file(job.file_path, range, disposition=disposition)


@router.get("/files", response_model=FilesListResponse)
async def list_files() -> FilesListResponse:
    """List all completed download files from disk.

    Disk-backed endpoint — survives backend restarts. Returns all files
    currently in the completed/ directory, even if their job records
    are gone (e.g. after a server restart).

    Returns:
        FilesListResponse: List of file metadata sorted by modification time.
    """
    return list_completed_files()


@router.get("/files/{filename}")
async def serve_file_by_name(
    filename: str,
    range: str | None = Header(default=None),
    stream: bool = False,
) -> Response:
    """Serve a completed file by filename (Range-aware).

    Used by the FileList UI component to allow downloading files that
    survived a server restart (where the job record no longer exists).

    The filename is validated to prevent path traversal. The actual file
    path is resolved from the completed/ directory — not from user input.

    Args:
        filename: Filename in the completed/ directory.
        range: HTTP Range header value (optional).
        stream: If True, uses 'inline' for preview playback;
                if False (default), uses 'attachment' to download.

    Returns:
        Response: Streaming file response with Range support.

    Raises:
        InvalidURLError: If the filename contains path traversal characters.
        JobNotFoundError: If the file doesn't exist in completed/.
    """
    safe_filename = _validate_filename(filename)
    settings = get_settings()
    file_path = settings.completed_dir / safe_filename

    # Verify the resolved path is still within completed/
    try:
        file_path.resolve().relative_to(settings.completed_dir.resolve())
    except ValueError as exc:
        raise InvalidURLError(
            f"Invalid filename: path traversal detected."
        ) from exc

    disposition = "inline" if stream else "attachment"
    return await _serve_file(file_path, range, disposition=disposition)


@router.delete("/files/{filename}")
async def delete_file_by_name(filename: str) -> dict:
    """Delete a completed file by filename from the history library."""
    safe_filename = _validate_filename(filename)
    settings = get_settings()
    file_path = settings.completed_dir / safe_filename

    try:
        file_path.resolve().relative_to(settings.completed_dir.resolve())
    except ValueError as exc:
        raise InvalidURLError("Invalid filename: path traversal detected.") from exc

    if not file_path.exists() or not file_path.is_file():
        raise JobNotFoundError(f"File '{safe_filename}' not found.")

    file_path.unlink()
    logger.info("Deleted completed file: %s", safe_filename)
    return {"message": f"File '{safe_filename}' deleted.", "filename": safe_filename}
