"use client";

import React, { useState, useEffect, useMemo } from "react";
import type { FileInfo } from "@/lib/types";
import { resolveMediaUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/websocket";
import { useTheme } from "../context/ThemeContext";

export const LOCAL_STORAGE_PLAYLISTS_KEY = "ytdl_user_playlists_v1";

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

export interface CustomPlaylist {
  id: string;
  name: string;
  songFilenames: string[];
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
  const { config } = useTheme();
  const [customPlaylists, setCustomPlaylists] = useState<CustomPlaylist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  // Load playlists and listen for sync updates
  useEffect(() => {
    const load = () => {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_PLAYLISTS_KEY);
        if (stored) {
          setCustomPlaylists(JSON.parse(stored));
        } else {
          const defaults: CustomPlaylist[] = [
            { id: "pl-favorites", name: "Favorites ⭐", songFilenames: [] },
            { id: "pl-workout", name: "Workout Energy ⚡", songFilenames: [] },
            { id: "pl-chill", name: "Late Night Chill 🌙", songFilenames: [] },
          ];
          setCustomPlaylists(defaults);
          localStorage.setItem(LOCAL_STORAGE_PLAYLISTS_KEY, JSON.stringify(defaults));
        }
      } catch (e) {
        console.warn("Failed to load playlists", e);
      }
    };

    load();
    window.addEventListener("ytdl_playlists_updated", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("ytdl_playlists_updated", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  const savePlaylists = (updated: CustomPlaylist[]) => {
    setCustomPlaylists(updated);
    saveStoredPlaylists(updated);
  };

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPlaylistName.trim();
    if (!trimmed) return;
    const newPl: CustomPlaylist = {
      id: `pl-${Date.now()}`,
      name: trimmed,
      songFilenames: [],
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

  const handleRemoveTrack = (playlistId: string, filename: string) => {
    const updated = customPlaylists.map((pl) => {
      if (pl.id !== playlistId) return pl;
      return {
        ...pl,
        songFilenames: pl.songFilenames.filter((f) => f !== filename),
      };
    });
    savePlaylists(updated);
  };

  // Compile all system + custom playlists
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
      },
      {
        id: "sys-music",
        name: "Music Only",
        tracks: musicOnly,
        icon: "🎵",
        isSystem: true,
      },
      {
        id: "sys-videos",
        name: "Videos Only",
        tracks: videoOnly,
        icon: "🎬",
        isSystem: true,
      },
    ];
  }, [allFiles]);

  const customPlaylistsWithTracks = useMemo(() => {
    const fileMap = new Map(allFiles.map((f) => [f.filename, f]));
    return customPlaylists.map((pl) => {
      const tracks = pl.songFilenames
        .map((fn) => fileMap.get(fn))
        .filter((f): f is FileInfo => f !== undefined);
      return {
        id: pl.id,
        name: pl.name,
        tracks,
        icon: "🎧",
        isSystem: false,
      };
    });
  }, [customPlaylists, allFiles]);

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
      isAlbum: true,
    }));
  }, [allFiles]);

  const allPlaylistsList = useMemo(() => {
    return [...systemPlaylists, ...albumPlaylists, ...customPlaylistsWithTracks];
  }, [systemPlaylists, albumPlaylists, customPlaylistsWithTracks]);

  // If a playlist detail view is active
  const selectedPlaylist = useMemo(() => {
    if (!activePlaylistId) return null;
    return allPlaylistsList.find((p) => p.id === activePlaylistId) || null;
  }, [activePlaylistId, allPlaylistsList]);

  // Playlist Detail View
  if (selectedPlaylist) {
    const topTrack = selectedPlaylist.tracks[0];
    const topThumbnail = topTrack?.thumbnail_url;
    const totalSize = selectedPlaylist.tracks.reduce((acc, t) => acc + t.size_bytes, 0);

    return (
      <div id={id} className="space-y-6 animate-in fade-in duration-200">
        {/* Top Back Nav & Header */}
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() => setActivePlaylistId(null)}
            className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-zinc-400 hover:text-white transition-colors p-2 -ml-2 rounded-xl hover:bg-white/5 active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span>Back to All Playlists</span>
          </button>

          {!selectedPlaylist.isSystem && (
            <button
              onClick={() => handleDeletePlaylist(selectedPlaylist.id)}
              className="text-xs text-zinc-500 hover:text-red-400 p-2 rounded-xl hover:bg-red-500/10 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span>Delete Playlist</span>
            </button>
          )}
        </div>

        {/* Playlist Hero Banner (Image 1 Style) */}
        <div className="relative rounded-3xl overflow-hidden glass-card p-6 sm:p-8 flex flex-col sm:flex-row items-center sm:items-end gap-6 shadow-2xl border border-white/10">
          {/* Cover Art (Top track in queue as thumbnail) */}
          <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-2xl overflow-hidden bg-zinc-900 shadow-2xl border border-white/15 shrink-0 group">
            {topThumbnail ? (
              <img
                src={resolveMediaUrl(topThumbnail)}
                alt={selectedPlaylist.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-950 to-black text-5xl">
                <span>{selectedPlaylist.icon}</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
          </div>

          {/* Details & Actions */}
          <div className="flex-1 space-y-3 text-center sm:text-left">
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-1 rounded-full bg-white/10 border border-white/10 inline-block">
              {selectedPlaylist.isSystem ? "System Playlist" : "User Playlist"}
            </span>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {selectedPlaylist.name}
            </h1>

            <p className="text-xs text-zinc-400">
              {selectedPlaylist.tracks.length} {selectedPlaylist.tracks.length === 1 ? "track" : "tracks"} •{" "}
              {formatFileSize(totalSize)} total
            </p>

            {/* Actions: Play All, Shuffle All */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-2">
              <button
                onClick={() => {
                  if (selectedPlaylist.tracks.length > 0) {
                    onPlayPlaylist(selectedPlaylist.tracks, 0, selectedPlaylist.name);
                  }
                }}
                disabled={selectedPlaylist.tracks.length === 0}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r ${config.gradient} text-white text-xs font-bold shadow-lg disabled:opacity-40 disabled:pointer-events-none active:scale-95 transition-all`}
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
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold border border-white/10 disabled:opacity-40 disabled:pointer-events-none active:scale-95 transition-all"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
                </svg>
                <span>Shuffle</span>
              </button>
            </div>
          </div>
        </div>

        {/* Track List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-400">
              Playlist Queue ({selectedPlaylist.tracks.length})
            </h3>
            <span className="text-[11px] text-zinc-500">Click any track to stream</span>
          </div>

          {selectedPlaylist.tracks.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-white/10 glass-card space-y-2">
              <span className="text-3xl">📭</span>
              <p className="text-sm text-zinc-400">This playlist is currently empty.</p>
              <p className="text-xs text-zinc-500">
                Go to the Downloads History tab and click the ➕ button on any song to add it.
              </p>
            </div>
          ) : (
            selectedPlaylist.tracks.map((track, idx) => {
              const isPlaying = currentPlayingFile?.filename === track.filename;
              return (
                <div
                  key={track.filename}
                  onClick={() => onSelectTrack(track, selectedPlaylist.tracks, selectedPlaylist.name)}
                  className={`group flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all ${
                    isPlaying
                      ? "bg-white/10 border border-white/20 shadow-lg shadow-black/30"
                      : "glass-card hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Track Number */}
                    <span className="w-6 text-center text-xs font-mono font-bold text-zinc-500 shrink-0">
                      {isPlaying ? (
                        <span className={`${config.textAccent} animate-pulse`}>▶</span>
                      ) : (
                        `${idx + 1}`
                      )}
                    </span>

                    {/* Thumbnail */}
                    <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-zinc-950 shrink-0 border border-white/10">
                      {track.thumbnail_url ? (
                        <img
                          src={resolveMediaUrl(track.thumbnail_url)}
                          alt={track.clean_title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm bg-zinc-900">
                          {track.media_type === "video" ? "🎬" : "🎵"}
                        </div>
                      )}
                    </div>

                    {/* Title & Metadata */}
                    <div className="min-w-0 flex-1">
                      <h4
                        className={`text-xs sm:text-sm font-semibold truncate ${
                          isPlaying ? "text-white font-bold" : "text-zinc-200 group-hover:text-white"
                        }`}
                      >
                        {track.clean_title}
                      </h4>
                      <p className="text-[11px] text-zinc-400">
                        {track.media_type === "video" ? "🎬 Video" : "🎵 Audio"} • {formatFileSize(track.size_bytes)}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pl-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onSelectTrack(track, selectedPlaylist.tracks, selectedPlaylist.name)}
                      className={`p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors ${
                        isPlaying ? config.textAccent : ""
                      }`}
                      title="Play"
                    >
                      <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>

                    {!selectedPlaylist.isSystem && (
                      <button
                        onClick={() => handleRemoveTrack(selectedPlaylist.id, track.filename)}
                        className="p-2 text-zinc-500 hover:text-red-400 rounded-xl hover:bg-red-500/10 transition-colors"
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

  // Playlists Grid Hub (Image 1 & Image 2 Reference Style)
  return (
    <div id={id} className="space-y-6 animate-in fade-in duration-200">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Playlists Hub
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Browse, play continuous queues, and curate your personal music & video collections
          </p>
        </div>

        <button
          onClick={() => setShowNewModal(true)}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r ${config.gradient} text-white text-xs font-bold shadow-lg shadow-black/25 active:scale-95 transition-all`}
        >
          <span>+</span>
          <span>New Playlist</span>
        </button>
      </div>

      {/* Grid of Playlists Cards (Desktop & Mobile, top track as cover art) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-5">
        {allPlaylistsList.map((pl) => {
          const topTrack = pl.tracks[0];
          const topThumbnail = topTrack?.thumbnail_url;

          return (
            <div
              key={pl.id}
              onClick={() => setActivePlaylistId(pl.id)}
              className="group relative flex flex-col rounded-3xl overflow-hidden glass-card p-3 sm:p-3.5 hover:border-white/25 cursor-pointer transition-all hover:-translate-y-1 shadow-xl"
            >
              {/* Dynamic Cover Artwork (Top track thumbnail auto-assigned) */}
              <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-zinc-950 border border-white/10 shadow-md">
                {topThumbnail ? (
                  <img
                    src={resolveMediaUrl(topThumbnail)}
                    alt={pl.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-950 to-black text-4xl text-zinc-600">
                    <span>{pl.icon}</span>
                  </div>
                )}

                {/* Subtle vignette */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

                {/* Quick Play Hover Button */}
                {pl.tracks.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlayPlaylist(pl.tracks, 0, pl.name);
                    }}
                    className={`absolute bottom-2.5 right-2.5 w-10 h-10 rounded-full bg-gradient-to-r ${config.gradient} text-white flex items-center justify-center shadow-lg opacity-90 sm:opacity-0 sm:group-hover:opacity-100 sm:translate-y-2 sm:group-hover:translate-y-0 transition-all active:scale-90`}
                    title="Play Playlist"
                  >
                    <svg className="w-4 h-4 ml-0.5 fill-current" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                )}

                {/* System Badge */}
                {pl.isSystem && (
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-zinc-300 text-[9px] font-bold border border-white/10">
                    System
                  </span>
                )}
              </div>

              {/* Playlist Title & Stats */}
              <div className="pt-3 px-1 space-y-0.5">
                <h3 className="text-xs sm:text-sm font-bold text-white group-hover:text-zinc-100 truncate">
                  {pl.name}
                </h3>
                <p className="text-[11px] text-zinc-400">
                  {pl.tracks.length} {pl.tracks.length === 1 ? "track" : "tracks"}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* New Playlist Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <form
            onSubmit={handleCreatePlaylist}
            className="w-full max-w-sm rounded-3xl bg-zinc-950 border border-white/15 p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Create New Playlist</h3>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="text-zinc-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400">Playlist Name</label>
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="e.g. Synthwave Dreams, Driving Mix..."
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-white text-xs focus:outline-none focus:border-white/30"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white rounded-xl hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newPlaylistName.trim()}
                className={`px-5 py-2 text-xs font-bold text-white rounded-xl bg-gradient-to-r ${config.gradient} shadow-lg disabled:opacity-40 disabled:pointer-events-none active:scale-95`}
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
