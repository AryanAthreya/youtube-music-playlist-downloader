/**
 * REST API client — one typed function per endpoint.
 *
 * All functions throw an APIError-shaped object on non-2xx responses.
 * Never exposes raw fetch errors to consumers.
 */

import type {
  APIError,
  CreateJobResponse,
  DownloadRequest,
  FilesListResponse,
  HealthResponse,
  InfoResponse,
  JobResponse,
  SearchResponse,
} from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Helpers ──────────────────────────────────────────────────────────────────

class APIRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly jobId?: string,
  ) {
    super(message);
    this.name = "APIRequestError";
  }
}

async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${API_BASE}${path}`;
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers ?? {}),
      },
      ...options,
    });
  } catch (networkError) {
    throw new APIRequestError(
      "NETWORK_ERROR",
      "Failed to reach the backend. Is it running?",
      0,
    );
  }

  if (!response.ok) {
    let errorBody: Partial<APIError> = {};
    try {
      errorBody = await response.json();
    } catch {
      // Could not parse JSON error body
    }
    throw new APIRequestError(
      errorBody.error ?? "API_ERROR",
      errorBody.message ?? `HTTP ${response.status}`,
      response.status,
      errorBody.job_id,
    );
  }

  return response.json() as Promise<T>;
}

// ── Info ─────────────────────────────────────────────────────────────────────

/**
 * Fetch video or playlist metadata and available formats.
 *
 * @param url - YouTube video or playlist URL.
 * @returns VideoInfoResponse or PlaylistInfoResponse from the backend.
 * @throws APIRequestError on invalid URL, unavailable video, or backend error.
 */
export async function fetchInfo(url: string): Promise<InfoResponse> {
  return apiFetch<InfoResponse>("/api/info", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

/**
 * Search YouTube for videos by keywords.
 *
 * @param query - Keyword search term.
 * @param limit - Max results (default 15).
 * @returns SearchResponse containing top matching results.
 */
export async function searchYouTube(query: string, limit: number = 15): Promise<SearchResponse> {
  return apiFetch<SearchResponse>("/api/search", {
    method: "POST",
    body: JSON.stringify({ query, limit }),
  });
}

// ── Download ──────────────────────────────────────────────────────────────────

/**
 * Create a new download job (single video or playlist).
 *
 * @param request - DownloadRequest with url, mode, quality_id, and optional playlist_video_ids.
 * @returns CreateJobResponse with the new job_id and initial status.
 * @throws APIRequestError on invalid parameters or duplicate job.
 */
export async function createDownload(
  request: DownloadRequest,
): Promise<CreateJobResponse> {
  return apiFetch<CreateJobResponse>("/api/download", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

/**
 * Get the current status and progress of a download job.
 *
 * Polling fallback — prefer WebSocket for real-time updates.
 *
 * @param jobId - UUID string for the job.
 * @returns JobResponse with current state and progress.
 * @throws APIRequestError if the job is not found (server may have restarted).
 */
export async function getJobStatus(jobId: string): Promise<JobResponse> {
  return apiFetch<JobResponse>(`/api/download/${jobId}`);
}

/**
 * Cancel an active job or delete a completed job and its file.
 *
 * @param jobId - UUID string for the job.
 * @throws APIRequestError if the job is not found.
 */
export async function deleteJob(jobId: string): Promise<void> {
  await apiFetch<void>(`/api/download/${jobId}`, {
    method: "DELETE",
  });
}

/**
 * Get the download URL for a completed job's file.
 *
 * @param jobId - UUID string for the job.
 * @param stream - If true, requests inline stream disposition.
 * @returns Full URL to the file (including API base).
 */
export function getFileUrl(jobId: string, stream: boolean = false): string {
  const base = `${API_BASE}/api/download/${jobId}/file`;
  return stream ? `${base}?stream=true` : base;
}

// ── Files ─────────────────────────────────────────────────────────────────────

/**
 * List all completed download files from disk.
 *
 * Disk-backed — survives backend restarts. Returns files even if the
 * corresponding job records are gone.
 *
 * @returns FilesListResponse with all files in the completed/ directory.
 */
export async function getFiles(): Promise<FilesListResponse> {
  return apiFetch<FilesListResponse>("/api/files");
}

/**
 * Get the download URL for a file in the completed/ directory by filename.
 *
 * @param filename - Filename in completed/ (e.g. 'dQw4w9WgXcQ-title.mp4').
 * @param stream - If true, requests inline stream disposition.
 * @returns Full URL to the file.
 */
export function getFileByNameUrl(filename: string, stream: boolean = false): string {
  const base = `${API_BASE}/api/files/${encodeURIComponent(filename)}`;
  return stream ? `${base}?stream=true` : base;
}

/**
 * Delete a completed file from disk.
 *
 * @param filename - Filename in completed/
 */
export async function deleteFileByName(filename: string): Promise<{ message: string; filename: string }> {
  return apiFetch<{ message: string; filename: string }>(`/api/files/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
}

// ── Health ────────────────────────────────────────────────────────────────────

/**
 * Check backend health including yt-dlp, FFmpeg, and Deno.
 *
 * @returns HealthResponse with per-dependency status.
 */
export async function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/api/health");
}

// Re-export the error class for use in components
export { APIRequestError };
