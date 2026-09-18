"""
Job manager — job creation, state transitions, and executor submission.

Owns the ThreadPoolExecutor that runs all yt-dlp downloads. This is the
correct execution model for long-running, blocking, CPU/IO-bound work
(not FastAPI BackgroundTasks which is for short fire-and-forget tasks).

Key responsibilities:
- Maintains the in-memory job store (dict[str, Job])
- Creates and submits jobs to the ThreadPoolExecutor
- Implements the idempotent duplicate-job guard
- Handles cancellation via threading.Event
- Manages the per-job ProgressBridge lifecycle
- Updates job state on worker completion/failure
- Implements MAX_CONCURRENT_DOWNLOADS via bounded executor
"""

import asyncio
import logging
import uuid
import zipfile
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.errors.exceptions import (
    DuplicateJobError,
    JobNotFoundError,
    CancelledError,
)
from app.models.job import (
    ChildJob,
    DownloadMode,
    Job,
    JobStatus,
    ProgressSnapshot,
)
from app.schemas.download import (
    ChildJobSchema,
    CreateJobResponse,
    JobResponse,
    ProgressSnapshotSchema,
)
from app.services import file_manager
from app.services.file_manager import (
    check_disk_space,
    create_job_temp_dir,
    delete_job_temp_dir,
    move_to_completed,
    move_first_file_to_completed,
)
from app.services.resilient_selector import (
    build_resilient_video_selector,
    build_resilient_audio_selector,
)
from app.services.merge import get_audio_postprocessors, get_video_postprocessors
from app.services.progress_bridge import ProgressBridge, progress_registry
from app.services import yt_dlp_client

logger = logging.getLogger(__name__)

# ── Module-level state ────────────────────────────────────────────────────────

_job_store: dict[str, Job] = {}
_executor: ThreadPoolExecutor | None = None
_event_loop: asyncio.AbstractEventLoop | None = None

# Deduplication window: reject identical (url, mode, quality) within this period
_DEDUP_WINDOW_SECONDS = 5


# ─────────────────────────────────────────────────────────────────────────────
# Lifecycle
# ─────────────────────────────────────────────────────────────────────────────


def initialize(loop: asyncio.AbstractEventLoop) -> None:
    """Initialize the executor and store the event loop reference.

    Must be called once at application startup, from the asyncio startup event.

    Args:
        loop: The running asyncio event loop.
    """
    global _executor, _event_loop
    settings = get_settings()
    max_workers = settings.max_concurrent_downloads
    _executor = ThreadPoolExecutor(
        max_workers=max_workers,
        thread_name_prefix="ytdl-worker",
    )
    _event_loop = loop
    logger.info(
        "Job manager initialized: max_concurrent_downloads=%d", max_workers
    )


def shutdown() -> None:
    """Gracefully shut down the executor.

    Waits for in-flight workers to complete before returning.
    Called from the FastAPI shutdown event.
    """
    global _executor
    if _executor:
        logger.info("Shutting down job executor...")
        _executor.shutdown(wait=True, cancel_futures=False)
        _executor = None


# ─────────────────────────────────────────────────────────────────────────────
# Job CRUD
# ─────────────────────────────────────────────────────────────────────────────


def get_job(job_id: str) -> Job:
    """Return a Job by its ID.

    Args:
        job_id: UUID string for the job.

    Returns:
        Job: The job instance.

    Raises:
        JobNotFoundError: If the job_id is not in the store (server may have restarted).
    """
    job = _job_store.get(job_id)
    if job is None:
        raise JobNotFoundError(
            "Job not found — the server may have restarted. "
            "In-progress jobs are not persisted across restarts. "
            "Completed files are still available via GET /api/files.",
            job_id=job_id,
        )
    return job


