"use client";

import { useState } from "react";
import type { SearchResultItem } from "@/lib/types";

interface SearchResultsProps {
  id: string;
  query: string;
  results: SearchResultItem[];
  onSelectVideo: (url: string) => void;
  onPlayPreview?: (item: SearchResultItem) => void;
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
  onReset,
  onLoadMore,
}: SearchResultsProps) {
  const [visible, setVisible] = useState(15);

  return (
    <div id={id} className="space-y-4 animate-in fade-in-50 duration-200">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-white/[0.08]">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <span>Search Results for</span>
            <span className="text-indigo-400 font-mono">"{query}"</span>
          </h2>
          <p className="text-xs text-gray-400">
            Showing {Math.min(visible, results.length)} of {results.length} results. Click to select format and download.
          </p>
        </div>

        <button
          onClick={onReset}
          className="self-start sm:self-auto text-xs font-medium text-gray-400 hover:text-white glass-card px-3 py-1.5 rounded-lg hover:border-white/20 transition-all"
        >
          ← New Search
        </button>
      </div>

      {results.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center space-y-2">
          <p className="text-sm text-gray-300 font-medium">No results found for "{query}".</p>
          <p className="text-xs text-gray-500">Try searching for other keywords or paste a direct YouTube URL.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {results.slice(0, visible).map((item) => (
              <div
                key={item.video_id}
                className="glass-card rounded-xl overflow-hidden hover:border-indigo-500/50 hover:bg-white/[0.04] transition-all duration-200 flex flex-col justify-between group"
              >
                {/* Thumbnail */}
                <div
                  className="relative aspect-video bg-slate-950 overflow-hidden cursor-pointer"
                  onClick={() => onSelectVideo(item.url)}
                >
                  {item.thumbnail ? (
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600">
                      🎬
                    </div>
                  )}

                  {/* Instant Play / Preview Button on Thumbnail */}
                  {onPlayPreview && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlayPreview(item);
                      }}
                      className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-black/60 hover:bg-red-600 active:scale-90 text-white flex items-center justify-center backdrop-blur-md border border-white/20 opacity-0 group-hover:opacity-100 transition-all shadow-xl"
                      title="Play / Preview in Player"
                    >
                      <svg className="w-5 h-5 ml-0.5 fill-current" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  )}

                  {item.duration && (
                    <span className="absolute bottom-2 right-2 bg-black/85 backdrop-blur-sm text-white text-[10px] font-mono px-1.5 py-0.5 rounded border border-white/10">
                      {formatDuration(item.duration)}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                  <div onClick={() => onSelectVideo(item.url)} className="cursor-pointer">
                    <h3
                      className="text-xs sm:text-sm font-semibold text-white line-clamp-2 leading-snug group-hover:text-indigo-300 transition-colors"
                      title={item.title}
                    >
                      {item.title}
                    </h3>
                    <p className="text-[11px] text-gray-400 mt-1 truncate font-medium">
                      {item.uploader}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-[10px] text-gray-400">
                    <span>{item.view_count ? `${item.view_count.toLocaleString()} views` : "YouTube"}</span>
                    
                    <div className="flex items-center gap-1.5">
                      {onPlayPreview && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onPlayPreview(item);
                          }}
                          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                          title="Stream / Preview"
                        >
                          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectVideo(item.url);
                        }}
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-indigo-600 text-white transition-colors"
                        title="Download this track"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Load More Button */}
          {visible < results.length && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => setVisible((v) => v + 15)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl glass-card border border-white/10 hover:border-white/20 text-sm font-semibold text-white hover:bg-white/5 active:scale-95 transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Load next {Math.min(15, results.length - visible)} results
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
