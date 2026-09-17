"use client";

import { getFileUrl } from "@/lib/api";
import type { WebSocketFrame } from "@/lib/types";

interface DownloadCompleteNotificationProps {
  jobId: string;
  frame: WebSocketFrame;
  onDismiss: () => void;
  onViewInLibrary: () => void;
}

export function DownloadCompleteNotification({
  jobId,
  frame,
  onDismiss,
  onViewInLibrary,
}: DownloadCompleteNotificationProps) {
  const isPartial = frame.status === "partial";
  const downloadUrl = getFileUrl(jobId);

  return (
    <>
      {/* ── PC VIEW: Centered Pop-Up Modal with Translucent Backdrop ───────── */}
      <div
        className="hidden sm:flex fixed inset-0 z-50 items-center justify-center p-4 bg-slate-950/65 backdrop-blur-md animate-in fade-in duration-200"
        onClick={(e) => {
          if (e.target === e.currentTarget) onDismiss();
        }}
      >
        <div className="relative w-full max-w-md bg-slate-900/90 border border-emerald-500/30 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 shadow-2xl shadow-emerald-500/20 text-center space-y-5 animate-in zoom-in-95 duration-200">
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
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {isPartial ? "Partially Completed" : "Download Complete!"}
            </h3>
            <p className="text-xs text-emerald-300/90 font-medium">
              Saved directly to your local computer:{" "}
              <code className="bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/50 font-mono text-[11px]">
                downloads/completed
              </code>
            </p>
            <p className="text-[11px] text-gray-400">
              Browser download triggered! Press <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-white/10 font-mono text-gray-300">Ctrl + J</kbd> in Brave/Chrome to view.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5 pt-2">
            <a
              href={downloadUrl}
              download
              onClick={onDismiss}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black rounded-xl shadow-lg shadow-emerald-500/25 active:scale-95 transition-all text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Save to Browser Downloads</span>
            </a>

            <button
              onClick={() => {
                onViewInLibrary();
                onDismiss();
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 glass-card hover:bg-white/10 text-white font-semibold rounded-xl active:scale-95 transition-all text-sm border border-white/10"
            >
              <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span>View in History Library →</span>
            </button>
          </div>

          <button
            onClick={onDismiss}
            className="text-xs text-gray-400 hover:text-white transition-colors pt-1"
          >
            Dismiss
          </button>
        </div>
      </div>

      {/* ── MOBILE VIEW: Floating Header Notification with Translucent Glass ─ */}
      <aside
        aria-label="Download notification"
        className="sm:hidden fixed top-3 left-3 right-3 z-50 bg-slate-900/90 backdrop-blur-xl border border-emerald-500/35 rounded-2xl p-3.5 shadow-2xl shadow-emerald-500/25 animate-in slide-in-from-top-4 duration-300 space-y-2.5"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-white truncate">
                {isPartial ? "Partially Completed" : "Download Complete!"}
              </h4>
              <p className="text-[10px] text-emerald-300 truncate">Saved to local storage</p>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onDismiss}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Compact Quick Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <a
            href={downloadUrl}
            download
            onClick={onDismiss}
            className="flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-[11px] shadow-sm shadow-emerald-500/20 active:scale-95 transition-all text-center"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Save File</span>
          </a>

          <button
            onClick={() => {
              onViewInLibrary();
              onDismiss();
            }}
            className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl text-[11px] border border-white/10 active:scale-95 transition-all text-center"
          >
            <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span>View Library</span>
          </button>
        </div>
      </aside>
    </>
  );
}
