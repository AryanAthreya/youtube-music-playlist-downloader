/**
 * IndexedDB storage layer for YT Music Online Player.
 *
 * Uses the lightweight 'idb' wrapper around IndexedDB.
 * Manages playlists, playback history, user settings, cached track metadata,
 * and downloaded offline audio/thumbnail Blobs.
 *
 * All operations are SSR-safe and fall back gracefully if IndexedDB is unavailable.
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { FileInfo } from "./types";

export interface CustomPlaylist {
  id: string;
  name: string;
  songFilenames: string[];
  createdAt?: number;
  updatedAt?: number;
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

export interface HistoryRecord {
  timestamp: number;
  track: FileInfo;
}

export interface SettingRecord {
  key: string;
  value: unknown;
  updatedAt: number;
}

export interface TrackRecord {
  id: string;
  track: FileInfo;
  updatedAt: number;
}

export interface MusicPlayerDBSchema extends DBSchema {
  playlists: {
    key: string;
    value: CustomPlaylist;
  };
  tracks: {
    key: string;
    value: TrackRecord;
  };
  history: {
    key: number;
    value: HistoryRecord;
    indexes: { "by-timestamp": number };
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
const DB_VERSION = 1;
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
      upgrade(db) {
        if (!db.objectStoreNames.contains("playlists")) {
          db.createObjectStore("playlists", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("tracks")) {
          db.createObjectStore("tracks", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("history")) {
          const historyStore = db.createObjectStore("history", { keyPath: "timestamp" });
          historyStore.createIndex("by-timestamp", "timestamp");
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("offlineTracks")) {
          const offlineStore = db.createObjectStore("offlineTracks", { keyPath: "id" });
          offlineStore.createIndex("by-filename", "filename");
        }
      },
    });
  }
  return dbPromise;
}

// ── PLAYLISTS REPOSITORY ───────────────────────────────────────────────────

const DEFAULT_PLAYLISTS: CustomPlaylist[] = [
  { id: "pl-favorites", name: "Favorites ⭐", songFilenames: [] },
  { id: "pl-workout", name: "Workout Energy ⚡", songFilenames: [] },
  { id: "pl-chill", name: "Late Night Chill 🌙", songFilenames: [] },
];

/**
 * Read backup playlists from localStorage.
 */
function getLocalStoragePlaylistsBackup(): CustomPlaylist[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PLAYLISTS_KEY) || localStorage.getItem(LEGACY_PLAYLISTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Write continuous backup to localStorage for crash resilience.
 */
function updateLocalStorageBackup(playlists: CustomPlaylist[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_PLAYLISTS_KEY, JSON.stringify(playlists));
    window.dispatchEvent(new Event("ytdl_playlists_updated"));
  } catch {}
}

/**
 * Idempotently migrate playlists from localStorage to IndexedDB if DB is empty.
 * Never deletes localStorage data (kept as safety backup).
 */
export async function migratePlaylistsFromLocalStorage(): Promise<CustomPlaylist[]> {
  const dbPromiseRef = getDB();
  const backup = getLocalStoragePlaylistsBackup();
  const playlistsToSeed = backup.length > 0 ? backup : DEFAULT_PLAYLISTS;

  if (!dbPromiseRef) {
    return playlistsToSeed;
  }

  try {
    const db = await dbPromiseRef;
    const tx = db.transaction("playlists", "readwrite");
    const existing = await tx.store.getAll();

    if (existing.length === 0) {
      for (const pl of playlistsToSeed) {
        await tx.store.put(pl);
      }
      await tx.done;
      updateLocalStorageBackup(playlistsToSeed);
      return playlistsToSeed;
    }
    return existing;
  } catch (err) {
    console.warn("Error migrating playlists to IndexedDB:", err);
    return playlistsToSeed;
  }
}

/**
 * Fetch all custom playlists from IndexedDB with transparent fallback and migration.
 */
export async function getAllPlaylists(): Promise<CustomPlaylist[]> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) {
    return getLocalStoragePlaylistsBackup();
  }

  try {
    const db = await dbPromiseRef;
    const all = await db.getAll("playlists");
    if (all.length === 0) {
      return await migratePlaylistsFromLocalStorage();
    }
    return all;
  } catch (err) {
    console.warn("Failed to read playlists from IndexedDB, using backup:", err);
    return getLocalStoragePlaylistsBackup();
  }
}

/**
 * Save or update a single playlist.
 */
