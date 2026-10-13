/**
 * IndexedDB storage layer for YT Music Online Player (Version 2).
 *
 * Uses the lightweight 'idb' wrapper around IndexedDB.
 * Manages:
 * - Unified tracks repository (YouTube streams + downloaded library files)
 * - Custom and imported playlists
 * - Playback history with listen-qualification (>=30s or >=50%) and capped log (500 items)
 * - Aggregated play counts ("Most Played")
 * - Liked songs ("Liked Tracks")
 * - User settings & throttled playerState persistence
 * - Downloaded offline audio/thumbnail Blobs (NEVER ephemeral object URLs)
 *
 * All operations are SSR-safe and fall back gracefully if IndexedDB is unavailable.
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { FileInfo, PlaylistInfoResponse } from "./types";
import type { PersistedPlayerState } from "./player/types";
import { PLAY_THRESHOLD_SEC, SKIP_THRESHOLD_SEC } from "./player/constants";

// ── Types ──────────────────────────────────────────────────────────────────

export interface TrackRecord {
  id: string; // YouTube video ID or "lib:<filename>"
  title: string;
  artist: string;
  durationSec: number;
  thumbnailUrl?: string | null;
  source: "youtube" | "library";
  unavailable?: boolean;
  addedAt: number;
  metadata?: FileInfo; // Cached snapshot for instant rendering
}

export interface PlaylistRecord {
  id: string; // UUID or legacy id
  name: string;
  kind?: "user" | "youtube-import";
  sourceUrl?: string;
  trackIds?: string[]; // Ordered list of track IDs
  coverTrackId?: string;
  createdAt?: number;
  updatedAt?: number;
  songFilenames: string[]; // Required for complete backwards compatibility
}

// Backwards-compatibility alias for components expecting CustomPlaylist
export type CustomPlaylist = PlaylistRecord;

export interface HistoryRecord {
  key?: number; // Auto-increment primary key
  trackId: string;
  playedAt: number;
  listenedSec: number;
  completed: boolean;
  track?: FileInfo; // Backwards-compatible snapshot
  timestamp?: number;
}

export interface PlayCountRecord {
  trackId: string;
  count: number;
  lastPlayedAt: number;
}

export interface LikedTrackRecord {
  trackId: string;
  likedAt: number;
}

export interface SettingRecord {
  key: string;
  value: unknown;
  updatedAt: number;
}

export interface OfflineTrackRecord {
  id: string; // video_id or unique identifier
  filename: string;
  audioBlob: Blob; // Raw audio file blob (NEVER store ephemeral object URLs)
  thumbnailBlob?: Blob | null;
  metadata: FileInfo;
  savedAt: number;
  sizeBytes: number;
}

// ── Database Schema ────────────────────────────────────────────────────────

export interface MusicPlayerDBSchema extends DBSchema {
  playlists: {
    key: string;
    value: PlaylistRecord;
    indexes: { "by-kind": string };
  };
  tracks: {
    key: string;
    value: TrackRecord;
    indexes: { "by-source": string };
  };
  history: {
    key: number;
    value: HistoryRecord;
    indexes: {
      "by-playedAt": number;
      "by-trackId": string;
      "by-timestamp"?: number;
    };
  };
  playCounts: {
    key: string;
    value: PlayCountRecord;
    indexes: { "by-count": number };
  };
  likedTracks: {
    key: string;
    value: LikedTrackRecord;
  };
  settings: {
    key: string;
    value: SettingRecord;
  };
  offlineTracks: {
    key: string;
    value: OfflineTrackRecord;
    indexes: { "by-filename": string };
  };
}

const DB_NAME = "yt_music_player_db";
const DB_VERSION = 2;
export const LOCAL_STORAGE_PLAYLISTS_KEY = "ytdl_user_playlists_v1";
export const LEGACY_PLAYLISTS_KEY = "ytdl_custom_playlists_v1";

let dbPromise: Promise<IDBPDatabase<MusicPlayerDBSchema>> | null = null;

/**
 * Get or initialize the IndexedDB singleton. Returns null during SSR or if unsupported.
 */
