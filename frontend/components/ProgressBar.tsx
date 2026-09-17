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
    downloading: "bg-blue-400 animate-pulse",
    merging: "bg-yellow-400 animate-pulse",
    completed: "bg-green-400",
    partial: "bg-yellow-400",
    failed: "bg-red-500",
    cancelled: "bg-gray-500",
  };
  return (
    <div className={`w-2.5 h-2.5 rounded-full ${colors[status] ?? "bg-gray-400"}`} />
  );
}

export function ProgressBar({ id, jobId, frame, onCancel }: ProgressBarProps) {
  const { config } = useTheme();
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
      className="rounded-2xl border border-gray-700/50 bg-gray-800/50 backdrop-blur p-6 space-y-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <StatusDot status={status} />
          <span className="text-sm font-medium text-white">
            {STATUS_LABELS[status] ?? status}
          </span>
        </div>
        <button
          id={`${id}-cancel`}
          onClick={onCancel}
          className="text-xs text-gray-500 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg border border-gray-700 hover:border-red-500/40"
        >
          Cancel
        </button>
      </div>

      {/* Playlist aggregate */}
      {isPlaylist && (
        <div className="flex items-center justify-between text-sm text-gray-400 bg-white/5 px-3.5 py-2.5 rounded-xl border border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-base">{completedCount}</span>
            <span className="text-zinc-400 font-bold">/</span>
            <span className="text-zinc-200 font-semibold">{totalCount} videos complete</span>
          </div>
          <span
            className="text-xs font-mono font-medium px-2 py-0.5 rounded-md bg-white/10"
            style={{ color: config.primaryHex }}
          >
            {completedCount === totalCount
              ? "All Complete! 🎉"
              : `Downloading #${Math.min(completedCount + 1, totalCount)} of ${totalCount}`}
          </span>
        </div>
      )}

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-gray-400">
          <span>
            {frame?.downloaded_bytes
              ? formatFileSize(frame.downloaded_bytes)
              : "—"}
            {frame?.total_bytes ? ` / ${formatFileSize(frame.total_bytes)}` : ""}
          </span>
          <span className="font-mono font-medium text-white">
            {percent.toFixed(1)}%
          </span>
        </div>
        <div className="relative h-2.5 rounded-full bg-gray-700 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
            style={{
              width: `${Math.min(100, percent)}%`,
              background: `linear-gradient(to right, ${config.primaryHex}, ${config.secondaryHex})`,
              boxShadow: `0 0 10px ${config.glow}`,
            }}
          />
          {/* Shimmer effect */}
          {status === "downloading" && (
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)",
                animation: "shimmer 1.5s infinite",
              }}
            />
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900/50 rounded-xl p-3 space-y-0.5">
          <p className="text-xs text-gray-500">Speed</p>
          <p className="text-sm font-medium text-white font-mono">
            {formatSpeed(frame?.speed ?? null)}
          </p>
        </div>
        <div className="bg-gray-900/50 rounded-xl p-3 space-y-0.5">
          <p className="text-xs text-gray-500">ETA</p>
          <p className="text-sm font-medium text-white font-mono">
            {formatEta(frame?.eta ?? null)}
          </p>
        </div>
      </div>

      {/* Job ID (for debugging) */}
      <p className="text-xs text-gray-600 font-mono truncate">
        Job: {jobId}
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
