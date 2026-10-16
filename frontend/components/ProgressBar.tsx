"use client";

import { useRef } from "react";
import type { WebSocketFrame } from "@/lib/types";
import { formatSpeed, formatEta, formatFileSize } from "@/lib/websocket";
import { useTheme } from "../context/ThemeContext";

interface ProgressBarProps {
  id: string;
  jobId: string;
  frame: WebSocketFrame | null;
  onCancel: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  queued: "Queued…",
  downloading: "Downloading…",
  merging: "Merging streams…",
  completed: "Complete",
  partial: "Partially complete",
  failed: "Failed",
  cancelled: "Cancelled",
};

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    queued: "bg-gray-400",
    downloading: "bg-blue-500 animate-pulse",
    merging: "bg-amber-400 animate-pulse",
    completed: "bg-emerald-500",
    partial: "bg-amber-400",
    failed: "bg-red-500",
    cancelled: "bg-gray-500",
  };
  return (
    <div className={`w-2.5 h-2.5 rounded-full ${colors[status] ?? "bg-gray-400"}`} />
  );
}

export function ProgressBar({ id, jobId, frame, onCancel }: ProgressBarProps) {
  const { config, theme } = useTheme();
  const isLight = config.isLight || theme === "soft-light";

  const status = frame?.status ?? "queued";
  const percent = frame?.percent ?? 0;

  // Track playlist count history so counter never blinks or resets to 0
  const lastTotalRef = useRef<number>(0);
  const lastCompletedRef = useRef<number>(0);

  if (frame?.total_count && frame.total_count > lastTotalRef.current) {
    lastTotalRef.current = frame.total_count;
  }
  if (frame?.completed_count !== undefined && frame.completed_count >= lastCompletedRef.current) {
    lastCompletedRef.current = frame.completed_count;
  }

  const totalCount = frame?.total_count || lastTotalRef.current;
  const completedCount = frame?.completed_count !== undefined ? frame.completed_count : lastCompletedRef.current;
  const isPlaylist = totalCount > 0;

  return (
    <div
      id={id}
      className={`rounded-[28px] border p-6 space-y-5 transition-all ${
        isLight
          ? "bg-white border-[#E2E8F0] shadow-[0_12px_32px_rgba(35,55,110,0.08)]"
          : "bg-[#161C2E] border-white/10 shadow-[0_16px_36px_rgba(0,0,0,0.4)]"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <StatusDot status={status} />
          <span
            className={`text-sm font-bold ${isLight ? "text-slate-800" : "text-white"}`}
            style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
          >
            {STATUS_LABELS[status] ?? status}
          </span>
        </div>
        <button
          id={`${id}-cancel`}
          onClick={onCancel}
          className={`text-xs font-bold px-3.5 py-1.5 rounded-full border transition-all active:scale-95 ${
            isLight
              ? "bg-[#F3F5FA] border-[#E2E8F0] text-slate-500 hover:text-red-500 hover:border-red-200"
              : "bg-white/5 border-white/10 text-slate-400 hover:text-red-400 hover:border-red-500/30"
          }`}
        >
          Cancel
        </button>
      </div>

      {/* Playlist aggregate */}
      {isPlaylist && (
        <div
          className={`flex items-center justify-between text-xs px-4 py-3 rounded-[18px] border ${
            isLight
              ? "bg-[#F3F5FA] border-[#E2E8F0]"
              : "bg-black/20 border-white/10"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={`font-black text-sm ${isLight ? "text-slate-800" : "text-white"}`}>{completedCount}</span>
            <span className="text-[#8E99AE] font-bold">/</span>
            <span className="text-[#8E99AE] font-semibold">{totalCount} videos completed</span>
          </div>
          <span
            className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-white/20"
            style={{ color: config.primaryHex }}
          >
            {completedCount === totalCount
              ? "All Complete! 🎉"
              : `Downloading #${Math.min(completedCount + 1, totalCount)} of ${totalCount}`}
          </span>
        </div>
      )}

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-[#8E99AE] font-medium">
          <span>
            {frame?.downloaded_bytes
              ? formatFileSize(frame.downloaded_bytes)
              : "—"}
            {frame?.total_bytes ? ` / ${formatFileSize(frame.total_bytes)}` : ""}
          </span>
          <span className={`font-mono font-bold ${isLight ? "text-slate-800" : "text-white"}`}>
            {percent.toFixed(1)}%
          </span>
        </div>
        <div
          className={`relative h-3 rounded-full overflow-hidden ${
            isLight ? "bg-[#E2E8F0]" : "bg-black/40"
          }`}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
            style={{
              width: `${Math.min(100, percent)}%`,
              backgroundColor: config.primaryHex,
              boxShadow: `0 0 12px ${config.primaryHex}66`,
            }}
          />
          {/* Shimmer effect */}
          {status === "downloading" && (
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%)",
                animation: "shimmer 1.5s infinite",
              }}
            />
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div
          className={`rounded-[18px] p-3 space-y-0.5 border ${
            isLight ? "bg-[#F3F5FA] border-[#E2E8F0]" : "bg-black/20 border-white/5"
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8E99AE]">Speed</p>
          <p className={`text-sm font-bold font-mono ${isLight ? "text-slate-800" : "text-white"}`}>
            {formatSpeed(frame?.speed ?? null)}
          </p>
        </div>
        <div
          className={`rounded-[18px] p-3 space-y-0.5 border ${
            isLight ? "bg-[#F3F5FA] border-[#E2E8F0]" : "bg-black/20 border-white/5"
          }`}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8E99AE]">ETA</p>
          <p className={`text-sm font-bold font-mono ${isLight ? "text-slate-800" : "text-white"}`}>
            {formatEta(frame?.eta ?? null)}
          </p>
        </div>
      </div>

      {/* Job ID */}
      <p className="text-[10px] text-[#8E99AE] font-mono truncate">
        Job ID: {jobId}
      </p>

      {/* Shimmer keyframe */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