export function getDB(): Promise<IDBPDatabase<MusicPlayerDBSchema>> | null {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return null;
  }
  if (!dbPromise) {
    dbPromise = openDB<MusicPlayerDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        // ── Stores created in v1 ──
        if (!db.objectStoreNames.contains("playlists")) {
          const playlistStore = db.createObjectStore("playlists", { keyPath: "id" });
          playlistStore.createIndex("by-kind", "kind");
        }
        if (!db.objectStoreNames.contains("tracks")) {
          const trackStore = db.createObjectStore("tracks", { keyPath: "id" });
          trackStore.createIndex("by-source", "source");
        }
        if (!db.objectStoreNames.contains("history")) {
          const historyStore = db.createObjectStore("history", { keyPath: "key", autoIncrement: true });
          historyStore.createIndex("by-playedAt", "playedAt");
          historyStore.createIndex("by-trackId", "trackId");
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("offlineTracks")) {
          const offlineStore = db.createObjectStore("offlineTracks", { keyPath: "id" });
          offlineStore.createIndex("by-filename", "filename");
        }

        // ── Upgrades for v2 ──
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains("playCounts")) {
            const playCountsStore = db.createObjectStore("playCounts", { keyPath: "trackId" });
            playCountsStore.createIndex("by-count", "count");
          }
          if (!db.objectStoreNames.contains("likedTracks")) {
            db.createObjectStore("likedTracks", { keyPath: "trackId" });
          }

          // Ensure indexes on existing stores
          const playlistStore = transaction.objectStore("playlists");
          if (!playlistStore.indexNames.contains("by-kind")) {
            playlistStore.createIndex("by-kind", "kind");
          }

          const trackStore = transaction.objectStore("tracks");
          if (!trackStore.indexNames.contains("by-source")) {
            trackStore.createIndex("by-source", "source");
          }

          const historyStore = transaction.objectStore("history");
          if (!historyStore.indexNames.contains("by-playedAt")) {
            historyStore.createIndex("by-playedAt", "playedAt");
          }
          if (!historyStore.indexNames.contains("by-trackId")) {
            historyStore.createIndex("by-trackId", "trackId");
          }
        }
      },
    });
  }
  return dbPromise;
}

// ── TRACK CONVERSION HELPERS ───────────────────────────────────────────────

/**
 * Standardize FileInfo to a TrackRecord with stable ID.
 */
export function fileInfoToTrackRecord(file: FileInfo): TrackRecord {
  let id = file.youtube_id || "";
  let source: "youtube" | "library" = "youtube";

  if (!id) {
    if (file.filename.startsWith("lib:")) {
      id = file.filename;
      source = "library";
    } else {
      id = `lib:${file.filename}`;
      source = "library";
    }
  }

  return {
    id,
    title: file.clean_title || file.filename,
    artist: file.artist || "Unknown Artist",
    durationSec: typeof file.duration === "number" ? file.duration : 0,
    thumbnailUrl: file.thumbnail_url || null,
    source,
    addedAt: Date.now(),
    metadata: file,
  };
}

/**
 * Convert a TrackRecord back into a FileInfo compatible with player components.
 */
export function trackRecordToFileInfo(tr: TrackRecord): FileInfo {
  if (tr.metadata) {
    return {
      ...tr.metadata,
      clean_title: tr.title,
      artist: tr.artist,
      duration: tr.durationSec,
      thumbnail_url: tr.thumbnailUrl,
    };
  }

  const isLibrary = tr.source === "library" || tr.id.startsWith("lib:");
  const cleanFilename = tr.id.replace(/^lib:/, "");

  return {
    filename: isLibrary ? cleanFilename : `${tr.id}.m4a`,
    clean_title: tr.title,
    artist: tr.artist,
    media_type: "audio",
    size_bytes: 0,
    created_at: new Date(tr.addedAt).toISOString(),
    modified_at: new Date(tr.addedAt).toISOString(),
    download_url: isLibrary ? `/api/files/${cleanFilename}` : "",
    thumbnail_url: tr.thumbnailUrl,
    youtube_id: isLibrary ? undefined : tr.id,
    source_type: isLibrary ? "library" : "stream",
    duration: tr.durationSec,
  };
}

