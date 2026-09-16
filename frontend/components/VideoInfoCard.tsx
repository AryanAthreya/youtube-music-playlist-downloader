"use client";

import { useState } from "react";
import { QualitySelector } from "./QualitySelector";
import type { VideoInfoResponse, DownloadRequest, DownloadMode } from "@/lib/types";
import { formatFileSize } from "@/lib/websocket";

interface VideoInfoCardProps {
  id: string;
  info: VideoInfoResponse;
  onDownload: (request: Omit<DownloadRequest, "playlist_video_ids">) => void;
  onReset: () => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoInfoCard({ id, info, onDownload, onReset }: VideoInfoCardProps) {
  const [mode, setMode] = useState<DownloadMode>("video");
  const [selectedQualityId, setSelectedQualityId] = useState<string>(
    info.formats[0]?.format_id ?? ""
  );
  const [selectedAudioId, setSelectedAudioId] = useState<string>(
    info.audio_options[0]?.format_id ?? ""
  );

  const handleDownload = () => {
    const qualityId = mode === "video" ? selectedQualityId : selectedAudioId;
    if (!qualityId) return;
    onDownload({ url: `https://www.youtube.com/watch?v=${info.video_id}`, mode, quality_id: qualityId });
  };

  const selectedFormat = mode === "video"
    ? info.formats.find(f => f.format_id === selectedQualityId)
    : info.audio_options.find(a => a.format_id === selectedAudioId);

  const estimatedSize = selectedFormat?.filesize ?? selectedFormat?.filesize_approx;

  return (
    <div id={id} className="space-y-3">
      {/* Back button */}
      <button
        onClick={onReset}
        className="inline-flex items-center gap-1.5 text-gray-400 hover:text-white text-xs sm:text-sm font-medium transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span>Change URL / Back</span>
      </button>

      {/* Video card */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
        <div className="flex flex-col md:flex-row">
          {/* Thumbnail column */}
          {info.thumbnail && (
            <div className="md:w-5/12 relative aspect-video md:aspect-auto bg-slate-950 overflow-hidden shrink-0">
              <img
                src={info.thumbnail}
                alt={info.title}
                className="w-full h-full object-cover"
              />
              {/* Duration badge */}
              {info.duration && (
                <div className="absolute bottom-2.5 right-2.5 bg-black/85 backdrop-blur-sm text-white text-[11px] font-mono px-2 py-0.5 rounded-md border border-white/10">
                  {formatDuration(info.duration)}
                </div>
              )}
            </div>
          )}

          {/* Info column */}
          <div className="p-4 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white leading-snug line-clamp-2">
                {info.title}
              </h2>
              {info.uploader && (
                <p className="text-gray-400 text-xs sm:text-sm mt-1 font-medium">{info.uploader}</p>
              )}

              {/* Stats row */}
              <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-gray-400 mt-2">
                {info.view_count && (
                  <span className="bg-white/5 px-2 py-0.5 rounded border border-white/5">
                    {info.view_count.toLocaleString()} views
                  </span>
                )}
                {info.upload_date && (
                  <span className="bg-white/5 px-2 py-0.5 rounded border border-white/5">
                    {info.upload_date.slice(0, 4)}-{info.upload_date.slice(4, 6)}-{info.upload_date.slice(6, 8)}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-white/[0.06]">
              {/* Mode toggle */}
              <div className="flex rounded-xl p-1 bg-slate-900/80 border border-white/10 w-full sm:w-fit">
                {(["video", "audio"] as DownloadMode[]).map((m) => (
                  <button
                    key={m}
                    id={`${id}-mode-${m}`}
                    onClick={() => setMode(m)}
                    className={`flex-1 sm:flex-initial px-5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                      mode === m
                        ? "bg-gradient-to-r from-red-600 to-indigo-600 text-white shadow-sm"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    {m === "video" ? "🎬 Video (MP4)" : "🎵 Audio (MP3)"}
                  </button>
                ))}
              </div>

              {/* Quality selector */}
              <QualitySelector
                id={`${id}-quality`}
                mode={mode}
                formats={info.formats}
                audioOptions={info.audio_options}
                selectedVideoId={selectedQualityId}
                selectedAudioId={selectedAudioId}
                onVideoSelect={setSelectedQualityId}
                onAudioSelect={setSelectedAudioId}
              />

              {/* Estimated size */}
              {estimatedSize && (
                <p className="text-xs text-gray-400 font-mono">
                  Estimated size: <span className="text-gray-200 font-medium">{formatFileSize(estimatedSize)}</span>
                </p>
              )}

              {/* Download button */}
              <button
                id={`${id}-download-btn`}
                onClick={handleDownload}
                disabled={!selectedQualityId && !selectedAudioId}
                className="w-full py-3 sm:py-3.5 rounded-xl font-bold text-sm sm:text-base text-white
                  bg-gradient-to-r from-red-600 via-rose-600 to-indigo-600
                  hover:from-red-500 hover:to-indigo-500
                  disabled:from-slate-800 disabled:to-slate-800 disabled:text-gray-500 disabled:cursor-not-allowed
                  shadow-lg shadow-red-600/20 hover:shadow-indigo-500/25
                  transition-all duration-200 active:scale-[0.98]
                  flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download {mode === "video" ? "Video (MP4)" : "Audio (MP3)"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
