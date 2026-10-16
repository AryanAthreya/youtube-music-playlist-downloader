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
  const { config, theme } = useTheme();
  const isLight = config.isLight || theme === "soft-light";

  const isPartial = frame.status === "partial";
  const isPlaylist = (frame.total_count ?? 0) > 1;
  const downloadUrl = getFileUrl(jobId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div
        className={`relative w-full max-w-sm rounded-[32px] p-7 shadow-2xl text-center space-y-5 animate-in zoom-in-95 duration-200 border ${
          isLight
            ? "bg-white border-[#E2E8F0] shadow-[0_20px_50px_rgba(35,55,110,0.15)]"
            : "bg-[#161C2E] border-white/15 shadow-[0_25px_60px_rgba(0,0,0,0.6)]"
        }`}
      >
        {/* Close button */}
        <button
          onClick={onDismiss}
          className={`absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
            isLight
              ? "bg-[#F3F5FA] hover:bg-[#E6ECF8] text-slate-500 hover:text-slate-800"
              : "bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
          }`}
          title="Close"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Success Icon */}
        <div
          className="w-16 h-16 mx-auto rounded-[20px] flex items-center justify-center shadow-lg"
          style={{
            backgroundColor: `${config.primaryHex}15`,
            border: `1px solid ${config.primaryHex}35`,
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
          <h3
            className={`text-xl font-black tracking-tight ${isLight ? "text-[#1A1F2C]" : "text-white"}`}
            style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
          >
            {isPartial ? "Partially Completed" : "Download Complete!"}
          </h3>
          <p className="text-xs font-semibold" style={{ color: config.primaryHex }}>
            Saved directly to your local computer:{" "}
            <code
              className={`px-2 py-0.5 rounded-full border font-mono text-[11px] ${
                isLight ? "bg-slate-100 border-slate-200 text-slate-800" : "bg-black/30 border-white/10 text-white"
              }`}
            >
              downloads/completed
            </code>
          </p>
          <p className="text-[11px] text-[#8E99AE]">
            Browser download triggered! Press{" "}
            <kbd className={`px-1.5 py-0.5 rounded border font-mono ${
              isLight ? "bg-slate-100 border-slate-200 text-slate-700" : "bg-black/40 border-white/10 text-slate-300"
            }`}>
              Ctrl + J
            </kbd>{" "}
            in your browser to view downloads.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5 pt-1">
          <a
            href={downloadUrl}
            download
            onClick={onDismiss}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-white font-bold rounded-full shadow-md active:scale-95 transition-all text-xs"
            style={{ backgroundColor: config.primaryHex }}
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
              className={`w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full active:scale-95 transition-all text-xs font-bold border ${
                isLight
                  ? "bg-[#F3F5FA] border-[#E2E8F0] text-slate-800 hover:bg-[#E6ECF8]"
                  : "bg-white/10 border-white/10 text-white hover:bg-white/15"
              }`}
            >
              <span>View in Playlists Section →</span>
            </button>
          )}

          <button
            onClick={() => {
              onViewInLibrary();
              onDismiss();
            }}
            className={`w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full active:scale-95 transition-all text-xs font-bold border ${
              isLight
                ? "bg-[#F3F5FA] border-[#E2E8F0] text-slate-800 hover:bg-[#E6ECF8]"
                : "bg-white/10 border-white/10 text-white hover:bg-white/15"
            }`}
          >
            <span>View in Music Library →</span>
          </button>
        </div>

        <button
          onClick={onDismiss}
          className="text-xs text-[#8E99AE] hover:text-slate-800 dark:hover:text-white transition-colors pt-1"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
