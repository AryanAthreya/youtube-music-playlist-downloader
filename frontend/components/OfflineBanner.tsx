"use client";

import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check initial online status
    setIsOffline(!navigator.onLine);

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handleInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setInstallPrompt(null);
      setIsInstalled(true);
    }
  };

  return (
    <>
      {/* Offline Status Warning Bar */}
      {isOffline && (
        <div className="bg-amber-500/15 border-b border-amber-500/20 px-4 py-2 text-center text-xs font-semibold text-amber-300 flex items-center justify-center gap-2 backdrop-blur-md sticky top-0 z-50">
          <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.828m2.829 2.828L3 3m15.364 2.636A9 9 0 005.636 5.636m0 0l2.828 2.828M12 12a3 3 0 100 6 3 3 0 000-6z"
            />
          </svg>
          <span>Offline Mode: Streaming is paused, but your saved offline tracks and library remain fully playable.</span>
        </div>
      )}

      {/* Install PWA Prompt Banner (Shown once when prompt available and not installed) */}
      {!isInstalled && installPrompt && (
        <div className="bg-gradient-to-r from-indigo-950/80 to-purple-950/80 border-b border-indigo-500/20 px-4 py-2 flex items-center justify-between text-xs text-indigo-200 backdrop-blur-md sticky top-0 z-40">
          <div className="flex items-center gap-2 truncate">
            <span className="p-1 rounded-lg bg-indigo-500/20 text-indigo-300">📱</span>
            <span className="truncate">Install YT Music Player for background playback and offline music access</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleInstallClick}
              className="px-3 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-[11px] shadow-sm transition-all"
            >
              Install App
            </button>
            <button
              onClick={() => setInstallPrompt(null)}
              className="text-gray-400 hover:text-white px-1 text-xs"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
