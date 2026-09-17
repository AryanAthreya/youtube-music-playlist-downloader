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
  const { config } = useTheme();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-slate-950/90 backdrop-blur-xl border-t border-white/10 px-3 py-2"
      aria-label="Mobile Navigation Bar"
    >
      {/* Subtle Settings Gear Icon beside top right of footer */}
      {onOpenSettings && (
        <button
          id="mobile-footer-settings-button"
          onClick={onOpenSettings}
          className="absolute -top-3.5 right-3 p-1.5 rounded-full bg-zinc-900/90 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/15 shadow-lg backdrop-blur-md active:scale-95 transition-all"
          title="Settings & Appearance"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      )}

      <div className="flex items-center justify-around max-w-md mx-auto">
        {/* Downloader Tab */}
        <button
          onClick={() => onChangeTab("downloader")}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl transition-all ${
            activeTab === "downloader"
              ? "font-bold scale-105"
              : "text-gray-400 hover:text-gray-200"
          }`}
          style={{ color: activeTab === "downloader" ? config.primaryHex : undefined }}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span className="text-[10px]">Download</span>
        </button>

        {/* Library Tab */}
        <button
          onClick={() => onChangeTab("history")}
          className={`relative flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl transition-all ${
            activeTab === "history"
              ? "font-bold scale-105"
              : "text-gray-400 hover:text-gray-200"
          }`}
          style={{ color: activeTab === "history" ? config.primaryHex : undefined }}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className="text-[10px]">Library</span>
          {fileCount > 0 && (
            <span
              className="absolute top-0 right-1 text-[9px] font-bold px-1 rounded-full text-white leading-tight"
              style={{ backgroundColor: config.primaryHex }}
            >
              {fileCount}
            </span>
          )}
        </button>

        {/* Playlists Tab (Matching Image 2 Reference) */}
        <button
          onClick={() => onChangeTab("playlists")}
          className={`flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl transition-all ${
            activeTab === "playlists"
              ? "font-bold scale-105"
              : "text-gray-400 hover:text-gray-200"
          }`}
          style={{ color: activeTab === "playlists" ? config.primaryHex : undefined }}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          <span className="text-[10px]">Playlists</span>
        </button>

        {/* Player Tab */}
        <button
          onClick={() => onChangeTab("player")}
          className={`relative flex flex-col items-center gap-1 py-1 px-2.5 rounded-xl transition-all ${
            activeTab === "player"
              ? "font-bold scale-105"
              : "text-gray-400 hover:text-gray-200"
          }`}
          style={{ color: activeTab === "player" ? config.primaryHex : undefined }}
        >
          <div className="relative">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
            {hasActiveTrack && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            )}
          </div>
          <span className="text-[10px]">Player</span>
        </button>
      </div>
    </nav>
  );
}
