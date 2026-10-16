"use client";

import React, { useRef, useState, useCallback } from "react";
import type { FileInfo } from "@/lib/types";
import { resolveMediaUrl } from "@/lib/api";
import { useTheme } from "@/context/ThemeContext";
import { LikeButton } from "./LikeButton";

interface MiniPlayerBarProps {
  currentFile: FileInfo | null;
  isPlaying: boolean;
  onTogglePlayPause: () => void;
  onOpenPlayer: () => void;
  onPlayNext?: () => void;
  onPlayPrev?: () => void;
  progressPercent?: number;
}

export function MiniPlayerBar({
  currentFile,
  isPlaying,
  onTogglePlayPause,
  onOpenPlayer,
  onPlayNext,
  onPlayPrev,
  progressPercent = 0,
}: MiniPlayerBarProps) {
  const { config, theme } = useTheme();
  const isLight = config.isLight || theme === "soft-light";

  // Native swipe gestures
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;

    // Detect swipe up to expand full player
    if (deltaY < -45 && Math.abs(deltaY) > Math.abs(deltaX)) {
      onOpenPlayer();
    }
    // Detect swipe left for next track
    else if (deltaX < -50 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (onPlayNext) onPlayNext();
    }
    // Detect swipe right for previous track
    else if (deltaX > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (onPlayPrev) onPlayPrev();
    }

    touchStartX.current = null;
    touchStartY.current = null;
  };

  if (!currentFile) return null;

  // SVG Circular progress math
  const radius = 19;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.max(0, Math.min(100, progressPercent)) / 100) * circumference;

  return (
    <div
      onClick={onOpenPlayer}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`fixed bottom-20 left-3 right-3 z-40 md:bottom-6 md:right-6 md:left-auto md:w-96 p-2 sm:p-2.5 rounded-3xl border transition-all cursor-pointer group animate-in slide-in-from-bottom-4 duration-300 ${
        isLight
          ? "bg-white/95 border-[#E2E8F0] shadow-[0_12px_32px_rgba(35,55,110,0.12)]"
          : "bg-[#161C2E]/95 border-white/10 shadow-[0_12px_32px_rgba(0,0,0,0.55)]"
      } backdrop-blur-xl`}
      title="Tap or swipe up to open player"
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left: Squircle Thumbnail */}
        <div className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-[18px] overflow-hidden bg-slate-900 shrink-0 shadow-sm border border-black/5 dark:border-white/10">
          {currentFile.thumbnail_url ? (
            <img
              src={resolveMediaUrl(currentFile.thumbnail_url)}
              alt={currentFile.clean_title}
              className={`w-full h-full object-cover transition-transform duration-300 ${
                isPlaying ? "scale-105" : "scale-100 opacity-90"
              }`}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg bg-slate-800 text-white">
              🎵
            </div>
          )}
        </div>

        {/* Middle: Title & Artist with marquee */}
        <div className="min-w-0 flex-1">
          <h4 className="text-xs sm:text-sm font-bold text-[#1A1F2C] dark:text-[#EAF0FF] truncate group-hover:text-[#2B4C8F] dark:group-hover:text-[#6C95FF] transition-colors font-quicksand">
            {currentFile.clean_title}
          </h4>
          <p className="text-[11px] text-[#9AA3B5] truncate mt-0.5">
            {currentFile.artist || "YouTube Music"}
          </p>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Heart Like Button */}
          <LikeButton size="sm" track={currentFile} />

          {/* Previous button (hidden on tiny screens) */}
          {onPlayPrev && (
            <button
              type="button"
              onClick={onPlayPrev}
              className="hidden sm:flex w-7 h-7 rounded-full text-[#9AA3B5] hover:text-[#1A1F2C] dark:hover:text-white items-center justify-center transition-colors active:scale-90"
              title="Previous Track"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>
          )}

          {/* Circular Play Button with Progress Ring Wrapper */}
          <div className="relative w-11 h-11 flex items-center justify-center">
            {/* SVG Progress Ring */}
            <svg className="absolute inset-0 w-11 h-11 -rotate-90 pointer-events-none" viewBox="0 0 44 44">
              <circle
                cx="22"
                cy="22"
                r={radius}
                className={isLight ? "text-[#E6ECF8]" : "text-white/10"}
                stroke="currentColor"
                strokeWidth="2.5"
                fill="transparent"
              />
              <circle
                cx="22"
                cy="22"
                r={radius}
                stroke={config.primaryHex}
                strokeWidth="2.5"
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-300"
              />
            </svg>

            {/* Inner Play/Pause Button */}
            <button
              type="button"
              onClick={onTogglePlayPause}
              className="w-9 h-9 rounded-full text-white flex items-center justify-center shadow-md active:scale-90 transition-all z-10"
              style={{
                backgroundColor: config.primaryHex,
                boxShadow: `0 3px 10px ${config.glow}`,
              }}
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 ml-0.5 fill-current" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
          </div>

          {/* Next button */}
          {onPlayNext && (
            <button
              type="button"
              onClick={onPlayNext}
              className="w-7 h-7 rounded-full text-[#9AA3B5] hover:text-[#1A1F2C] dark:hover:text-white flex items-center justify-center transition-colors active:scale-90"
              title="Next Track"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
