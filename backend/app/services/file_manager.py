"""
File management service: sanitization, disk checks, file operations, retention sweep.

Handles all filesystem operations for downloads:
- Pre-download disk space checks
- Moving completed files from temp/ to completed/
- Deleting temp working directories on failure/cancel
- Listing files in completed/ (disk-backed, survives backend restart)
- Periodic retention sweep that deletes old completed files
"""

import asyncio
import logging
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from app.config import get_settings
from app.errors.exceptions import DiskSpaceError
from app.schemas.download import FileInfo, FilesListResponse
from app.utils.sanitize import build_safe_filename

logger = logging.getLogger(__name__)

_VIDEO_ID_REGEX = re.compile(r"^([a-zA-Z0-9_-]{11})-(.+)$")
_IMAGE_EXTS = {".jpg", ".jpeg", ".webp", ".png", ".gif"}
_VIDEO_EXTS = {".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv"}
_AUDIO_EXTS = {".mp3", ".m4a", ".opus", ".wav", ".flac", ".ogg", ".aac"}


def ensure_directories() -> None:
    """Create all required download directories if they don't exist.

    Also verifies write permissions by attempting to write a temp file.

    Raises:
        PermissionError: If the directories cannot be created or written to.
        OSError: For other filesystem errors.
    """
    settings = get_settings()
    for directory in [settings.jobs_dir, settings.completed_dir, settings.temp_dir]:
        directory.mkdir(parents=True, exist_ok=True)
        logger.debug("Ensured directory exists: %s", directory)

    # Verify write permission
    test_file = settings.temp_dir / ".write_test"
    try:
        test_file.write_text("ok")
        test_file.unlink()
        logger.info("Download directories verified writable: %s", settings.downloads_base_path)
    except OSError as exc:
        raise PermissionError(
            f"Download directory {settings.temp_dir} is not writable: {exc}"
        ) from exc


def get_job_temp_dir(job_id: str) -> Path:
    """Return the temp working directory for a specific job.

    The directory is named by job_id (UUID), making path traversal impossible
    since job_ids are validated as UUIDs before reaching this function.

    Args:
        job_id: UUID string for the job.

    Returns:
        Path: The job's temp directory path (may not exist yet).
    """
    return get_settings().temp_dir / job_id


def create_job_temp_dir(job_id: str) -> Path:
    """Create and return the temp working directory for a job.

    Args:
        job_id: UUID string for the job.

    Returns:
        Path: The created temp directory.
    """
    job_dir = get_job_temp_dir(job_id)
    job_dir.mkdir(parents=True, exist_ok=True)
    logger.debug("Created temp dir for job %s: %s", job_id, job_dir)
    return job_dir


def check_disk_space(required_bytes: int = 0) -> None:
    """Check that sufficient disk space is available before starting a download.

    Checks free space against MIN_DISK_HEADROOM_BYTES + required_bytes.

    Args:
        required_bytes: Estimated file size in bytes (0 if unknown).

    Raises:
        DiskSpaceError: If free space is below the required threshold.
    """
    settings = get_settings()
    base_path = settings.downloads_base_path

    try:
        usage = shutil.disk_usage(base_path)
        free_bytes = usage.free
    except OSError as exc:
        logger.warning("Could not check disk space at %s: %s", base_path, exc)
        return  # Don't block the download if we can't check

    needed = settings.min_disk_headroom_bytes + required_bytes
    if free_bytes < needed:
        free_gb = free_bytes / (1024 ** 3)
        needed_gb = needed / (1024 ** 3)
        raise DiskSpaceError(
            f"Insufficient disk space. Available: {free_gb:.2f} GB, "
            f"Required: {needed_gb:.2f} GB (including {settings.min_disk_headroom_mb} MB safety margin).",
            detail=f"free={free_bytes}, needed={needed}",
        )

    logger.debug(
        "Disk space OK: free=%.2f GB, required=%.2f GB",
        free_bytes / (1024 ** 3),
        needed / (1024 ** 3),
    )


