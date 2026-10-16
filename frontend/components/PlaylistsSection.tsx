"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import type { FileInfo, PlaylistInfoResponse } from "@/lib/types";
import { resolveMediaUrl, fetchInfo } from "@/lib/api";
import { formatFileSize } from "@/lib/websocket";
import { useTheme } from "../context/ThemeContext";
import {
  getAllPlaylists,
  saveAllPlaylists,
  exportPlaylistsAsJson,
  importPlaylistsFromJson,
  getRecentlyPlayedTracks,
  getMostPlayedTracks,
  getLikedTracks,
  getTracks,
  trackRecordToFileInfo,
  importYouTubePlaylist,
  getAllOfflineTracks,
  type PlaylistRecord,
  type CustomPlaylist,
  LOCAL_STORAGE_PLAYLISTS_KEY,
} from "@/lib/db";
import { PlaylistImportModal } from "./PlaylistImportModal";
import { LikeButton } from "./LikeButton";
import { saveTrackForOffline } from "@/lib/offlineManager";

export { LOCAL_STORAGE_PLAYLISTS_KEY, type CustomPlaylist };

export function getStoredPlaylists(): CustomPlaylist[] {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_PLAYLISTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveStoredPlaylists(playlists: CustomPlaylist[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_PLAYLISTS_KEY, JSON.stringify(playlists));
    window.dispatchEvent(new Event("ytdl_playlists_updated"));
  } catch {}
}

interface PlaylistsSectionProps {
  id?: string;
  allFiles: FileInfo[];
  onPlayPlaylist: (tracks: FileInfo[], startIndex?: number, playlistName?: string) => void;
  onSelectTrack: (file: FileInfo, queue: FileInfo[], playlistName?: string) => void;
  currentPlayingFile?: FileInfo | null;
}

