"use client";
import type { FileInfo } from "@/lib/types";
import { resolveMediaUrl } from "@/lib/api";
import { useTheme } from "@/context/ThemeContext";

interface MiniPlayerBarProps {
  currentFile: FileInfo | null;
  isPlaying: boolean;
  onTogglePlayPause: () => void;
  onOpenPlayer: () => void;
}

export function MiniPlayerBar({
  currentFile,
  isPlaying,
  onTogglePlayPause,
  onOpenPlayer,
}: MiniPlayerBarProps) {
  const { config } = useTheme();
  if (!currentFile) return null;

  return (
    <div
      onClick={onOpenPlayer}
      className="fixed bottom-16 left-3 right-3 z-40 md:bottom-6 md:right-6 md:left-auto md:w-80 bg-zinc-950/95 backdrop-blur-2xl border rounded-2xl p-2.5 shadow-2xl flex items-center justify-between gap-3 cursor-pointer transition-all group animate-in slide-in-from-bottom-3 duration-300"
      style={{
        borderColor: `${config.primaryHex}35`,
        boxShadow: `0 10px 30px -5px ${config.glow}, 0 20px 25px -5px rgba(0, 0, 0, 0.8)`,
      }}
      title="Tap to open full player"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Thumbnail */}
        <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-zinc-900 shrink-0 border border-white/10 shadow">
          {currentFile.thumbnail_url ? (
            <img
              src={resolveMediaUrl(currentFile.thumbnail_url)}
              alt={currentFile.clean_title}
              className={`w-full h-full object-cover transition-transform ${
                isPlaying ? "scale-105" : "scale-100 opacity-80"
              }`}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm bg-zinc-900">
              {currentFile.media_type === "video" ? "🎬" : "🎵"}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: config.primaryHex }}
            />
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: config.primaryHex }}
            >
              Now Playing
            </span>
          </div>
          <h4 className="text-xs font-semibold text-white truncate group-hover:text-zinc-200 transition-colors">
            {currentFile.clean_title}
          </h4>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        {/* Play/Pause Button */}
        <button
          onClick={onTogglePlayPause}
          className="w-9 h-9 rounded-full text-white flex items-center justify-center shadow-lg active:scale-90 transition-all"
          style={{
            background: `linear-gradient(to right, ${config.primaryHex}, ${config.secondaryHex})`,
            boxShadow: `0 4px 14px 0 ${config.glow}`,
          }}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 ml-0.5 fill-current" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Expand into full player */}
        <button
          onClick={onOpenPlayer}
          className="w-8 h-8 rounded-full hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
          title="Open Player"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
