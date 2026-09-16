"""
Thread-to-asyncio progress bridge for yt-dlp download progress.

yt-dlp's progress hooks fire synchronously on the worker thread, NOT on
the asyncio event loop. This module bridges the two worlds safely:

  Worker Thread                    Asyncio Event Loop
  ─────────────                    ──────────────────
  yt-dlp progress hook             WebSocket sender
       │                                  │
       ▼                                  ▼
  thread_queue.put_nowait()    ←→   asyncio_queue.get()
  (via loop.call_soon_threadsafe)

Each job gets its own ProgressBridge. The bridge stores the latest
progress snapshot so the polling endpoint always has current state.
"""

import asyncio
import logging
import queue
import threading
from typing import Any

from app.models.job import ProgressSnapshot

logger = logging.getLogger(__name__)


class ProgressBridge:
    """Per-job bridge between yt-dlp's sync progress hooks and asyncio WebSocket delivery.

    Thread-safe: The progress hook (called on the worker thread) writes to
    a thread-safe queue. An asyncio drain task reads from that queue and
    puts messages onto an asyncio.Queue for the WebSocket handler.

    Args:
        job_id: UUID string identifying the job.
        loop: The running asyncio event loop. Required to schedule
              coroutines from the worker thread.
    """

    def __init__(self, job_id: str, loop: asyncio.AbstractEventLoop) -> None:
        self.job_id = job_id
        self._loop = loop
        # Thread-safe queue for hook → bridge transfer
        self._thread_queue: queue.SimpleQueue[dict[str, Any]] = queue.SimpleQueue()
        # Asyncio queue for bridge → WebSocket transfer
        self._async_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=100)
        # Latest snapshot for polling endpoint
        self._latest_snapshot = ProgressSnapshot()
        self._snapshot_lock = threading.Lock()
        self._drain_task: asyncio.Task | None = None
        self._closed = False

    def get_hook(self):
        """Return a callable suitable for use as a yt-dlp progress_hook.

        The returned hook is thread-safe and can be called from any thread.

        Returns:
            Callable: A function that accepts a yt-dlp progress dict.
        """
        def hook(d: dict[str, Any]) -> None:
            if self._closed:
                return
            try:
                self._thread_queue.put_nowait(d)
                # Schedule the drain coroutine on the event loop from the worker thread
                self._loop.call_soon_threadsafe(self._schedule_drain)
            except Exception as exc:
                logger.debug("Progress hook error (job %s): %s", self.job_id, exc)

        return hook

    def _schedule_drain(self) -> None:
        """Schedule a single drain iteration if not already running."""
        if self._loop.is_running():
            asyncio.ensure_future(self._drain_once(), loop=self._loop)

    async def _drain_once(self) -> None:
        """Drain all pending items from the thread queue into the async queue."""
        while not self._thread_queue.empty():
            try:
                raw = self._thread_queue.get_nowait()
                snapshot = self._parse_progress(raw)

                # Update the latest snapshot (thread-safe)
                with self._snapshot_lock:
                    self._latest_snapshot = snapshot

                # Put on the async queue for WebSocket consumption
                try:
                    self._async_queue.put_nowait(self._snapshot_to_dict(snapshot))
                except asyncio.QueueFull:
                    # Drop oldest item to make room
                    try:
                        self._async_queue.get_nowait()
                        self._async_queue.put_nowait(self._snapshot_to_dict(snapshot))
                    except asyncio.QueueEmpty:
                        pass

            except queue.Empty:
                break
            except Exception as exc:
                logger.debug("Drain error (job %s): %s", self.job_id, exc)

    def _parse_progress(self, d: dict[str, Any]) -> ProgressSnapshot:
        """Parse a raw yt-dlp progress dict into a ProgressSnapshot.

        yt-dlp progress hook dict has these keys (not all always present):
            status: 'downloading' | 'finished' | 'error'
            downloaded_bytes: int
            total_bytes: int | None
            total_bytes_estimate: int | None
            speed: float | None  (bytes/second)
            eta: int | None      (seconds)
            filename: str | None
            info_dict: dict      (the format info)

        Args:
            d: Raw yt-dlp progress hook dictionary.

        Returns:
            ProgressSnapshot: Structured progress data.
        """
        downloaded = d.get("downloaded_bytes", 0) or 0
        total = d.get("total_bytes") or d.get("total_bytes_estimate")
        speed = d.get("speed")
        eta = d.get("eta")
        status = d.get("status", "downloading")
        filename = d.get("filename", "")

        percent = 0.0
        if total and total > 0:
            percent = min(100.0, (downloaded / total) * 100)
        elif status == "finished":
            percent = 100.0

        return ProgressSnapshot(
            status=status,
            downloaded_bytes=downloaded,
            total_bytes=total,
            speed=speed,
            eta=eta,
            percent=round(percent, 1),
            video_id=self.job_id,
            filename=filename,
        )

    def _snapshot_to_dict(self, snapshot: ProgressSnapshot) -> dict[str, Any]:
        """Convert a ProgressSnapshot to a JSON-serialisable dict."""
        return {
            "job_id": self.job_id,
            "status": snapshot.status,
            "downloaded_bytes": snapshot.downloaded_bytes,
            "total_bytes": snapshot.total_bytes,
            "speed": snapshot.speed,
            "eta": snapshot.eta,
            "percent": snapshot.percent,
            "filename": snapshot.filename,
            "file_path": snapshot.file_path,
            "completed_count": snapshot.completed_count,
            "total_count": snapshot.total_count,
        }

    def get_latest_snapshot(self) -> ProgressSnapshot:
        """Return the most recent progress snapshot (thread-safe).

        Used by the polling endpoint to return current state without
        requiring an active WebSocket connection.

        Returns:
            ProgressSnapshot: The latest progress data.
        """
        with self._snapshot_lock:
            return self._latest_snapshot

    def update_snapshot(self, snapshot: ProgressSnapshot) -> None:
        """Manually update the latest snapshot (e.g., for status transitions).

        Called by the job manager when transitioning between states
        (queued → downloading → merging → completed).

        Args:
            snapshot: New progress snapshot to store.
        """
        with self._snapshot_lock:
            self._latest_snapshot = snapshot

        # Also push to the async queue
        if self._loop.is_running():
            self._loop.call_soon_threadsafe(
                lambda: asyncio.ensure_future(
                    self._put_snapshot(snapshot), loop=self._loop
                )
            )

    async def _put_snapshot(self, snapshot: ProgressSnapshot) -> None:
        """Put a snapshot onto the async queue."""
        try:
            self._async_queue.put_nowait(self._snapshot_to_dict(snapshot))
        except asyncio.QueueFull:
            pass

    def get_async_queue(self) -> asyncio.Queue:
        """Return the asyncio queue for WebSocket consumption.

        The WebSocket handler should await queue.get() in a loop to receive
        progress updates in real time.

        Returns:
            asyncio.Queue: The async progress queue.
        """
        return self._async_queue

    def close(self) -> None:
        """Mark the bridge as closed; stop accepting new progress events."""
        self._closed = True