def move_to_completed(
    job_id: str,
    video_id: str,
    title: str,
    ext: str,
) -> Path:
    """Move the downloaded file from the job's temp dir to completed/.

    Searches the job's temp directory for the first file with a matching
    extension and moves it to completed/ with a sanitized filename.

    Args:
        job_id: UUID string for the job.
        video_id: YouTube video ID (used in filename).
        title: Video title (sanitized for use in filename).
        ext: Expected file extension (e.g. 'mp4', 'mp3').

    Returns:
        Path: The final path in completed/.

    Raises:
        FileNotFoundError: If no matching file is found in the temp dir.
        OSError: For filesystem errors during move.
    """
    temp_dir = get_job_temp_dir(job_id)
    settings = get_settings()

    # Find the output file (yt-dlp may add extra suffixes)
    candidates = list(temp_dir.glob(f"*.{ext}"))
    if not candidates:
        # Try any file as fallback
        candidates = [f for f in temp_dir.iterdir() if f.is_file()]

    if not candidates:
        raise FileNotFoundError(
            f"No output file found in temp dir for job {job_id} (expected .{ext})"
        )

    source_file = candidates[0]  # Take first match
    safe_name = build_safe_filename(video_id, title, source_file.suffix.lstrip(".") or ext)
    dest = settings.completed_dir / safe_name

    # Handle filename collision by appending job_id suffix
    if dest.exists():
        stem = dest.stem
        dest = settings.completed_dir / f"{stem}-{job_id[:8]}{dest.suffix}"

    shutil.move(str(source_file), str(dest))
    logger.info("Moved completed file: %s -> %s", source_file, dest)
    return dest


def move_first_file_to_completed(job_id: str) -> Path:
    """Move the first file found in the job's temp dir to completed/.

    Unlike move_to_completed, this does NOT require a video_id or title —
    it preserves the yt-dlp-generated filename (%(id)s-%(title)s.ext).
    Used when the info dict is not available in the worker.

    Args:
        job_id: UUID string for the job.

    Returns:
        Path: The final path in completed/.

    Raises:
        FileNotFoundError: If no file is found in the temp dir.
    """
    temp_dir = get_job_temp_dir(job_id)
    settings = get_settings()

    # Find all files (excluding dotfiles)
    candidates = [f for f in temp_dir.iterdir() if f.is_file() and not f.name.startswith(".")]

    if not candidates:
        raise FileNotFoundError(
            f"No output file found in temp dir for job {job_id}"
        )

    # Prefer the final merged file (usually .mp4 or .mp3, not .part or .ytdl or images)
    final_candidates = [
        f for f in candidates
        if not f.suffix.lower() in {".part", ".ytdl", ".tmp"} and not f.suffix.lower() in _IMAGE_EXTS
    ]
    source_file = final_candidates[0] if final_candidates else candidates[0]

    # Use the yt-dlp generated filename directly (already safe — yt-dlp sanitizes it)
    dest = settings.completed_dir / source_file.name

    # Handle collision
    if dest.exists():
        dest = settings.completed_dir / f"{source_file.stem}-{job_id[:8]}{source_file.suffix}"

    shutil.move(str(source_file), str(dest))
    logger.info("Moved completed file (preserved name): %s -> %s", source_file, dest)

    # Move any companion thumbnail images found in temp_dir alongside
    thumb_candidates = [
        f for f in candidates
        if f.suffix.lower() in _IMAGE_EXTS
    ]
    for thumb in thumb_candidates:
        thumb_dest = settings.completed_dir / f"{dest.stem}{thumb.suffix}"
        try:
            shutil.move(str(thumb), str(thumb_dest))
            logger.info("Moved companion thumbnail: %s -> %s", thumb, thumb_dest)
        except Exception as err:
            logger.warning("Failed to move thumbnail %s: %s", thumb, err)

    return dest


def delete_job_temp_dir(job_id: str) -> None:
    """Delete the temp working directory for a job.

    Called on job failure or cancellation. Silently ignores missing dirs.

    Args:
        job_id: UUID string for the job.
    """
    temp_dir = get_job_temp_dir(job_id)
    if temp_dir.exists():
        shutil.rmtree(temp_dir, ignore_errors=True)
        logger.info("Deleted temp dir for job %s", job_id)


def delete_completed_file(file_path: Path) -> None:
    """Delete a completed file from the completed/ directory.

    Only deletes files that are within the configured completed/ directory
    to prevent path traversal. Also deletes any companion thumbnail images.

    Args:
        file_path: Absolute path to the file to delete.

    Raises:
        ValueError: If the path is outside the completed/ directory.
    """
    settings = get_settings()
    try:
        file_path.resolve().relative_to(settings.completed_dir.resolve())
    except ValueError as exc:
        raise ValueError(
            f"Path {file_path} is outside the completed directory. Refusing to delete."
        ) from exc

    if file_path.exists():
        file_path.unlink()
        logger.info("Deleted completed file: %s", file_path)

    # Clean up any companion thumbnail images
    for img_ext in _IMAGE_EXTS:
        thumb_candidate = file_path.parent / f"{file_path.stem}{img_ext}"
        if thumb_candidate.exists():
            thumb_candidate.unlink(missing_ok=True)
            logger.info("Deleted companion thumbnail: %s", thumb_candidate)


