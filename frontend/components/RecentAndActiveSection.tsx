"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { FileInfo } from "@/lib/types";
import { formatFileSize } from "@/lib/websocket";
import { resolveMediaUrl } from "@/lib/api";
import { useTheme } from "@/context/ThemeContext";
import {
  getRecentlyPlayedTracks,
  getMostPlayedTracks,
  getLikedTracks,
  trackRecordToFileInfo,
} from "@/lib/db";
import { LikeButton } from "./LikeButton";

interface RecentAndActiveSectionProps {
  id: string;
  currentFile: FileInfo | null;
  recentFiles: FileInfo[];
  totalCount: number;
  onPlayTrack: (file: FileInfo) => void;
  onOpenPlayer: () => void;
  onViewLibrary: () => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning !";
  if (hour >= 12 && hour < 18) return "Good afternoon !";
  return "Welcome !";
}

export function RecentAndActiveSection({
  id,
  currentFile,
  recentFiles,
  totalCount,
  onPlayTrack,
  onOpenPlayer,
  onViewLibrary,
}: RecentAndActiveSectionProps) {
  const { config, theme } = useTheme();
  const isLight = config.isLight || theme === "soft-light";

  const [activeTab, setActiveTab] = useState<"recently" | "popular" | "liked">("recently");
  const [tabTracks, setTabTracks] = useState<FileInfo[]>([]);
  const [carouselTracks, setCarouselTracks] = useState<FileInfo[]>([]);

  // Load tracks for carousel ("Music Trending" / "Jump back in")
  const loadCarousel = useCallback(async () => {
    try {
      const recent = await getRecentlyPlayedTracks(8);
      if (recent.length > 0) {
        setCarouselTracks(recent.map(trackRecordToFileInfo));
      } else if (recentFiles.length > 0) {
        setCarouselTracks(recentFiles.slice(0, 8));
      }
    } catch {
      if (recentFiles.length > 0) {
        setCarouselTracks(recentFiles.slice(0, 8));
      }
    }
  }, [recentFiles]);

  // Load tracks for selected switcher tab
  const loadTabTracks = useCallback(async () => {
    try {
      if (activeTab === "recently") {
        const list = await getRecentlyPlayedTracks(6);
        if (list.length > 0) {
          setTabTracks(list.map(trackRecordToFileInfo));
        } else {
          setTabTracks(recentFiles.slice(0, 6));
        }
      } else if (activeTab === "popular") {
        const list = await getMostPlayedTracks(6);
        if (list.length > 0) {
          setTabTracks(list.map((item) => trackRecordToFileInfo(item.track)));
        } else {
          setTabTracks(recentFiles.slice(0, 6));
        }
      } else if (activeTab === "liked") {
        const list = await getLikedTracks();
        setTabTracks(list.slice(0, 6).map(trackRecordToFileInfo));
      }
    } catch {
      setTabTracks(recentFiles.slice(0, 6));
    }
  }, [activeTab, recentFiles]);

  useEffect(() => {
    loadCarousel();
  }, [loadCarousel]);

  useEffect(() => {
    loadTabTracks();
  }, [loadTabTracks]);

  // Listen to liked / history updates
  useEffect(() => {
    const handler = () => {
      loadCarousel();
      loadTabTracks();
    };
    window.addEventListener("ytdl_liked_changed", handler);
    window.addEventListener("ytdl_history_updated", handler);
    return () => {
      window.removeEventListener("ytdl_liked_changed", handler);
      window.removeEventListener("ytdl_history_updated", handler);
    };
  }, [loadCarousel, loadTabTracks]);

  const greeting = getGreeting();
  const displayCarousel = carouselTracks.length > 0 ? carouselTracks : recentFiles;

  return (
    <div id={id} className="space-y-6 pt-1 animate-in fade-in duration-300">
      {/* ── 1. Reference Style Greeting ─────────────────────────── */}
      <div className="pt-1">
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1A1F2C] dark:text-[#EAF0FF] font-quicksand">
          {greeting}
        </h2>
      </div>

      {/* ── 2. "You Are Playing" Floating Card (if active track exists) ─── */}
      {currentFile && (
        <div
          onClick={onOpenPlayer}
          className={`relative overflow-hidden p-3.5 sm:p-4 rounded-3xl border transition-all cursor-pointer ${
            isLight
              ? "bg-white border-[#E2E8F0] shadow-[0_10px_25px_rgba(35,55,110,0.08)]"
              : "bg-[#161C2E] border-white/10 shadow-[0_10px_25px_rgba(0,0,0,0.4)]"
          } hover:scale-[1.01] active:scale-[0.99]`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="relative w-12 h-12 rounded-2xl overflow-hidden bg-slate-900 shrink-0 shadow border border-black/5 dark:border-white/10">
                {currentFile.thumbnail_url ? (
                  <img
                    src={resolveMediaUrl(currentFile.thumbnail_url)}
                    alt={currentFile.clean_title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xl bg-slate-800">
                    🎵
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span
                    className="text-[10px] uppercase font-bold tracking-wider"
                    style={{ color: config.primaryHex }}
                  >
                    Listening To
                  </span>
                </div>
                <h3 className="text-sm font-bold text-[#1A1F2C] dark:text-[#EAF0FF] truncate">
                  {currentFile.clean_title}
                </h3>
                <p className="text-xs text-[#9AA3B5] truncate">
                  {currentFile.artist || "Ready to resume"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPlayTrack(currentFile);
              }}
              className="w-10 h-10 rounded-full text-white flex items-center justify-center shadow-md active:scale-90 transition-all shrink-0"
              style={{
                backgroundColor: config.primaryHex,
                boxShadow: `0 4px 14px ${config.glow}`,
              }}
              title="Resume Playback"
            >
              <svg className="w-4 h-4 ml-0.5 fill-current" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── 3. "Music Trending" / "Jump back in" Horizontal Carousel ─────────── */}
      {displayCarousel.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base sm:text-lg font-bold text-[#1A1F2C] dark:text-[#EAF0FF] font-quicksand">
              Music Trending
            </h3>
            <button
              onClick={onViewLibrary}
              className="text-xs font-semibold text-[#9AA3B5] hover:text-[#2B4C8F] dark:hover:text-[#6C95FF] transition-colors"
            >
              Show more
            </button>
          </div>

          {/* Horizontal Carousel */}
          <div className="flex gap-4 overflow-x-auto pb-3 pt-1 -mx-4 px-4 sm:mx-0 sm:px-0 no-scrollbar snap-x snap-mandatory">
            {displayCarousel.slice(0, 6).map((track) => (
              <div
                key={track.youtube_id || track.filename}
                onClick={() => onPlayTrack(track)}
                className="group relative w-40 sm:w-44 h-52 sm:h-56 rounded-3xl overflow-hidden shrink-0 cursor-pointer shadow-[0_8px_20px_rgba(35,55,110,0.08)] dark:shadow-[0_8px_20px_rgba(0,0,0,0.35)] border border-black/5 dark:border-white/10 snap-start transition-transform active:scale-[0.98]"
              >
                {/* Full-bleed Artwork */}
                {track.thumbnail_url ? (
                  <img
                    src={resolveMediaUrl(track.thumbnail_url)}
                    alt={track.clean_title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-slate-800 to-slate-900 text-3xl">
                    🎵
                  </div>
                )}

                {/* Subtle dark gradient overlay at bottom for legibility */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none" />

                {/* Frosted Glass Pill Overlay at Bottom (Exact Reference Style) */}
                <div className="absolute bottom-2.5 left-2.5 right-2.5 p-2 rounded-2xl bg-white/20 dark:bg-black/40 backdrop-blur-md border border-white/25 flex items-center justify-between gap-2 shadow-lg">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate drop-shadow-sm font-quicksand">
                      {track.clean_title}
                    </p>
                    <p className="text-[10px] text-white/80 truncate drop-shadow-sm">
                      {track.artist || "YouTube Music"}
                    </p>
                  </div>

                  {/* Circular Play Button */}
                  <div className="w-7 h-7 rounded-full bg-white/90 text-[#2B4C8F] flex items-center justify-center shadow-md shrink-0 group-hover:scale-110 transition-transform">
                    <svg className="w-3.5 h-3.5 ml-0.5 fill-current" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 4. Reference Switcher ("Recently / Popular / Similar") ─────────────── */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-6 border-b border-black/5 dark:border-white/5 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("recently")}
            className={`text-sm sm:text-base font-quicksand transition-all ${
              activeTab === "recently"
                ? "font-bold text-[#1A1F2C] dark:text-[#EAF0FF]"
                : "font-medium text-[#9AA3B5] hover:text-[#1A1F2C] dark:hover:text-[#EAF0FF]"
            }`}
          >
            Recently
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("popular")}
            className={`text-sm sm:text-base font-quicksand transition-all ${
              activeTab === "popular"
                ? "font-bold text-[#1A1F2C] dark:text-[#EAF0FF]"
                : "font-medium text-[#9AA3B5] hover:text-[#1A1F2C] dark:hover:text-[#EAF0FF]"
            }`}
          >
            Popular
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("liked")}
            className={`text-sm sm:text-base font-quicksand transition-all ${
              activeTab === "liked"
                ? "font-bold text-[#1A1F2C] dark:text-[#EAF0FF]"
                : "font-medium text-[#9AA3B5] hover:text-[#1A1F2C] dark:hover:text-[#EAF0FF]"
            }`}
          >
            Liked
          </button>
        </div>

        {/* Vertical Track List Rows (Matching Reference Screen 1) */}
        <div className="space-y-2">
          {tabTracks.length > 0 ? (
            tabTracks.map((track) => (
              <div
                key={track.youtube_id || track.filename}
                onClick={() => onPlayTrack(track)}
                className={`group flex items-center justify-between p-2.5 rounded-2xl transition-all cursor-pointer ${
                  isLight
                    ? "hover:bg-white hover:shadow-[0_4px_16px_rgba(35,55,110,0.06)]"
                    : "hover:bg-[#161C2E] hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Rounded-square squircle thumbnail */}
                  <div className="w-12 h-12 rounded-[18px] overflow-hidden bg-slate-800 shrink-0 shadow-sm border border-black/5 dark:border-white/10">
                    {track.thumbnail_url ? (
                      <img
                        src={resolveMediaUrl(track.thumbnail_url)}
                        alt={track.clean_title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-lg bg-slate-800 text-white">
                        🎵
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-[#1A1F2C] dark:text-[#EAF0FF] truncate group-hover:text-[#2B4C8F] dark:group-hover:text-[#6C95FF] transition-colors font-quicksand">
                      {track.clean_title}
                    </h4>
                    <p className="text-xs text-[#9AA3B5] truncate mt-0.5">
                      {track.artist || (track.size_bytes ? formatFileSize(track.size_bytes) : "YouTube Music")}
                    </p>
                  </div>
                </div>

                {/* Right controls: Like button + Kebab menu */}
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <LikeButton size="sm" track={track} />
                  <button
                    type="button"
                    onClick={() => onPlayTrack(track)}
                    className="p-2 text-[#9AA3B5] hover:text-[#1A1F2C] dark:hover:text-white rounded-full transition-colors"
                    title="Play track"
                  >
                    <svg className="w-4 h-4 fill-currentColor" viewBox="0 0 24 24">
                      <circle cx="5" cy="12" r="1.75" />
                      <circle cx="12" cy="12" r="1.75" />
                      <circle cx="19" cy="12" r="1.75" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-xs text-[#9AA3B5] space-y-1">
              <p>No tracks in this category yet.</p>
              <p>Paste a YouTube link or search above to play and download music!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