// ── TRACKS REPOSITORY ──────────────────────────────────────────────────────

export async function upsertTrack(track: TrackRecord): Promise<void> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return;
  try {
    const db = await dbPromiseRef;
    await db.put("tracks", track);
  } catch (err) {
    console.warn("Failed to upsert track in IndexedDB:", err);
  }
}

export async function getTrack(trackId: string): Promise<TrackRecord | undefined> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return undefined;
  try {
    const db = await dbPromiseRef;
    return await db.get("tracks", trackId);
  } catch {
    return undefined;
  }
}

export async function getTracks(trackIds: string[]): Promise<TrackRecord[]> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef || trackIds.length === 0) return [];
  try {
    const db = await dbPromiseRef;
    const tx = db.transaction("tracks", "readonly");
    const results: TrackRecord[] = [];
    for (const id of trackIds) {
      const record = await tx.store.get(id);
      if (record) results.push(record);
    }
    return results;
  } catch {
    return [];
  }
}

// ── PLAYLISTS REPOSITORY ───────────────────────────────────────────────────

const DEFAULT_PLAYLISTS: PlaylistRecord[] = [
  {
    id: "pl-favorites",
    name: "Favorites ⭐",
    kind: "user",
    trackIds: [],
    songFilenames: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "pl-workout",
    name: "Workout Energy ⚡",
    kind: "user",
    trackIds: [],
    songFilenames: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: "pl-chill",
    name: "Late Night Chill 🌙",
    kind: "user",
    trackIds: [],
    songFilenames: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

function normalizePlaylistRecord(p: any): PlaylistRecord {
  const trackIds: string[] = Array.isArray(p.trackIds)
    ? p.trackIds
    : Array.isArray(p.songFilenames)
    ? p.songFilenames.map((f: string) => (f.startsWith("lib:") ? f : `lib:${f}`))
    : [];

  return {
    id: p.id || `pl_${Date.now()}`,
    name: p.name || "Untitled Playlist",
    kind: p.kind === "youtube-import" ? "youtube-import" : "user",
    sourceUrl: p.sourceUrl,
    trackIds,
    songFilenames: trackIds.map((id) => id.replace(/^lib:/, "")),
    coverTrackId: p.coverTrackId || (trackIds.length > 0 ? trackIds[0] : undefined),
    createdAt: p.createdAt || Date.now(),
    updatedAt: p.updatedAt || Date.now(),
  };
}

function getLocalStoragePlaylistsBackup(): PlaylistRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw =
      localStorage.getItem(LOCAL_STORAGE_PLAYLISTS_KEY) ||
      localStorage.getItem(LEGACY_PLAYLISTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizePlaylistRecord) : [];
  } catch {
    return [];
  }
}

function updateLocalStorageBackup(playlists: PlaylistRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_PLAYLISTS_KEY, JSON.stringify(playlists));
    window.dispatchEvent(new Event("ytdl_playlists_updated"));
  } catch {}
}

export async function migratePlaylistsFromLocalStorage(): Promise<PlaylistRecord[]> {
  const dbPromiseRef = getDB();
  const backup = getLocalStoragePlaylistsBackup();
  const playlistsToSeed = backup.length > 0 ? backup : DEFAULT_PLAYLISTS;

  if (!dbPromiseRef) return playlistsToSeed;

  try {
    const db = await dbPromiseRef;
    const tx = db.transaction("playlists", "readwrite");
    const existing = await tx.store.getAll();

    if (existing.length === 0) {
      for (const pl of playlistsToSeed) {
        await tx.store.put(normalizePlaylistRecord(pl));
      }
      await tx.done;
      updateLocalStorageBackup(playlistsToSeed);
      return playlistsToSeed;
    }
    return existing.map(normalizePlaylistRecord);
  } catch (err) {
    console.warn("Error migrating playlists to IndexedDB:", err);
    return playlistsToSeed;
  }
}

