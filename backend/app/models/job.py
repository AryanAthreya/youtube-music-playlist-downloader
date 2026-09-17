"""
Job and child-job data models with status enums.

These are the core in-memory data structures for the job store.
No FastAPI or Pydantic imports — these are plain dataclasses and enums
that can be used and tested independently.
"""

import threading
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any


class JobStatus(str, Enum):
    """Lifecycle states for a download job (single video or playlist parent).

    States:
        QUEUED:      Job created, waiting for a worker thread slot.
        DOWNLOADING: Active yt-dlp download in progress.
        MERGING:     FFmpeg merge/transcode in progress.
        COMPLETED:   All work done; file(s) available.
        PARTIAL:     Playlist job where some videos succeeded, some failed.
        FAILED:      All work failed; no usable output.
        CANCELLED:   Cancelled by user request.
    """

    QUEUED = "queued"
    DOWNLOADING = "downloading"
    MERGING = "merging"
    COMPLETED = "completed"
    PARTIAL = "partial"
    FAILED = "failed"
    CANCELLED = "cancelled"


class DownloadMode(str, Enum):
    """Whether the job downloads video+audio or audio-only."""

    VIDEO = "video"
    AUDIO = "audio"


@dataclass
class ProgressSnapshot:
    """Point-in-time snapshot of download progress.

    Stored in Job.progress and updated by the progress bridge.
    Also sent over WebSocket as JSON.
    """

    status: str = "queued"
    downloaded_bytes: int = 0
    total_bytes: int | None = None
    speed: float | None = None          # bytes/second
    eta: int | None = None              # seconds remaining
    percent: float = 0.0
    video_id: str | None = None
    filename: str | None = None
    file_path: str | None = None
    # Playlist aggregate fields
    completed_count: int = 0
    total_count: int = 0
    files: list[str] = field(default_factory=list)


@dataclass
class ChildJob:
    """A single video within a playlist job.

    Args:
        video_id: YouTube video ID.
        title: Video title (from playlist metadata).
        thumbnail: Thumbnail URL.
        duration: Duration in seconds.
        status: Current job status for this child video.
        progress: Latest progress snapshot.
        file_path: Path to the completed file (None until done).
        error: Error message if failed.
        index: Zero-based position in the playlist.
    """

    video_id: str
    title: str
    thumbnail: str | None
    duration: int | None
    index: int
    status: JobStatus = JobStatus.QUEUED
    progress: ProgressSnapshot = field(default_factory=ProgressSnapshot)
    file_path: Path | None = None
    error: str | None = None


@dataclass
class Job:
    """A download job — either a single video or a playlist.

    For single-video jobs, `children` is empty and `file_path` is set on completion.
    For playlist jobs, `children` contains ordered ChildJob instances and
    `file_path` remains None (files are per-child).

    Thread-safety: `_lock` guards all mutable fields. Always acquire it
    before reading/writing status, progress, children, or file_path.

    Args:
        job_id: UUID string uniquely identifying this job.
        url: The YouTube URL being downloaded.
        mode: VIDEO or AUDIO download mode.
        quality_id: yt-dlp format ID or height string selected by the user.
        created_at: UTC timestamp of job creation.
        status: Current lifecycle state.
        progress: Latest progress snapshot (updated by progress bridge).
        children: Ordered list of child video jobs (playlist only).
        file_path: Path to the completed output file (single video only).
        error: Human-readable error message if failed.
        cancel_event: Threading event; set to signal cancellation to the worker.
        future: The concurrent.futures.Future for the submitted worker task.
    """

    job_id: str
    url: str
    mode: DownloadMode
    quality_id: str
    created_at: datetime = field(default_factory=datetime.utcnow)
    status: JobStatus = JobStatus.QUEUED
    progress: ProgressSnapshot = field(default_factory=ProgressSnapshot)
    children: list[ChildJob] = field(default_factory=list)
    file_path: Path | None = None
    error: str | None = None
    cancel_event: threading.Event = field(default_factory=threading.Event)
    future: Any = None  # concurrent.futures.Future — avoid circular import

    @property
    def is_playlist(self) -> bool:
        """Return True if this is a playlist job with child entries."""
        return len(self.children) > 0

    @property
    def is_terminal(self) -> bool:
        """Return True if the job is in a terminal state (no further transitions)."""
        return self.status in {
            JobStatus.COMPLETED,
            JobStatus.PARTIAL,
            JobStatus.FAILED,
            JobStatus.CANCELLED,
        }

    def compute_playlist_status(self) -> JobStatus:
        """Compute the parent status from child statuses.

        Rules:
            - All completed → COMPLETED
            - All failed/cancelled → FAILED
            - Mix of completed + failed → PARTIAL
            - Any still downloading → DOWNLOADING
            - All queued → QUEUED

        Returns:
            JobStatus: The derived parent status.
        """
        if not self.children:
            return self.status

        statuses = {c.status for c in self.children}

        if all(c.status == JobStatus.COMPLETED for c in self.children):
            return JobStatus.COMPLETED

        if all(c.status in {JobStatus.FAILED, JobStatus.CANCELLED} for c in self.children):
            return JobStatus.FAILED

        if JobStatus.DOWNLOADING in statuses or JobStatus.MERGING in statuses:
            return JobStatus.DOWNLOADING

        if any(c.status == JobStatus.COMPLETED for c in self.children):
            return JobStatus.PARTIAL

        return JobStatus.QUEUED
