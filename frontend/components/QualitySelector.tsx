"use client";

import type { FormatInfo, AudioOption, DownloadMode } from "@/lib/types";
import { formatFileSize } from "@/lib/websocket";

interface QualitySelectorProps {
  id: string;
  mode: DownloadMode;
  formats: FormatInfo[];
  audioOptions: AudioOption[];
  selectedVideoId: string;
  selectedAudioId: string;
  onVideoSelect: (id: string) => void;
  onAudioSelect: (id: string) => void;
}

function formatVideoLabel(fmt: FormatInfo): string {
  const parts: string[] = [];
  if (fmt.height) parts.push(`${fmt.height}p`);
  if (fmt.fps && fmt.fps > 30) parts.push(`${Math.round(fmt.fps)}fps`);
  if (fmt.vcodec && fmt.vcodec !== "none") {
    const codec = fmt.vcodec.split(".")[0];
    parts.push(codec);
  }
  parts.push(fmt.ext.toUpperCase());
  const size = fmt.filesize ?? fmt.filesize_approx;
  if (size) parts.push(`~${formatFileSize(size)}`);
  return parts.join(" · ");
}

function formatAudioLabel(opt: AudioOption): string {
  const parts: string[] = [];
  if (opt.acodec && opt.acodec !== "none") {
    parts.push(opt.acodec.split(".")[0].toUpperCase());
  }
  if (opt.abr) parts.push(`${Math.round(opt.abr)}kbps`);
  parts.push(opt.ext.toUpperCase());
  const size = opt.filesize ?? opt.filesize_approx;
  if (size) parts.push(`~${formatFileSize(size)}`);
  return parts.join(" · ");
}

export function QualitySelector({
  id,
  mode,
  formats,
  audioOptions,
  selectedVideoId,
  selectedAudioId,
  onVideoSelect,
  onAudioSelect,
}: QualitySelectorProps) {
  if (mode === "video") {
    if (formats.length === 0) {
      return (
        <p className="text-sm text-gray-500">No video formats available.</p>
      );
    }

    return (
      <div className="space-y-2">
        <label htmlFor={`${id}-video-select`} className="block text-sm font-medium text-gray-300">
          Quality
        </label>
        <select
          id={`${id}-video-select`}
          value={selectedVideoId}
          onChange={(e) => onVideoSelect(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm
            focus:outline-none focus:border-red-500/60 focus:ring-2 focus:ring-red-500/10
            transition-colors cursor-pointer"
        >
          {formats.map((fmt) => (
            <option key={fmt.format_id} value={fmt.format_id}>
              {formatVideoLabel(fmt)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Audio mode
  if (audioOptions.length === 0) {
    return (
      <p className="text-sm text-gray-500">No audio formats available.</p>
    );
  }

  return (
    <div className="space-y-2">
      <label htmlFor={`${id}-audio-select`} className="block text-sm font-medium text-gray-300">
        Audio Format
      </label>
      <select
        id={`${id}-audio-select`}
        value={selectedAudioId}
        onChange={(e) => onAudioSelect(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 text-white rounded-xl px-4 py-3 text-sm
          focus:outline-none focus:border-orange-500/60 focus:ring-2 focus:ring-orange-500/10
          transition-colors cursor-pointer"
      >
        {audioOptions.map((opt) => (
          <option key={opt.format_id} value={opt.format_id}>
            {formatAudioLabel(opt)}
          </option>
        ))}
      </select>
      <p className="text-xs text-gray-500">
        Audio will be extracted/converted via FFmpeg.
      </p>
    </div>
  );
}