export async function getAllPlaylists(): Promise<PlaylistRecord[]> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return getLocalStoragePlaylistsBackup();

  try {
    const db = await dbPromiseRef;
    const all = await db.getAll("playlists");
    if (all.length === 0) {
      return await migratePlaylistsFromLocalStorage();
    }
    return all.map(normalizePlaylistRecord);
  } catch (err) {
    console.warn("Failed to read playlists from IndexedDB, using backup:", err);
    return getLocalStoragePlaylistsBackup();
  }
}

export async function savePlaylist(playlist: PlaylistRecord): Promise<void> {
  const normalized = normalizePlaylistRecord(playlist);
  const dbPromiseRef = getDB();
  if (dbPromiseRef) {
    try {
      const db = await dbPromiseRef;
      await db.put("playlists", { ...normalized, updatedAt: Date.now() });
    } catch (e) {
      console.warn("IndexedDB savePlaylist failed:", e);
    }
  }

  const all = getLocalStoragePlaylistsBackup();
  const idx = all.findIndex((p) => p.id === normalized.id);
  if (idx >= 0) {
    all[idx] = normalized;
  } else {
    all.push(normalized);
  }
  updateLocalStorageBackup(all);
}

export async function saveAllPlaylists(playlists: PlaylistRecord[]): Promise<void> {
  const normalizedList = playlists.map(normalizePlaylistRecord);
  const dbPromiseRef = getDB();
  if (dbPromiseRef) {
    try {
      const db = await dbPromiseRef;
      const tx = db.transaction("playlists", "readwrite");
      await tx.store.clear();
      for (const pl of normalizedList) {
        await tx.store.put({ ...pl, updatedAt: Date.now() });
      }
      await tx.done;
    } catch (e) {
      console.warn("IndexedDB saveAllPlaylists failed:", e);
    }
  }
  updateLocalStorageBackup(normalizedList);
}

export async function deletePlaylist(id: string): Promise<void> {
  const dbPromiseRef = getDB();
  if (dbPromiseRef) {
    try {
      const db = await dbPromiseRef;
      await db.delete("playlists", id);
    } catch (e) {
      console.warn("IndexedDB deletePlaylist failed:", e);
    }
  }
  const all = getLocalStoragePlaylistsBackup().filter((p) => p.id !== id);
  updateLocalStorageBackup(all);
}

// ── PLAYBACK HISTORY & RECENTLY PLAYED ─────────────────────────────────────

const MAX_HISTORY_ITEMS = 500;

/**
 * Record a played track only after listening for >= 15 seconds OR >= 50% of track duration.
 * Skipping before 5 seconds is discarded.
 * Updates playCounts aggregate and caps history at 500 entries.
 */
export async function recordPlayHistory(
  trackId: string,
  listenedSec: number,
  durationSec: number,
  trackInfo?: FileInfo,
): Promise<boolean> {
  // Discard early skips (< 5 seconds)
  if (listenedSec < SKIP_THRESHOLD_SEC) {
    return false;
  }

  // Check qualification: >= 15 seconds or >= 50% of track duration
  const isQualified =
    listenedSec >= PLAY_THRESHOLD_SEC || (durationSec > 0 && listenedSec >= durationSec * 0.5);

  if (!isQualified) {
    return false;
  }

  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return false;

  try {
    const db = await dbPromiseRef;
    const now = Date.now();
    const completed = durationSec > 0 && listenedSec >= durationSec * 0.9;

    // 1. If trackInfo provided, ensure track is cached in tracks store
    if (trackInfo) {
      const tr = fileInfoToTrackRecord(trackInfo);
      await db.put("tracks", tr);
    }

    // 2. Add entry to history
    await db.add("history", {
      trackId,
      playedAt: now,
      listenedSec,
      completed,
      track: trackInfo,
      timestamp: now,
    });

    // 3. Update aggregate playCounts
    const existingCount = await db.get("playCounts", trackId);
    await db.put("playCounts", {
      trackId,
      count: (existingCount?.count || 0) + 1,
      lastPlayedAt: now,
    });

    // 4. Cap history store at MAX_HISTORY_ITEMS (500)
    const count = await db.count("history");
    if (count > MAX_HISTORY_ITEMS) {
      const tx = db.transaction("history", "readwrite");
      let cursor = await tx.store.openCursor();
      let toDelete = count - MAX_HISTORY_ITEMS;
      while (cursor && toDelete > 0) {
        await cursor.delete();
        toDelete--;
        cursor = await cursor.continue();
      }
      await tx.done;
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("ytdl_history_updated"));
    }
    return true;
  } catch (err) {
    console.warn("Failed to record play history:", err);
    return false;
  }
}

