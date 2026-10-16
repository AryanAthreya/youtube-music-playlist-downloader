"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { getFiles, getFileByNameUrl, deleteFileByName, resolveMediaUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/websocket";
import type { FileInfo } from "@/lib/types";
import { useTheme } from "../context/ThemeContext";
import {
  saveTrackForOffline,
  removeTrackFromOffline,
  getAllOfflineTrackList,
  loadOfflineTrackForPlayback,
  getTrackOfflineId,
} from "@/lib/offlineManager";
import { LikeButton } from "./LikeButton";
import { toggleLikedOptimistic } from "@/lib/player/useLiked";

interface FileListProps {
  id: string;
  onCountChange?: (count: number) => void;
  onPlayTrack?: (file: FileInfo, allFiles: FileInfo[]) => void;
}

type LibraryTab = "songs" | "artists" | "albums" | "offline";
type SortOption = "recent" | "title" | "duration";

function formatRelativeTime(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return "";
  }
}

function formatDurationSec(seconds?: number): string {
  if (!seconds || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function isVideoFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ["mp4", "webm", "mkv", "avi", "mov"].includes(ext);
}

function isAudioFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ["mp3", "m4a", "opus", "flac", "wav", "ogg"].includes(ext);
}

export function FileList({ id, onCountChange, onPlayTrack }: FileListProps) {
  const { config, theme } = useTheme();
  const isLight = config.isLight || theme === "soft-light";

  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active library navigation tab: songs | artists | albums | offline
  const [activeTab, setActiveTab] = useState<LibraryTab>("songs");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [filterType, setFilterType] = useState<"all" | "audio" | "video">("all");

  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FileInfo | null>(null);
  const [copiedFilename, setCopiedFilename] = useState<string | null>(null);

  const [savedOfflineIds, setSavedOfflineIds] = useState<Set<string>>(new Set());
  const [offlineTrackList, setOfflineTrackList] = useState<FileInfo[]>([]);
  const [offlineDownloadingMap, setOfflineDownloadingMap] = useState<Record<string, number>>({});

  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [activeMenuFilename, setActiveMenuFilename] = useState<string | null>(null);

  // Sub-filter for Artists and Albums drill-down
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    try {
      setError(null);
      const response = await getFiles();
      setFiles(response.files);
      onCountChange?.(response.files.length);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message ?? "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    loadFiles();
    const interval = setInterval(loadFiles, 15_000);
    return () => clearInterval(interval);
  }, [loadFiles]);

  const loadOfflineTracks = useCallback(async () => {
    try {
      const list = await getAllOfflineTrackList();
      setOfflineTrackList(list);
      setSavedOfflineIds(new Set(list.map((t) => getTrackOfflineId(t))));
    } catch {}
  }, []);

  useEffect(() => {
    loadOfflineTracks();
    window.addEventListener("ytdl_offline_updated", loadOfflineTracks);
    return () => window.removeEventListener("ytdl_offline_updated", loadOfflineTracks);
  }, [loadOfflineTracks]);

  // Close context menu on outside click
  useEffect(() => {
    const handleOutsideClick = () => setActiveMenuFilename(null);
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  const handleToggleOffline = async (file: FileInfo) => {
    const id = getTrackOfflineId(file);
    if (savedOfflineIds.has(id)) {
      if (confirm(`Remove "${file.clean_title}" from offline storage?`)) {
        await removeTrackFromOffline(file);
      }
    } else {
      setOfflineDownloadingMap((prev) => ({ ...prev, [id]: 0 }));
      try {
        await saveTrackForOffline(file, (pct) => {
          setOfflineDownloadingMap((prev) => ({ ...prev, [id]: pct }));
        });
      } catch (err) {
        alert("Failed to save offline: " + String(err));
      } finally {
        setOfflineDownloadingMap((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    }
  };

  const handlePlayFile = async (file: FileInfo, queue: FileInfo[]) => {
    const id = getTrackOfflineId(file);
    if (savedOfflineIds.has(id)) {
      const offlineTrack = await loadOfflineTrackForPlayback(file);
      if (offlineTrack) {
        onPlayTrack?.(offlineTrack, queue);
        return;
      }
    }
    onPlayTrack?.(file, queue);
  };

  const toggleSelectForDelete = (filename: string) => {
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) {
        next.delete(filename);
      } else {
        next.add(filename);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedForDelete.size === filteredFiles.length && filteredFiles.length > 0) {
      setSelectedForDelete(new Set());
    } else {
      setSelectedForDelete(new Set(filteredFiles.map((f) => f.filename)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedForDelete.size === 0) return;
    const count = selectedForDelete.size;
    if (!confirm(`Are you sure you want to permanently delete ${count} selected ${count === 1 ? "file" : "files"}?`)) {
      return;
    }
    try {
      setIsBatchDeleting(true);
      const toDelete = Array.from(selectedForDelete);
      for (const filename of toDelete) {
        try {
          await deleteFileByName(filename);
        } catch (e) {
          console.error("Failed to delete", filename, e);
        }
      }
      setFiles((prev) => prev.filter((f) => !selectedForDelete.has(f.filename)));
      onCountChange?.(files.length - count);
      setSelectedForDelete(new Set());
      setIsDeleteMode(false);
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(e.message ?? "Failed to delete selected files");
    } finally {
      setIsBatchDeleting(false);
    }
  };

  const handleCopyLink = (filename: string) => {
    const url = getFileByNameUrl(filename);
    navigator.clipboard.writeText(url);
    setCopiedFilename(filename);
    setTimeout(() => setCopiedFilename(null), 2000);
  };

  const handleDeleteSingle = async (filename: string) => {
    if (!confirm(`Are you sure you want to permanently delete "${filename}"?`)) return;
    try {
      setDeletingFile(filename);
      await deleteFileByName(filename);
      setFiles((prev) => prev.filter((f) => f.filename !== filename));
      onCountChange?.(files.length - 1);
    } catch (e: any) {
      alert(e?.message || "Failed to delete file");
    } finally {
      setDeletingFile(null);
    }
  };

  // Base list depending on active tab
  const baseFiles = useMemo(() => {
    if (activeTab === "offline") {
      return offlineTrackList.length > 0
        ? offlineTrackList
        : files.filter((f) => savedOfflineIds.has(getTrackOfflineId(f)));
    }
    return files;
  }, [activeTab, files, offlineTrackList, savedOfflineIds]);

  // Filtered and sorted files
  const filteredFiles = useMemo(() => {
    let list = baseFiles.filter((f) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        f.filename.toLowerCase().includes(q) ||
        f.clean_title.toLowerCase().includes(q) ||
        (f.artist ? f.artist.toLowerCase().includes(q) : false) ||
        (f.album ? f.album.toLowerCase().includes(q) : false);

      if (!matchesSearch) return false;

      if (filterType === "video") return isVideoFile(f.filename);
      if (filterType === "audio") return isAudioFile(f.filename);
      return true;
    });

    if (activeTab === "artists" && selectedArtist) {
      list = list.filter((f) => (f.artist || "Unknown Artist") === selectedArtist);
    }
    if (activeTab === "albums" && selectedAlbum) {
      list = list.filter((f) => (f.album || "Single") === selectedAlbum);
    }

    // Sort
    if (sortBy === "title") {
      list.sort((a, b) => a.clean_title.localeCompare(b.clean_title));
    } else if (sortBy === "duration") {
      list.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    } else {
      // recent: modified_at descending
      list.sort((a, b) => {
        const da = a.modified_at ? new Date(a.modified_at).getTime() : 0;
        const db = b.modified_at ? new Date(b.modified_at).getTime() : 0;
        return db - da;
      });
    }

    return list;
  }, [baseFiles, searchQuery, filterType, activeTab, selectedArtist, selectedAlbum, sortBy]);

  // Groupings for Artists tab
  const artistsGrouped = useMemo(() => {
    const map = new Map<string, FileInfo[]>();
    for (const f of files) {
      const artist = f.artist?.trim() || "Unknown Artist";
      if (!map.has(artist)) map.set(artist, []);
      map.get(artist)!.push(f);
    }
    return Array.from(map.entries())
      .map(([name, tracks]) => ({ name, tracks, count: tracks.length }))
      .sort((a, b) => b.count - a.count);
  }, [files]);

  // Groupings for Albums tab
  const albumsGrouped = useMemo(() => {
    const map = new Map<string, FileInfo[]>();
    for (const f of files) {
      const album = f.album?.trim() || "Single / Downloaded";
      if (!map.has(album)) map.set(album, []);
      map.get(album)!.push(f);
    }
    return Array.from(map.entries())
      .map(([name, tracks]) => ({ name, tracks, count: tracks.length }))
      .sort((a, b) => b.count - a.count);
  }, [files]);

  const videoCount = useMemo(() => files.filter((f) => isVideoFile(f.filename)).length, [files]);
  const audioCount = useMemo(() => files.filter((f) => isAudioFile(f.filename)).length, [files]);
  const offlineCount = useMemo(() => savedOfflineIds.size, [savedOfflineIds]);

  return (
    <section id={id} className="space-y-5 animate-in fade-in duration-300">
      {/* Top Header & Underline Navigation */}
      <div
        className={`rounded-[28px] p-5 sm:p-6 border transition-all ${
          isLight
            ? "bg-white border-[#E2E8F0] shadow-[0_10px_30px_rgba(35,55,110,0.06)]"
            : "bg-[#161C2E] border-white/10 shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-black/5 dark:border-white/10">
          <div>
            <div className="flex items-center gap-3">
              <h2
                className={`text-2xl font-black tracking-tight ${
                  isLight ? "text-[#1A1F2C]" : "text-white"
                }`}
                style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
              >
                Music Library
              </h2>
              {/* Refresh Button */}
              <button
                id={`${id}-refresh`}
                onClick={loadFiles}
                disabled={loading}
                className={`p-2 rounded-xl border transition-all active:scale-95 ${
                  isLight
                    ? "bg-[#F3F5FA] hover:bg-[#E6ECF8] border-[#E2E8F0] text-slate-600 hover:text-[#2B4C8F]"
                    : "bg-white/5 hover:bg-white/10 border-white/10 text-slate-400 hover:text-white"
                }`}
                title="Refresh library"
              >
                <svg
                  className={`w-4 h-4 ${loading ? "animate-spin text-[#2B4C8F] dark:text-[#6C95FF]" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            </div>
            <p className="text-xs text-[#8E99AE] mt-1 font-medium">
              <span className={`font-bold ${isLight ? "text-slate-800" : "text-slate-200"}`}>
                {files.length}
              </span>{" "}
              {files.length === 1 ? "track" : "tracks"} • Stream, manage, and play saved offline
            </p>
          </div>

          {/* Delete mode toggle */}
          {files.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setIsDeleteMode(!isDeleteMode);
                  setSelectedForDelete(new Set());
                }}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border transition-all active:scale-95 ${
                  isDeleteMode
                    ? "bg-red-600 text-white border-red-500 shadow-lg shadow-red-600/30"
                    : isLight
                    ? "text-slate-600 hover:text-red-600 hover:border-red-300 border-[#E2E8F0] bg-[#F8FAFC]"
                    : "text-zinc-400 hover:text-red-400 hover:border-red-500/30 border-white/10 bg-white/5"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>{isDeleteMode ? "Cancel" : "Manage / Delete"}</span>
              </button>
            </div>
          )}
        </div>

        {/* Underline Tabs: Songs / Artists / Albums / Saved Offline (Screen 3 style) */}
        <div className="flex items-center gap-2 sm:gap-6 pt-4 overflow-x-auto scrollbar-none">
          {[
            { id: "songs", label: "Songs", count: files.length },
            { id: "artists", label: "Artists", count: artistsGrouped.length },
            { id: "albums", label: "Albums", count: albumsGrouped.length },
            { id: "offline", label: "Saved Offline", count: offlineCount, badge: "⚡" },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as LibraryTab);
                  setSelectedArtist(null);
                  setSelectedAlbum(null);
                }}
                className={`relative pb-3 px-1 text-sm font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                  isActive
                    ? isLight
                      ? "text-[#1A1F2C]"
                      : "text-white"
                    : "text-[#8E99AE] hover:text-[#1A1F2C] dark:hover:text-[#EAF0FF]"
                }`}
                style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
              >
                <span>{tab.label}</span>
                {tab.badge && <span className="text-emerald-500 text-xs">{tab.badge}</span>}
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    isActive
                      ? isLight
                        ? "bg-[#E6ECF8] text-[#2B4C8F]"
                        : "bg-white/15 text-white"
                      : isLight
                      ? "bg-slate-100 text-slate-500"
                      : "bg-white/5 text-slate-400"
                  }`}
                >
                  {tab.count}
                </span>

                {/* Smooth 3px Navy Underline Pill */}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full transition-all duration-300"
                    style={{ backgroundColor: config.primaryHex }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Batch Delete Action Bar */}
      {isDeleteMode && (
        <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/30 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectAll}
              className="text-xs font-semibold text-zinc-300 hover:text-white flex items-center gap-2"
            >
              <span
                className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                  selectedForDelete.size === filteredFiles.length && filteredFiles.length > 0
                    ? "bg-red-600 border-red-500 text-white"
                    : "border-white/30 bg-white/5"
                }`}
              >
                {selectedForDelete.size === filteredFiles.length && filteredFiles.length > 0 ? "✓" : ""}
              </span>
              <span>Select All</span>
            </button>
            <span className="text-xs text-zinc-400">
              {selectedForDelete.size} of {filteredFiles.length} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setIsDeleteMode(false);
                setSelectedForDelete(new Set());
              }}
              className="px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleBatchDelete}
              disabled={selectedForDelete.size === 0 || isBatchDeleting}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-bold rounded-xl shadow-lg shadow-red-600/30 active:scale-95 transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span>{isBatchDeleting ? "Deleting..." : `Delete (${selectedForDelete.size})`}</span>
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl">
          {error}
        </div>
      )}

      {/* Search & Sort Controls Bar */}
      {files.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Pill Search Input */}
          <div className="relative flex-1 sm:max-w-md">
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-9 py-2.5 text-xs rounded-full border transition-all outline-none ${
                isLight
                  ? "bg-white border-[#E2E8F0] text-slate-800 placeholder-slate-400 shadow-[inset_0_2px_4px_rgba(35,55,110,0.03)] focus:border-[#2B4C8F]"
                  : "bg-[#161C2E] border-white/10 text-white placeholder-slate-400 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] focus:border-[#6C95FF]"
              }`}
            />
            <svg
              className="w-4 h-4 text-[#8E99AE] absolute left-3.5 top-1/2 -translate-y-1/2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick Filters / Sorting Pills */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* Format filter */}
            <div
              className={`flex items-center p-1 rounded-full border ${
                isLight ? "bg-white border-[#E2E8F0]" : "bg-[#161C2E] border-white/10"
              }`}
            >
              {(["all", "audio", "video"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1 text-[11px] font-bold rounded-full transition-all ${
                    filterType === type
                      ? "text-white shadow-sm"
                      : "text-[#8E99AE] hover:text-[#1A1F2C] dark:hover:text-[#EAF0FF]"
                  }`}
                  style={filterType === type ? { backgroundColor: config.primaryHex } : undefined}
                >
                  {type === "all" ? "All" : type === "audio" ? `Audio (${audioCount})` : `Video (${videoCount})`}
                </button>
              ))}
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full border outline-none ${
                isLight
                  ? "bg-white border-[#E2E8F0] text-slate-700"
                  : "bg-[#161C2E] border-white/10 text-slate-200"
              }`}
            >
              <option value="recent">Recently Added</option>
              <option value="title">Title (A-Z)</option>
              <option value="duration">Duration</option>
            </select>
          </div>
        </div>
      )}

      {/* Breadcrumb if drilled down into Artist or Album */}
      {(selectedArtist || selectedAlbum) && (
        <div className="flex items-center gap-2 animate-in fade-in">
          <button
            onClick={() => {
              setSelectedArtist(null);
              setSelectedAlbum(null);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
              isLight
                ? "bg-[#E6ECF8] text-[#2B4C8F] border-[#2B4C8F]/20"
                : "bg-white/10 text-white border-white/15"
            }`}
          >
            <span>← Back to all {selectedArtist ? "Artists" : "Albums"}</span>
          </button>
          <span className="text-xs font-bold text-[#8E99AE]">
            Viewing {selectedArtist || selectedAlbum} ({filteredFiles.length} tracks)
          </span>
        </div>
      )}

      {/* Empty State */}
      {files.length === 0 && !loading && (
        <div
          className={`rounded-[28px] p-10 text-center space-y-3 border ${
            isLight
              ? "bg-white border-[#E2E8F0] shadow-[0_10px_30px_rgba(35,55,110,0.06)]"
              : "bg-[#161C2E] border-white/10 shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
          }`}
        >
          <div
            className="w-16 h-16 mx-auto rounded-3xl flex items-center justify-center text-3xl shadow-sm"
            style={{ background: `${config.primaryHex}15`, border: `1px solid ${config.primaryHex}30` }}
          >
            📥
          </div>
          <h3 className={`text-base font-bold ${isLight ? "text-slate-800" : "text-white"}`}>
            No Downloaded Songs Yet
          </h3>
          <p className="text-xs text-[#8E99AE] max-w-sm mx-auto leading-relaxed">
            Download music or videos using the Discover tab above. All tracks are stored for instant in-browser playback and offline saving.
          </p>
        </div>
      )}

      {/* ARTISTS TAB VIEW */}
      {activeTab === "artists" && !selectedArtist && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
          {artistsGrouped.map((item) => (
            <div
              key={item.name}
              onClick={() => setSelectedArtist(item.name)}
              className={`rounded-[24px] p-4 text-center cursor-pointer transition-all active:scale-[0.98] border group ${
                isLight
                  ? "bg-white border-[#E2E8F0] hover:border-[#2B4C8F]/40 shadow-[0_6px_20px_rgba(35,55,110,0.05)] hover:shadow-[0_10px_26px_rgba(35,55,110,0.1)]"
                  : "bg-[#161C2E] border-white/10 hover:border-[#6C95FF]/40 shadow-[0_8px_24px_rgba(0,0,0,0.3)] hover:shadow-[0_12px_30px_rgba(0,0,0,0.4)]"
              }`}
            >
              <div
                className="w-16 h-16 mx-auto rounded-full flex items-center justify-center text-2xl font-bold shadow-md transition-transform group-hover:scale-105"
                style={{ backgroundColor: `${config.primaryHex}20`, color: config.primaryHex }}
              >
                {item.tracks[0]?.thumbnail_url ? (
                  <img
                    src={resolveMediaUrl(item.tracks[0].thumbnail_url)}
                    alt={item.name}
                    className="w-full h-full object-cover rounded-full"
                    loading="lazy"
                  />
                ) : (
                  <span>🎤</span>
                )}
              </div>
              <h4 className={`text-sm font-bold mt-3 truncate ${isLight ? "text-slate-800" : "text-white"}`}>
                {item.name}
              </h4>
              <p className="text-xs text-[#8E99AE] mt-0.5">
                {item.count} {item.count === 1 ? "track" : "tracks"}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ALBUMS TAB VIEW */}
      {activeTab === "albums" && !selectedAlbum && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
          {albumsGrouped.map((item) => (
            <div
              key={item.name}
              onClick={() => setSelectedAlbum(item.name)}
              className={`rounded-[24px] p-4 text-center cursor-pointer transition-all active:scale-[0.98] border group ${
                isLight
                  ? "bg-white border-[#E2E8F0] hover:border-[#2B4C8F]/40 shadow-[0_6px_20px_rgba(35,55,110,0.05)] hover:shadow-[0_10px_26px_rgba(35,55,110,0.1)]"
                  : "bg-[#161C2E] border-white/10 hover:border-[#6C95FF]/40 shadow-[0_8px_24px_rgba(0,0,0,0.3)] hover:shadow-[0_12px_30px_rgba(0,0,0,0.4)]"
              }`}
            >
              <div className="w-20 h-20 mx-auto rounded-[20px] overflow-hidden bg-slate-900 shadow-md transition-transform group-hover:scale-105">
                {item.tracks[0]?.thumbnail_url ? (
                  <img
                    src={resolveMediaUrl(item.tracks[0].thumbnail_url)}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl">📁</div>
                )}
              </div>
              <h4 className={`text-sm font-bold mt-3 truncate ${isLight ? "text-slate-800" : "text-white"}`}>
                {item.name}
              </h4>
              <p className="text-xs text-[#8E99AE] mt-0.5">
                {item.count} {item.count === 1 ? "track" : "tracks"}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* SONGS / TRACK LIST ROWS (Screen 3 style) */}
      {(activeTab === "songs" || activeTab === "offline" || selectedArtist || selectedAlbum) && (
        <div className="space-y-2.5">
          {filteredFiles.map((file) => {
            const isVideo = file.media_type === "video" || isVideoFile(file.filename);
            const isAudio = file.media_type === "audio" || isAudioFile(file.filename);
            const downloadUrl = getFileByNameUrl(file.filename);
            const isSelected = selectedForDelete.has(file.filename);
            const isSavedOffline = savedOfflineIds.has(getTrackOfflineId(file));
            const isDownloading = offlineDownloadingMap[getTrackOfflineId(file)] !== undefined;

            return (
              <div
                key={file.filename}
                onClick={() => {
                  if (isDeleteMode) {
                    toggleSelectForDelete(file.filename);
                  }
                }}
                className={`rounded-[22px] p-3 sm:p-3.5 flex items-center justify-between gap-3 sm:gap-4 transition-all duration-200 border group ${
                  isDeleteMode ? "cursor-pointer" : ""
                } ${
                  isSelected
                    ? "bg-red-500/10 border-red-500 shadow-md"
                    : isLight
                    ? "bg-white border-[#E2E8F0] hover:border-[#2B4C8F]/30 shadow-[0_4px_16px_rgba(35,55,110,0.05)] hover:shadow-[0_8px_24px_rgba(35,55,110,0.09)]"
                    : "bg-[#161C2E] border-white/10 hover:border-[#6C95FF]/30 shadow-[0_4px_16px_rgba(0,0,0,0.25)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
                }`}
              >
                {/* Delete Mode Checkbox */}
                {isDeleteMode && (
                  <div className="pr-1 flex items-center shrink-0">
                    <div
                      className={`w-5 h-5 rounded-lg border flex items-center justify-center text-xs font-bold transition-all ${
                        isSelected
                          ? "bg-red-600 border-red-500 text-white shadow-md shadow-red-600/40"
                          : isLight
                          ? "border-slate-300 bg-slate-50"
                          : "border-white/30 bg-zinc-900/80"
                      }`}
                    >
                      {isSelected && "✓"}
                    </div>
                  </div>
                )}

                {/* Squircle Thumbnail (52x52 / rounded-[18px]) */}
                <div
                  onClick={(e) => {
                    if (isDeleteMode) {
                      e.stopPropagation();
                      toggleSelectForDelete(file.filename);
                      return;
                    }
                    if (onPlayTrack) {
                      handlePlayFile(file, filteredFiles);
                    } else {
                      setPreviewFile(file);
                    }
                  }}
                  className="relative w-13 h-13 sm:w-14 sm:h-14 rounded-[18px] overflow-hidden bg-slate-900 shrink-0 border border-black/5 dark:border-white/10 flex items-center justify-center cursor-pointer shadow-sm group-hover:scale-105 transition-all duration-300"
                  title={isDeleteMode ? "Select for deletion" : "Click to play"}
                >
                  {file.thumbnail_url ? (
                    <img
                      src={resolveMediaUrl(file.thumbnail_url)}
                      alt={file.clean_title || file.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl bg-slate-800">
                      {isVideo ? "🎬" : "🎵"}
                    </div>
                  )}

                  {/* Play overlay triangle on hover */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <div className="w-7 h-7 rounded-full bg-white/90 text-[#2B4C8F] flex items-center justify-center pl-0.5 shadow-md">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Track Information */}
                <div className="flex-1 min-w-0 pr-1 sm:pr-2">
                  <button
                    onClick={(e) => {
                      if (isDeleteMode) {
                        e.stopPropagation();
                        toggleSelectForDelete(file.filename);
                        return;
                      }
                      if (onPlayTrack) {
                        handlePlayFile(file, filteredFiles);
                      } else {
                        setPreviewFile(file);
                      }
                    }}
                    className={`text-left font-bold text-xs sm:text-sm truncate block w-full transition-colors leading-tight ${
                      isLight ? "text-[#1A1F2C] hover:text-[#2B4C8F]" : "text-white hover:text-[#6C95FF]"
                    }`}
                    style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
                    title={isDeleteMode ? "Select for deletion" : "Click to play"}
                  >
                    {file.clean_title || file.filename}
                  </button>

                  <div className="text-[11px] text-[#8E99AE] mt-1 truncate flex items-center gap-2 font-medium">
                    {file.artist && (
                      <span className="truncate max-w-[120px] font-semibold">
                        {file.artist}
                      </span>
                    )}
                    {file.artist && <span>•</span>}
                    {file.duration && file.duration > 0 ? (
                      <span className="font-mono">{formatDurationSec(file.duration)}</span>
                    ) : (
                      <span className="font-mono">{formatFileSize(file.size_bytes)}</span>
                    )}
                    <span>•</span>
                    <span>{formatRelativeTime(file.modified_at)}</span>

                    {/* Saved Offline Pill Badge */}
                    {isSavedOffline && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                        ⚡ Saved
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Column on Right */}
                <div
                  className="flex items-center gap-1 sm:gap-1.5 shrink-0 relative"
                  onClick={(e) => {
                    if (isDeleteMode) e.stopPropagation();
                  }}
                >
                  {/* Heart / Like Button */}
                  <LikeButton size="sm" track={file} />

                  {/* Offline Toggle Icon */}
                  <button
                    type="button"
                    onClick={() => handleToggleOffline(file)}
                    disabled={isDownloading}
                    className={`p-2 rounded-xl transition-all ${
                      isLight ? "text-slate-400 hover:text-[#2B4C8F] hover:bg-[#F3F5FA]" : "text-slate-400 hover:text-white hover:bg-white/10"
                    }`}
                    title={
                      isSavedOffline
                        ? "Saved offline (click to remove)"
                        : "Save to device for offline playback"
                    }
                  >
                    {isDownloading ? (
                      <span className="text-[10px] font-bold text-amber-500">
                        {offlineDownloadingMap[getTrackOfflineId(file)]}%
                      </span>
                    ) : isSavedOffline ? (
                      <span className="text-xs text-emerald-500 font-bold" title="Saved offline">
                        ⚡
                      </span>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                        />
                      </svg>
                    )}
                  </button>

                  {/* Three-dots Kebab Button */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuFilename(activeMenuFilename === file.filename ? null : file.filename);
                      }}
                      className={`p-2 rounded-xl text-xs font-bold transition-colors ${
                        isLight
                          ? "text-slate-400 hover:text-slate-800 hover:bg-[#F3F5FA]"
                          : "text-slate-400 hover:text-white hover:bg-white/10"
                      }`}
                      title="More options"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>

                    {/* Popup Context Sheet */}
                    {activeMenuFilename === file.filename && (
                      <div
                        className={`absolute right-0 top-full mt-1 w-52 rounded-2xl shadow-2xl p-1.5 z-40 space-y-1 animate-in fade-in zoom-in-95 duration-150 border ${
                          isLight
                            ? "bg-white border-[#E2E8F0] shadow-[0_12px_32px_rgba(35,55,110,0.15)] text-slate-700"
                            : "bg-[#161C2E] border-white/15 shadow-[0_16px_36px_rgba(0,0,0,0.5)] text-slate-200"
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuFilename(null);
                            handlePlayFile(file, filteredFiles);
                          }}
                          className="w-full text-left px-3 py-2 text-xs font-semibold rounded-xl flex items-center gap-2.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          <span>▶️</span>
                          <span>Play Now</span>
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            setActiveMenuFilename(null);
                            await toggleLikedOptimistic(file);
                          }}
                          className="w-full text-left px-3 py-2 text-xs font-semibold rounded-xl flex items-center gap-2.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          <span>❤️</span>
                          <span>Like / Liked Songs</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuFilename(null);
                            handleToggleOffline(file);
                          }}
                          className="w-full text-left px-3 py-2 text-xs font-semibold rounded-xl flex items-center gap-2.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          <span>⚡</span>
                          <span>{isSavedOffline ? "Remove Offline" : "Save Offline"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuFilename(null);
                            handleCopyLink(file.filename);
                          }}
                          className="w-full text-left px-3 py-2 text-xs font-semibold rounded-xl flex items-center gap-2.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          <span>🔗</span>
                          <span>{copiedFilename === file.filename ? "Copied!" : "Copy Link"}</span>
                        </button>

                        <a
                          href={downloadUrl}
                          download={file.filename}
                          onClick={() => setActiveMenuFilename(null)}
                          className="w-full text-left px-3 py-2 text-xs font-semibold rounded-xl flex items-center gap-2.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          <span>💾</span>
                          <span>Download to Browser</span>
                        </a>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuFilename(null);
                            handleDeleteSingle(file.filename);
                          }}
                          className="w-full text-left px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-500/10 rounded-xl flex items-center gap-2.5 transition-colors"
                        >
                          <span>🗑️</span>
                          <span>Delete File</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* In-Browser Preview Modal */}
      {previewFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setPreviewFile(null)}
        >
          <div
            className={`w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl border ${
              isLight ? "bg-white border-[#E2E8F0]" : "bg-[#161C2E] border-white/15"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 dark:border-white/10">
              <div className="flex items-center gap-2 min-w-0 pr-4">
                <span className="text-base">{isVideoFile(previewFile.filename) ? "🎬" : "🎵"}</span>
                <h4 className={`text-sm font-bold truncate ${isLight ? "text-slate-800" : "text-white"}`}>
                  {previewFile.filename}
                </h4>
              </div>
              <button
                onClick={() => setPreviewFile(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-black/90 flex items-center justify-center">
              {isVideoFile(previewFile.filename) ? (
                <video
                  controls
                  autoPlay
                  className="max-h-[60vh] w-full rounded-2xl outline-none"
                  src={getFileByNameUrl(previewFile.filename, true)}
                >
                  Your browser does not support the video tag.
                </video>
              ) : (
                <div className="w-full py-8 text-center space-y-4">
                  <div
                    className="w-20 h-20 mx-auto rounded-3xl flex items-center justify-center text-3xl animate-pulse"
                    style={{ backgroundColor: `${config.primaryHex}20`, color: config.primaryHex }}
                  >
                    🎵
                  </div>
                  <audio
                    controls
                    autoPlay
                    className="w-full max-w-md mx-auto outline-none"
                    src={getFileByNameUrl(previewFile.filename, true)}
                  >
                    Your browser does not support the audio tag.
                  </audio>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-t border-black/5 dark:border-white/10 text-xs text-[#8E99AE]">
              <span>Size: {formatFileSize(previewFile.size_bytes)}</span>
              <a
                href={getFileByNameUrl(previewFile.filename)}
                download={previewFile.filename}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-white font-bold rounded-full text-xs shadow-md transition-all active:scale-95"
                style={{ backgroundColor: config.primaryHex }}
              >
                Save to Browser Downloads
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
