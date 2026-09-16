/**
 * WebSocket client with automatic reconnect and polling fallback.
 *
 * Manages a single WebSocket connection per job, with:
 * - Exponential backoff reconnect (up to 5 retries)
 * - Automatic polling fallback when WebSocket fails persistently
 * - Clean teardown on job completion or manual close
 */

import type { JobResponse, WebSocketFrame } from "./types";
import { getJobStatus } from "./api";

const WS_BASE =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";

// Maximum reconnect attempts before switching to polling
const MAX_RECONNECT_ATTEMPTS = 5;
// Base delay for exponential backoff (ms)
const BASE_RECONNECT_DELAY_MS = 1000;
// Polling interval when WebSocket is unavailable (ms)
const POLL_INTERVAL_MS = 2000;

export type ProgressCallback = (frame: WebSocketFrame) => void;
export type CompleteCallback = (frame: WebSocketFrame) => void;
export type ErrorCallback = (error: string) => void;

const TERMINAL_STATUSES = new Set(["completed", "partial", "failed", "cancelled"]);

interface JobWebSocketHandle {
  /** Close the WebSocket connection and stop polling. */
  close: () => void;
}

/**
 * Create a WebSocket connection to stream job progress.
 *
 * Falls back to polling if WebSocket fails after MAX_RECONNECT_ATTEMPTS.
 *
 * @param jobId - UUID string for the job.
 * @param onProgress - Called on each progress frame.
 * @param onComplete - Called when the job reaches a terminal state.
 * @param onError - Called on connection errors.
 * @returns JobWebSocketHandle with a close() method.
 */
export function createJobWebSocket(
  jobId: string,
  onProgress: ProgressCallback,
  onComplete: CompleteCallback,
  onError: ErrorCallback,
): JobWebSocketHandle {
  let ws: WebSocket | null = null;
  let reconnectAttempts = 0;
  let closed = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (closed) return;

    const url = `${WS_BASE}/api/download/${jobId}/ws`;
    ws = new WebSocket(url);

    ws.onopen = () => {
      reconnectAttempts = 0; // Reset on successful connection
    };

    ws.onmessage = (event: MessageEvent) => {
      if (closed) return;
      try {
        const frame = JSON.parse(event.data as string) as WebSocketFrame;
        if (frame.type === "heartbeat") return; // Ignore heartbeats

        onProgress(frame);

        if (frame.status && TERMINAL_STATUSES.has(frame.status)) {
          onComplete(frame);
          close();
        }
      } catch {
        // Ignore unparseable frames
      }
    };

    ws.onerror = () => {
      // onerror is always followed by onclose; handle reconnect there
    };

    ws.onclose = (event: CloseEvent) => {
      if (closed) return;

      if (event.code === 1000) {
        // Normal close from server — job is terminal
        return;
      }

      reconnectAttempts++;
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        onError(
          `WebSocket disconnected after ${MAX_RECONNECT_ATTEMPTS} attempts. Switching to polling.`,
        );
        startPolling();
        return;
      }

      const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts - 1);
      reconnectTimer = setTimeout(connect, delay);
    };
  }

  function startPolling() {
    async function poll() {
      if (closed) return;
      try {
        const job: JobResponse = await getJobStatus(jobId);
        const frame: WebSocketFrame = {
          job_id: jobId,
          status: job.status,
          percent: job.progress.percent,
          downloaded_bytes: job.progress.downloaded_bytes,
          total_bytes: job.progress.total_bytes,
          speed: job.progress.speed,
          eta: job.progress.eta,
          video_id: job.progress.video_id,
          filename: job.progress.filename,
          completed_count: job.progress.completed_count,
          total_count: job.progress.total_count,
          file_path: job.file_path,
          error: job.error,
        };

        onProgress(frame);

        if (TERMINAL_STATUSES.has(job.status)) {
          onComplete(frame);
          close();
          return;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Polling failed";
        onError(message);
      }

      if (!closed) {
        pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();
  }

  function close() {
    closed = true;
    if (pollTimer) clearTimeout(pollTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      ws.close();
    }
  }

  // Start the WebSocket connection
  connect();

  return { close };
}

/**
 * Format a speed value (bytes/second) into a human-readable string.
 *
 * @param bytesPerSecond - Speed in bytes/second.
 * @returns Formatted string like "3.2 MB/s" or "512 KB/s".
 */
export function formatSpeed(bytesPerSecond: number | null): string {
  if (bytesPerSecond === null || bytesPerSecond === 0) return "—";
  if (bytesPerSecond >= 1_048_576) {
    return `${(bytesPerSecond / 1_048_576).toFixed(1)} MB/s`;
  }
  if (bytesPerSecond >= 1024) {
    return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`;
  }
  return `${bytesPerSecond.toFixed(0)} B/s`;
}

/**
 * Format an ETA value (seconds) into a human-readable string.
 *
 * @param seconds - Time remaining in seconds.
 * @returns Formatted string like "2m 34s" or "45s".
 */
export function formatEta(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

/**
 * Format a file size in bytes into a human-readable string.
 *
 * @param bytes - File size in bytes.
 * @returns Formatted string like "1.2 GB" or "42.5 MB".
 */
export function formatFileSize(bytes: number | null): string {
  if (bytes === null) return "unknown size";
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