class ProgressBridgeRegistry:
    """Global registry of ProgressBridge instances, keyed by job_id.

    Thread-safe singleton that allows WebSocket handlers to locate the
    correct bridge for any active job.
    """

    def __init__(self) -> None:
        self._bridges: dict[str, ProgressBridge] = {}
        self._lock = threading.Lock()

    def create(self, job_id: str, loop: asyncio.AbstractEventLoop) -> ProgressBridge:
        """Create and register a new ProgressBridge for a job.

        Args:
            job_id: UUID string for the job.
            loop: The running asyncio event loop.

        Returns:
            ProgressBridge: The newly created bridge.
        """
        bridge = ProgressBridge(job_id, loop)
        with self._lock:
            self._bridges[job_id] = bridge
        return bridge

    def get(self, job_id: str) -> ProgressBridge | None:
        """Look up the bridge for a job by job_id.

        Args:
            job_id: UUID string for the job.

        Returns:
            ProgressBridge | None: The bridge, or None if the job is not active.
        """
        with self._lock:
            return self._bridges.get(job_id)

    def remove(self, job_id: str) -> None:
        """Remove and close the bridge for a completed/cancelled job.

        Args:
            job_id: UUID string for the job.
        """
        with self._lock:
            bridge = self._bridges.pop(job_id, None)
        if bridge:
            bridge.close()


# Module-level singleton
progress_registry = ProgressBridgeRegistry()