export function PlaylistsSection({
  id = "playlists-section",
  allFiles,
  onPlayPlaylist,
  onSelectTrack,
  currentPlayingFile,
}: PlaylistsSectionProps) {
  const { config, theme } = useTheme();
  const isLight = config.isLight || theme === "soft-light";

  const [customPlaylists, setCustomPlaylists] = useState<PlaylistRecord[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [isRefreshingYt, setIsRefreshingYt] = useState(false);

  // Smart Playlists states
  const [recentlyPlayed, setRecentlyPlayed] = useState<FileInfo[]>([]);
  const [mostPlayed, setMostPlayed] = useState<FileInfo[]>([]);
  const [likedTracks, setLikedTracks] = useState<FileInfo[]>([]);
  const [offlineTracks, setOfflineTracks] = useState<FileInfo[]>([]);
  const [dbTracksMap, setDbTracksMap] = useState<Map<string, FileInfo>>(new Map());

  // Load Smart Playlists data
  const loadSmartPlaylists = useCallback(async () => {
    try {
      const [recentRecords, mostPlayedRecords, likedRecords, offlineRecords] = await Promise.all([
        getRecentlyPlayedTracks(50),
        getMostPlayedTracks(50),
        getLikedTracks(),
        getAllOfflineTracks(),
      ]);

      setRecentlyPlayed(recentRecords.map(trackRecordToFileInfo));
      setMostPlayed(mostPlayedRecords.map((m) => trackRecordToFileInfo(m.track)));
      setLikedTracks(likedRecords.map(trackRecordToFileInfo));
      setOfflineTracks(offlineRecords.map((o) => o.metadata));
    } catch (err) {
      console.warn("Failed to load smart playlists:", err);
    }
  }, []);

  // Load Custom Playlists & resolve tracks
  const loadCustomPlaylists = useCallback(async () => {
    try {
      const playlists = await getAllPlaylists();
      setCustomPlaylists(playlists);

      // Collect track IDs from all playlists to resolve in DB
      const allIds = new Set<string>();
      for (const pl of playlists) {
        if (pl.trackIds) {
          for (const tid of pl.trackIds) allIds.add(tid);
        }
        if (pl.songFilenames) {
          for (const fn of pl.songFilenames) {
            allIds.add(fn);
          }
        }
      }

      if (allIds.size > 0) {
        const records = await getTracks(Array.from(allIds));
        const map = new Map<string, FileInfo>();
        for (const rec of records) {
          map.set(rec.id, trackRecordToFileInfo(rec));
        }
        setDbTracksMap(map);
      }
    } catch (err) {
      console.warn("Failed to load custom playlists:", err);
    }
  }, []);

  useEffect(() => {
    loadSmartPlaylists();
    loadCustomPlaylists();

    const handleUpdate = () => {
      loadSmartPlaylists();
      loadCustomPlaylists();
    };

    window.addEventListener("ytdl_playlists_updated", handleUpdate);
    window.addEventListener("ytdl_history_updated", handleUpdate);
    window.addEventListener("ytdl_liked_changed", handleUpdate);
    window.addEventListener("ytdl_offline_updated", handleUpdate);

    return () => {
      window.removeEventListener("ytdl_playlists_updated", handleUpdate);
      window.removeEventListener("ytdl_history_updated", handleUpdate);
      window.removeEventListener("ytdl_liked_changed", handleUpdate);
      window.removeEventListener("ytdl_offline_updated", handleUpdate);
    };
  }, [loadSmartPlaylists, loadCustomPlaylists]);

  const savePlaylists = async (updated: PlaylistRecord[]) => {
    setCustomPlaylists(updated);
    await saveAllPlaylists(updated);
  };

  const handleExportPlaylists = async () => {
    try {
      const json = await exportPlaylistsAsJson();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `music_playlists_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to export playlists: " + String(err));
    }
  };

  const handleImportPlaylists = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await importPlaylistsFromJson(text);
      await loadCustomPlaylists();
      await loadSmartPlaylists();
      alert("Playlists imported successfully!");
    } catch (err) {
      alert("Failed to import playlists: " + String(err));
    }
    e.target.value = "";
  };

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    const newPl: PlaylistRecord = {
      id: "pl-" + Date.now(),
      name: newPlaylistName.trim(),
      kind: "user",
      songFilenames: [],
      trackIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = [...customPlaylists, newPl];
    savePlaylists(updated);
    setNewPlaylistName("");
    setShowNewModal(false);
    setActivePlaylistId(newPl.id);
  };

  const handleDeletePlaylist = (playlistId: string) => {
    if (!confirm("Are you sure you want to delete this playlist?")) return;
    const updated = customPlaylists.filter((p) => p.id !== playlistId);
    savePlaylists(updated);
    if (activePlaylistId === playlistId) {
      setActivePlaylistId(null);
    }
  };

  const handleRemoveTrack = (playlistId: string, filenameOrId: string) => {
    const updated = customPlaylists.map((pl) => {
      if (pl.id !== playlistId) return pl;
      return {
        ...pl,
        songFilenames: pl.songFilenames.filter((f) => f !== filenameOrId),
        trackIds: pl.trackIds?.filter((id) => id !== filenameOrId),
        updatedAt: Date.now(),
      };
    });
    savePlaylists(updated);
  };

  const handleRefreshYouTubePlaylist = async (playlist: PlaylistRecord) => {
    if (!playlist.sourceUrl) {
      alert("This playlist does not have a source YouTube URL.");
      return;
    }
    setIsRefreshingYt(true);
    try {
      const info = await fetchInfo(playlist.sourceUrl);
      if (info.type === "playlist") {
        await importYouTubePlaylist(info as PlaylistInfoResponse, playlist.sourceUrl);
        await loadCustomPlaylists();
        alert(`Playlist "${playlist.name}" refreshed with ${info.videos.length} tracks.`);
      } else {
        alert("Source URL is not a playlist.");
      }
    } catch (err) {
      alert("Failed to refresh playlist: " + String(err));
    } finally {
      setIsRefreshingYt(false);
    }
  };

  const [isSavingAllOffline, setIsSavingAllOffline] = useState(false);
  const [savingOfflineProgress, setSavingOfflineProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  const handleSaveAllOffline = async (tracks: FileInfo[]) => {
    if (tracks.length === 0 || isSavingAllOffline) return;
    setIsSavingAllOffline(true);
    setSavingOfflineProgress({ current: 0, total: tracks.length });
    let savedCount = 0;
    try {
      for (let i = 0; i < tracks.length; i++) {
        setSavingOfflineProgress({ current: i + 1, total: tracks.length });
        try {
          await saveTrackForOffline(tracks[i]);
          savedCount++;
        } catch (e) {
          console.warn("Failed to save track offline:", tracks[i].clean_title, e);
        }
      }
      alert(`Successfully saved ${savedCount} of ${tracks.length} tracks offline!`);
    } finally {
      setIsSavingAllOffline(false);
      loadSmartPlaylists();
    }
  };

  // Compile Smart Playlists (Liked Songs pinned first)
  const smartPlaylists = useMemo(() => {
    return [
      {
        id: "smart-liked",
        name: "Liked Songs",
        tracks: likedTracks,
        icon: "❤️",
        isSystem: true,
        isSmart: true,
        gradient: "from-[#EC4899] via-[#8B5CF6] to-[#2B4C8F]",
        description: "All tracks you have marked with heart",
      },
      {
        id: "smart-recent",
        name: "Recently Played",
        tracks: recentlyPlayed,
        icon: "🕒",
        isSystem: true,
        isSmart: true,
        gradient: "from-[#3B82F6] to-[#1D4ED8]",
        description: "Tracks listened for at least 15 seconds",
      },
      {
        id: "smart-most-played",
        name: "Most Played",
        tracks: mostPlayed,
        icon: "🔥",
        isSystem: true,
        isSmart: true,
        gradient: "from-[#F97316] to-[#EA580C]",
        description: "Your most frequently played tracks",
      },
      {
        id: "smart-offline",
        name: "Saved Offline",
        tracks: offlineTracks,
        icon: "⚡",
        isSystem: true,
        isSmart: true,
        gradient: "from-[#10B981] to-[#059669]",
        description: "Tracks cached in browser IndexedDB storage",
      },
    ];
  }, [likedTracks, recentlyPlayed, mostPlayed, offlineTracks]);

  // Compile system downloaded playlists
  const systemPlaylists = useMemo(() => {
    const musicOnly = allFiles.filter(
      (f) =>
        f.media_type === "audio" ||
        f.filename.toLowerCase().endsWith(".mp3") ||
        f.filename.toLowerCase().endsWith(".m4a")
    );
    const videoOnly = allFiles.filter(
      (f) =>
        f.media_type === "video" ||
        f.filename.toLowerCase().endsWith(".mp4") ||
        f.filename.toLowerCase().endsWith(".webm") ||
        f.filename.toLowerCase().endsWith(".mkv")
    );

    return [
      {
        id: "sys-all",
        name: "All Downloads",
        tracks: allFiles,
        icon: "📥",
        isSystem: true,
        isSmart: false,
      },
      {
        id: "sys-music",
        name: "Music Only",
        tracks: musicOnly,
        icon: "🎵",
        isSystem: true,
        isSmart: false,
      },
      {
        id: "sys-videos",
        name: "Videos Only",
        tracks: videoOnly,
        icon: "🎬",
        isSystem: true,
        isSmart: false,
      },
    ];
  }, [allFiles]);

  const customPlaylistsWithTracks = useMemo(() => {
    const fileMap = new Map(allFiles.map((f) => [f.filename, f]));
    return customPlaylists.map((pl) => {
      const idsOrFilenames = pl.trackIds && pl.trackIds.length > 0 ? pl.trackIds : pl.songFilenames;
      const tracks = idsOrFilenames
        .map((idOrFn) => fileMap.get(idOrFn) || dbTracksMap.get(idOrFn))
        .filter((f): f is FileInfo => f !== undefined);
      return {
        id: pl.id,
        name: pl.name,
        tracks,
        icon: pl.kind === "youtube-import" ? "▶" : "🎧",
        isSystem: false,
        isSmart: false,
        kind: pl.kind,
        sourceUrl: pl.sourceUrl,
        rawRecord: pl,
      };
    });
  }, [customPlaylists, allFiles, dbTracksMap]);

  // Compile folder-based Album playlists automatically
  const albumPlaylists = useMemo(() => {
    const albumMap = new Map<string, FileInfo[]>();
    for (const file of allFiles) {
      if (file.album) {
        if (!albumMap.has(file.album)) {
          albumMap.set(file.album, []);
        }
        albumMap.get(file.album)!.push(file);
      }
    }
    return Array.from(albumMap.entries()).map(([albumName, tracks]) => ({
      id: `album-${albumName}`,
      name: albumName,
      tracks,
      icon: "📁",
      isSystem: true,
      isSmart: false,
      isAlbum: true,
    }));
  }, [allFiles]);

  const allPlaylistsList = useMemo(() => {
    return [
      ...smartPlaylists,
      ...customPlaylistsWithTracks,
      ...systemPlaylists,
      ...albumPlaylists,
    ];
  }, [smartPlaylists, customPlaylistsWithTracks, systemPlaylists, albumPlaylists]);

  // If a playlist detail view is active
  const selectedPlaylist = useMemo(() => {
    if (!activePlaylistId) return null;
    return allPlaylistsList.find((p) => p.id === activePlaylistId) || null;
  }, [activePlaylistId, allPlaylistsList]);

  // Playlist Detail View
  if (selectedPlaylist) {
    const topTrack = selectedPlaylist.tracks[0];
    const topThumbnail = topTrack?.thumbnail_url;
    const totalSize = selectedPlaylist.tracks.reduce((acc, t) => acc + (t.size_bytes || 0), 0);
    const isYtImport = "kind" in selectedPlaylist && selectedPlaylist.kind === "youtube-import";

    return (
      <div id={id} className="space-y-6 animate-in fade-in duration-200">
        {/* Top Back Nav & Header */}
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() => setActivePlaylistId(null)}
            className={`flex items-center gap-2 text-xs sm:text-sm font-bold transition-all px-3 py-2 rounded-2xl active:scale-95 ${
              isLight
                ? "text-slate-600 hover:text-slate-900 bg-white border border-[#E2E8F0] shadow-sm"
                : "text-slate-300 hover:text-white bg-[#161C2E] border border-white/10"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span>Back to All Playlists</span>
          </button>

          {!selectedPlaylist.isSystem && (
            <button
              onClick={() => handleDeletePlaylist(selectedPlaylist.id)}
              className="text-xs text-red-500 hover:text-red-600 px-3 py-1.5 rounded-xl hover:bg-red-500/10 transition-colors flex items-center gap-1.5 font-bold"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span>Delete</span>
            </button>
          )}
        </div>

        {/* Playlist Hero Banner */}
        <div
          className={`relative rounded-[28px] overflow-hidden p-6 sm:p-8 flex flex-col sm:flex-row items-center sm:items-end gap-6 border transition-all ${
            isLight
              ? "bg-white border-[#E2E8F0] shadow-[0_12px_32px_rgba(35,55,110,0.08)]"
              : "bg-[#161C2E] border-white/10 shadow-[0_16px_36px_rgba(0,0,0,0.4)]"
          }`}
        >
          {/* Cover Art */}
          <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-[24px] overflow-hidden bg-slate-900 shadow-xl border border-black/5 dark:border-white/10 shrink-0 group">
            {topThumbnail ? (
              <img
                src={resolveMediaUrl(topThumbnail)}
                alt={selectedPlaylist.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div
                className={`w-full h-full flex flex-col items-center justify-center text-5xl bg-gradient-to-br ${
                  (selectedPlaylist as any).gradient || "from-slate-800 to-slate-950"
                }`}
              >
                <span>{selectedPlaylist.icon}</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
          </div>

          {/* Details & Actions */}
          <div className="flex-1 space-y-3 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <span
                className={`text-[10px] font-mono uppercase tracking-wider font-bold px-3 py-1 rounded-full border ${
                  isLight
                    ? "bg-[#E6ECF8] text-[#2B4C8F] border-[#2B4C8F]/20"
                    : "bg-white/10 text-white border-white/15"
                }`}
              >
                {selectedPlaylist.isSmart
                  ? "Smart Collection"
                  : isYtImport
                  ? "YouTube Import"
                  : selectedPlaylist.isSystem
                  ? "System Playlist"
                  : "Custom Playlist"}
              </span>
              {isYtImport && (
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-red-500/15 text-red-500 border border-red-500/30">
                  YouTube Sync
                </span>
              )}
            </div>

            <h1
              className={`text-2xl sm:text-3xl font-black tracking-tight ${
                isLight ? "text-[#1A1F2C]" : "text-white"
              }`}
              style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
            >
              {selectedPlaylist.name}
            </h1>

            <p className="text-xs text-[#8E99AE] font-medium">
              {selectedPlaylist.tracks.length} {selectedPlaylist.tracks.length === 1 ? "track" : "tracks"}
              {totalSize > 0 && ` • ${formatFileSize(totalSize)} total`}
            </p>

            {/* Actions: Play All, Shuffle All, Save All Offline */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 pt-2">
              <button
                onClick={() => {
                  if (selectedPlaylist.tracks.length > 0) {
                    onPlayPlaylist(selectedPlaylist.tracks, 0, selectedPlaylist.name);
                  }
                }}
                disabled={selectedPlaylist.tracks.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-xs font-bold shadow-md disabled:opacity-40 disabled:pointer-events-none active:scale-95 transition-all"
                style={{ backgroundColor: config.primaryHex }}
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span>Play All</span>
              </button>

              <button
                onClick={() => {
                  if (selectedPlaylist.tracks.length > 0) {
                    const shuffled = [...selectedPlaylist.tracks].sort(() => Math.random() - 0.5);
                    onPlayPlaylist(shuffled, 0, selectedPlaylist.name);
                  }
                }}
                disabled={selectedPlaylist.tracks.length <= 1}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold border disabled:opacity-40 disabled:pointer-events-none active:scale-95 transition-all ${
                  isLight
                    ? "bg-[#F3F5FA] hover:bg-[#E6ECF8] border-[#E2E8F0] text-slate-700"
                    : "bg-white/10 hover:bg-white/15 border-white/10 text-white"
                }`}
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
                </svg>
                <span>Shuffle</span>
              </button>

              {/* Save All Offline */}
              {selectedPlaylist.tracks.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleSaveAllOffline(selectedPlaylist.tracks)}
                  disabled={isSavingAllOffline}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
                  title="Save all tracks in this playlist for offline listening"
                >
                  <span>⚡</span>
                  <span>
                    {isSavingAllOffline
                      ? `Saving ${savingOfflineProgress.current}/${savingOfflineProgress.total}...`
                      : "Save all offline"}
                  </span>
                </button>
              )}

              {isYtImport && "rawRecord" in selectedPlaylist && (
                <button
                  type="button"
                  onClick={() => handleRefreshYouTubePlaylist((selectedPlaylist as any).rawRecord)}
                  disabled={isRefreshingYt}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-red-500/15 hover:bg-red-500/25 text-red-500 border border-red-500/30 text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
                >
                  <span className={isRefreshingYt ? "animate-spin inline-block" : ""}>🔄</span>
                  <span>{isRefreshingYt ? "Refreshing..." : "Refresh"}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Track List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#8E99AE]">
              Tracks ({selectedPlaylist.tracks.length})
            </h3>
            <span className="text-[11px] text-[#8E99AE]">Click any track to stream</span>
          </div>

          {selectedPlaylist.tracks.length === 0 ? (
            <div
              className={`p-8 text-center rounded-[24px] border ${
                isLight ? "bg-white border-[#E2E8F0]" : "bg-[#161C2E] border-white/10"
              } space-y-2`}
            >
              <span className="text-3xl">📭</span>
              <p className={`text-sm font-bold ${isLight ? "text-slate-800" : "text-white"}`}>
                This playlist is currently empty.
              </p>
              <p className="text-xs text-[#8E99AE]">
                Play or like tracks, or add songs from your Downloads History to populate it.
              </p>
            </div>
          ) : (
            selectedPlaylist.tracks.map((track, idx) => {
              const isPlaying =
                (currentPlayingFile?.youtube_id && track.youtube_id === currentPlayingFile.youtube_id) ||
                (currentPlayingFile?.filename && track.filename === currentPlayingFile.filename);

              return (
                <div
                  key={`${track.filename || track.youtube_id}-${idx}`}
                  onClick={() => onSelectTrack(track, selectedPlaylist.tracks, selectedPlaylist.name)}
                  className={`group flex items-center justify-between p-3 rounded-[20px] cursor-pointer transition-all border ${
                    isPlaying
                      ? isLight
                        ? "bg-[#E6ECF8] border-[#2B4C8F]/30 shadow-md"
                        : "bg-white/15 border-white/20 shadow-md"
                      : isLight
                      ? "bg-white border-[#E2E8F0] hover:border-[#2B4C8F]/30 hover:shadow-sm"
                      : "bg-[#161C2E] border-white/10 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Track Number */}
                    <span className="w-6 text-center text-xs font-mono font-bold text-[#8E99AE] shrink-0">
                      {isPlaying ? (
                        <span style={{ color: config.primaryHex }} className="animate-pulse">
                          ▶
                        </span>
                      ) : (
                        idx + 1
                      )}
                    </span>

                    {/* Squircle Thumbnail */}
                    <div className="w-10 h-10 rounded-[14px] overflow-hidden bg-slate-900 border border-black/5 dark:border-white/10 shrink-0 relative">
                      {track.thumbnail_url ? (
                        <img
                          src={resolveMediaUrl(track.thumbnail_url)}
                          alt={track.clean_title || track.filename}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-[#8E99AE]">
                          🎵
                        </div>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-xs sm:text-sm font-bold truncate leading-snug ${
                          isPlaying
                            ? isLight
                              ? "text-[#2B4C8F]"
                              : "text-[#6C95FF]"
                            : isLight
                            ? "text-[#1A1F2C] group-hover:text-[#2B4C8F]"
                            : "text-white group-hover:text-[#6C95FF]"
                        }`}
                        style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
                      >
                        {track.clean_title || track.filename}
                      </p>
                      <p className="text-[11px] text-[#8E99AE] truncate">
                        {track.artist || "Unknown Artist"}
                        {track.album ? ` • ${track.album}` : ""}
                      </p>
                    </div>
                  </div>

                  {/* Actions & Duration */}
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <LikeButton size="sm" track={track} />

                    {typeof track.duration === "number" && track.duration > 0 && (
                      <span className="text-[11px] font-mono text-[#8E99AE] hidden sm:inline">
                        {Math.floor(track.duration / 60)}:
                        {Math.floor(track.duration % 60).toString().padStart(2, "0")}
                      </span>
                    )}

                    {!selectedPlaylist.isSystem && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveTrack(selectedPlaylist.id, track.filename || track.youtube_id || "");
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-xl hover:bg-red-500/10 transition-colors"
                        title="Remove from playlist"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // Playlists Hub View
  return (
    <div id={id} className="space-y-8 animate-in fade-in duration-200">
      {/* Header bar */}
      <div
        className={`rounded-[28px] p-5 sm:p-6 border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          isLight
            ? "bg-white border-[#E2E8F0] shadow-[0_10px_30px_rgba(35,55,110,0.06)]"
            : "bg-[#161C2E] border-white/10 shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
        }`}
      >
        <div>
          <h2
            className={`text-2xl font-black tracking-tight ${
              isLight ? "text-[#1A1F2C]" : "text-white"
            }`}
            style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
          >
            Playlists Hub
          </h2>
          <p className="text-xs text-[#8E99AE] mt-1 font-medium">
            Browse smart collections, import YouTube sets, and manage your library
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className={`text-xs px-3.5 py-2 rounded-full border transition-all flex items-center gap-1.5 font-bold active:scale-95 ${
              isLight
                ? "bg-[#F3F5FA] hover:bg-[#E6ECF8] border-[#E2E8F0] text-slate-700"
                : "bg-white/10 hover:bg-white/15 border-white/10 text-white"
            }`}
          >
            <span>📥</span>
            <span>Import</span>
          </button>

          {/* Backup dropdown */}
          <div className="relative group">
            <button
              type="button"
              className={`text-xs px-3 py-2 rounded-full border transition-all font-bold ${
                isLight
                  ? "bg-[#F3F5FA] hover:bg-[#E6ECF8] border-[#E2E8F0] text-slate-700"
                  : "bg-white/10 hover:bg-white/15 border-white/10 text-white"
              }`}
              title="Backup & Restore Options"
            >
              •••
            </button>
            <div
              className={`absolute right-0 top-full mt-1.5 hidden group-hover:flex flex-col rounded-2xl p-2 shadow-2xl z-30 min-w-[170px] space-y-1 border ${
                isLight
                  ? "bg-white border-[#E2E8F0] shadow-[0_12px_32px_rgba(35,55,110,0.15)]"
                  : "bg-[#161C2E] border-white/15 shadow-[0_16px_36px_rgba(0,0,0,0.5)]"
              }`}
            >
              <button
                type="button"
                onClick={handleExportPlaylists}
                className="w-full text-left px-3 py-2 text-xs font-semibold rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                Export JSON Backup
              </button>
              <label className="w-full text-left px-3 py-2 text-xs font-semibold rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer block">
                Restore JSON Backup
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleImportPlaylists}
                />
              </label>
            </div>
          </div>

          <button
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-xs font-bold shadow-md active:scale-95 transition-all"
            style={{ backgroundColor: config.primaryHex }}
          >
            <span>+</span>
            <span>New Playlist</span>
          </button>
        </div>
      </div>

      {/* ── SMART PLAYLISTS HERO SHELF (Liked Songs pinned first) ─────────────────── */}
      <div className="space-y-3">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#8E99AE] px-1">
          Smart Collections
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {smartPlaylists.map((sp) => {
            const count = sp.tracks.length;
            const isLikedCard = sp.id === "smart-liked";

            return (
              <div
                key={sp.id}
                onClick={() => setActivePlaylistId(sp.id)}
                className={`group relative flex flex-col justify-between p-4 rounded-[24px] cursor-pointer transition-all duration-300 hover:-translate-y-1 border ${
                  isLikedCard
                    ? isLight
                      ? "bg-gradient-to-br from-[#FFF0F5] to-white border-[#F472B6]/40 shadow-[0_8px_24px_rgba(244,114,182,0.15)]"
                      : "bg-gradient-to-br from-[#2D1629] to-[#161C2E] border-[#EC4899]/40 shadow-[0_8px_24px_rgba(236,72,153,0.25)]"
                    : isLight
                    ? "bg-white border-[#E2E8F0] shadow-[0_6px_20px_rgba(35,55,110,0.05)] hover:shadow-[0_12px_28px_rgba(35,55,110,0.1)]"
                    : "bg-[#161C2E] border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.3)] hover:shadow-[0_12px_28px_rgba(0,0,0,0.45)]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={`w-11 h-11 rounded-[16px] flex items-center justify-center text-xl shadow-sm transition-transform group-hover:scale-110 ${
                      isLikedCard
                        ? "bg-[#EC4899]/15 text-[#EC4899]"
                        : isLight
                        ? "bg-[#F3F5FA] text-slate-700"
                        : "bg-white/10 text-white"
                    }`}
                  >
                    {sp.icon}
                  </div>
                  {count > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlayPlaylist(sp.tracks, 0, sp.name);
                      }}
                      className="w-8 h-8 rounded-full text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md active:scale-90 pl-0.5"
                      style={{ backgroundColor: config.primaryHex }}
                      title={`Play ${sp.name}`}
                    >
                      ▶
                    </button>
                  )}
                </div>

                <div className="pt-4 space-y-0.5">
                  <h4
                    className={`text-sm font-bold truncate ${
                      isLikedCard
                        ? isLight
                          ? "text-[#BE185D]"
                          : "text-[#F472B6]"
                        : isLight
                        ? "text-[#1A1F2C]"
                        : "text-white"
                    }`}
                    style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
                  >
                    {sp.name}
                  </h4>
                  <p className="text-[11px] text-[#8E99AE] font-medium">
                    {count} {count === 1 ? "track" : "tracks"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── RECENTLY PLAYED HORIZONTAL CAROUSEL ──────────────────────────────── */}
      {recentlyPlayed.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#8E99AE]">
              Recently Played
            </h3>
            <button
              onClick={() => setActivePlaylistId("smart-recent")}
              className={`text-xs font-bold transition-colors ${
                isLight ? "text-[#2B4C8F] hover:underline" : "text-[#6C95FF] hover:underline"
              }`}
            >
              See all ({recentlyPlayed.length}) →
            </button>
          </div>

          <div className="flex gap-3.5 overflow-x-auto pb-2 scrollbar-none -mx-1 px-1">
            {recentlyPlayed.slice(0, 10).map((track, idx) => (
              <div
                key={`${track.filename || track.youtube_id}-${idx}`}
                onClick={() => onSelectTrack(track, recentlyPlayed, "Recently Played")}
                className={`group w-36 sm:w-40 shrink-0 flex flex-col p-3 rounded-[22px] cursor-pointer transition-all duration-300 hover:-translate-y-1 border ${
                  isLight
                    ? "bg-white border-[#E2E8F0] shadow-[0_6px_20px_rgba(35,55,110,0.05)] hover:shadow-[0_12px_28px_rgba(35,55,110,0.1)]"
                    : "bg-[#161C2E] border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.3)] hover:shadow-[0_12px_28px_rgba(0,0,0,0.45)]"
                }`}
              >
                <div className="relative w-full aspect-square rounded-[18px] overflow-hidden bg-slate-900 mb-2 shadow-sm">
                  {track.thumbnail_url ? (
                    <img
                      src={resolveMediaUrl(track.thumbnail_url)}
                      alt={track.clean_title || track.filename}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl text-slate-500">
                      🎵
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="w-8 h-8 rounded-full bg-white text-[#2B4C8F] flex items-center justify-center text-xs pl-0.5 shadow-lg">
                      ▶
                    </span>
                  </div>
                </div>
                <p
                  className={`text-xs font-bold truncate leading-tight ${
                    isLight ? "text-slate-800" : "text-white"
                  }`}
                  style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
                >
                  {track.clean_title || track.filename}
                </p>
                <p className="text-[10px] text-[#8E99AE] truncate mt-0.5">
                  {track.artist || "Unknown Artist"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ALL PLAYLISTS & CUSTOM COLLECTIONS ──────────────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#8E99AE] px-1">
          Playlists & Sets
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-5">
          {allPlaylistsList
            .filter((pl) => !pl.isSmart)
            .map((pl) => {
              const topTrack = pl.tracks[0];
              const topThumbnail = topTrack?.thumbnail_url;
              const isYt = "kind" in pl && pl.kind === "youtube-import";

              return (
                <div
                  key={pl.id}
                  onClick={() => setActivePlaylistId(pl.id)}
                  className={`group relative flex flex-col rounded-[26px] overflow-hidden p-3.5 cursor-pointer transition-all duration-300 hover:-translate-y-1 border ${
                    isLight
                      ? "bg-white border-[#E2E8F0] shadow-[0_6px_20px_rgba(35,55,110,0.05)] hover:shadow-[0_12px_28px_rgba(35,55,110,0.1)]"
                      : "bg-[#161C2E] border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.3)] hover:shadow-[0_12px_28px_rgba(0,0,0,0.45)]"
                  }`}
                >
                  {/* Dynamic Squircle Cover Artwork */}
                  <div className="relative w-full aspect-square rounded-[20px] overflow-hidden bg-slate-900 shadow-sm">
                    {topThumbnail ? (
                      <img
                        src={resolveMediaUrl(topThumbnail)}
                        alt={pl.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 text-4xl text-slate-400">
                        <span>{pl.icon}</span>
                      </div>
                    )}

                    {/* Quick Play Hover Button */}
                    {pl.tracks.length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlayPlaylist(pl.tracks, 0, pl.name);
                        }}
                        className="absolute bottom-2.5 right-2.5 w-10 h-10 rounded-full text-white flex items-center justify-center shadow-lg opacity-90 sm:opacity-0 sm:group-hover:opacity-100 sm:translate-y-2 sm:group-hover:translate-y-0 transition-all active:scale-90 pl-0.5"
                        style={{ backgroundColor: config.primaryHex }}
                        title="Play Playlist"
                      >
                        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </button>
                    )}

                    {/* Badges */}
                    {isYt ? (
                      <span className="absolute top-2 left-2 px-2.5 py-0.5 rounded-full bg-red-600/90 backdrop-blur-md text-white text-[9px] font-bold shadow-sm flex items-center gap-1">
                        <span>▶</span> YouTube
                      </span>
                    ) : pl.isSystem ? (
                      <span className="absolute top-2 left-2 px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-white text-[9px] font-bold">
                        System
                      </span>
                    ) : null}
                  </div>

                  {/* Playlist Title & Stats */}
                  <div className="pt-3 px-1 space-y-0.5">
                    <h3
                      className={`text-xs sm:text-sm font-bold truncate leading-tight ${
                        isLight ? "text-slate-800" : "text-white"
                      }`}
                      style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
                    >
                      {pl.name}
                    </h3>
                    <p className="text-[11px] text-[#8E99AE] font-medium">
                      {pl.tracks.length} {pl.tracks.length === 1 ? "track" : "tracks"}
                    </p>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* New Playlist Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <form
            onSubmit={handleCreatePlaylist}
            className={`w-full max-w-sm rounded-[28px] border p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 ${
              isLight ? "bg-white border-[#E2E8F0]" : "bg-[#161C2E] border-white/15"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3
                className={`text-base font-bold ${isLight ? "text-slate-800" : "text-white"}`}
                style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
              >
                Create New Playlist
              </h3>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#8E99AE]">Playlist Name</label>
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="e.g. Chill Beats, Workout Mix..."
                className={`w-full px-4 py-2.5 rounded-full border text-xs outline-none transition-all ${
                  isLight
                    ? "bg-[#F3F5FA] border-[#E2E8F0] text-slate-800 focus:border-[#2B4C8F]"
                    : "bg-white/5 border-white/10 text-white focus:border-[#6C95FF]"
                }`}
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 text-xs font-bold text-[#8E99AE] hover:text-slate-800 dark:hover:text-white rounded-full"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newPlaylistName.trim()}
                className="px-5 py-2 text-xs font-bold text-white rounded-full shadow-md disabled:opacity-40 disabled:pointer-events-none active:scale-95 transition-all"
                style={{ backgroundColor: config.primaryHex }}
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Playlist Import Modal (CSV, Text, YouTube) */}
      <PlaylistImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={(playlistId) => {
          loadCustomPlaylists();
          setActivePlaylistId(playlistId);
        }}
        onPreviewTrack={(track) => onSelectTrack(track, [track])}
      />
    </div>
  );
}