# Convenience alias
delete_file = delete_completed_file


def list_completed_files() -> FilesListResponse:
    """List all audio and video files in the completed/ directory and its subfolders.

    Disk-backed — survives backend restarts even though the in-memory
    job store is cleared. Files are sorted by modification time, newest first.
    Recursively scans subfolders so users can organize music into albums or
    drop album folders directly into the completed/ directory.

    Returns:
        FilesListResponse: List of file metadata for all completed downloads.
    """
    settings = get_settings()
    completed_dir = settings.completed_dir

    if not completed_dir.exists():
        return FilesListResponse(files=[], total=0)

    # 1. Collect all valid audio and video files recursively
    all_media_paths: list[Path] = []
    for root, dirs, files in os.walk(completed_dir):
        # Exclude hidden directories (e.g. .git, .cache)
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for file in files:
            if file.startswith("."):
                continue
            file_path = Path(root) / file
            ext = file_path.suffix.lower()
            if ext in _AUDIO_EXTS or ext in _VIDEO_EXTS:
                all_media_paths.append(file_path)

    # 2. Sort newest first based on modification time
    all_media_paths.sort(key=lambda p: p.stat().st_mtime, reverse=True)

    file_infos: list[FileInfo] = []
    for path in all_media_paths:
        try:
            stat = path.stat()
        except OSError:
            continue

        ext = path.suffix.lower()
        stem = path.stem
        rel_path = path.relative_to(completed_dir)
        rel_str = rel_path.as_posix()

        # Check if file is in an album / subfolder
        album: str | None = None
        if len(rel_path.parts) > 1:
            album = rel_path.parent.as_posix()

        # Extract YouTube ID and clean title
        match = _VIDEO_ID_REGEX.match(stem)
        if match:
            video_id = match.group(1)
            clean_title = match.group(2).strip()
        else:
            video_id = None
            clean_title = stem.strip()

        # Determine media type
        if ext in _VIDEO_EXTS:
            media_type = "video"
        elif ext in _AUDIO_EXTS:
            media_type = "audio"
        else:
            media_type = "other"

        # Determine thumbnail:
        # A) Track-specific companion in same folder (e.g. Song.webp, Song.jpg)
        thumbnail_url = None
        for img_ext in (".jpg", ".jpeg", ".webp", ".png"):
            companion = path.parent / f"{stem}{img_ext}"
            if companion.exists() and companion.is_file():
                rel_thumb = companion.relative_to(completed_dir).as_posix()
                thumbnail_url = f"/api/files/{quote(rel_thumb)}"
                break

        # B) Folder-level album artwork (e.g. cover.jpg, folder.jpg, album.jpg, art.jpg)
        if not thumbnail_url and album:
            for cover_stem in ("cover", "folder", "album", "front", "art"):
                for img_ext in (".jpg", ".jpeg", ".webp", ".png"):
                    cover_candidate = path.parent / f"{cover_stem}{img_ext}"
                    if cover_candidate.exists() and cover_candidate.is_file():
                        rel_thumb = cover_candidate.relative_to(completed_dir).as_posix()
                        thumbnail_url = f"/api/files/{quote(rel_thumb)}"
                        break
                if thumbnail_url:
                    break

        # C) YouTube CDN fallback if we have a valid video_id
        if not thumbnail_url and video_id:
            thumbnail_url = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"

        file_infos.append(
            FileInfo(
                filename=rel_str,
                clean_title=clean_title,
                media_type=media_type,
                thumbnail_url=thumbnail_url,
                size_bytes=stat.st_size,
                created_at=datetime.fromtimestamp(stat.st_ctime, tz=timezone.utc).isoformat(),
                modified_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                download_url=f"/api/files/{quote(rel_str)}",
                album=album,
            )
        )

    return FilesListResponse(files=file_infos, total=len(file_infos))


async def retention_sweep() -> int:
    """Retention sweep is permanently disabled to preserve user music."""
    return 0


def _retention_sweep_sync() -> int:
    """Retention sweep is permanently disabled to preserve user music."""
    return 0


async def start_retention_sweep_task() -> asyncio.Task:
    """Permanent retention: no sweep task needed. Files are preserved forever."""
    logger.info("Retention sweep is disabled. Downloaded files and albums are kept permanently.")
    return asyncio.create_task(asyncio.sleep(0))

