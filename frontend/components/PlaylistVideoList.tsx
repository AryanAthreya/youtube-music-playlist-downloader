"use client";

import { useState } from "react";
import { QualitySelector } from "./QualitySelector";
import type {
  PlaylistInfoResponse,
  DownloadRequest,
  DownloadMode,
  FormatInfo,
  AudioOption,
} from "@/lib/types";
import { useTheme } from "../context/ThemeContext";

interface PlaylistVideoListProps {
  id: string;
  info: PlaylistInfoResponse;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onDownload: (request: Omit<DownloadRequest, "playlist_video_ids">) => void;
  onReset: () => void;
  onPlayPlaylist?: (videos: PlaylistInfoResponse["videos"], startIndex?: number) => void;
  onPlayTrack?: (video: PlaylistInfoResponse["videos"][0]) => void;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlaylistVideoList({
  id,
  info,
  selectedIds,
  onSelectionChange,
  onDownload,
  onReset,
  onPlayPlaylist,
  onPlayTrack,
}: PlaylistVideoListProps) {
  const { config, theme } = useTheme();
  const isLight = config.isLight || theme === "soft-light";

  const [mode, setMode] = useState<DownloadMode>("video");
  const [qualityId, setQualityId] = useState<string>("1080");
  const [audioQualityId, setAudioQualityId] = useState<string>("bestaudio");

  const allSelected = selectedIds.length === info.videos.length;
  const noneSelected = selectedIds.length === 0;

  const toggleAll = () => {
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(info.videos.map((v) => v.video_id));
    }
  };

  const toggleVideo = (videoId: string) => {
    if (selectedIds.includes(videoId)) {
      onSelectionChange(selectedIds.filter((id) => id !== videoId));
    } else {
      onSelectionChange([...selectedIds, videoId]);
    }
  };

  const handleDownload = () => {
    if (noneSelected) return;
    const q = mode === "video" ? qualityId : audioQualityId;
    onDownload({ url: `https://www.youtube.com/playlist?list=${info.playlist_id}`, mode, quality_id: q });
  };

  const playlistVideoFormats: FormatInfo[] = [
    { format_id: "2160", ext: "mp4", resolution: "3840x2160", height: 2160, width: 3840, fps: null, vcodec: "avc1", acodec: null, tbr: null, filesize: null, filesize_approx: null, note: "4K" },
    { format_id: "1440", ext: "mp4", resolution: "2560x1440", height: 1440, width: 2560, fps: null, vcodec: "avc1", acodec: null, tbr: null, filesize: null, filesize_approx: null, note: "1440p" },
    { format_id: "1080", ext: "mp4", resolution: "1920x1080", height: 1080, width: 1920, fps: null, vcodec: "avc1", acodec: null, tbr: null, filesize: null, filesize_approx: null, note: "1080p (Recommended)" },
    { format_id: "720",  ext: "mp4", resolution: "1280x720",  height: 720,  width: 1280, fps: null, vcodec: "avc1", acodec: null, tbr: null, filesize: null, filesize_approx: null, note: "720p" },
    { format_id: "480",  ext: "mp4", resolution: "854x480",   height: 480,  width: 854,  fps: null, vcodec: "avc1", acodec: null, tbr: null, filesize: null, filesize_approx: null, note: "480p" },
    { format_id: "360",  ext: "mp4", resolution: "640x360",   height: 360,  width: 640,  fps: null, vcodec: "avc1", acodec: null, tbr: null, filesize: null, filesize_approx: null, note: "360p" },
  ];

  const playlistAudioFormats: AudioOption[] = [
    { format_id: "bestaudio-mp3", ext: "mp3", acodec: "mp3", abr: 320, filesize: null, filesize_approx: null, note: "MP3 320kbps" },
    { format_id: "bestaudio-m4a", ext: "m4a", acodec: "mp4a", abr: 256, filesize: null, filesize_approx: null, note: "M4A 256kbps" },
    { format_id: "bestaudio-opus", ext: "opus", acodec: "opus", abr: 160, filesize: null, filesize_approx: null, note: "Opus 160kbps" },
  ];

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

