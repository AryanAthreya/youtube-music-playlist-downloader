"use client";

import { useState } from "react";
import type { SearchResultItem, FileInfo } from "@/lib/types";
import { LikeButton } from "./LikeButton";
import { useTheme } from "../context/ThemeContext";

interface SearchResultsProps {
  id: string;
  query: string;
  results: SearchResultItem[];
  onSelectVideo: (url: string) => void;
  onPlayPreview?: (item: SearchResultItem) => void;
  onStreamTrack?: (item: SearchResultItem) => void;
  onReset: () => void;
  onLoadMore?: (query: string) => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SearchResults({
  id,
  query,
  results,
  onSelectVideo,
  onPlayPreview,
  onStreamTrack,
  onReset,
  onLoadMore,
}: SearchResultsProps) {
  const { config, theme } = useTheme();
  const isLight = config.isLight || theme === "soft-light";
  const [visible, setVisible] = useState(15);

  return (
    <div id={id} className="space-y-4 animate-in fade-in-50 duration-200">
      {/* Header bar */}
      <div className="flex items-center justify-between pb-2 border-b border-black/5 dark:border-white/5">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[#1A1F2C] dark:text-[#EAF0FF] font-quicksand flex items-center gap-2">
            <span>Results for</span>
            <span style={{ color: config.primaryHex }}>"{query}"</span>
          </h2>
          <p className="text-xs text-[#9AA3B5]">
            Showing {Math.min(visible, results.length)} of {results.length} matches
          </p>
        </div>

        <button
          onClick={onReset}
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all active:scale-95 ${
            isLight
              ? "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 shadow-sm"
              : "bg-[#161C2E] text-slate-300 border-white/10 hover:text-white"
          }`}
        >
          ← New Search
        </button>
      </div>

      {results.length === 0 ? (
        <div className={`rounded-3xl p-8 text-center space-y-2 border ${
          isLight ? "bg-white border-slate-200 shadow-sm" : "bg-[#161C2E] border-white/10"
        }`}>
          <p className="text-sm font-semibold text-[#1A1F2C] dark:text-[#EAF0FF]">No results found for "{query}".</p>
          <p className="text-xs text-[#9AA3B5]">Try searching for other keywords or paste a direct YouTube URL.</p>
        </div>
      ) : (
        <>
          <div className="space-y-2.5">
            {results.slice(0, visible).map((item) => {
              const trackInfo: FileInfo = {
                filename: `${item.video_id}.m4a`,
                clean_title: item.title,
                artist: item.uploader,
                media_type: "audio",
                size_bytes: 0,
                created_at: new Date().toISOString(),
                modified_at: new Date().toISOString(),
                download_url: "",
                thumbnail_url: item.thumbnail,
                youtube_id: item.video_id,
                source_type: "stream",
                duration: item.duration || 0,
              };

              return (
                <div
                  key={item.video_id}
                  onClick={() => (onStreamTrack ? onStreamTrack(item) : onSelectVideo(item.url))}
                  className={`group flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer ${
                    isLight
                      ? "bg-white hover:bg-white border-[#E2E8F0] shadow-[0_4px_16px_rgba(35,55,110,0.06)] hover:shadow-[0_8px_24px_rgba(35,55,110,0.10)]"
                      : "bg-[#161C2E] hover:bg-[#1E263D] border-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.25)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Thumbnail */}
                    <div className="relative w-14 h-14 rounded-[18px] overflow-hidden bg-slate-900 shrink-0 shadow-sm border border-black/5 dark:border-white/10">
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-lg bg-slate-900 text-white">
                          🎬
                        </div>
                      )}

                      {/* Play overlay icon */}
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-7 h-7 rounded-full bg-white text-[#2B4C8F] flex items-center justify-center shadow">
                          <svg className="w-3.5 h-3.5 ml-0.5 fill-current" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>

                      {item.duration && (
                        <span className="absolute bottom-1 right-1 bg-black/80 backdrop-blur-xs text-white text-[9px] font-mono px-1 rounded">
                          {formatDuration(item.duration)}
                        </span>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="min-w-0 flex-1">
                      <h4
                        className="text-sm font-bold text-[#1A1F2C] dark:text-[#EAF0FF] line-clamp-1 group-hover:text-[#2B4C8F] dark:group-hover:text-[#6C95FF] transition-colors font-quicksand"
                        title={item.title}
                      >
                        {item.title}
                      </h4>
                      <p className="text-xs text-[#9AA3B5] truncate mt-0.5 font-medium">
                        {item.uploader} {item.view_count ? `• ${item.view_count.toLocaleString()} views` : ""}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 pl-2" onClick={(e) => e.stopPropagation()}>
                    <LikeButton size="sm" track={trackInfo} />

                    {onStreamTrack && (
                      <button
                        type="button"
                        onClick={() => onStreamTrack(item)}
                        className="w-8 h-8 rounded-full text-white flex items-center justify-center shadow-sm active:scale-90 transition-all"
                        style={{ backgroundColor: config.primaryHex }}
                        title="Stream Track Online"
                      >
                        <svg className="w-3.5 h-3.5 ml-0.5 fill-current" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </button>
                    )}

                    {onPlayPreview && (
                      <button
                        type="button"
                        onClick={() => onPlayPreview(item)}
                        className={`p-2 rounded-full transition-colors ${
                          isLight ? "text-slate-500 hover:bg-slate-100 hover:text-slate-800" : "text-gray-400 hover:bg-white/10 hover:text-white"
                        }`}
                        title="Preview on YouTube"
                      >
                        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                          <path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z" />
                        </svg>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onSelectVideo(item.url)}
                      className={`p-2 rounded-full transition-colors ${
                        isLight ? "text-slate-500 hover:bg-slate-100 hover:text-slate-800" : "text-gray-400 hover:bg-white/10 hover:text-white"
                      }`}
                      title="Download Options"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Load More Button */}
          {visible < results.length && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setVisible((v) => v + 15)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full border text-xs font-semibold transition-all active:scale-95 ${
                  isLight
                    ? "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-sm"
                    : "bg-[#161C2E] text-slate-200 border-white/10 hover:bg-[#1E263D]"
                }`}
              >
                <span>Load next {Math.min(15, results.length - visible)} results</span>
                <span>↓</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