export async function savePlaylist(playlist: CustomPlaylist): Promise<void> {
  const dbPromiseRef = getDB();
  if (dbPromiseRef) {
    try {
      const db = await dbPromiseRef;
      await db.put("playlists", {
        ...playlist,
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.warn("IndexedDB savePlaylist failed:", e);
    }
  }

  // Also update localStorage backup
  const all = getLocalStoragePlaylistsBackup();
  const idx = all.findIndex((p) => p.id === playlist.id);
  if (idx >= 0) {
    all[idx] = playlist;
  } else {
    all.push(playlist);
  }
  updateLocalStorageBackup(all);
}

/**
 * Save all playlists (bulk sync).
 */
export async function saveAllPlaylists(playlists: CustomPlaylist[]): Promise<void> {
  const dbPromiseRef = getDB();
  if (dbPromiseRef) {
    try {
      const db = await dbPromiseRef;
      const tx = db.transaction("playlists", "readwrite");
      await tx.store.clear();
      for (const pl of playlists) {
        await tx.store.put({ ...pl, updatedAt: Date.now() });
      }
      await tx.done;
    } catch (e) {
      console.warn("IndexedDB saveAllPlaylists failed:", e);
    }
  }
  updateLocalStorageBackup(playlists);
}

/**
 * Delete a playlist by ID.
 */
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

// ── PLAYBACK HISTORY REPOSITORY ────────────────────────────────────────────

const MAX_HISTORY_ITEMS = 100;

/**
 * Record a played track in the playback history, auto-capping at 100 entries.
 */
export async function addHistoryEntry(track: FileInfo): Promise<void> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return;

  try {
    const db = await dbPromiseRef;
    const now = Date.now();
    await db.put("history", { timestamp: now, track });

    // Clean up oldest items if exceeding cap
    const count = await db.count("history");
    if (count > MAX_HISTORY_ITEMS) {
      const tx = db.transaction("history", "readwrite");
      const index = tx.store.index("by-timestamp");
      let cursor = await index.openCursor();
      let toDelete = count - MAX_HISTORY_ITEMS;
      while (cursor && toDelete > 0) {
        await cursor.delete();
        toDelete--;
        cursor = await cursor.continue();
      }
      await tx.done;
    }
  } catch (err) {
    console.warn("Failed to write history to IndexedDB:", err);
  }
}

/**
 * Retrieve playback history entries, sorted from newest to oldest.
 */
export async function getHistoryEntries(limit = 50): Promise<HistoryRecord[]> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return [];

  try {
    const db = await dbPromiseRef;
    const index = db.transaction("history").store.index("by-timestamp");
    const results: HistoryRecord[] = [];
    let cursor = await index.openCursor(null, "prev");
    while (cursor && results.length < limit) {
      results.push(cursor.value);
      cursor = await cursor.continue();
    }
    return results;
  } catch (err) {
    console.warn("Failed to fetch history from IndexedDB:", err);
    return [];
  }
}

/**
 * Clear all playback history.
 */
export async function clearHistory(): Promise<void> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return;
  try {
    const db = await dbPromiseRef;
    await db.clear("history");
  } catch {}
}

// ── SETTINGS REPOSITORY ────────────────────────────────────────────────────

/**
 * Read setting from IndexedDB with fallback to defaultValue.
 */
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

/**
 * Write setting to IndexedDB.
 */
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

// ── OFFLINE TRACKS REPOSITORY ──────────────────────────────────────────────

/**
 * Save an offline track (audio blob + metadata) to IndexedDB.
 */
export async function saveOfflineTrack(record: OfflineTrackRecord): Promise<void> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) throw new Error("IndexedDB is not available in this browser environment");

  const db = await dbPromiseRef;
  await db.put("offlineTracks", record);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("ytdl_offline_updated"));
  }
}

/**
 * Get an offline track by its ID.
 */
export async function getOfflineTrack(id: string): Promise<OfflineTrackRecord | undefined> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return undefined;
  const db = await dbPromiseRef;
  return db.get("offlineTracks", id);
}

/**
 * Get an offline track by its filename.
 */
export async function getOfflineTrackByFilename(filename: string): Promise<OfflineTrackRecord | undefined> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return undefined;
  const db = await dbPromiseRef;
  return db.getFromIndex("offlineTracks", "by-filename", filename);
}

/**
 * Retrieve all offline tracks stored in IndexedDB.
 */
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

/**
 * Delete an offline track by ID.
 */
export async function deleteOfflineTrack(id: string): Promise<void> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return;
  const db = await dbPromiseRef;
  await db.delete("offlineTracks", id);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("ytdl_offline_updated"));
  }
}

/**
 * Remove all saved offline tracks from IndexedDB.
 */
export async function clearAllOfflineTracks(): Promise<void> {
  const dbPromiseRef = getDB();
  if (!dbPromiseRef) return;
  const db = await dbPromiseRef;
  await db.clear("offlineTracks");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("ytdl_offline_updated"));
  }
}

/**
 * Check total offline storage usage and track count.
 */
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

/**
 * Check browser storage quota and usage via navigator.storage.estimate().
 */
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

// ── PLAYLIST IMPORT / EXPORT ───────────────────────────────────────────────

/**
 * Export all playlists as a JSON string for user backup.
 */
export async function exportPlaylistsAsJson(): Promise<string> {
  const playlists = await getAllPlaylists();
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      playlists,
    },
    null,
    2,
  );
}

/**
 * Import playlists from JSON string. Merges with existing or adds newly.
 */
export async function importPlaylistsFromJson(jsonString: string): Promise<{ imported: number }> {
  const parsed = JSON.parse(jsonString);
  const items: CustomPlaylist[] = Array.isArray(parsed) ? parsed : parsed.playlists;
  if (!Array.isArray(items)) {
    throw new Error("Invalid playlist backup format: missing playlists array");
  }

  const existing = await getAllPlaylists();
  const map = new Map<string, CustomPlaylist>(existing.map((p) => [p.id, p]));

  let count = 0;
  for (const item of items) {
    if (item.id && item.name && Array.isArray(item.songFilenames)) {
      map.set(item.id, item);
      count++;
    }
  }

  const merged = Array.from(map.values());
  await saveAllPlaylists(merged);
  return { imported: count };
}