// Legacy alias used by existing components
export async function addHistoryEntry(track: FileInfo): Promise<void> {
  const tr = fileInfoToTrackRecord(track);
  await recordPlayHistory(tr.id, PLAY_THRESHOLD_SEC, tr.durationSec, track);
}

/**
 * Retrieve de-duplicated "Recently Played" tracks (last unique tracks, max 50).
 */
export async function getRecentlyPlayedTracks(limit = 50): Promise<TrackRecord[]> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return [];

  try {
    const db = await dbPromiseRef;
    const historyTx = db.transaction("history", "readonly");
    const index = historyTx.store.index("by-playedAt");
    const seenTrackIds = new Set<string>();
    const orderedTrackIds: string[] = [];

    let cursor = await index.openCursor(null, "prev");
    while (cursor && orderedTrackIds.length < limit) {
      const tid = cursor.value.trackId;
      if (tid && !seenTrackIds.has(tid)) {
        seenTrackIds.add(tid);
        orderedTrackIds.push(tid);
      }
      cursor = await cursor.continue();
    }

    if (orderedTrackIds.length === 0) return [];

    // Fetch TrackRecords
    const tracksTx = db.transaction("tracks", "readonly");
    const results: TrackRecord[] = [];
    for (const tid of orderedTrackIds) {
      const tr = await tracksTx.store.get(tid);
      if (tr) {
        results.push(tr);
      } else {
        // Fallback placeholder
        results.push({
          id: tid,
          title: tid.startsWith("lib:") ? tid.replace(/^lib:/, "") : tid,
          artist: "Unknown Artist",
          durationSec: 0,
          source: tid.startsWith("lib:") ? "library" : "youtube",
          addedAt: Date.now(),
        });
      }
    }
    return results;
  } catch (err) {
    console.warn("Failed to get recently played tracks:", err);
    return [];
  }
}

/**
 * Retrieve "Most Played" tracks sorted by play count.
 */
export async function getMostPlayedTracks(limit = 50): Promise<{ track: TrackRecord; count: number }[]> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return [];

  try {
    const db = await dbPromiseRef;
    const allCounts = await db.getAll("playCounts");
    allCounts.sort((a, b) => b.count - a.count);

    const top = allCounts.slice(0, limit);
    const results: { track: TrackRecord; count: number }[] = [];

    const tracksTx = db.transaction("tracks", "readonly");
    for (const item of top) {
      const tr = await tracksTx.store.get(item.trackId);
      if (tr) {
        results.push({ track: tr, count: item.count });
      } else {
        results.push({
          track: {
            id: item.trackId,
            title: item.trackId.startsWith("lib:") ? item.trackId.replace(/^lib:/, "") : item.trackId,
            artist: "Unknown Artist",
            durationSec: 0,
            source: item.trackId.startsWith("lib:") ? "library" : "youtube",
            addedAt: Date.now(),
          },
          count: item.count,
        });
      }
    }
    return results;
  } catch (err) {
    console.warn("Failed to get most played tracks:", err);
    return [];
  }
}

/**
 * Retrieve raw playback history log entries (sorted newest to oldest).
 */
