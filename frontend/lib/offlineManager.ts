/**
 * Offline Track Manager for YT Music Online Player.
 *
 * Manages downloading audio and thumbnail streams directly into IndexedDB as raw Blobs.
 *
 * CRITICAL RULE:
 * NEVER persist 'offline_blob_url' to IndexedDB or localStorage.
 * Ephemeral runtime object URLs must ONLY be created at play time via
 * URL.createObjectURL(blob) and revoked via URL.revokeObjectURL(url).
 */

import {
  saveOfflineTrack,
  deleteOfflineTrack,
  getOfflineTrack,
  getAllOfflineTracks,
  getOfflineStorageUsage,
  type OfflineTrackRecord,
} from "./db";
import { getStreamUrl, getThumbProxyUrl, getFileByNameUrl } from "./api";
import type { FileInfo } from "./types";

export interface OfflineProgressCallback {
  (percent: number, loadedBytes: number, totalBytes: number): void;
}

// Active runtime object URLs to prevent leaks
let activeRuntimeObjectUrl: string | null = null;

/**
 * Revoke the current active runtime audio object URL if one was created.
 */
export function revokeCurrentOfflineAudioUrl(): void {
  if (activeRuntimeObjectUrl) {
    try {
      URL.revokeObjectURL(activeRuntimeObjectUrl);
    } catch {}
    activeRuntimeObjectUrl = null;
  }
}

/**
 * Create a new ephemeral runtime object URL for an offline track audio Blob.
 * Automatically revokes any previous object URL.
 */
export function createRuntimeOfflineAudioUrl(blob: Blob): string {
  revokeCurrentOfflineAudioUrl();
  const url = URL.createObjectURL(blob);
  activeRuntimeObjectUrl = url;
  return url;
}

/**
 * Determine track unique ID (video_id or filename).
 */
export function getTrackOfflineId(track: FileInfo): string {
  return track.youtube_id || track.filename;
}

/**
 * Check if a track is saved in IndexedDB offline storage.
 */
export async function isTrackSavedOffline(track: FileInfo): Promise<boolean> {
  const id = getTrackOfflineId(track);
  const record = await getOfflineTrack(id);
  return record !== undefined;
}

/**
 * Download a track (audio + thumbnail) and persist as raw Blobs in IndexedDB.
 */
export async function saveTrackForOffline(
  track: FileInfo,
  onProgress?: OfflineProgressCallback,
): Promise<void> {
  const id = getTrackOfflineId(track);

  // 1. Determine download endpoint
  let audioUrl: string;
  if (track.source_type === "stream" || track.stream_url) {
    audioUrl = track.stream_url || (track.youtube_id ? getStreamUrl(track.youtube_id) : "");
  } else {
    audioUrl = getFileByNameUrl(track.filename);
  }

  if (!audioUrl) {
    throw new Error("Unable to resolve audio source URL for offline download");
  }

  // 2. Fetch audio with progress tracking
  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to download audio track: HTTP ${response.status}`);
  }

  const contentLength = response.headers.get("Content-Length");
  const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
  const reader = response.body?.getReader();

  let audioBlob: Blob;
  if (!reader) {
    audioBlob = await response.blob();
    onProgress?.(100, audioBlob.size, audioBlob.size);
  } else {
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        receivedBytes += value.length;
        if (totalBytes > 0) {
          const percent = Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
          onProgress?.(percent, receivedBytes, totalBytes);
        } else {
          onProgress?.(50, receivedBytes, 0);
        }
      }
    }

    const mimeType = response.headers.get("Content-Type") || "audio/mp4";
    // Copy chunks into a contiguous ArrayBuffer/Blob
    audioBlob = new Blob(chunks as BlobPart[], { type: mimeType });
    onProgress?.(100, audioBlob.size, audioBlob.size);
  }

  // 3. Fetch thumbnail via proxy to prevent CORS issues
  let thumbnailBlob: Blob | null = null;
  if (track.youtube_id) {
    try {
      const thumbUrl = getThumbProxyUrl(track.youtube_id);
      const thumbRes = await fetch(thumbUrl);
      if (thumbRes.ok) {
        thumbnailBlob = await thumbRes.blob();
      }
    } catch {}
  } else if (track.thumbnail_url) {
    try {
      const thumbRes = await fetch(track.thumbnail_url);
      if (thumbRes.ok) {
        thumbnailBlob = await thumbRes.blob();
      }
    } catch {}
  }

  // 4. Clean metadata copy (no ephemeral fields)
  const cleanMetadata: FileInfo = {
    ...track,
    source_type: "offline",
    offline_blob_url: undefined,
  };

  const record: OfflineTrackRecord = {
    id,
    filename: track.filename,
    audioBlob,
    thumbnailBlob,
    metadata: cleanMetadata,
    savedAt: Date.now(),
    sizeBytes: audioBlob.size + (thumbnailBlob?.size || 0),
  };

  await saveOfflineTrack(record);
}

/**
 * Remove an offline track from IndexedDB.
 */
export async function removeTrackFromOffline(track: FileInfo): Promise<void> {
  const id = getTrackOfflineId(track);
  await deleteOfflineTrack(id);
}

/**
 * Load offline track and return a FileInfo with an ephemeral runtime object URL.
 * NEVER persist this returned object URL.
 */
export async function loadOfflineTrackForPlayback(track: FileInfo): Promise<FileInfo | null> {
  const id = getTrackOfflineId(track);
  const record = await getOfflineTrack(id);
  if (!record) return null;

  const ephemeralUrl = createRuntimeOfflineAudioUrl(record.audioBlob);
  let ephemeralThumbUrl = record.metadata.thumbnail_url;
  if (record.thumbnailBlob) {
    try {
      ephemeralThumbUrl = URL.createObjectURL(record.thumbnailBlob);
    } catch {}
  }

  return {
    ...record.metadata,
    source_type: "offline",
    offline_blob_url: ephemeralUrl,
    thumbnail_url: ephemeralThumbUrl,
  };
}

/**
 * Retrieve all offline tracks converted to FileInfo for listing in library.
 */
export async function getAllOfflineTrackList(): Promise<FileInfo[]> {
  const records = await getAllOfflineTracks();
  return records.map((r) => ({
    ...r.metadata,
    source_type: "offline",
    size_bytes: r.sizeBytes,
    offline_blob_url: undefined, // runtime object URL created only on play
  }));
}

export { getOfflineStorageUsage };
