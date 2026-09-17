"use client";
import type { FileInfo } from "@/lib/types";
import { formatFileSize } from "@/lib/websocket";
import { resolveMediaUrl } from "@/lib/api";

interface RecentAndActiveSectionProps {
  id: string;
  currentFile: FileInfo | null;
  recentFiles: FileInfo[];
  totalCount: number;
  onPlayTrack: (file: FileInfo) => void;
  onOpenPlayer: () => void;
  onViewLibrary: () => void;
}

export function RecentAndActiveSection({
  id,
  currentFile,
  recentFiles,
  totalCount,
  onPlayTrack,
  onOpenPlayer,
  onViewLibrary,
}: RecentAndActiveSectionProps) {
  const hasHistory = recentFiles.length > 0;

  return (
    <div id={id} className="space-y-6 pt-4 animate-in fade-in duration-300">
      {/* ── 1. Continue Playing / You Are Playing Banner ─────────────────── */}
      {currentFile && (
        <div className="relative overflow-hidden p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-purple-950/40 via-slate-900/80 to-indigo-950/40 border border-purple-500/30 shadow-xl shadow-purple-950/20 glass-card">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 w-full sm:w-auto">
              <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-slate-850 shrink-0 shadow-md border border-white/10">
                {currentFile.thumbnail_url ? (
                  <img
                    src={resolveMediaUrl(currentFile.thumbnail_url)}
                    alt={currentFile.clean_title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl bg-slate-900">
                    {currentFile.media_type === "video" ? "🎬" : "🎵"}
                  </div>
                )}
                <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded text-[9px] font-black bg-black/80 text-white">
                  {currentFile.media_type === "video" ? "🎬" : "🎵"}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-purple-300">
                    You Are Playing
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-bold text-white truncate">
                  {currentFile.clean_title}
                </h3>
                <p className="text-xs text-gray-400">
                  {formatFileSize(currentFile.size_bytes)} • Ready to continue
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => onPlayTrack(currentFile)}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs sm:text-sm shadow-md shadow-purple-600/25 active:scale-95 transition-all shrink-0"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span>Resume</span>
              </button>

              <button
                onClick={onOpenPlayer}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs sm:text-sm border border-white/10 active:scale-95 transition-all shrink-0"
              >
                <span>Full Player →</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. Recently Downloaded Section ──────────────────────────────── */}
      {hasHistory && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-500" />
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-gray-300">
                Recently Downloaded
              </h3>
            </div>
            <button
              onClick={onViewLibrary}
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
            >
              <span>View all {totalCount} in Library</span>
              <span>→</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recentFiles.slice(0, 4).map((file) => (
              <div
                key={file.filename}
                className="group relative flex items-center gap-3 p-3 rounded-xl bg-slate-900/60 hover:bg-slate-850/80 border border-white/[0.06] hover:border-white/15 transition-all glass-card"
              >
                {/* Thumbnail with badge */}
                <div
                  onClick={() => onPlayTrack(file)}
                  className="relative w-14 h-14 rounded-lg overflow-hidden bg-slate-950 shrink-0 shadow cursor-pointer"
                >
                  {file.thumbnail_url ? (
                    <img
                      src={resolveMediaUrl(file.thumbnail_url)}
                      alt={file.clean_title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-lg bg-slate-900">
                      {file.media_type === "video" ? "🎬" : "🎵"}
                    </div>
                  )}
                  <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded text-[8px] font-black bg-black/85 text-white">
                    {file.media_type === "video" ? "🎬 VID" : "🎵 MP3"}
                  </span>
                </div>

                {/* Details */}
                <div
                  onClick={() => onPlayTrack(file)}
                  className="min-w-0 flex-1 cursor-pointer"
                >
                  <h4 className="text-xs sm:text-sm font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
                    {file.clean_title}
                  </h4>
                  <p className="text-[11px] text-gray-400">
                    {formatFileSize(file.size_bytes)}
                  </p>
                </div>

                {/* Quick Play Button */}
                <button
                  onClick={() => onPlayTrack(file)}
                  className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white group-hover:bg-indigo-600 group-hover:text-white transition-all shadow-sm shrink-0"
                  title="Play"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 3. Fresh State Features (When zero downloads exist) ──────────── */}
      {!hasHistory && !currentFile && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-4 rounded-xl bg-slate-900/40 border border-white/[0.06] space-y-1.5">
            <div className="text-lg">⚡</div>
            <h4 className="text-xs font-bold text-white">Fast Direct Engine</h4>
            <p className="text-[11px] text-gray-400">
              Powered by native yt-dlp & FFmpeg for maximum bitrates.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/40 border border-white/[0.06] space-y-1.5">
            <div className="text-lg">🎵</div>
            <h4 className="text-xs font-bold text-white">Playlist & Video Support</h4>
            <p className="text-[11px] text-gray-400">
              Paste single video or full playlist links to download in batch.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/40 border border-white/[0.06] space-y-1.5">
            <div className="text-lg">🎧</div>
            <h4 className="text-xs font-bold text-white">Built-in Player</h4>
            <p className="text-[11px] text-gray-400">
              Stream your downloaded songs with live scrubber and turntable vinyl.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
