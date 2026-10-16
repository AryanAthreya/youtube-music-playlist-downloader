"use client";

import React, { useState, useEffect } from "react";
import { useTheme, THEMES } from "../context/ThemeContext";
import {
  getOfflineStorageUsage,
  getStorageQuotaEstimate,
  clearAllOfflineTracks,
  getStreamingQualitySetting,
  setStreamingQualitySetting,
  isOpusSupported,
  type StreamingQualitySetting,
} from "@/lib/db";
import { formatFileSize } from "@/lib/websocket";

interface ThemeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ThemeSelectorModal({ isOpen, onClose }: ThemeSelectorModalProps) {
  const { theme, setTheme, config, isFollowSystem, setIsFollowSystem } = useTheme();
  const isLight = config.isLight || theme === "soft-light";

  const [offlineUsage, setOfflineUsage] = useState<{ count: number; totalBytes: number }>({ count: 0, totalBytes: 0 });
  const [quota, setQuota] = useState<{ percentUsed: number; quotaBytes: number; usageBytes: number }>({ percentUsed: 0, quotaBytes: 0, usageBytes: 0 });
  const [quality, setQuality] = useState<StreamingQualitySetting>("auto");
  const [opusSupported, setOpusSupported] = useState<boolean>(true);

  const refreshStorage = () => {
    getOfflineStorageUsage().then(setOfflineUsage).catch(() => {});
    getStorageQuotaEstimate().then(setQuota).catch(() => {});
    getStreamingQualitySetting().then(setQuality).catch(() => {});
    setOpusSupported(isOpusSupported());
  };

  useEffect(() => {
    if (isOpen) {
      refreshStorage();
      window.addEventListener("ytdl_offline_updated", refreshStorage);
      return () => window.removeEventListener("ytdl_offline_updated", refreshStorage);
    }
  }, [isOpen]);

  const handleQualityChange = async (newQuality: StreamingQualitySetting) => {
    setQuality(newQuality);
    await setStreamingQualitySetting(newQuality);
  };

  const handleClearOffline = async () => {
    if (!confirm("Remove all saved offline tracks from this device?")) return;
    await clearAllOfflineTracks();
    refreshStorage();
  };

  if (!isOpen) return null;

