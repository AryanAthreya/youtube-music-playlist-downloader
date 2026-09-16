"""
WebSocket route: WS /api/download/{job_id}/ws

Provides real-time progress updates by draining the job's async queue
(populated by the progress bridge) and sending JSON frames to the client.

Handles:
- Client reconnects gracefully
- Clean close when job reaches terminal state
- Polling-compatible: if WS is not connected, the bridge still updates
  Job.progress for the polling endpoint
"""

import asyncio
import logging
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.errors.exceptions import InvalidURLError
from app.services.job_manager import get_job
from app.services.progress_bridge import progress_registry

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])

# How long to wait for the next progress message before sending a heartbeat
_HEARTBEAT_INTERVAL_SECONDS = 5
# Max time to wait for a terminal job's queue to drain before closing
_DRAIN_TIMEOUT_SECONDS = 30


@router.websocket("/api/download/{job_id}/ws")
async def websocket_progress(websocket: WebSocket, job_id: str) -> None:
    """Stream real-time download progress over WebSocket.

    The client connects and receives JSON progress frames as the download proceeds.
    When the job reaches a terminal state (completed/failed/cancelled), a final
    frame is sent and the connection is closed cleanly.

    If no progress is received within _HEARTBEAT_INTERVAL_SECONDS, a heartbeat
    ping is sent to keep the connection alive.

    Args:
        websocket: The FastAPI WebSocket connection.
        job_id: UUID string for the job to monitor.
    """
    # Validate job_id format before touching any state
    try:
        uuid.UUID(job_id)
    except ValueError:
        await websocket.accept()
        await websocket.send_json({"error": "INVALID_JOB_ID", "message": "job_id must be a UUID"})
        await websocket.close(code=1008)
        return

    await websocket.accept()
    logger.info("WebSocket connected for job %s", job_id)

    # Validate job exists
    try:
        job = get_job(job_id)
    except Exception as exc:
        await websocket.send_json({
            "error": "JOB_NOT_FOUND",
            "message": str(exc),
            "job_id": job_id,
        })
        await websocket.close(code=1008)
        return

    # Send initial status immediately
    bridge = progress_registry.get(job_id)
    if bridge:
        initial_snap = bridge.get_latest_snapshot()
        await websocket.send_json({
            "job_id": job_id,
            "status": initial_snap.status,
            "percent": initial_snap.percent,
            "downloaded_bytes": initial_snap.downloaded_bytes,
            "total_bytes": initial_snap.total_bytes,
            "speed": initial_snap.speed,
            "eta": initial_snap.eta,
            "completed_count": initial_snap.completed_count,
            "total_count": initial_snap.total_count,
        })

    try:
        await _stream_progress(websocket, job_id)
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected for job %s", job_id)
    except Exception as exc:
        logger.error("WebSocket error for job %s: %s", job_id, exc, exc_info=True)
        try:
            await websocket.close(code=1011)
        except Exception:
            pass


async def _stream_progress(websocket: WebSocket, job_id: str) -> None:
    """Drain the progress queue and send frames to the WebSocket client.

    Runs until the job reaches a terminal state or the client disconnects.

    Args:
        websocket: The active WebSocket connection.
        job_id: UUID string for the job.
    """
    while True:
        # Re-fetch job on each iteration (status may have changed)
        try:
            job = get_job(job_id)
        except Exception:
            await websocket.send_json({
                "job_id": job_id,
                "status": "not_found",
                "message": "Job not found — server may have restarted.",
            })
            break

        bridge = progress_registry.get(job_id)

        if bridge:
            async_queue = bridge.get_async_queue()
            try:
                # Wait up to heartbeat interval for the next progress item
                frame = await asyncio.wait_for(
                    async_queue.get(),
                    timeout=_HEARTBEAT_INTERVAL_SECONDS,
                )
                await websocket.send_json(frame)
                continue
            except asyncio.TimeoutError:
                # No progress update: send heartbeat
                await websocket.send_json({
                    "job_id": job_id,
                    "type": "heartbeat",
                    "status": job.status.value,
                })
        else:
            # No bridge (job terminal or not started yet): send current state
            await websocket.send_json({
                "job_id": job_id,
                "status": job.status.value,
                "percent": job.progress.percent,
                "downloaded_bytes": job.progress.downloaded_bytes,
                "total_bytes": job.progress.total_bytes,
                "completed_count": job.progress.completed_count,
                "total_count": job.progress.total_count,
                "file_path": str(job.file_path) if job.file_path else None,
                "error": job.error,
            })

            if job.is_terminal:
                logger.info("Job %s is terminal; closing WebSocket", job_id)
                await websocket.close(code=1000)
                return

            # Bridge gone but job not terminal yet — wait briefly and retry
            await asyncio.sleep(1)