def build_job_response(job: Job) -> JobResponse:
    """Convert a Job to its API response schema.

    Args:
        job: The Job instance.

    Returns:
        JobResponse: Pydantic schema for the API response.
    """
    bridge = progress_registry.get(job.job_id)
    if bridge:
        snap = bridge.get_latest_snapshot()
    else:
        snap = job.progress

    progress_schema = ProgressSnapshotSchema(
        status=snap.status,
        downloaded_bytes=snap.downloaded_bytes,
        total_bytes=snap.total_bytes,
        speed=snap.speed,
        eta=snap.eta,
        percent=snap.percent,
        video_id=snap.video_id,
        filename=snap.filename,
        completed_count=snap.completed_count,
        total_count=snap.total_count,
        files=getattr(snap, "files", []),
    )

    children_schema = [
        ChildJobSchema(
            video_id=c.video_id,
            title=c.title,
            thumbnail=c.thumbnail,
            duration=c.duration,
            index=c.index,
            status=c.status,
            progress=ProgressSnapshotSchema(**c.progress.__dict__),
            file_path=str(c.file_path) if c.file_path else None,
            error=c.error,
        )
        for c in job.children
    ]

    return JobResponse(
        job_id=job.job_id,
        url=job.url,
        mode=job.mode,
        status=job.status,
        progress=progress_schema,
        children=children_schema,
        file_path=str(job.file_path) if job.file_path else None,
        error=job.error,
        created_at=job.created_at.isoformat(),
    )


def _find_duplicate_job(url: str, mode: str, quality_id: str) -> Job | None:
    """Check for an identical in-flight job within the deduplication window.

    Args:
        url: YouTube URL.
        mode: 'video' or 'audio'.
        quality_id: Format quality selector.

    Returns:
        Job | None: An existing in-flight job with the same parameters, or None.
    """
    cutoff = datetime.utcnow() - timedelta(seconds=_DEDUP_WINDOW_SECONDS)
    for job in _job_store.values():
        if (
            job.url == url
            and job.mode.value == mode
            and job.quality_id == quality_id
            and not job.is_terminal
            and job.created_at > cutoff
        ):
            return job
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Job Creation + Submission
# ─────────────────────────────────────────────────────────────────────────────


def create_and_submit_job(
    url: str,
    mode: str,
    quality_id: str,
    playlist_video_ids: list[str] | None = None,
    playlist_info: dict[str, Any] | None = None,
) -> CreateJobResponse:
    """Create a new download job and submit it to the executor.

    Implements the idempotent duplicate-job guard: if an identical
    (url, mode, quality) job was created within _DEDUP_WINDOW_SECONDS,
    raises DuplicateJobError instead of creating a new job.

    Args:
        url: Validated YouTube URL.
        mode: 'video' or 'audio'.
        quality_id: Format ID or height string from /api/info.
        playlist_video_ids: Optional list of video IDs to download from a playlist.
        playlist_info: Optional pre-fetched playlist info dict from yt-dlp.

    Returns:
        CreateJobResponse: The new job ID and initial status.

    Raises:
        DuplicateJobError: If an identical in-flight job exists.
    """
    if _executor is None or _event_loop is None:
        raise RuntimeError("Job manager not initialized. Call initialize() first.")

    # Deduplication check
    existing = _find_duplicate_job(url, mode, quality_id)
    if existing:
        raise DuplicateJobError(
            f"An identical download job (job_id={existing.job_id}) is already in progress. "
            "Please wait for it to complete or cancel it first.",
            job_id=existing.job_id,
        )

    job_id = str(uuid.uuid4())
    job = Job(
        job_id=job_id,
        url=url,
        mode=DownloadMode(mode),
        quality_id=quality_id,
    )

    # If playlist info was provided, build child jobs
    if playlist_info and playlist_info.get("_type") == "playlist":
        entries = playlist_info.get("entries", []) or []
        if playlist_video_ids:
            entries = [e for e in entries if e and e.get("id") in playlist_video_ids]

        for idx, entry in enumerate(entries):
            if not entry:
                continue
            raw_title = entry.get("title")
            if not raw_title or str(raw_title).strip() in (
                "[Private video]",
                "[Deleted video]",
                "[Unavailable video]",
            ):
                continue
            video_id = entry.get("id")
            if not video_id:
                continue

            thumbnail = entry.get("thumbnail")
            if not thumbnail and entry.get("thumbnails"):
                thumbnail = entry["thumbnails"][-1].get("url")

            child = ChildJob(
                video_id=str(video_id),
                title=str(raw_title).strip(),
                thumbnail=thumbnail,
                duration=entry.get("duration"),
                index=idx,
            )
            job.children.append(child)

    _job_store[job_id] = job

    # Create progress bridge before submitting to executor
    bridge = progress_registry.create(job_id, _event_loop)

    # Submit to the executor
    future: Future = _executor.submit(_worker, job, bridge)
    job.future = future

    logger.info(
        "Job created and submitted: job_id=%s url=%s mode=%s quality=%s children=%d",
        job_id, url, mode, quality_id, len(job.children),
    )
    return CreateJobResponse(job_id=job_id, status=JobStatus.QUEUED)


