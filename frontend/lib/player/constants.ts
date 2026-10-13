/**
 * Playback threshold and player constants.
 */

// Playback duration threshold required for a track to count as "played"
// (listened for >= 15 seconds or >= 50% of track duration).
export const PLAY_THRESHOLD_SEC = 15;

// Tracks skipped before this duration are explicitly discarded as early skips.
export const SKIP_THRESHOLD_SEC = 5;

/**
 * Resolve a unique, stable track ID across stream, offline, and library sources.
 * Library tracks are prefixed with "lib:".
 */
export function resolveTrackId(
  item: { youtube_id?: string; filename: string } | string | null | undefined,
): string {
  if (!item) return "";
  if (typeof item === "string") return item;
  if (item.youtube_id) return item.youtube_id;
  if (item.filename.startsWith("lib:")) return item.filename;
  return `lib:${item.filename}`;
}
