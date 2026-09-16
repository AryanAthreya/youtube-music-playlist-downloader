"use client";

import type { SearchResultItem } from "@/lib/types";

interface SearchResultsProps {
  id: string;
  query: string;
  results: SearchResultItem[];
  onSelectVideo: (url: string) => void;
  onReset: () => void;
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
  onReset,
}: SearchResultsProps) {
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
            Found {results.length} related videos. Click any video to select format and download.
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {results.map((item) => (
            <div
              key={item.video_id}
              onClick={() => onSelectVideo(item.url)}
              className="glass-card rounded-xl overflow-hidden hover:border-indigo-500/50 hover:bg-white/[0.04] transition-all duration-200 flex flex-col justify-between group cursor-pointer active:scale-[0.98]"
            >
              {/* Thumbnail */}
              <div className="relative aspect-video bg-slate-950 overflow-hidden">
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
                {item.duration && (
                  <span className="absolute bottom-2 right-2 bg-black/85 backdrop-blur-sm text-white text-[10px] font-mono px-1.5 py-0.5 rounded border border-white/10">
                    {formatDuration(item.duration)}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                <div>
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
                  <span className="text-indigo-400 font-bold group-hover:translate-x-0.5 transition-transform">
                    Select & Download →
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
