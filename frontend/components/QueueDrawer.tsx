"use client";

import React from "react";
import type { FileInfo } from "@/lib/types";
import { resolveMediaUrl } from "@/lib/api";
import { useTheme } from "@/context/ThemeContext";
import { LikeButton } from "./LikeButton";

interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentTrack: FileInfo | null;
  queueTracks: FileInfo[];
  currentIndex: number;
  isPlaying: boolean;
  onSelectIndex: (index: number) => void;
  onRemoveIndex: (index: number) => void;
  onMoveIndex: (fromIndex: number, toIndex: number) => void;
  onClearQueue: () => void;
}

export function QueueDrawer({
  isOpen,
  onClose,
  currentTrack,
  queueTracks,
  currentIndex,
  isPlaying,
  onSelectIndex,
  onRemoveIndex,
  onMoveIndex,
  onClearQueue,
}: QueueDrawerProps) {
  const { config, theme } = useTheme();
  const isLight = config.isLight || theme === "soft-light";

  if (!isOpen) return null;

  const upNextTracks = queueTracks
    .map((track, idx) => ({ track, originalIndex: idx }))
    .filter((item) => item.originalIndex > currentIndex);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Backdrop tap to close */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer Panel: Slide up on mobile, slide in on desktop */}
      <div
        className={`w-full max-w-md h-full flex flex-col p-5 sm:p-6 overflow-hidden animate-in slide-in-from-right duration-300 border-l ${
          isLight
            ? "bg-[#F3F5FA] border-[#E2E8F0] text-slate-800 shadow-[0_0_50px_rgba(35,55,110,0.15)]"
            : "bg-[#0D1220] border-white/10 text-white shadow-[0_0_50px_rgba(0,0,0,0.7)]"
        }`}
      >
        {/* Mobile Drag Handle */}
        <div className="w-12 h-1 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto mb-3 md:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-black/5 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-[14px] flex items-center justify-center text-sm shadow-sm"
              style={{ backgroundColor: `${config.primaryHex}20`, color: config.primaryHex }}
            >
              📜
            </div>
            <div>
              <h3
                className={`text-lg font-black tracking-tight ${isLight ? "text-[#1A1F2C]" : "text-white"}`}
                style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
              >
                Queue
              </h3>
              <p className="text-xs text-[#8E99AE] font-medium">
                {queueTracks.length} {queueTracks.length === 1 ? "track" : "tracks"} total
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {upNextTracks.length > 0 && (
              <button
                type="button"
                onClick={onClearQueue}
                className="px-3 py-1.5 text-xs font-bold rounded-full text-red-500 hover:bg-red-500/10 transition-colors"
                title="Clear upcoming tracks"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className={`p-2 rounded-full border transition-all ${
                isLight
                  ? "bg-white border-[#E2E8F0] text-slate-500 hover:text-slate-800 shadow-sm"
                  : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
              }`}
              title="Close Queue"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto space-y-5 py-4 pr-1 scrollbar-none">
          {/* NOW PLAYING SECTION */}
          {currentTrack && (
            <div>
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#8E99AE] mb-2.5 block">
                Now Playing
              </span>
              <div
                className={`p-3.5 rounded-[22px] border flex items-center justify-between gap-3 transition-all ${
                  isLight
                    ? "bg-white border-[#E2E8F0] shadow-[0_6px_20px_rgba(35,55,110,0.06)] ring-1 ring-[#2B4C8F]/15"
                    : "bg-[#161C2E] border-white/15 shadow-[0_8px_24px_rgba(0,0,0,0.3)] ring-1 ring-[#6C95FF]/20"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative w-12 h-12 rounded-[16px] overflow-hidden bg-slate-900 shrink-0 border border-black/5 dark:border-white/10 shadow-sm">
                    {currentTrack.thumbnail_url ? (
                      <img
                        src={resolveMediaUrl(currentTrack.thumbnail_url)}
                        alt={currentTrack.clean_title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-base">
                        🎵
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4
                      className={`text-xs sm:text-sm font-bold truncate leading-tight ${
                        isLight ? "text-[#1A1F2C]" : "text-white"
                      }`}
                      style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
                    >
                      {currentTrack.clean_title}
                    </h4>
                    <p className="text-[11px] text-[#8E99AE] truncate mt-0.5">
                      {currentTrack.artist || "YouTube Music"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <LikeButton size="sm" track={currentTrack} />
                  {isPlaying ? (
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                      style={{ backgroundColor: `${config.primaryHex}20`, color: config.primaryHex }}
                    >
                      Playing
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-[#8E99AE] bg-black/5 dark:bg-white/5">
                      Paused
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* UP NEXT SECTION */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#8E99AE]">
                Up Next ({upNextTracks.length})
              </span>
            </div>

            {upNextTracks.length === 0 ? (
              <div
                className={`py-8 text-center rounded-[22px] border border-dashed p-4 ${
                  isLight ? "border-slate-300 text-slate-500" : "border-white/10 text-slate-400"
                }`}
              >
                <p className="text-sm font-bold">Queue is empty</p>
                <p className="text-xs text-[#8E99AE] mt-1">
                  Add tracks from search or playlists to play next
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {upNextTracks.map((item, relIndex) => {
                  const { track, originalIndex } = item;
                  return (
                    <div
                      key={`${track.filename}_${originalIndex}`}
                      onClick={() => onSelectIndex(originalIndex)}
                      className={`p-2.5 sm:p-3 rounded-[18px] border transition-all flex items-center justify-between gap-3 group cursor-pointer ${
                        isLight
                          ? "bg-white border-[#E2E8F0] hover:border-[#2B4C8F]/30 hover:shadow-sm"
                          : "bg-[#161C2E] border-white/10 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="text-xs font-mono font-bold text-[#8E99AE] w-4 text-center shrink-0">
                          {relIndex + 1}
                        </span>
                        <div className="relative w-10 h-10 rounded-[14px] overflow-hidden bg-slate-900 shrink-0 border border-black/5 dark:border-white/10 shadow-sm">
                          {track.thumbnail_url ? (
                            <img
                              src={resolveMediaUrl(track.thumbnail_url)}
                              alt={track.clean_title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs">
                              🎵
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4
                            className={`text-xs font-bold truncate leading-tight ${
                              isLight ? "text-slate-800 group-hover:text-[#2B4C8F]" : "text-white group-hover:text-[#6C95FF]"
                            }`}
                            style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
                          >
                            {track.clean_title}
                          </h4>
                          {track.artist && (
                            <p className="text-[10px] text-[#8E99AE] truncate mt-0.5">{track.artist}</p>
                          )}
                        </div>
                      </div>

                      {/* Controls: Like, Move Up / Down, Remove */}
                      <div
                        className="flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <LikeButton size="sm" track={track} />
                        {relIndex > 0 && (
                          <button
                            type="button"
                            onClick={() => onMoveIndex(originalIndex, originalIndex - 1)}
                            className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                            title="Move up"
                          >
                            ▲
                          </button>
                        )}
                        {relIndex < upNextTracks.length - 1 && (
                          <button
                            type="button"
                            onClick={() => onMoveIndex(originalIndex, originalIndex + 1)}
                            className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                            title="Move down"
                          >
                            ▼
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onRemoveIndex(originalIndex)}
                          className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors ml-0.5"
                          title="Remove from queue"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