export async function getHistoryEntries(limit = 100): Promise<HistoryRecord[]> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return [];

  try {
    const db = await dbPromiseRef;
    const index = db.transaction("history").store.index("by-playedAt");
    const results: HistoryRecord[] = [];
    let cursor = await index.openCursor(null, "prev");
    while (cursor && results.length < limit) {
      results.push(cursor.value);
      cursor = await cursor.continue();
    }
    return results;
  } catch (err) {
    console.warn("Failed to fetch history entries:", err);
    return [];
  }
}

export async function clearHistory(): Promise<void> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return;
  try {
    const db = await dbPromiseRef;
    await db.clear("history");
    await db.clear("playCounts");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("ytdl_history_updated"));
    }
  } catch {}
}

export async function deleteHistoryEntry(key: number): Promise<void> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return;
  try {
    const db = await dbPromiseRef;
    await db.delete("history", key);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("ytdl_history_updated"));
    }
  } catch {}
}

// ── LIKED TRACKS REPOSITORY ────────────────────────────────────────────────

export async function isTrackLiked(trackId: string): Promise<boolean> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return false;
  try {
    const db = await dbPromiseRef;
    const record = await db.get("likedTracks", trackId);
    return !!record;
  } catch {
    return false;
  }
}

export async function toggleLikeTrack(trackId: string, trackInfo?: FileInfo): Promise<boolean> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return false;
  try {
    const db = await dbPromiseRef;
    const existing = await db.get("likedTracks", trackId);
    if (existing) {
      await db.delete("likedTracks", trackId);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ytdl_liked_changed", { detail: { trackId, liked: false } }));
      }
      return false;
    } else {
      // Upsert track into 'tracks' store before recording the like
      const existingTrack = await db.get("tracks", trackId);
      if (trackInfo) {
        await db.put("tracks", fileInfoToTrackRecord(trackInfo));
      } else if (!existingTrack) {
        const isLib = trackId.startsWith("lib:");
        await db.put("tracks", {
          id: trackId,
          title: isLib ? trackId.replace(/^lib:/, "") : trackId,
          artist: "Unknown Artist",
          durationSec: 0,
          source: isLib ? "library" : "youtube",
          addedAt: Date.now(),
        });
      }

      await db.put("likedTracks", { trackId, likedAt: Date.now() });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ytdl_liked_changed", { detail: { trackId, liked: true } }));
      }
      return true;
    }
  } catch {
    return false;
  }
}

export async function getAllLikedTrackIds(): Promise<string[]> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return [];
  try {
    const db = await dbPromiseRef;
    const all = await db.getAll("likedTracks");
    return all.map((item) => item.trackId);
  } catch {
    return [];
  }
}

