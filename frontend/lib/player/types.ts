/**
 * Player engine type definitions.
 *
 * Framework-agnostic interfaces for queue items, repeat modes, player state,
 * and playback source resolution.
 */

import type { FileInfo } from "../types";

export interface QueueItem {
  qid: string;     // Unique identifier per queue entry (allows same song multiple times in queue)
  trackId: string; // References TrackRecord.id ("<youtube_id>" or "lib:<filename>")
}

export type RepeatMode = "off" | "all" | "one";

export interface PersistedPlayerState {
  queue: QueueItem[];
  currentIndex: number;
  positionSec: number;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  muted: boolean;
  savedAt: number;
}

export interface PlayerQueueState {
  items: QueueItem[];
  currentIndex: number;
  shuffle: boolean;
  repeat: RepeatMode;
  originalOrder: QueueItem[];
  historyStack: number[];
}

export type PlaybackSourceType = "offline" | "library" | "stream";

export interface ResolvedPlaybackSource {
  type: PlaybackSourceType;
  url: string;
  isEphemeralBlobUrl: boolean;
}
