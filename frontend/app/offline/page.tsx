"use client";

import Link from "next/link";

export default function OfflineFallbackPage() {
  return (
    <main className="min-h-screen bg-[#080c14] text-white flex flex-col items-center justify-center p-6 text-center select-none">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-indigo-600/10 blur-3xl rounded-full" />
      </div>

      <div className="relative z-10 max-w-md w-full glass-card p-8 rounded-3xl border border-white/10 shadow-2xl space-y-6">
        {/* Offline Icon */}
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-rose-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.828m2.829 2.828L3 3m15.364 2.636A9 9 0 005.636 5.636m0 0l2.828 2.828M12 12a3 3 0 100 6 3 3 0 000-6z"
            />
          </svg>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            You're Offline
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 leading-relaxed">
            No internet connection detected and the local player shell is still synchronizing. Connect to Wi-Fi or mobile data to access the full streaming catalog.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 px-5 rounded-xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-red-600 to-indigo-600 hover:from-red-500 hover:to-indigo-500 transition-all shadow-lg shadow-red-600/20 active:scale-95"
          >
            Retry Connection
          </button>
          <Link
            href="/"
            className="w-full py-3 px-5 rounded-xl font-bold text-xs sm:text-sm text-gray-300 hover:text-white glass-card border border-white/10 hover:border-white/20 transition-all active:scale-95 text-center flex items-center justify-center"
          >
            Open Player
          </Link>
        </div>
      </div>
    </main>
  );
}