export async function getLikedTracks(): Promise<TrackRecord[]> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return [];
  try {
    const db = await dbPromiseRef;
    const all = await db.getAll("likedTracks");
    all.sort((a, b) => b.likedAt - a.likedAt);

    const tracksTx = db.transaction("tracks", "readonly");
    const results: TrackRecord[] = [];
    for (const item of all) {
      const tr = await tracksTx.store.get(item.trackId);
      if (tr) {
        results.push(tr);
      } else {
        results.push({
          id: item.trackId,
          title: item.trackId.startsWith("lib:") ? item.trackId.replace(/^lib:/, "") : item.trackId,
          artist: "Unknown Artist",
          durationSec: 0,
          source: item.trackId.startsWith("lib:") ? "library" : "youtube",
          addedAt: item.likedAt,
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

// ── YOUTUBE PLAYLIST IMPORT & REFRESH ──────────────────────────────────────

export async function importYouTubePlaylist(
  info: PlaylistInfoResponse,
  sourceUrl?: string,
): Promise<PlaylistRecord> {
  const trackIds: string[] = [];
  const dbPromiseRef = getDB();

  for (const item of info.videos) {
    if (!item.video_id) continue;
    trackIds.push(item.video_id);
    const tr: TrackRecord = {
      id: item.video_id,
      title: item.title,
      artist: info.uploader || "YouTube Music",
      durationSec: typeof item.duration === "number" ? item.duration : 0,
      thumbnailUrl: item.thumbnail,
      source: "youtube",
      addedAt: Date.now(),
    };
    if (dbPromiseRef) {
      await upsertTrack(tr);
    }
  }

  const playlist: PlaylistRecord = {
    id: `yt_${info.playlist_id}`,
    name: info.title || "Imported YouTube Playlist",
    kind: "youtube-import",
    sourceUrl: sourceUrl || `https://www.youtube.com/playlist?list=${info.playlist_id}`,
    trackIds,
    songFilenames: trackIds,
    coverTrackId: trackIds[0],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await savePlaylist(playlist);
  return playlist;
}

// ── PLAYER STATE & SETTINGS ────────────────────────────────────────────────

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return defaultValue;

  try {
    const db = await dbPromiseRef;
    const record = await db.get("settings", key);
    if (record !== undefined && record.value !== undefined) {
      return record.value as T;
    }
  } catch {}
  return defaultValue;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return;

  try {
    const db = await dbPromiseRef;
    await db.put("settings", {
      key,
      value,
      updatedAt: Date.now(),
    });
  } catch {}
}

export async function savePersistedPlayerState(state: PersistedPlayerState): Promise<void> {
  await setSetting("playerState", state);
}

export async function getPersistedPlayerState(): Promise<PersistedPlayerState | null> {
  return await getSetting<PersistedPlayerState | null>("playerState", null);
}

// ── OFFLINE TRACKS REPOSITORY ──────────────────────────────────────────────

export async function saveOfflineTrack(record: OfflineTrackRecord): Promise<void> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) throw new Error("IndexedDB is not available in this browser environment");

  const db = await dbPromiseRef;
  await db.put("offlineTracks", record);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("ytdl_offline_updated"));
  }
}

export async function getOfflineTrack(id: string): Promise<OfflineTrackRecord | undefined> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return undefined;
  const db = await dbPromiseRef;
  return db.get("offlineTracks", id);
}

export async function getOfflineTrackByFilename(filename: string): Promise<OfflineTrackRecord | undefined> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return undefined;
  const db = await dbPromiseRef;
  return db.getFromIndex("offlineTracks", "by-filename", filename);
}

export async function getAllOfflineTracks(): Promise<OfflineTrackRecord[]> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return [];
  try {
    const db = await dbPromiseRef;
    return await db.getAll("offlineTracks");
  } catch {
    return [];
  }
}

export async function deleteOfflineTrack(id: string): Promise<void> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return;
  const db = await dbPromiseRef;
  await db.delete("offlineTracks", id);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("ytdl_offline_updated"));
  }
}

export async function clearAllOfflineTracks(): Promise<void> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return;
  const db = await dbPromiseRef;
  await db.clear("offlineTracks");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("ytdl_offline_updated"));
  }
}

export async function getOfflineStorageUsage(): Promise<{ count: number; totalBytes: number }> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return { count: 0, totalBytes: 0 };
  try {
    const db = await dbPromiseRef;
    const all = await db.getAll("offlineTracks");
    const totalBytes = all.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);
    return { count: all.length, totalBytes };
  } catch {
    return { count: 0, totalBytes: 0 };
  }
}

export async function getStorageQuotaEstimate(): Promise<{
  quotaBytes: number;
  usageBytes: number;
  percentUsed: number;
}> {
  if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const quotaBytes = estimate.quota || 0;
      const usageBytes = estimate.usage || 0;
      const percentUsed = quotaBytes > 0 ? (usageBytes / quotaBytes) * 100 : 0;
      return { quotaBytes, usageBytes, percentUsed };
    } catch {}
  }
  return { quotaBytes: 0, usageBytes: 0, percentUsed: 0 };
}

// ── PLAYLIST EXPORT / IMPORT ───────────────────────────────────────────────

