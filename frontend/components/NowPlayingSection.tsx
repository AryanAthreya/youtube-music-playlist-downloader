"use client";

import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import type { FileInfo } from "@/lib/types";
import { getFileByNameUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/websocket";

export interface NowPlayingSectionHandle {
  togglePlayPause: () => void;
  playNext: () => void;
  playPrev: () => void;
}

interface NowPlayingSectionProps {
  id: string;
  currentFile: FileInfo | null;
  playlist: FileInfo[];
  onSelectTrack: (file: FileInfo) => void;
  onPlayNext: () => void;
  onPlayPrev: () => void;
  onGoToHistory: () => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
}

function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const NowPlayingSection = forwardRef<NowPlayingSectionHandle, NowPlayingSectionProps>(
  function NowPlayingSection(
    {
      id,
      currentFile,
      playlist,
      onSelectTrack,
      onPlayNext,
      onPlayPrev,
      onGoToHistory,
      onPlaybackStateChange,
    },
    ref
  ) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    const [isPlaying, setIsPlaying] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isRepeat, setIsRepeat] = useState(false);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [tapFeedback, setTapFeedback] = useState<"play" | "pause" | null>(null);

    const isVideo =
      currentFile?.media_type === "video" ||
      currentFile?.filename.toLowerCase().endsWith(".mp4") ||
      currentFile?.filename.toLowerCase().endsWith(".webm") ||
      currentFile?.filename.toLowerCase().endsWith(".mkv");

    // Sync isPlaying when track changes
    useEffect(() => {
      setIsPlaying(true);
      setCurrentTime(0);
      setDuration(0);
      onPlaybackStateChange?.(true);
    }, [currentFile?.filename, onPlaybackStateChange]);

    const togglePlayPause = useCallback(() => {
      const el = isVideo ? videoRef.current : audioRef.current;
      if (!el) return;
      if (isPlaying) {
        el.pause();
        setIsPlaying(false);
        onPlaybackStateChange?.(false);
        setTapFeedback("pause");
      } else {
        el.play().catch(() => {});
        setIsPlaying(true);
        onPlaybackStateChange?.(true);
        setTapFeedback("play");
      }
      setTimeout(() => setTapFeedback(null), 700);
    }, [isPlaying, isVideo, onPlaybackStateChange]);

    // Expose handle to parent (e.g. for mini-player control)
    useImperativeHandle(ref, () => ({
      togglePlayPause,
      playNext: onPlayNext,
      playPrev: onPlayPrev,
    }));

    const handleTimeUpdate = () => {
      const el = isVideo ? videoRef.current : audioRef.current;
      if (!el) return;
      setCurrentTime(el.currentTime);
      if (el.duration && !isNaN(el.duration)) {
        setDuration(el.duration);
      }
    };

    const handleLoadedMetadata = () => {
      const el = isVideo ? videoRef.current : audioRef.current;
      if (!el) return;
      if (el.duration && !isNaN(el.duration)) {
        setDuration(el.duration);
      }
      el.play().catch(() => {});
      setIsPlaying(true);
      onPlaybackStateChange?.(true);
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = parseFloat(e.target.value);
      setCurrentTime(time);
      const el = isVideo ? videoRef.current : audioRef.current;
      if (el) {
        el.currentTime = time;
      }
    };

    const toggleMute = () => {
      const el = isVideo ? videoRef.current : audioRef.current;
      if (!el) return;
      if (isMuted) {
        el.volume = volume || 0.8;
        setIsMuted(false);
      } else {
        el.volume = 0;
        setIsMuted(true);
      }
    };

    const handleEnded = () => {
      if (isRepeat) {
        const el = isVideo ? videoRef.current : audioRef.current;
        if (el) {
          el.currentTime = 0;
          el.play().catch(() => {});
        }
      } else {
        onPlayNext();
      }
    };

    const handleShuffle = () => {
      if (playlist.length <= 1) return;
      const candidates = playlist.filter((f) => f.filename !== currentFile?.filename);
      if (candidates.length > 0) {
        const randomIndex = Math.floor(Math.random() * candidates.length);
        onSelectTrack(candidates[randomIndex]);
      }
    };

    if (!currentFile) {
      return (
        <div id={id} className="glass-panel rounded-3xl p-8 sm:p-12 text-center space-y-6 animate-in fade-in-50 duration-300">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-red-600/15 border border-red-500/20 flex items-center justify-center text-3xl shadow-xl shadow-red-600/10">
            🎧
          </div>
          <div className="space-y-2 max-w-md mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Nothing Playing Right Now
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400">
              Select any song or video from your Downloads History to start listening or watching continuously.
            </p>
          </div>
          <button
            onClick={onGoToHistory}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 via-rose-600 to-indigo-600 hover:from-red-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-lg shadow-red-600/20 active:scale-95 transition-all"
          >
            <span>Browse Downloads History</span>
            <span className="text-lg">→</span>
          </button>
        </div>
      );
    }

    const mediaUrl = getFileByNameUrl(currentFile.filename, true);
    const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
      <div id={id} className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
        {/* ── TOP NAV / HEADER (Apple / Nothing Minimalist Header) ───────── */}
        <div className="flex items-center justify-between px-1 pb-1">
          <button
            onClick={onGoToHistory}
            className="flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-white transition-colors p-2 -ml-2 rounded-xl hover:bg-white/5 active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span>Library</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-300">
              {isVideo ? "Video Player" : "Now Playing"}
            </h2>
          </div>

          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-zinc-300 border border-white/10">
            {isVideo ? "🎬 VID" : "🎵 MP3"}
          </span>
        </div>

        {/* ── HERO MEDIA CARD (Pleasant 1:1.15 Square Ratio, Blended Typography) */}
        <div className="relative group">
          {/* Subtle ambient lighting behind hero */}
          <div className="absolute -inset-2 bg-gradient-to-tr from-red-600/20 via-indigo-600/15 to-transparent rounded-[32px] blur-2xl opacity-75 group-hover:opacity-100 transition-opacity" />

          <div className="relative w-full aspect-[1/1.1] sm:aspect-[4/3] rounded-3xl overflow-hidden bg-zinc-950 border border-white/10 shadow-2xl flex flex-col justify-end">
            {isVideo ? (
              /* Video Container */
              <div
                onClick={togglePlayPause}
                className="absolute inset-0 w-full h-full bg-black cursor-pointer flex items-center justify-center"
              >
                <video
                  ref={videoRef}
                  key={currentFile.filename}
                  src={mediaUrl}
                  playsInline
                  autoPlay
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={handleEnded}
                  className="w-full h-full object-contain"
                />

                {/* Tap Feedback Indicator */}
                {tapFeedback && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none animate-in fade-in zoom-in-75 duration-200">
                    <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white text-2xl shadow-xl">
                      {tapFeedback === "play" ? "▶" : "❚❚"}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Music Artwork Container */
              <div
                onClick={togglePlayPause}
                className="absolute inset-0 w-full h-full cursor-pointer overflow-hidden flex items-center justify-center bg-zinc-900"
              >
                {/* Hidden Audio Element */}
                <audio
                  ref={audioRef}
                  key={currentFile.filename}
                  src={mediaUrl}
                  autoPlay
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={handleEnded}
                />

                {currentFile.thumbnail_url ? (
                  <img
                    src={currentFile.thumbnail_url}
                    alt={currentFile.clean_title}
                    className={`w-full h-full object-cover transition-transform duration-700 ${
                      isPlaying ? "scale-105" : "scale-100 opacity-85"
                    }`}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-zinc-900 to-black text-6xl text-zinc-500">
                    🎵
                  </div>
                )}
              </div>
            )}

            {/* Blended Dark Vignette with Full Song Name & Metadata (Reference Image 2/3 style) */}
            <div className="relative z-10 p-5 sm:p-6 bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-16 pointer-events-none">
              <div className="flex items-center gap-2 pb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
                  {isVideo ? "Video Track" : "Audio Track"}
                </span>
                <span className="text-zinc-500">•</span>
                <span className="text-[10px] font-medium text-zinc-400">
                  {formatFileSize(currentFile.size_bytes)}
                </span>
              </div>

              <h1 className="text-base sm:text-xl font-bold text-white tracking-tight leading-snug drop-shadow line-clamp-2">
                {currentFile.clean_title}
              </h1>
            </div>

            {/* Floating Red Circular Action/Shuffle Button (Directly from Reference Image 2) */}
            <button
              onClick={handleShuffle}
              className="absolute bottom-5 right-5 z-20 w-12 h-12 rounded-full bg-red-600 hover:bg-red-500 active:scale-90 text-white flex items-center justify-center shadow-xl shadow-red-600/40 border border-white/20 transition-all cursor-pointer"
              title="Shuffle next track"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── UNIFIED MINIMALIST CONTROLS BAR (For Both Audio & Video) ──── */}
        <div className="p-4 sm:p-5 rounded-3xl bg-zinc-900/60 backdrop-blur-xl border border-white/[0.08] shadow-xl space-y-4">
          {/* Custom Pill Scrubber */}
          <div className="space-y-1.5">
            <div className="relative w-full flex items-center">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-red-500 hover:accent-red-400 transition-all"
                style={{
                  background: `linear-gradient(to right, #ef4444 ${progressPercent}%, rgba(255,255,255,0.1) ${progressPercent}%)`,
                }}
              />
            </div>

            <div className="flex justify-between text-[11px] font-mono text-zinc-400 px-0.5">
              <span>{formatDuration(currentTime)}</span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>

          {/* Minimalist Apple / Nothing Transport Controls */}
          <div className="flex items-center justify-between sm:justify-around px-2 pt-1">
            {/* Repeat Toggle */}
            <button
              onClick={() => setIsRepeat(!isRepeat)}
              className={`p-2.5 rounded-full text-sm transition-all active:scale-95 ${
                isRepeat
                  ? "text-red-400 bg-red-500/15 border border-red-500/30 shadow-sm shadow-red-500/20"
                  : "text-zinc-400 hover:text-white"
              }`}
              title={isRepeat ? "Repeat is ON" : "Repeat is OFF"}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            {/* Previous Track */}
            <button
              onClick={onPlayPrev}
              disabled={playlist.length <= 1}
              className="p-3 text-zinc-300 hover:text-white disabled:opacity-30 rounded-full hover:bg-white/5 active:scale-90 transition-all"
              title="Previous Track"
            >
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>

            {/* Center Circular Play/Pause (Red Coral Accent from Image 2) */}
            <button
              onClick={togglePlayPause}
              className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 text-white flex items-center justify-center shadow-xl shadow-red-600/35 border border-white/20 transition-all"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg className="w-7 h-7 ml-1 fill-current" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Next Track */}
            <button
              onClick={onPlayNext}
              disabled={playlist.length <= 1}
              className="p-3 text-zinc-300 hover:text-white disabled:opacity-30 rounded-full hover:bg-white/5 active:scale-90 transition-all"
              title="Next Track"
            >
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>

            {/* Volume Toggle */}
            <button
              onClick={toggleMute}
              className="p-2.5 text-zinc-400 hover:text-white rounded-full transition-colors active:scale-95"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted || volume === 0 ? (
                <svg className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* ── SLIDE-UP PLAYLIST SHEET (Reference Image 2 Style) ─────────── */}
        <div className="pt-2 space-y-3">
          {/* Section Header with track count */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Playlist & Queue
              </h3>
            </div>
            <span className="text-xs text-zinc-400 font-medium">
              {playlist.length} {playlist.length === 1 ? "track" : "tracks"} available
            </span>
          </div>

          {/* Minimalist Numbered Playlist Items (Image 2 style) */}
          <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
            {playlist.map((track, idx) => {
              const isActive = track.filename === currentFile.filename;
              return (
                <div
                  key={track.filename}
                  onClick={() => onSelectTrack(track)}
                  className={`group relative flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all ${
                    isActive
                      ? "bg-red-950/30 border border-red-500/30 shadow-md shadow-red-950/20"
                      : "bg-zinc-900/40 hover:bg-zinc-850/70 border border-transparent hover:border-white/[0.08]"
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Track Number / Playing indicator */}
                    <span className="w-5 text-center text-xs font-mono font-bold text-zinc-500 shrink-0">
                      {isActive ? (
                        <span className="text-red-400 animate-pulse">▶</span>
                      ) : (
                        `${idx + 1}.`
                      )}
                    </span>

                    {/* Circular / Rounded Avatar */}
                    <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-zinc-950 shrink-0 shadow border border-white/10">
                      {track.thumbnail_url ? (
                        <img
                          src={track.thumbnail_url}
                          alt={track.clean_title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm bg-zinc-900">
                          {track.media_type === "video" ? "🎬" : "🎵"}
                        </div>
                      )}
                    </div>

                    {/* Track Metadata */}
                    <div className="min-w-0 flex-1">
                      <h4
                        className={`text-xs sm:text-sm font-semibold truncate transition-colors ${
                          isActive ? "text-red-300 font-bold" : "text-zinc-200 group-hover:text-white"
                        }`}
                      >
                        {track.clean_title}
                      </h4>
                      <p className="text-[11px] text-zinc-400">
                        {track.media_type === "video" ? "🎬 Video" : "🎵 Audio"} • {formatFileSize(track.size_bytes)}
                      </p>
                    </div>
                  </div>

                  {/* Right side icon */}
                  <div className="flex items-center gap-2 pl-2">
                    {isActive ? (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                        Playing
                      </span>
                    ) : (
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg text-zinc-400 hover:text-white">
                        ▶
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
);
