/**
 * Shared TypeScript types mirroring backend Pydantic schemas.
 *
 * ⚠️ MANUAL SYNC REQUIRED
 * These types mirror the backend Pydantic models in backend/app/schemas/.
 * There is no codegen in V1. After changing any Pydantic model, update this
 * file to match:
 *   - schemas/info.py       → VideoInfoResponse, PlaylistInfoResponse, FormatInfo, AudioOption
 *   - schemas/download.py   → DownloadRequest, JobResponse, CreateJobResponse, FileInfo
 *   - models/job.py         → JobStatus, ProgressSnapshot
 */

// ── Job Status ──────────────────────────────────────────────────────────────

export type JobStatus =
  | "queued"
  | "downloading"
  | "merging"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export type DownloadMode = "video" | "audio";

// ── Progress ────────────────────────────────────────────────────────────────

export interface ProgressSnapshot {
  status: string;
  downloaded_bytes: number;
  total_bytes: number | null;
  speed: number | null;       // bytes/second
  eta: number | null;         // seconds
  percent: number;
  video_id: string | null;
  filename: string | null;
  completed_count: number;
  total_count: number;
}

// WebSocket frame (superset of ProgressSnapshot with job context)
export interface WebSocketFrame extends ProgressSnapshot {
  job_id: string;
  type?: "heartbeat" | "progress" | "complete" | "error";
  file_path?: string | null;
  error?: string | null;
  message?: string;
}

// ── Info Endpoint ────────────────────────────────────────────────────────────

export interface FormatInfo {
  format_id: string;
  ext: string;
  resolution: string;         // e.g. "1920x1080"
  height: number | null;
  width: number | null;
  fps: number | null;
  vcodec: string | null;
  acodec: string | null;
  tbr: number | null;         // total bitrate kbps
  filesize: number | null;    // bytes
  filesize_approx: number | null;
  note: string | null;
}

export interface AudioOption {
  format_id: string;
  ext: string;
  acodec: string | null;
  abr: number | null;         // audio bitrate kbps
  filesize: number | null;
  filesize_approx: number | null;
  note: string | null;
}

export interface VideoInfoResponse {
  type: "video";
  video_id: string;
  title: string;
  thumbnail: string | null;
  duration: number | null;    // seconds
  uploader: string | null;
  upload_date: string | null; // YYYYMMDD
  view_count: number | null;
  formats: FormatInfo[];
  audio_options: AudioOption[];
}

export interface PlaylistVideoItem {
  video_id: string;
  title: string;
  thumbnail: string | null;
  duration: number | null;
  url: string;
}

export interface PlaylistInfoResponse {
  type: "playlist";
  playlist_id: string;
  title: string;
  uploader: string | null;
  video_count: number;
  videos: PlaylistVideoItem[];
}

export type InfoResponse = VideoInfoResponse | PlaylistInfoResponse;

// ── Search Endpoint ──────────────────────────────────────────────────────────

export interface SearchResultItem {
  video_id: string;
  url: string;
  title: string;
  uploader: string;
  duration: number | null;
  thumbnail: string | null;
  view_count: number | null;
}

export interface SearchResponse {
  query: string;
  count: number;
  results: SearchResultItem[];
}

// ── Download Endpoint ────────────────────────────────────────────────────────

export interface DownloadRequest {
  url: string;
  mode: DownloadMode;
  quality_id: string;
  playlist_video_ids?: string[] | null;
}

export interface CreateJobResponse {
  job_id: string;
  status: JobStatus;
}

export interface ChildJobResponse {
  video_id: string;
  title: string;
  thumbnail: string | null;
  duration: number | null;
  index: number;
  status: JobStatus;
  progress: ProgressSnapshot;
  file_path: string | null;
  error: string | null;
}

export interface JobResponse {
  job_id: string;
  url: string;
  mode: DownloadMode;
  status: JobStatus;
  progress: ProgressSnapshot;
  children: ChildJobResponse[];
  file_path: string | null;
  error: string | null;
  created_at: string;         // ISO 8601
}

// ── Files Endpoint ────────────────────────────────────────────────────────────

export interface FileInfo {
  filename: string;
  clean_title: string;
  media_type: "video" | "audio" | "other";
  thumbnail_url?: string | null;
  size_bytes: number;
  created_at: string;         // ISO 8601
  modified_at: string;        // ISO 8601
  download_url: string;       // Relative: /api/files/{filename}
}

export interface FilesListResponse {
  files: FileInfo[];
  total: number;
}

// ── Health Endpoint ───────────────────────────────────────────────────────────

export interface DependencyStatus {
  ok: boolean;
  version: string | null;
  error: string | null;
}

export interface HealthResponse {
  status: "healthy" | "degraded";
  python: string;
  dependencies: {
    yt_dlp: DependencyStatus;
    yt_dlp_ejs: DependencyStatus;
    ffmpeg: DependencyStatus;
    deno: DependencyStatus;
  };
}

// ── API Error ─────────────────────────────────────────────────────────────────

export interface APIError {
  error: string;          // Error code, e.g. "INVALID_URL"
  message: string;        // Human-readable message
  job_id?: string;
}
