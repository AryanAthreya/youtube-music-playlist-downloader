"use client";

interface BottomNavBarProps {
  activeTab: "downloader" | "history" | "player";
  onChangeTab: (tab: "downloader" | "history" | "player") => void;
  fileCount: number;
  hasActiveTrack: boolean;
}

export function BottomNavBar({
  activeTab,
  onChangeTab,
  fileCount,
  hasActiveTrack,
}: BottomNavBarProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-slate-950/90 backdrop-blur-xl border-t border-white/10 px-4 py-2"
      aria-label="Mobile Navigation Bar"
    >
      <div className="flex items-center justify-around max-w-md mx-auto">
        {/* Downloader Tab */}
        <button
          onClick={() => onChangeTab("downloader")}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
            activeTab === "downloader"
              ? "text-red-400 font-bold scale-105"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span className="text-[10px]">Download</span>
        </button>

        {/* Library Tab */}
        <button
          onClick={() => onChangeTab("history")}
          className={`relative flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
            activeTab === "history"
              ? "text-indigo-400 font-bold scale-105"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className="text-[10px]">Library</span>
          {fileCount > 0 && (
            <span className="absolute top-0 right-1 text-[9px] font-bold px-1 rounded-full bg-indigo-500 text-white leading-tight">
              {fileCount}
            </span>
          )}
        </button>

        {/* Player Tab */}
        <button
          onClick={() => onChangeTab("player")}
          className={`relative flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${
            activeTab === "player"
              ? "text-purple-400 font-bold scale-105"
              : "text-gray-400 hover:text-gray-200"
          }`}
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
