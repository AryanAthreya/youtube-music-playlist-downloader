"use client";

import { getFileUrl } from "@/lib/api";
import type { WebSocketFrame } from "@/lib/types";
import { useTheme } from "../context/ThemeContext";

interface DownloadCompleteNotificationProps {
  jobId: string;
  frame: WebSocketFrame;
  onDismiss: () => void;
  onViewInLibrary: () => void;
  onViewInPlaylists?: () => void;
}

export function DownloadCompleteNotification({
  jobId,
  frame,
  onDismiss,
  onViewInLibrary,
  onViewInPlaylists,
}: DownloadCompleteNotificationProps) {
  const { config } = useTheme();
  const isPartial = frame.status === "partial";
  const isPlaylist = (frame.total_count ?? 0) > 1;
  const downloadUrl = getFileUrl(jobId);

  // Same full-modal popup on BOTH mobile and desktop
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div
        className="relative w-full max-w-sm rounded-3xl p-7 shadow-2xl text-center space-y-5 animate-in zoom-in-95 duration-200 border"
        style={{
          background: `linear-gradient(135deg, #101820 0%, #0a1014 100%)`,
          borderColor: `${config.primaryHex}44`,
          boxShadow: `0 25px 50px -10px ${config.glow}`,
        }}
      >
        {/* Close button */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          title="Close"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Success Icon */}
        <div
          className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center shadow-xl"
          style={{
            background: `${config.primaryHex}22`,
            border: `1px solid ${config.primaryHex}55`,
            boxShadow: `0 10px 30px -5px ${config.glow}`,
          }}
        >
          <svg
            className="w-8 h-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            style={{ color: config.primaryHex }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div className="space-y-1.5">
          <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            {isPartial ? "Partially Completed" : "Download Complete!"}
          </h3>
          <p className="text-xs font-medium" style={{ color: config.primaryHex }}>
            Saved directly to your local computer:{" "}
            <code
              className="px-2 py-0.5 rounded border font-mono text-[11px] text-white"
              style={{ background: `${config.primaryHex}20`, borderColor: `${config.primaryHex}40` }}
            >
              downloads/completed
            </code>
          </p>
          <p className="text-[11px] text-gray-400">
            Browser download triggered! Press{" "}
            <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-white/10 font-mono text-gray-300">
              Ctrl + J
            </kbd>{" "}
            in Brave/Chrome to view.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5 pt-1">
          <a
            href={downloadUrl}
            download
            onClick={onDismiss}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-white font-black rounded-xl shadow-lg active:scale-95 transition-all text-sm"
            style={{
              background: `linear-gradient(135deg, ${config.primaryHex} 0%, ${config.secondaryHex} 100%)`,
              boxShadow: `0 8px 20px -4px ${config.glow}`,
            }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Save to Browser Downloads</span>
          </a>

          {isPlaylist && onViewInPlaylists && (
            <button
              onClick={() => {
                onViewInPlaylists();
                onDismiss();
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl active:scale-95 transition-all text-sm font-bold border border-white/20 shadow-md"
              style={{
                backgroundColor: config.primaryHex,
                color: "#ffffff",
                boxShadow: `0 4px 15px -3px ${config.glow}`,
              }}
            >
              <svg className="w-4 h-4 fill-none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <span>View in Playlists Section →</span>
            </button>
          )}

          <button
            onClick={() => {
              onViewInLibrary();
              onDismiss();
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 glass-card hover:bg-white/10 text-white font-semibold rounded-xl active:scale-95 transition-all text-sm border border-white/10"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: config.primaryHex }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span>View in History Library →</span>
          </button>
        </div>

        <button
          onClick={onDismiss}
          className="text-xs text-gray-500 hover:text-white transition-colors pt-1"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