export async function exportPlaylistsAsJson(): Promise<string> {
  const playlists = await getAllPlaylists();
  const dbPromiseRef = getDB();
  let likedTracks: LikedTrackRecord[] = [];
  if (dbPromiseRef) {
    try {
      const db = await dbPromiseRef;
      likedTracks = await db.getAll("likedTracks");
    } catch {}
  }

  return JSON.stringify(
    {
      version: 2,
      exportedAt: new Date().toISOString(),
      playlists,
      likedTracks,
    },
    null,
    2,
  );
}

export async function importPlaylistsFromJson(jsonString: string): Promise<{ imported: number }> {
  const parsed = JSON.parse(jsonString);
  const items: PlaylistRecord[] = Array.isArray(parsed) ? parsed : parsed.playlists;
  if (!Array.isArray(items)) {
    throw new Error("Invalid playlist backup format: missing playlists array");
  }

  const existing = await getAllPlaylists();
  const map = new Map<string, PlaylistRecord>(existing.map((p) => [p.id, p]));

  let count = 0;
  for (const item of items) {
    if (item.id && item.name) {
      const norm = normalizePlaylistRecord(item);
      map.set(item.id, norm);
      count++;
    }
  }

  const merged = Array.from(map.values());
  await saveAllPlaylists(merged);

  // Restore likedTracks if present in export payload
  if (Array.isArray(parsed.likedTracks)) {
    const dbPromiseRef = getDB();
    if (dbPromiseRef) {
      try {
        const db = await dbPromiseRef;
        const tx = db.transaction("likedTracks", "readwrite");
        for (const item of parsed.likedTracks) {
          if (item && item.trackId) {
            await tx.store.put({
              trackId: item.trackId,
              likedAt: item.likedAt || Date.now(),
            });
          }
        }
        await tx.done;
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("ytdl_liked_changed", { detail: { imported: true } }));
        }
      } catch (e) {
        console.warn("Failed to import liked tracks:", e);
      }
    }
  }

  return { imported: count };
}

// ── STREAMING QUALITY SETTINGS ─────────────────────────────────────────────

export type StreamingQualitySetting = "auto" | "compatible" | "saver";

let cachedQualitySetting: StreamingQualitySetting = "auto";

if (typeof window !== "undefined") {
  setTimeout(() => {
    getStreamingQualitySetting().then((q) => {
      cachedQualitySetting = q;
    });
  }, 0);
  window.addEventListener("ytdl_streaming_quality_changed", ((e: CustomEvent) => {
    if (e.detail) cachedQualitySetting = e.detail;
  }) as EventListener);
}

export function getCurrentStreamingQuality(): StreamingQualitySetting {
  return cachedQualitySetting;
}

export function isOpusSupported(): boolean {
  if (typeof window === "undefined" || typeof Audio === "undefined") {
    return false;
  }
  try {
    const audio = new Audio();
    const canPlay = audio.canPlayType('audio/webm; codecs="opus"');
    return canPlay === "probably" || canPlay === "maybe";
  } catch {
    return false;
  }
}

export async function getStreamingQualitySetting(): Promise<StreamingQualitySetting> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return "auto";
  try {
    const db = await dbPromiseRef;
    const record = await db.get("settings", "streamingQuality");
    if (record && (record.value === "auto" || record.value === "compatible" || record.value === "saver")) {
      return record.value as StreamingQualitySetting;
    }
  } catch {}
  return "auto";
}

export async function setStreamingQualitySetting(quality: StreamingQualitySetting): Promise<void> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return;
  try {
    const db = await dbPromiseRef;
    await db.put("settings", { key: "streamingQuality", value: quality, updatedAt: Date.now() });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ytdl_streaming_quality_changed", { detail: quality }));
    }
  } catch {}
}

export function getEffectiveStreamingQuality(setting: StreamingQualitySetting = "auto"): "auto" | "compatible" | "saver" {
  if (setting === "compatible") return "compatible";
  if (setting === "saver") return "saver";
  return isOpusSupported() ? "auto" : "compatible";
}
