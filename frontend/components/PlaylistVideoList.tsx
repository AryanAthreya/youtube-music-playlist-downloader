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
import { formatFileSize } from "@/lib/websocket";

interface PlaylistVideoListProps {
  id: string;
  info: PlaylistInfoResponse;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onDownload: (request: Omit<DownloadRequest, "playlist_video_ids">) => void;
  onReset: () => void;
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
}: PlaylistVideoListProps) {
  const [mode, setMode] = useState<DownloadMode>("video");
  // Placeholder quality state — in a real flow these come from a per-video info fetch
  // For playlists, the quality is applied uniformly to all selected videos
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

  // Synthetic format options for playlist quality selection
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
    <div id={id} className="space-y-4">
      {/* Back button */}
      <button
        onClick={onReset}
        className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 text-sm transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        New URL
      </button>

      <div className="rounded-2xl border border-gray-700/50 bg-gray-800/50 backdrop-blur overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-gray-700/50">
          <h2 className="text-lg font-semibold text-white">{info.title}</h2>
          {info.uploader && <p className="text-gray-400 text-sm mt-0.5">{info.uploader}</p>}
          <p className="text-gray-500 text-sm mt-1">{info.video_count} videos</p>
        </div>

        {/* Selection controls */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-gray-700/30 bg-gray-900/30">
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
              className="w-4 h-4 rounded accent-red-500"
            />
            <span className="text-sm text-gray-300 font-medium">
              {allSelected ? "Deselect All" : "Select All"}
            </span>
          </label>
          <span className="text-xs text-gray-500">
            {selectedIds.length} / {info.videos.length} selected
          </span>
        </div>

        {/* Video list */}
        <div className="divide-y divide-gray-700/30 max-h-80 overflow-y-auto">
          {info.videos.map((video) => {
            const isSelected = selectedIds.includes(video.video_id);
            return (
              <label
                key={video.video_id}
                htmlFor={`${id}-video-${video.video_id}`}
                className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors
                  ${isSelected ? "bg-red-500/5 hover:bg-red-500/10" : "hover:bg-gray-700/30"}`}
              >
                <input
                  id={`${id}-video-${video.video_id}`}
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleVideo(video.video_id)}
                  className="w-4 h-4 rounded accent-red-500 shrink-0"
                />
                {video.thumbnail && (
                  <img
                    src={video.thumbnail}
                    alt=""
                    className="w-12 h-8 object-cover rounded shrink-0 bg-gray-700"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{video.title}</p>
                </div>
                {video.duration && (
                  <span className="text-xs text-gray-500 font-mono shrink-0">
                    {formatDuration(video.duration)}
                  </span>
                )}
              </label>
            );
          })}
        </div>

        {/* Download settings */}
        <div className="p-5 border-t border-gray-700/50 space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded-xl overflow-hidden border border-gray-700 w-fit">
            {(["video", "audio"] as DownloadMode[]).map((m) => (
              <button
                key={m}
                id={`${id}-mode-${m}`}
                onClick={() => setMode(m)}
                className={`px-5 py-2 text-sm font-medium capitalize transition-colors ${
                  mode === m
                    ? "bg-gradient-to-r from-red-500 to-orange-500 text-white"
                    : "bg-transparent text-gray-400 hover:text-white"
                }`}
              >
                {m === "video" ? "🎬 Video" : "🎵 Audio"}
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

          <p className="text-xs text-gray-500">
            Quality is applied to all selected videos. Individual videos may fall back to the next available quality.
          </p>

          <button
            id={`${id}-download-btn`}
            onClick={handleDownload}
            disabled={noneSelected}
            className="w-full py-3.5 rounded-xl font-semibold text-white
              bg-gradient-to-r from-red-500 to-orange-500
              hover:from-red-400 hover:to-orange-400
              disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed
              shadow-lg shadow-red-500/20 hover:shadow-red-400/30
              transition-all duration-200 active:scale-[0.98]
              flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download {selectedIds.length} Video{selectedIds.length !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
