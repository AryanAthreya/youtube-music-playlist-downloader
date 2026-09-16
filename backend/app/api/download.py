"""
Download job routes:
  POST   /api/download             -> create job
  GET    /api/download/{job_id}    -> get job status (polling fallback)
  DELETE /api/download/{job_id}    -> cancel or delete job
"""

import asyncio
import logging
import uuid

from fastapi import APIRouter

from app.config import get_settings
from app.errors.exceptions import InvalidURLError
from app.schemas.download import CreateJobResponse, DownloadRequest, JobResponse
from app.services import job_manager, yt_dlp_client
from app.services.format_selector import extract_audio_options, extract_available_formats
from app.utils.url_validation import validate_youtube_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["download"])


def _validate_job_id(job_id: str) -> str:
    """Validate that job_id is a valid UUID.

    Never constructs filesystem paths from raw user input — validates
    the UUID format strictly before any operation.

    Args:
        job_id: User-supplied job ID string.

    Returns:
        str: The validated job ID.

    Raises:
        InvalidURLError: If the job_id is not a valid UUID.
    """
    try:
        uuid.UUID(job_id)
    except ValueError as exc:
        raise InvalidURLError(
            f"Invalid job_id '{job_id}'. Must be a valid UUID.",
        ) from exc
    return job_id


@router.post("/download", response_model=CreateJobResponse, status_code=202)
async def create_download_job(request: DownloadRequest) -> CreateJobResponse:
    """Create a new download job (single video or playlist).

    Validates the URL, checks if playlist info is needed, then submits
    the job to the ThreadPoolExecutor via the job manager.

    For playlist URLs with video selection, pre-fetches playlist metadata
    to populate child jobs before submission.

    Args:
        request: DownloadRequest with url, mode, quality_id, and optional playlist_video_ids.

    Returns:
        CreateJobResponse: The new job_id and initial QUEUED status.

    Raises:
        InvalidURLError: If the URL is invalid.
        DuplicateJobError: If an identical in-flight job exists.
    """
    settings = get_settings()
    url = validate_youtube_url(request.url)

    # For playlist jobs, pre-fetch metadata to build child list
    playlist_info: dict | None = None
    if request.playlist_video_ids is not None:
        # We need the playlist structure to build child jobs
        playlist_info = await asyncio.to_thread(
            yt_dlp_client.fetch_info,
            url,
            socket_timeout=settings.ytdlp_socket_timeout,
            retries=settings.ytdlp_retries,
        )

    response = job_manager.create_and_submit_job(
        url=url,
        mode=request.mode.value,
        quality_id=request.quality_id,
        playlist_video_ids=request.playlist_video_ids,
        playlist_info=playlist_info,
    )

    logger.info("Created job %s for URL %s", response.job_id, url)
    return response


@router.get("/download/{job_id}", response_model=JobResponse)
async def get_job_status(job_id: str) -> JobResponse:
    """Get the current status and progress of a download job.

    Polling fallback endpoint — clients should prefer the WebSocket for
    real-time updates and only poll if WebSocket is unavailable.

    Args:
        job_id: UUID string for the job.

    Returns:
        JobResponse: Current job state, progress, and child job statuses.

    Raises:
        JobNotFoundError: If the job_id is not in the store.
        InvalidURLError: If the job_id is not a valid UUID.
    """
    _validate_job_id(job_id)
    job = job_manager.get_job(job_id)
    return job_manager.build_job_response(job)


@router.delete("/download/{job_id}", status_code=204)
async def cancel_or_delete_job(job_id: str) -> None:
    """Cancel an active job or delete a completed job and its file.

    For active/queued jobs: signals cancellation and cleans up temp files.
    For completed jobs: deletes the output file and removes from the job store.
    Already-completed files for child jobs (playlist) are kept.

    Args:
        job_id: UUID string for the job.

    Raises:
        JobNotFoundError: If the job_id is not in the store.
        InvalidURLError: If the job_id is not a valid UUID.
    """
    _validate_job_id(job_id)
    job_manager.delete_job(job_id)