      <div
        className={`rounded-[28px] overflow-hidden border transition-all ${
          isLight
            ? "bg-white border-[#E2E8F0] shadow-[0_12px_32px_rgba(35,55,110,0.08)]"
            : "bg-[#161C2E] border-white/10 shadow-[0_16px_36px_rgba(0,0,0,0.4)]"
        }`}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-black/5 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2
              className={`text-lg sm:text-xl font-black ${isLight ? "text-[#1A1F2C]" : "text-white"}`}
              style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
            >
              {info.title}
            </h2>
            {info.uploader && <p className="text-[#8E99AE] text-xs font-semibold mt-0.5">{info.uploader}</p>}
            <p className="text-xs text-[#8E99AE] mt-1">{info.video_count} videos in playlist</p>
          </div>
          {onPlayPlaylist && (
            <button
              onClick={() => onPlayPlaylist(info.videos, 0)}
              className="px-4 py-2.5 rounded-full text-white font-bold text-xs flex items-center gap-2 shadow-md active:scale-95 transition-all self-start sm:self-auto"
              style={{ backgroundColor: config.primaryHex }}
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>Stream Entire Playlist</span>
            </button>
          )}
        </div>

        {/* Selection controls */}
        <div
          className={`px-5 sm:px-6 py-3 flex items-center justify-between border-b ${
            isLight
              ? "bg-[#F3F5FA] border-[#E2E8F0]"
              : "bg-black/20 border-white/10"
          }`}
        >
          <label
            htmlFor={`${id}-select-all`}
            className="flex items-center gap-2.5 cursor-pointer select-none"
          >
            <input
              id={`${id}-select-all`}
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = !allSelected && !noneSelected;
              }}
              onChange={toggleAll}
              className="w-4 h-4 rounded accent-[#2B4C8F]"
            />
            <span className={`text-xs font-bold ${isLight ? "text-slate-700" : "text-slate-300"}`}>
              {allSelected ? "Deselect All" : "Select All"}
            </span>
          </label>
          <span className="text-xs font-mono text-[#8E99AE]">
            {selectedIds.length} / {info.videos.length} selected
          </span>
        </div>

        {/* Video list */}
        <div className="divide-y divide-black/5 dark:divide-white/10 max-h-80 overflow-y-auto scrollbar-none">
          {info.videos.map((video) => {
            const isSelected = selectedIds.includes(video.video_id);
            return (
              <label
                key={video.video_id}
                htmlFor={`${id}-video-${video.video_id}`}
                className={`flex items-center gap-3 px-5 sm:px-6 py-3 cursor-pointer transition-colors ${
                  isSelected
                    ? isLight
                      ? "bg-[#E6ECF8]/50"
                      : "bg-white/10"
                    : isLight
                    ? "hover:bg-slate-50"
                    : "hover:bg-white/5"
                }`}
              >
                <input
                  id={`${id}-video-${video.video_id}`}
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleVideo(video.video_id)}
                  className="w-4 h-4 rounded accent-[#2B4C8F] shrink-0"
                />
                {video.thumbnail && (
                  <img
                    src={video.thumbnail}
                    alt=""
                    className="w-12 h-9 object-cover rounded-[10px] shrink-0 bg-slate-900 shadow-sm"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-xs sm:text-sm font-bold truncate ${isLight ? "text-slate-800" : "text-white"}`}>
                    {video.title}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {onPlayTrack && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onPlayTrack(video);
                      }}
                      className="p-1.5 rounded-full bg-black/5 dark:bg-white/10 hover:scale-105 text-[#2B4C8F] dark:text-[#6C95FF] transition-all"
                      title="Stream this track"
                    >
                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  )}
                  {video.duration && (
                    <span className="text-[11px] text-[#8E99AE] font-mono">
                      {formatDuration(video.duration)}
                    </span>
                  )}
                </div>
              </label>
            );
          })}
        </div>

        {/* Download settings */}
        <div className="p-5 sm:p-6 border-t border-black/5 dark:border-white/10 space-y-4">
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
                className={`px-5 py-1.5 text-xs font-bold rounded-full transition-all ${
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

          <QualitySelector
            id={`${id}-quality`}
            mode={mode}
            formats={playlistVideoFormats}
            audioOptions={playlistAudioFormats}
            selectedVideoId={qualityId}
            selectedAudioId={audioQualityId}
            onVideoSelect={setQualityId}
            onAudioSelect={setAudioQualityId}
          />

          <p className="text-xs text-[#8E99AE]">
            Quality is applied uniformly across selected tracks. Tracks lacking higher formats automatically select best available.
          </p>

          <button
            id={`${id}-download-btn`}
            onClick={handleDownload}
            disabled={noneSelected}
            className="w-full py-3.5 rounded-full font-bold text-xs sm:text-sm text-white shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
            style={{ backgroundColor: config.primaryHex }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download {selectedIds.length} Track{selectedIds.length !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
