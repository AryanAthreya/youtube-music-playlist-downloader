"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { getFiles, getFileByNameUrl, deleteFileByName } from "@/lib/api";
import { formatFileSize } from "@/lib/websocket";
import type { FileInfo } from "@/lib/types";

interface FileListProps {
  id: string;
  onCountChange?: (count: number) => void;
  onPlayTrack?: (file: FileInfo, allFiles: FileInfo[]) => void;
}

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

function isVideoFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ["mp4", "webm", "mkv", "avi", "mov"].includes(ext);
}

function isAudioFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ["mp3", "m4a", "opus", "flac", "wav", "ogg"].includes(ext);
}

export function FileList({ id, onCountChange, onPlayTrack }: FileListProps) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "video" | "audio">("all");
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FileInfo | null>(null);
  const [copiedFilename, setCopiedFilename] = useState<string | null>(null);

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

  const handleDelete = async (filename: string) => {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) return;
    try {
      setDeletingFile(filename);
      await deleteFileByName(filename);
      setFiles((prev) => prev.filter((f) => f.filename !== filename));
      if (previewFile?.filename === filename) setPreviewFile(null);
      onCountChange?.(files.length - 1);
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(e.message ?? "Failed to delete file");
    } finally {
      setDeletingFile(null);
    }
  };

  const handleCopyLink = (filename: string) => {
    const url = getFileByNameUrl(filename);
    navigator.clipboard.writeText(url);
    setCopiedFilename(filename);
    setTimeout(() => setCopiedFilename(null), 2000);
  };

  const filteredFiles = useMemo(() => {
    return files.filter((f) => {
      const matchesSearch = f.filename.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
      if (filterType === "video") return isVideoFile(f.filename);
      if (filterType === "audio") return isAudioFile(f.filename);
      return true;
    });
  }, [files, searchQuery, filterType]);

  const videoCount = useMemo(() => files.filter((f) => isVideoFile(f.filename)).length, [files]);
  const audioCount = useMemo(() => files.filter((f) => isAudioFile(f.filename)).length, [files]);

  return (
    <section id={id} className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <span>Downloaded Files</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {files.length}
              </span>
            </h2>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Access, play, and save your downloaded media anytime
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id={`${id}-refresh`}
            onClick={loadFiles}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white glass-card rounded-lg transition-all hover:border-gray-500 active:scale-95"
            title="Refresh list"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-400" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 text-xs text-red-300 bg-red-950/40 border border-red-800/50 rounded-xl">
          {error}
        </div>
      )}

      {/* Filter and Search Bar */}
      {files.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 p-1 glass-card rounded-xl">
            <button
              onClick={() => setFilterType("all")}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                filterType === "all"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              All ({files.length})
            </button>
            <button
              onClick={() => setFilterType("video")}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                filterType === "video"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Videos ({videoCount})
            </button>
            <button
              onClick={() => setFilterType("audio")}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                filterType === "audio"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Audio ({audioCount})
            </button>
          </div>

          {/* Search input styled like Brave/Chrome downloads bar */}
          <div className="relative flex-1 sm:max-w-xs">
            <input
              type="text"
              placeholder="Search download history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900/80 border border-slate-700/60 rounded-xl text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <svg
              className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* Empty State */}
      {files.length === 0 && !loading && (
        <div className="glass-panel rounded-2xl p-8 text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-2xl">
            📥
          </div>
          <h3 className="text-base font-semibold text-gray-200">No Download History Yet</h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
            Downloaded videos and music are stored permanently in your local <code className="text-indigo-300 font-mono">downloads/completed</code> folder and will appear here with instant in-browser playback and saving.
          </p>
        </div>
      )}

      {/* Download Items List - Styled like Brave/Chrome Downloads */}
      {filteredFiles.length > 0 && (
        <div className="space-y-2.5">
          {filteredFiles.map((file) => {
            const isVideo = file.media_type === "video" || isVideoFile(file.filename);
            const isAudio = file.media_type === "audio" || isAudioFile(file.filename);
            const downloadUrl = getFileByNameUrl(file.filename);

            return (
              <div
                key={file.filename}
                className="glass-card rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-3 sm:gap-4 hover:border-indigo-500/30 transition-all group"
              >
                {/* Thumbnail with Video/Music Symbol Badge */}
                <div
                  onClick={() => {
                    if (onPlayTrack) {
                      onPlayTrack(file, filteredFiles);
                    } else {
                      setPreviewFile(file);
                    }
                  }}
                  className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-slate-950 overflow-hidden shrink-0 border border-white/10 flex items-center justify-center cursor-pointer group-hover:border-indigo-500/50 shadow-md transition-all"
                  title="Click to play"
                >
                  {file.thumbnail_url ? (
                    <img
                      src={file.thumbnail_url}
                      alt={file.clean_title || file.filename}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl bg-slate-900">
                      {isVideo ? "🎬" : isAudio ? "🎵" : "📄"}
                    </div>
                  )}

                  {/* Video / Music Symbol Badge on bottom right of thumbnail */}
                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md text-[9px] font-black bg-black/85 backdrop-blur-md border border-white/20 text-white flex items-center gap-1 shadow-sm">
                    {isVideo ? (
                      <>
                        <span className="text-orange-400">🎬</span>
                        <span className="font-mono">VID</span>
                      </>
                    ) : isAudio ? (
                      <>
                        <span className="text-indigo-400">🎵</span>
                        <span className="font-mono">MP3</span>
                      </>
                    ) : (
                      <span>📄</span>
                    )}
                  </span>
                </div>

                {/* File details (Clean Title) */}
                <div className="flex-1 min-w-0 pr-2">
                  <button
                    onClick={() => {
                      if (onPlayTrack) {
                        onPlayTrack(file, filteredFiles);
                      } else {
                        setPreviewFile(file);
                      }
                    }}
                    className="text-left font-semibold text-xs sm:text-sm text-white group-hover:text-indigo-300 hover:underline truncate block w-full transition-colors leading-snug"
                    title="Click to play in Player"
                  >
                    {file.clean_title || file.filename}
                  </button>
                  <p className="text-[11px] text-gray-400 mt-1 truncate flex items-center gap-2 font-medium">
                    <span className="font-mono">{formatFileSize(file.size_bytes)}</span>
                    <span>•</span>
                    <span>{formatRelativeTime(file.modified_at)}</span>
                    <span className="hidden sm:inline">•</span>
                    <span className="hidden sm:inline text-indigo-400/80 font-mono text-[10px]">
                      {isVideo ? "MP4 Video" : "MP3 Audio"}
                    </span>
                  </p>
                </div>

                {/* Action icons on right */}
                <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                  {/* Copy Link */}
                  <button
                    onClick={() => handleCopyLink(file.filename)}
                    className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                    title={copiedFilename === file.filename ? "Copied!" : "Copy download link"}
                  >
                    {copiedFilename === file.filename ? (
                      <span className="text-xs text-emerald-400 font-bold">✓</span>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    )}
                  </button>

                  {/* Play / Preview Button -> Switches to Player */}
                  <button
                    onClick={() => {
                      if (onPlayTrack) {
                        onPlayTrack(file, filteredFiles);
                      } else {
                        setPreviewFile(file);
                      }
                    }}
                    className="p-2 text-indigo-400 hover:text-indigo-300 rounded-lg hover:bg-indigo-500/15 active:scale-95 transition-all"
                    title="Play in dedicated player"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>

                  {/* Save to Browser Downloads */}
                  <a
                    href={downloadUrl}
                    download={file.filename}
                    className="p-2 text-emerald-400 hover:text-emerald-300 rounded-lg hover:bg-emerald-500/10 transition-colors"
                    title="Save into browser downloads"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </a>

                  {/* Delete from disk */}
                  <button
                    onClick={() => handleDelete(file.filename)}
                    disabled={deletingFile === file.filename}
                    className="p-2 text-gray-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                    title="Delete file from disk"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* In-Browser Preview Modal */}
      {previewFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setPreviewFile(null)}
        >
          <div
            className="glass-panel w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl border border-white/15"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] bg-slate-900/60">
              <div className="flex items-center gap-2 min-w-0 pr-4">
                <span className="text-base">{isVideoFile(previewFile.filename) ? "🎬" : "🎵"}</span>
                <h4 className="text-xs sm:text-sm font-semibold text-white truncate">
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

            {/* Media Player */}
            <div className="p-4 bg-black/80 flex items-center justify-center">
              {isVideoFile(previewFile.filename) ? (
                <video
                  controls
                  autoPlay
                  className="max-h-[60vh] w-full rounded-xl outline-none"
                  src={getFileByNameUrl(previewFile.filename, true)}
                >
                  Your browser does not support the video tag.
                </video>
              ) : (
                <div className="w-full py-8 text-center space-y-4">
                  <div className="w-20 h-20 mx-auto rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-3xl animate-pulse">
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

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900/60 border-t border-white/[0.08] text-xs text-gray-400">
              <span>Size: {formatFileSize(previewFile.size_bytes)}</span>
              <a
                href={getFileByNameUrl(previewFile.filename)}
                download={previewFile.filename}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs transition-colors"
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