# ─────────────────────────────────────────────────────────────────────────────
# Worker (runs in ThreadPoolExecutor)
# ─────────────────────────────────────────────────────────────────────────────


def _worker(job: Job, bridge: ProgressBridge) -> None:
    """Main worker function executed by the ThreadPoolExecutor.

    Handles both single-video and playlist jobs. Updates job status
    throughout the lifecycle. Cleans up temp files on failure/cancel.

    Args:
        job: The Job instance to execute.
        bridge: The ProgressBridge for this job.
    """
    try:
        job.status = JobStatus.DOWNLOADING
        _update_bridge_status(bridge, "downloading", job)

        if job.is_playlist:
            _run_playlist_job(job, bridge)
        else:
            _run_single_video_job(job, bridge)

    except CancelledError:
        job.status = JobStatus.CANCELLED
        job.error = "Cancelled by user."
        _update_bridge_status(bridge, "cancelled", job)
        logger.info("Job cancelled: job_id=%s", job.job_id)
    except Exception as exc:
        job.status = JobStatus.FAILED
        job.error = str(exc)
        _update_bridge_status(bridge, "failed", job)
        logger.error("Job failed: job_id=%s error=%s", job.job_id, exc, exc_info=True)
    finally:
        # Clean up temp dir on any non-success outcome
        if job.status not in {JobStatus.COMPLETED, JobStatus.PARTIAL}:
            delete_job_temp_dir(job.job_id)
        # Close the progress bridge
        progress_registry.remove(job.job_id)


def _run_single_video_job(job: Job, bridge: ProgressBridge) -> None:
    """Execute a single-video download job.

    Does NOT re-fetch yt-dlp info — uses resilient format selectors with
    built-in fallback chains to avoid FORMAT_UNAVAILABLE errors caused by
    YouTube rotating format IDs between the /api/info call and download.

    Args:
        job: The Job instance.
        bridge: The ProgressBridge for this job.
    """
    settings = get_settings()

    # Disk space check (no size estimate since we skip the second info fetch)
    check_disk_space(0)

    # Build a resilient format selector — does NOT require a second info fetch
    if job.mode == DownloadMode.AUDIO:
        fmt_selector = build_resilient_audio_selector(job.quality_id)
        postprocessors = get_audio_postprocessors("mp3")
        output_ext = "mp3"
    else:
        fmt_selector = build_resilient_video_selector(job.quality_id)
        postprocessors = get_video_postprocessors()
        output_ext = "mp4"

    logger.info("Job %s using format selector: %s", job.job_id, fmt_selector)

    # Create temp dir and set output template
    temp_dir = create_job_temp_dir(job.job_id)
    output_template = str(temp_dir / "%(title)s.%(ext)s")

    # Download (yt-dlp will try the selector fallback chain automatically)
    progress_hook = bridge.get_hook()
    result_info = yt_dlp_client.download_video(
        url=job.url,
        format_selector=fmt_selector,
        output_template=output_template,
        progress_hooks=[progress_hook],
        cancel_event=job.cancel_event,
        postprocessors=postprocessors,
        socket_timeout=settings.ytdlp_socket_timeout,
        retries=settings.ytdlp_retries,
        job_id=job.job_id,
    )

    if job.cancel_event.is_set():
        raise CancelledError("Job was cancelled.", job_id=job.job_id)

    # Transition to merging
    job.status = JobStatus.MERGING
    _update_bridge_status(bridge, "merging", job)

    # Move the yt-dlp-named output file to completed/ (preserves its generated filename)
    dest = move_first_file_to_completed(job.job_id)

    job.file_path = dest
    job.status = JobStatus.COMPLETED
    _update_bridge_status(bridge, "completed", job)
    logger.info("Job completed: job_id=%s file=%s", job.job_id, dest)