  const themeList = Object.values(THEMES);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-md max-h-[88vh] sm:max-h-[85vh] flex flex-col rounded-[28px] overflow-hidden shadow-2xl border transition-all animate-in zoom-in-95 duration-200 ${
          isLight
            ? "bg-white border-[#E2E8F0] text-slate-800 shadow-[0_20px_50px_rgba(35,55,110,0.18)]"
            : "bg-[#161C2E] border-white/15 text-white shadow-[0_25px_60px_rgba(0,0,0,0.7)]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Header (Always visible and pinned at top) */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-black/5 dark:border-white/10 shrink-0 bg-inherit z-10">
          <div className="flex items-center gap-3">
            <span
              className="w-9 h-9 rounded-2xl flex items-center justify-center text-sm shadow-sm"
              style={{ backgroundColor: `${config.primaryHex}20`, color: config.primaryHex }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </span>
            <div>
              <h3
                className={`text-base font-black tracking-tight ${isLight ? "text-[#1A1F2C]" : "text-white"}`}
                style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
              >
                Settings & Appearance
              </h3>
              <p className="text-[11px] text-[#8E99AE] font-medium">Themes, quality & offline storage</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95 border ${
              isLight
                ? "bg-[#F3F5FA] hover:bg-[#E6ECF8] border-[#E2E8F0] text-slate-500 hover:text-slate-800"
                : "bg-white/5 hover:bg-white/10 border-white/10 text-slate-400 hover:text-white"
            }`}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-5 scrollbar-thin">
          {/* Section 1: Themes */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#8E99AE]">
                Appearance Preset
              </span>
              <button
                type="button"
                onClick={() => setIsFollowSystem(!isFollowSystem)}
                className={`text-[10px] font-bold px-3 py-1 rounded-full border transition-all ${
                  isFollowSystem
                    ? "bg-blue-500/20 text-blue-500 dark:text-blue-300 border-blue-500/40"
                    : isLight
                    ? "bg-[#F3F5FA] text-slate-600 border-[#E2E8F0] hover:text-slate-900"
                    : "bg-white/5 text-zinc-400 border-white/10 hover:text-white"
                }`}
              >
                {isFollowSystem ? "✓ System Sync On" : "Sync with System"}
              </button>
            </div>

            <div className="space-y-2">
              {themeList.map((t) => {
                const isSelected = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTheme(t.id);
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-[20px] border transition-all text-left group ${
                      isSelected
                        ? isLight
                          ? "bg-[#E6ECF8] border-[#2B4C8F]/40 shadow-sm ring-1 ring-[#2B4C8F]/30"
                          : "bg-white/15 border-white/30 shadow-md ring-1 ring-white/30"
                        : isLight
                        ? "bg-[#F8FAFC] border-[#E2E8F0] hover:bg-white hover:border-[#2B4C8F]/20"
                        : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/15"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Swatch */}
                      <div
                        className={`w-9 h-9 rounded-[14px] bg-gradient-to-tr ${t.gradient} shadow-sm flex items-center justify-center border border-white/20 shrink-0 group-hover:scale-105 transition-transform`}
                      >
                        <span className="w-3.5 h-3.5 rounded-md bg-white/95 shadow-sm" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4
                            className={`text-xs sm:text-sm font-bold truncate ${
                              isLight ? "text-slate-800" : "text-white"
                            }`}
                            style={{ fontFamily: "var(--font-quicksand), sans-serif" }}
                          >
                            {t.name}
                          </h4>
                          {t.isLight && (
                            <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30">
                              Light
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-[#8E99AE] truncate mt-0.5">{t.description}</p>
                      </div>
                    </div>

                    {isSelected ? (
                      <span
                        className="w-5 h-5 rounded-full text-white flex items-center justify-center text-xs font-black shadow shrink-0 ml-2"
                        style={{ backgroundColor: config.primaryHex }}
                      >
                        ✓
                      </span>
                    ) : (
                      <span className="w-4 h-4 rounded-full border border-black/10 dark:border-white/20 shrink-0 ml-2" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Streaming Quality */}
          <div className="pt-3 border-t border-black/5 dark:border-white/10 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#8E99AE]">
                Streaming Quality
              </span>
              <span className="text-[10px] text-[#8E99AE] font-mono font-bold">
                {quality === "auto"
                  ? opusSupported
                    ? "Opus ~160k"
                    : "AAC ~128k"
                  : quality === "compatible"
                  ? "AAC ~128k"
                  : "m4a ~48k"}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleQualityChange("auto")}
                className={`p-2.5 rounded-[18px] border text-left transition-all ${
                  quality === "auto"
                    ? isLight
                      ? "bg-[#E6ECF8] border-[#2B4C8F]/40 shadow-sm"
                      : "bg-white/15 border-white/30 text-white shadow-sm"
                    : isLight
                    ? "bg-[#F8FAFC] border-[#E2E8F0] text-slate-600 hover:bg-white"
                    : "bg-white/5 border-white/5 text-zinc-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <div className="text-xs font-bold flex items-center justify-between">
                  Auto
                  {quality === "auto" && <span className="text-[10px] text-emerald-500">●</span>}
                </div>
                <p className="text-[9.5px] text-[#8E99AE] mt-0.5 leading-tight">
                  Opus (~160k) if supported
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleQualityChange("compatible")}
                className={`p-2.5 rounded-[18px] border text-left transition-all ${
                  quality === "compatible"
                    ? isLight
                      ? "bg-[#E6ECF8] border-[#2B4C8F]/40 shadow-sm"
                      : "bg-white/15 border-white/30 text-white shadow-sm"
                    : isLight
                    ? "bg-[#F8FAFC] border-[#E2E8F0] text-slate-600 hover:bg-white"
                    : "bg-white/5 border-white/5 text-zinc-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <div className="text-xs font-bold flex items-center justify-between">
                  Compatible
                  {quality === "compatible" && <span className="text-[10px] text-emerald-500">●</span>}
                </div>
                <p className="text-[9.5px] text-[#8E99AE] mt-0.5 leading-tight">
                  AAC only (~128k)
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleQualityChange("saver")}
                className={`p-2.5 rounded-[18px] border text-left transition-all ${
                  quality === "saver"
                    ? isLight
                      ? "bg-[#E6ECF8] border-[#2B4C8F]/40 shadow-sm"
                      : "bg-white/15 border-white/30 text-white shadow-sm"
                    : isLight
                    ? "bg-[#F8FAFC] border-[#E2E8F0] text-slate-600 hover:bg-white"
                    : "bg-white/5 border-white/5 text-zinc-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <div className="text-xs font-bold flex items-center justify-between">
                  Saver
                  {quality === "saver" && <span className="text-[10px] text-emerald-500">●</span>}
                </div>
                <p className="text-[9.5px] text-[#8E99AE] mt-0.5 leading-tight">
                  Low-bitrate (~48k)
                </p>
              </button>
            </div>

            <p className="text-[10px] text-[#8E99AE] leading-normal pt-0.5">
              💡 YouTube audio streams max out at 128–160 kbps (256 kbps AAC requires YouTube Premium cookies).
            </p>
          </div>

          {/* Section 3: Offline Storage Management */}
          <div className="pt-3 border-t border-black/5 dark:border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#8E99AE]">
                Offline Storage
              </span>
              {offlineUsage.count > 0 && (
                <button
                  type="button"
                  onClick={handleClearOffline}
                  className="text-[11px] font-bold text-red-500 hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
            <div
              className={`p-3.5 rounded-[20px] border space-y-1.5 text-xs ${
                isLight ? "bg-[#F8FAFC] border-[#E2E8F0]" : "bg-white/5 border-white/5"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[#8E99AE] font-medium">Saved Tracks</span>
                <span className={`font-bold ${isLight ? "text-slate-800" : "text-white"}`}>
                  {offlineUsage.count} tracks
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#8E99AE] font-medium">Space Used</span>
                <span className={`font-mono font-bold ${isLight ? "text-slate-800" : "text-zinc-200"}`}>
                  {formatFileSize(offlineUsage.totalBytes)}
                </span>
              </div>
              {quota.quotaBytes > 0 && (
                <div className="flex items-center justify-between text-[11px] text-[#8E99AE] pt-0.5 font-medium">
                  <span>Browser Quota</span>
                  <span>
                    {quota.percentUsed.toFixed(1)}% ({formatFileSize(quota.usageBytes)} / {formatFileSize(quota.quotaBytes)})
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: About & Footer Info */}
          <div className="pt-3 border-t border-black/5 dark:border-white/10 space-y-2.5">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#8E99AE]">
              About & Links
            </span>

            <div
              className={`p-3.5 rounded-[20px] border space-y-2 text-xs ${
                isLight ? "bg-[#F8FAFC] border-[#E2E8F0]" : "bg-white/5 border-white/5"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[#8E99AE] font-medium">Created by</span>
                <span className={`font-bold flex items-center gap-1.5 ${isLight ? "text-slate-800" : "text-white"}`}>
                  aryanathreya
                  <span className="text-red-500 animate-pulse">❤️</span>
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#8E99AE] font-medium">Engine</span>
                <span className="font-mono text-[11px] text-[#8E99AE]">yt-dlp & FFmpeg Local Engine</span>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <a
                  href="https://github.com/aryanathreya"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border transition-all text-xs font-bold ${
                    isLight
                      ? "bg-white border-[#E2E8F0] text-slate-700 hover:text-slate-900 shadow-sm"
                      : "bg-white/5 hover:bg-white/10 border-white/10 text-zinc-300 hover:text-white"
                  }`}
                >
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  <span>GitHub</span>
                </a>

                <a
                  href="https://www.linkedin.com/in/aryanathreya"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border transition-all text-xs font-bold ${
                    isLight
                      ? "bg-white border-[#E2E8F0] text-slate-700 hover:text-slate-900 shadow-sm"
                      : "bg-white/5 hover:bg-white/10 border-white/10 text-zinc-300 hover:text-white"
                  }`}
                >
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                  </svg>
                  <span>LinkedIn</span>
                </a>
              </div>

              <div className="text-[10px] text-[#8E99AE] text-center pt-1 font-medium">
                © 2026 aryanathreya. All rights reserved.
              </div>
            </div>
          </div>
        </div>

        {/* Fixed Footer with Done Button */}
        <div className="px-5 sm:px-6 py-3 border-t border-black/5 dark:border-white/10 shrink-0 bg-inherit">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-full text-xs font-bold text-white shadow-md active:scale-95 transition-all"
            style={{ backgroundColor: config.primaryHex }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
