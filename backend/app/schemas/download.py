"""
Pydantic request/response schemas for the /api/download endpoints.

These are the single source of truth for request/response shapes.
Mirror any changes here into frontend/lib/types.ts manually (no codegen in V1).
"""

from typing import Literal

from pydantic import BaseModel, field_validator

from app.models.job import DownloadMode, JobStatus, ProgressSnapshot


class DownloadRequest(BaseModel):
    """Request body for POST /api/download.

    Args:
        url: YouTube URL to download.
        mode: 'video' or 'audio'.
        quality_id: Format ID or height string from /api/info response.
        playlist_video_ids: Optional subset of video IDs to download from a playlist.
                            If None or empty, all playlist videos are downloaded.
    """

    url: str
    mode: DownloadMode
    quality_id: str
    playlist_video_ids: list[str] | None = None

    @field_validator("url")
    @classmethod
    def url_not_empty(cls, v: str) -> str:
        """Ensure URL is not blank."""
        if not v or not v.strip():
            raise ValueError("url must not be empty")
        return v.strip()

    @field_validator("quality_id")
    @classmethod
    def quality_not_empty(cls, v: str) -> str:
        """Ensure quality_id is not blank."""
        if not v or not v.strip():
            raise ValueError("quality_id must not be empty")
        return v.strip()


class CreateJobResponse(BaseModel):
    """Response for POST /api/download — returns the new job's ID."""

    job_id: str
    status: JobStatus


class ProgressSnapshotSchema(BaseModel):
    """Serializable progress snapshot for API responses.

    Mirrors app.models.job.ProgressSnapshot as a Pydantic model.
    """

    status: str
    downloaded_bytes: int = 0
    total_bytes: int | None = None
    speed: float | None = None
    eta: int | None = None
    percent: float = 0.0
    video_id: str | None = None
    filename: str | None = None
    completed_count: int = 0
    total_count: int = 0


class ChildJobSchema(BaseModel):
    """Serializable child job for playlist responses."""

    video_id: str
    title: str
    thumbnail: str | None = None
    duration: int | None = None
    index: int
    status: JobStatus
    progress: ProgressSnapshotSchema
    file_path: str | None = None
    error: str | None = None


class JobResponse(BaseModel):
    """Response for GET /api/download/{job_id} — current job state."""

    job_id: str
    url: str
    mode: DownloadMode
    status: JobStatus
    progress: ProgressSnapshotSchema
    children: list[ChildJobSchema] = []
    file_path: str | None = None
    error: str | None = None
    created_at: str                     # ISO 8601


class FileInfo(BaseModel):
    """Metadata for a file in the completed/ directory (disk-backed)."""

    filename: str
    clean_title: str
    media_type: str = "other"  # 'video', 'audio', or 'other'
    thumbnail_url: str | None = None
    size_bytes: int
    created_at: str          # ISO 8601
    modified_at: str         # ISO 8601
    download_url: str        # Relative URL for /api/files/{filename}


class FilesListResponse(BaseModel):
    """Response for GET /api/files."""

    files: list[FileInfo]
    total: int