def _run_playlist_job(job: Job, bridge: ProgressBridge) -> None:
    """Execute a playlist download job (downloads children sequentially).

    Does NOT re-fetch info per child — uses resilient format selectors.
    Children respect the global MAX_CONCURRENT_DOWNLOADS — they are not
    submitted separately to the executor. Each child runs in the same
    worker thread as the parent.

    Args:
        job: The Job instance with populated children list.
        bridge: The ProgressBridge for this job.
    """
    settings = get_settings()
    total = len(job.children)

    # Build selectors once for all children (same quality applies to all)
    if job.mode == DownloadMode.AUDIO:
        fmt_selector = build_resilient_audio_selector(job.quality_id)
        postprocessors = get_audio_postprocessors("mp3")
        output_ext = "mp3"
    else:
        fmt_selector = build_resilient_video_selector(job.quality_id)
        postprocessors = get_video_postprocessors()
        output_ext = "mp4"

    logger.info("Playlist job %s using format selector: %s", job.job_id, fmt_selector)

    for idx, child in enumerate(job.children):
        if job.cancel_event.is_set():
            # Cancel remaining children
            for remaining in job.children[idx:]:
                remaining.status = JobStatus.CANCELLED
            break

        child.status = JobStatus.DOWNLOADING
        completed_count = sum(1 for c in job.children if c.status == JobStatus.COMPLETED)
        _update_playlist_bridge(bridge, job, idx, completed_count=completed_count, total=total)

        try:
            child_url = f"https://www.youtube.com/watch?v={child.video_id}"
            check_disk_space(0)

            child_job_id = f"{job.job_id}-{child.video_id}"
            temp_dir = create_job_temp_dir(child_job_id)
            output_template = str(temp_dir / "%(title)s.%(ext)s")

            # Child progress hook updates the child and aggregate playlist snapshot
            def make_child_hook(c: ChildJob, current_idx: int, total_videos: int):
                def hook(d):
                    downloaded = d.get("downloaded_bytes", 0) or 0
                    total_b = d.get("total_bytes") or d.get("total_bytes_estimate")
                    child_pct = min(100.0, (downloaded / (total_b or 1)) * 100) if total_b else 0.0

                    done_count = sum(1 for ch in job.children if ch.status == JobStatus.COMPLETED)
                    done_files = [ch.file_path.name for ch in job.children if ch.file_path and ch.status == JobStatus.COMPLETED]
                    agg_percent = min(100.0, ((done_count + (child_pct / 100.0)) / max(1, total_videos)) * 100)

                    snap = ProgressSnapshot(
                        status=d.get("status", "downloading"),
                        downloaded_bytes=downloaded,
                        total_bytes=total_b,
                        speed=d.get("speed"),
                        eta=d.get("eta"),
                        percent=round(agg_percent, 1),
                        video_id=c.video_id,
                        completed_count=done_count,
                        total_count=total_videos,
                        files=done_files,
                    )
                    c.progress = snap
                    job.progress = snap
                    bridge.update_snapshot(snap)
                return hook

            yt_dlp_client.download_video(
                url=child_url,
                format_selector=fmt_selector,
                output_template=output_template,
                progress_hooks=[make_child_hook(child, idx, total)],
                cancel_event=job.cancel_event,
                postprocessors=postprocessors,
                socket_timeout=settings.ytdlp_socket_timeout,
                retries=settings.ytdlp_retries,
                job_id=f"{job.job_id}/{child.video_id}",
            )

            dest = move_first_file_to_completed(child_job_id)
            child.file_path = dest
            child.status = JobStatus.COMPLETED

        except CancelledError:
            child.status = JobStatus.CANCELLED
            child.error = "Cancelled."
            for remaining in job.children[idx + 1:]:
                remaining.status = JobStatus.CANCELLED
            break
        except Exception as exc:
            child.status = JobStatus.FAILED
            child.error = str(exc)
            logger.error(
                "Playlist child failed: job_id=%s video_id=%s error=%s",
                job.job_id, child.video_id, exc,
            )

        finally:
            delete_job_temp_dir(f"{job.job_id}-{child.video_id}")

        # Update aggregate progress
        completed_count = sum(1 for c in job.children if c.status == JobStatus.COMPLETED)
        _update_playlist_bridge(bridge, job, idx, completed_count=completed_count, total=total)

    # Determine final parent status
    job.status = job.compute_playlist_status()
    if job.status in (JobStatus.COMPLETED, JobStatus.PARTIAL):
        job.file_path = _bundle_playlist_files(job)

    _update_bridge_status(bridge, job.status.value, job)
    logger.info("Playlist job finished: job_id=%s status=%s file=%s", job.job_id, job.status.value, job.file_path)


