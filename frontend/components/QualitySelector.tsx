"use client";

import type { FormatInfo, AudioOption, DownloadMode } from "@/lib/types";
import { formatFileSize } from "@/lib/websocket";
import { useTheme } from "../context/ThemeContext";

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
  const { config, theme } = useTheme();
  const isLight = config.isLight || theme === "soft-light";

  if (mode === "video") {
    if (formats.length === 0) {
      return (
        <p className="text-xs text-[#8E99AE]">No video formats available.</p>
      );
    }

    return (
      <div className="space-y-1.5">
        <label htmlFor={`${id}-video-select`} className="block text-xs font-bold text-[#8E99AE]">
          Video Quality
        </label>
        <select
          id={`${id}-video-select`}
          value={selectedVideoId}
          onChange={(e) => onVideoSelect(e.target.value)}
          className={`w-full rounded-2xl px-4 py-2.5 text-xs font-semibold outline-none transition-all cursor-pointer border ${
            isLight
              ? "bg-[#F3F5FA] border-[#E2E8F0] text-slate-800 focus:border-[#2B4C8F]"
              : "bg-white/5 border-white/10 text-white focus:border-[#6C95FF]"
          }`}
        >
          {formats.map((fmt) => (
            <option key={fmt.format_id} value={fmt.format_id} className="bg-slate-900 text-white">
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
      <p className="text-xs text-[#8E99AE]">No audio formats available.</p>
    );
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={`${id}-audio-select`} className="block text-xs font-bold text-[#8E99AE]">
        Audio Quality
      </label>
      <select
        id={`${id}-audio-select`}
        value={selectedAudioId}
        onChange={(e) => onAudioSelect(e.target.value)}
        className={`w-full rounded-2xl px-4 py-2.5 text-xs font-semibold outline-none transition-all cursor-pointer border ${
          isLight
            ? "bg-[#F3F5FA] border-[#E2E8F0] text-slate-800 focus:border-[#2B4C8F]"
            : "bg-white/5 border-white/10 text-white focus:border-[#6C95FF]"
        }`}
      >
        {audioOptions.map((opt) => (
          <option key={opt.format_id} value={opt.format_id} className="bg-slate-900 text-white">
            {formatAudioLabel(opt)}
          </option>
        ))}
      </select>
    </div>
  );
}
