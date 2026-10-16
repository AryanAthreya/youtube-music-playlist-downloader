"use client";

import { useState } from "react";
import { QualitySelector } from "./QualitySelector";
import type { VideoInfoResponse, DownloadRequest, DownloadMode } from "@/lib/types";
import { formatFileSize } from "@/lib/websocket";
import { useTheme } from "../context/ThemeContext";

interface VideoInfoCardProps {
  id: string;
  info: VideoInfoResponse;
  onDownload: (request: Omit<DownloadRequest, "playlist_video_ids">) => void;
  onReset: () => void;
  onPlayTrack?: (info: VideoInfoResponse) => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoInfoCard({ id, info, onDownload, onReset, onPlayTrack }: VideoInfoCardProps) {
  const { config, theme } = useTheme();
  const isLight = config.isLight || theme === "soft-light";

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
    <div id={id} className="space-y-4 animate-in fade-in duration-300">
      {/* Back button */}
      <button
        onClick={onReset}
        className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all active:scale-95 ${
          isLight
            ? "bg-white border-[#E2E8F0] text-slate-600 hover:text-slate-900 shadow-sm"
            : "bg-white/5 border-white/10 text-slate-300 hover:text-white"
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span>Change URL / Search</span>
      </button>

      {/* Video card */}
      <div
        className={`rounded-[28px] overflow-hidden border p-5 sm:p-6 transition-all ${
          isLight
            ? "bg-white border-[#E2E8F0] shadow-[0_12px_32px_rgba(35,55,110,0.08)]"
            : "bg-[#161C2E] border-white/10 shadow-[0_16px_36px_rgba(0,0,0,0.4)]"
        }`}
      >
        <div className="flex flex-col md:flex-row gap-5 sm:gap-6">
          {/* Thumbnail column with squircle container */}
          {info.thumbnail && (
            <div className="md:w-5/12 relative aspect-video md:aspect-[4/3] rounded-[22px] overflow-hidden bg-slate-950 shrink-0 shadow-md">
              <img
                src={info.thumbnail}
                alt={info.title}
                className="w-full h-full object-cover"
              />
              {/* Duration badge */}
              {info.duration && (
                <div className="absolute bottom-2.5 right-2.5 bg-black/80 backdrop-blur-md text-white text-[11px] font-mono px-2 py-0.5 rounded-full border border-white/10 shadow-sm">
                  {formatDuration(info.duration)}
                </div>
              )}
            </div>
          )}

          {/* Info column */}
          <div className="flex-1 flex flex-col justify-between space-y-4">
            <div>
              <h2
                className={`text-base sm:text-lg font-black leading-snug line-clamp-2 ${
                  isLight ? "text-[#1A1F2C]" : "text-white"
                }`}
                style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
              >
                {info.title}
              </h2>
              {info.uploader && (
                <p className="text-[#8E99AE] text-xs sm:text-sm mt-1 font-semibold">{info.uploader}</p>
              )}

              {/* Stats row */}
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#8E99AE] mt-2.5">
                {info.view_count && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full border font-mono ${
                      isLight ? "bg-[#F3F5FA] border-[#E2E8F0]" : "bg-white/5 border-white/5"
                    }`}
                  >
                    {info.view_count.toLocaleString()} views
                  </span>
                )}
                {info.upload_date && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full border font-mono ${
                      isLight ? "bg-[#F3F5FA] border-[#E2E8F0]" : "bg-white/5 border-white/5"
                    }`}
                  >
                    {info.upload_date.slice(0, 4)}-{info.upload_date.slice(4, 6)}-{info.upload_date.slice(6, 8)}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-3.5 pt-3 border-t border-black/5 dark:border-white/10">
              {/* Mode toggle */}
              <div
                className={`flex rounded-full p-1 border w-full sm:w-fit ${
                  isLight ? "bg-[#F3F5FA] border-[#E2E8F0]" : "bg-black/20 border-white/10"
                }`}
              >
                {(["video", "audio"] as DownloadMode[]).map((m) => (
                  <button
                    key={m}
                    id={`${id}-mode-${m}`}
                    onClick={() => setMode(m)}
                    className={`flex-1 sm:flex-initial px-5 py-1.5 text-xs font-bold rounded-full transition-all ${
                      mode === m
                        ? "text-white shadow-sm"
                        : "text-[#8E99AE] hover:text-[#1A1F2C] dark:hover:text-[#EAF0FF]"
                    }`}
                    style={mode === m ? { backgroundColor: config.primaryHex } : undefined}
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
                <p className="text-xs text-[#8E99AE] font-mono">
                  Estimated size: <span className={`font-bold ${isLight ? "text-slate-800" : "text-slate-200"}`}>{formatFileSize(estimatedSize)}</span>
                </p>
              )}

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                {onPlayTrack && (
                  <button
                    type="button"
                    onClick={() => onPlayTrack(info)}
                    className={`flex-1 py-3 rounded-full font-bold text-xs sm:text-sm border transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 ${
                      isLight
                        ? "bg-[#F3F5FA] hover:bg-[#E6ECF8] border-[#E2E8F0] text-[#2B4C8F]"
                        : "bg-white/10 hover:bg-white/15 border-white/15 text-white"
                    }`}
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span>Stream Audio</span>
                  </button>
                )}
                <button
                  id={`${id}-download-btn`}
                  onClick={handleDownload}
                  disabled={!selectedQualityId && !selectedAudioId}
                  className={`${onPlayTrack ? "flex-[1.5]" : "w-full"} py-3 rounded-full font-bold text-xs sm:text-sm text-white shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2`}
                  style={{ backgroundColor: config.primaryHex }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Download {mode === "video" ? "Video (MP4)" : "Audio (MP3)"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