def _bundle_playlist_files(job: Job) -> Path | None:
    """Bundle completed files of a playlist job.

    If only 1 file completed, returns that file.
    If multiple completed, archives them into a zip file in completed/.
    """
    completed_files = [c.file_path for c in job.children if c.file_path and c.file_path.exists()]
    if not completed_files:
        return None
    if len(completed_files) == 1:
        return completed_files[0]

    settings = get_settings()
    safe_name = f"playlist-{job.job_id[:8]}.zip"
    zip_dest = settings.completed_dir / safe_name
    try:
        with zipfile.ZipFile(zip_dest, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in completed_files:
                zf.write(f, arcname=f.name)
        logger.info("Created playlist zip: %s", zip_dest)
        return zip_dest
    except Exception as exc:
        logger.error("Failed to create playlist zip: %s", exc)
        return completed_files[0]


def _update_bridge_status(bridge: ProgressBridge, status: str, job: Job) -> None:
    """Push a status-only progress update to the bridge."""
    completed_count = sum(1 for c in job.children if c.status == JobStatus.COMPLETED)
    total_count = len(job.children)
    done_files = [c.file_path.name for c in job.children if c.file_path and c.status == JobStatus.COMPLETED]
    snap = ProgressSnapshot(
        status=status,
        file_path=str(job.file_path) if job.file_path else None,
        filename=job.file_path.name if job.file_path else None,
        completed_count=completed_count,
        total_count=total_count,
        percent=100.0 if status == JobStatus.COMPLETED.value else (round((completed_count / max(1, total_count)) * 100, 1) if total_count else 0.0),
        files=done_files,
    )
    job.progress = snap
    bridge.update_snapshot(snap)


def _update_playlist_bridge(
    bridge: ProgressBridge,
    job: Job,
    current_idx: int,
    completed_count: int = 0,
    total: int = 0,
) -> None:
    """Push aggregate playlist progress to the bridge."""
    actual_completed = sum(1 for c in job.children if c.status == JobStatus.COMPLETED) if not completed_count else completed_count
    actual_total = total or len(job.children)
    agg_percent = round((actual_completed / max(1, actual_total)) * 100, 1)
    done_files = [c.file_path.name for c in job.children if c.file_path and c.status == JobStatus.COMPLETED]
    snap = ProgressSnapshot(
        status="downloading",
        completed_count=actual_completed,
        total_count=actual_total,
        percent=agg_percent,
        video_id=job.children[current_idx].video_id if job.children and current_idx < len(job.children) else None,
        files=done_files,
    )
    job.progress = snap
    bridge.update_snapshot(snap)


# ─────────────────────────────────────────────────────────────────────────────
# Cancellation
# ─────────────────────────────────────────────────────────────────────────────


def cancel_job(job_id: str) -> None:
    """Cancel an active job by signalling its cancel_event.

    For queued jobs that haven't started yet, also attempts to cancel the Future.
    For in-progress downloads, the cancel_event is checked periodically
    by the worker thread.

    Args:
        job_id: UUID string for the job to cancel.

    Raises:
        JobNotFoundError: If the job_id doesn't exist.
    """
    job = get_job(job_id)

    if job.is_terminal:
        logger.info("Cancel request for already-terminal job %s (status=%s)", job_id, job.status)
        return

    job.cancel_event.set()

    if job.future and not job.future.done():
        job.future.cancel()

    logger.info("Cancel signal sent to job %s", job_id)


def delete_job(job_id: str) -> None:
    """Delete a completed job and its file.

    For active jobs, cancel first then delete.
    For completed jobs, deletes the output file and removes from store.

    Args:
        job_id: UUID string for the job.

    Raises:
        JobNotFoundError: If the job_id doesn't exist.
    """
    job = get_job(job_id)

    if not job.is_terminal:
        cancel_job(job_id)

    if job.file_path and job.file_path.exists():
        from app.services.file_manager import delete_completed_file
        delete_completed_file(job.file_path)

    _job_store.pop(job_id, None)
    logger.info("Job deleted: job_id=%s", job_id)
