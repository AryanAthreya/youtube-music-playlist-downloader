"use client";

import { useTheme } from "../context/ThemeContext";

interface BottomNavBarProps {
  activeTab: "downloader" | "history" | "playlists" | "player";
  onChangeTab: (tab: "downloader" | "history" | "playlists" | "player") => void;
  fileCount: number;
  hasActiveTrack: boolean;
  onOpenSettings?: () => void;
}

export function BottomNavBar({
  activeTab,
  onChangeTab,
  fileCount,
  hasActiveTrack,
  onOpenSettings,
}: BottomNavBarProps) {
  const { config, theme } = useTheme();
  const isLight = config.isLight || theme === "soft-light";

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-50 md:hidden px-4 py-2.5 transition-all duration-300 border-t ${
        isLight
          ? "bg-white/95 border-[#E2E8F0] shadow-[0_-8px_25px_rgba(35,55,110,0.08)]"
          : "bg-[#161C2E]/95 border-white/10 shadow-[0_-8px_30px_rgba(0,0,0,0.5)]"
      } backdrop-blur-2xl`}
      aria-label="Mobile Navigation Bar"
    >
      {/* Settings trigger */}
      {onOpenSettings && (
        <button
          id="mobile-footer-settings-button"
          onClick={onOpenSettings}
          className={`absolute -top-3.5 right-4 p-1.5 rounded-full border shadow-md active:scale-95 transition-all ${
            isLight
              ? "bg-white text-slate-500 hover:text-slate-800 border-slate-200"
              : "bg-[#1E263D] text-slate-300 hover:text-white border-white/15"
          }`}
          title="Settings & Appearance"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      )}

      <div className="flex items-center justify-around max-w-sm mx-auto">
        {/* 1. Discover / Home Tab */}
        <button
          onClick={() => onChangeTab("downloader")}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-2xl transition-all duration-200 active:scale-95 ${
            activeTab === "downloader" ? "font-bold" : "text-[#9AA3B5] hover:text-[#1A1F2C] dark:hover:text-[#EAF0FF]"
          }`}
          style={{ color: activeTab === "downloader" ? config.primaryHex : undefined }}
        >
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
              activeTab === "downloader"
                ? isLight
                  ? "bg-[#E6ECF8] shadow-sm ring-2 ring-[#2B4C8F]/20"
                  : "bg-[#202D4E] shadow-sm ring-2 ring-[#6C95FF]/30"
                : ""
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={activeTab === "downloader" ? 2.5 : 1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          {activeTab === "downloader" && (
            <span className="text-[10px] tracking-tight animate-in fade-in duration-200">
              Discover
            </span>
          )}
        </button>

        {/* 2. Music / Library Tab */}
        <button
          onClick={() => onChangeTab("history")}
          className={`relative flex flex-col items-center gap-1 py-1 px-3 rounded-2xl transition-all duration-200 active:scale-95 ${
            activeTab === "history" ? "font-bold" : "text-[#9AA3B5] hover:text-[#1A1F2C] dark:hover:text-[#EAF0FF]"
          }`}
          style={{ color: activeTab === "history" ? config.primaryHex : undefined }}
        >
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
              activeTab === "history"
                ? isLight
                  ? "bg-[#E6ECF8] shadow-sm ring-2 ring-[#2B4C8F]/20"
                  : "bg-[#202D4E] shadow-sm ring-2 ring-[#6C95FF]/30"
                : ""
            }`}
          >
            {/* Concentric rings disc icon matching reference design */}
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={activeTab === "history" ? 2.5 : 1.75}>
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="12" cy="12" r="1" fill="currentColor" />
            </svg>
          </div>
          {fileCount > 0 && (
            <span
              className="absolute top-1 right-2 text-[8px] font-bold px-1 rounded-full text-white leading-tight shadow-sm"
              style={{ backgroundColor: config.primaryHex }}
            >
              {fileCount}
            </span>
          )}
          {activeTab === "history" && (
            <span className="text-[10px] tracking-tight animate-in fade-in duration-200">
              Music
            </span>
          )}
        </button>

        {/* 3. Liked Songs / Playlists Tab (Heart icon from reference design) */}
        <button
          onClick={() => onChangeTab("playlists")}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-2xl transition-all duration-200 active:scale-95 ${
            activeTab === "playlists" ? "font-bold" : "text-[#9AA3B5] hover:text-[#1A1F2C] dark:hover:text-[#EAF0FF]"
          }`}
          style={{ color: activeTab === "playlists" ? config.primaryHex : undefined }}
        >
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
              activeTab === "playlists"
                ? isLight
                  ? "bg-[#E6ECF8] shadow-sm ring-2 ring-[#2B4C8F]/20"
                  : "bg-[#202D4E] shadow-sm ring-2 ring-[#6C95FF]/30"
                : ""
            }`}
          >
            <svg className="w-5 h-5" fill={activeTab === "playlists" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          {activeTab === "playlists" && (
            <span className="text-[10px] tracking-tight animate-in fade-in duration-200">
              Playlists
            </span>
          )}
        </button>

        {/* 4. Player Tab */}
        <button
          onClick={() => onChangeTab("player")}
          className={`relative flex flex-col items-center gap-1 py-1 px-3 rounded-2xl transition-all duration-200 active:scale-95 ${
            activeTab === "player" ? "font-bold" : "text-[#9AA3B5] hover:text-[#1A1F2C] dark:hover:text-[#EAF0FF]"
          }`}
          style={{ color: activeTab === "player" ? config.primaryHex : undefined }}
        >
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
              activeTab === "player"
                ? isLight
                  ? "bg-[#E6ECF8] shadow-sm ring-2 ring-[#2B4C8F]/20"
                  : "bg-[#202D4E] shadow-sm ring-2 ring-[#6C95FF]/30"
                : ""
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={activeTab === "player" ? 2.5 : 1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            {hasActiveTrack && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            )}
          </div>
          {activeTab === "player" && (
            <span className="text-[10px] tracking-tight animate-in fade-in duration-200">
              Player
            </span>
          )}
        </button>
      </div>
    </nav>
  );
}
