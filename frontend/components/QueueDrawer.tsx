"use client";

import React from "react";
import type { FileInfo } from "@/lib/types";
import { resolveMediaUrl } from "@/lib/api";
import { useTheme } from "@/context/ThemeContext";

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
  const { config } = useTheme();

  if (!isOpen) return null;

  const upNextTracks = queueTracks
    .map((track, idx) => ({ track, originalIndex: idx }))
    .filter((item) => item.originalIndex > currentIndex);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      {/* Backdrop tap to close */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer Panel */}
      <div
        className="w-full max-w-md h-full bg-zinc-950/95 border-l border-white/10 shadow-2xl flex flex-col p-4 sm:p-6 overflow-hidden animate-in slide-in-from-right duration-300"
        style={{
          boxShadow: `-10px 0 40px -10px ${config.glow}`,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-sm"
              style={{ backgroundColor: `${config.primaryHex}25`, color: config.primaryHex }}
            >
              📜
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Queue</h3>
              <p className="text-xs text-zinc-400">
                {queueTracks.length} {queueTracks.length === 1 ? "track" : "tracks"} total
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {upNextTracks.length > 0 && (
              <button
                type="button"
                onClick={onClearQueue}
                className="px-2.5 py-1 text-xs rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Clear upcoming tracks"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Close Queue"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto space-y-5 py-4 pr-1">
          {/* NOW PLAYING SECTION */}
          {currentTrack && (
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2 block">
                Now Playing
              </span>
              <div
                className="p-3 rounded-2xl border flex items-center justify-between gap-3 shadow-lg"
                style={{
                  borderColor: `${config.primaryHex}50`,
                  backgroundColor: `${config.primaryHex}15`,
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-zinc-900 shrink-0 border border-white/10">
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
                    <h4 className="text-sm font-semibold text-white truncate">
                      {currentTrack.clean_title}
                    </h4>
                    <p className="text-xs text-zinc-400 truncate">
                      {currentTrack.artist || "YouTube Music"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {isPlaying ? (
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                      style={{ backgroundColor: `${config.primaryHex}30`, color: config.primaryHex }}
                    >
                      Playing
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-zinc-400 bg-white/5">
                      Paused
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* UP NEXT SECTION */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Up Next ({upNextTracks.length})
              </span>
            </div>

            {upNextTracks.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-white/10 rounded-2xl p-4">
                <p className="text-sm text-zinc-400">Queue is empty</p>
                <p className="text-xs text-zinc-500 mt-1">
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
                      className="p-2.5 rounded-xl border border-white/5 hover:border-white/20 bg-zinc-900/60 hover:bg-zinc-900 transition-all flex items-center justify-between gap-3 group cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="text-xs font-mono text-zinc-500 w-4 text-center shrink-0">
                          {relIndex + 1}
                        </span>
                        <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-zinc-950 shrink-0 border border-white/10">
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
                          <h4 className="text-xs font-medium text-white truncate group-hover:text-zinc-200">
                            {track.clean_title}
                          </h4>
                          {track.artist && (
                            <p className="text-[10px] text-zinc-400 truncate">{track.artist}</p>
                          )}
                        </div>
                      </div>

                      {/* Controls: Move Up / Down, Remove */}
                      <div
                        className="flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {relIndex > 0 && (
                          <button
                            type="button"
                            onClick={() => onMoveIndex(originalIndex, originalIndex - 1)}
                            className="w-6 h-6 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10"
                            title="Move up"
                          >
                            ▲
                          </button>
                        )}
                        {relIndex < upNextTracks.length - 1 && (
                          <button
                            type="button"
                            onClick={() => onMoveIndex(originalIndex, originalIndex + 1)}
                            className="w-6 h-6 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10"
                            title="Move down"
                          >
                            ▼
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onRemoveIndex(originalIndex)}
                          className="w-6 h-6 rounded flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 ml-1"
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
