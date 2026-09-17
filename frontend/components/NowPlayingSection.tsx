"use client";

import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import type { FileInfo } from "@/lib/types";
import { getFileByNameUrl, resolveMediaUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/websocket";
import { useTheme } from "../context/ThemeContext";

export interface NowPlayingSectionHandle {
  togglePlayPause: () => void;
  playNext: () => void;
  playPrev: () => void;
}

interface NowPlayingSectionProps {
  id: string;
  currentFile: FileInfo | null;
  allFiles: FileInfo[];
  playlist: FileInfo[];
  playlistName?: string;
  onSelectTrack: (file: FileInfo) => void;
  onPlayNext: () => void;
  onPlayPrev: () => void;
  onGoToHistory: () => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onControlsVisibilityChange?: (visible: boolean) => void;
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
      allFiles,
      playlist,
      playlistName,
      onSelectTrack,
      onPlayNext,
      onPlayPrev,
      onGoToHistory,
      onPlaybackStateChange,
      onControlsVisibilityChange,
    },
    ref
  ) {
    const { config } = useTheme();
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const controlsBarRef = useRef<HTMLDivElement>(null);
    // Ref to always hold the latest handlePlayNextInActivePlaylist without stale closures
    const playNextRef = useRef<() => void>(() => {});

    // Observe when the controls bar scrolls out of view to trigger floating mini player on mobile
    useEffect(() => {
      const target = controlsBarRef.current;
      if (!target || !onControlsVisibilityChange) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          // When controls bar is scrolled out of view, notify parent to show mini player
          const isVisible = entry.isIntersecting && entry.intersectionRatio >= 0.3;
          onControlsVisibilityChange(isVisible);
        },
        { threshold: [0, 0.3, 0.6, 1.0] }
      );

      observer.observe(target);
      return () => observer.disconnect();
    }, [onControlsVisibilityChange]);

    const [isPlaying, setIsPlaying] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isRepeat, setIsRepeat] = useState(false);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [showVolumeSlider, setShowVolumeSlider] = useState(false);




    const isVideo =
      currentFile?.media_type === "video" ||
      currentFile?.filename.toLowerCase().endsWith(".mp4") ||
      currentFile?.filename.toLowerCase().endsWith(".webm") ||
      currentFile?.filename.toLowerCase().endsWith(".mkv");

    // Sync playback when track changes
    useEffect(() => {
      setIsPlaying(true);
      setCurrentTime(0);
      setDuration(0);
      onPlaybackStateChange?.(true);
    }, [currentFile?.filename, onPlaybackStateChange]);

    // Listen for YouTube iframe postMessage "ended" event for preview tracks
    useEffect(() => {
      if (!currentFile?.is_preview) return;

      const handleYouTubeMessage = (event: MessageEvent) => {
        // YouTube sends JSON strings via postMessage
        try {
          const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
          // YouTube Player state: 0 = ended
          if (data?.event === "onStateChange" && data?.info === 0) {
            playNextRef.current();
          }
        } catch {
          // Not a YouTube message — ignore
        }
      };

      window.addEventListener("message", handleYouTubeMessage);
      return () => window.removeEventListener("message", handleYouTubeMessage);
    }, [currentFile?.is_preview, currentFile?.youtube_id]);


    const togglePlayPause = useCallback(() => {
      const el = isVideo ? videoRef.current : audioRef.current;
      if (!el) return;
      if (isPlaying) {
        el.pause();
        setIsPlaying(false);
        onPlaybackStateChange?.(false);
      } else {
        el.play().catch(() => {});
        setIsPlaying(true);
        onPlaybackStateChange?.(true);
      }
    }, [isPlaying, isVideo, onPlaybackStateChange]);

    // Expose handle to parent
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

    const handleVolumeChange = (newVal: number) => {
      setVolume(newVal);
      setIsMuted(newVal === 0);
      const el = isVideo ? videoRef.current : audioRef.current;
      if (el) el.volume = newVal;
    };

    // Dynamic touch & pointer dragging for vertical volume slider (works identical on PC and mobile)
    const volumeTrackRef = useRef<HTMLDivElement>(null);
    const isVolumeDraggingRef = useRef<boolean>(false);
    const lastVolumeTapRef = useRef<number>(0);

    const updateVolumeFromPointer = (clientY: number) => {
      if (!volumeTrackRef.current) return;
      const rect = volumeTrackRef.current.getBoundingClientRect();
      const height = rect.height;
      if (height <= 0) return;
      const deltaFromBottom = rect.bottom - clientY;
      const ratio = Math.max(0, Math.min(1, deltaFromBottom / height));
      handleVolumeChange(Math.round(ratio * 100) / 100);
    };

    const handleVolumePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      isVolumeDraggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      updateVolumeFromPointer(e.clientY);
    };

    const handleVolumePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isVolumeDraggingRef.current) return;
      e.preventDefault();
      updateVolumeFromPointer(e.clientY);
    };

    const handleVolumePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      isVolumeDraggingRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    };

    const handleVolumeButtonClick = () => {
      const now = Date.now();
      if (now - lastVolumeTapRef.current < 300) {
        // Double-tap or double-click toggles mute
        toggleMute();
        lastVolumeTapRef.current = 0;
      } else {
        lastVolumeTapRef.current = now;
        setShowVolumeSlider((prev) => !prev);
      }
    };

    // Close volume slider when clicked or touched outside
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent | TouchEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest("#volume-slider-container")) {
          setShowVolumeSlider(false);
        }
      };
      if (showVolumeSlider) {
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("touchstart", handleClickOutside, { passive: true });
      }
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("touchstart", handleClickOutside);
      };
    }, [showVolumeSlider]);

    const handleEnded = () => {
      if (isRepeat) {
        const el = isVideo ? videoRef.current : audioRef.current;
        if (el) {
          el.currentTime = 0;
          el.play().catch(() => {});
        }
      } else if (currentFile?.is_preview) {
        // When a YouTube preview ends, move to next in the downloaded playlist
        handlePlayNextInActivePlaylist();
      } else {
        handlePlayNextInActivePlaylist();
      }
    };

    // ── Playlist Cycling ───────────────────────────────────────────────────
    // Source: use passed playlist prop (active queue) or fallback to allFiles
    const sourceFiles = playlist && playlist.length > 0 ? playlist : allFiles;
    const currentPlaylistFiles: FileInfo[] = sourceFiles;

    const handlePlayNextInActivePlaylist = () => {
      if (!currentFile || currentPlaylistFiles.length === 0) {
        onPlayNext();
        return;
      }
      const idx = currentPlaylistFiles.findIndex((f) => f.filename === currentFile.filename);
      if (idx >= 0 && idx < currentPlaylistFiles.length - 1) {
        onSelectTrack(currentPlaylistFiles[idx + 1]);
      } else if (currentPlaylistFiles.length > 0) {
        onSelectTrack(currentPlaylistFiles[0]);
      }
    };
    // Always keep ref current so the YouTube postMessage listener uses the latest closure
    playNextRef.current = handlePlayNextInActivePlaylist;



    const handlePlayPrevInActivePlaylist = () => {
      if (!currentFile || currentPlaylistFiles.length === 0) {
        onPlayPrev();
        return;
      }
      const idx = currentPlaylistFiles.findIndex((f) => f.filename === currentFile.filename);
      if (idx > 0) {
        onSelectTrack(currentPlaylistFiles[idx - 1]);
      } else if (currentPlaylistFiles.length > 0) {
        onSelectTrack(currentPlaylistFiles[currentPlaylistFiles.length - 1]);
      }
    };

    const handleShuffle = () => {
      if (currentPlaylistFiles.length <= 1) return;
      const candidates = currentPlaylistFiles.filter((f) => f.filename !== currentFile?.filename);
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
            className="inline-flex items-center gap-2 px-6 py-3 text-white text-xs sm:text-sm font-semibold rounded-xl active:scale-95 transition-all"
            style={{
              background: `linear-gradient(135deg, ${config.primaryHex} 0%, ${config.secondaryHex} 100%)`,
              boxShadow: `0 8px 20px -4px ${config.glow}`,
            }}
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
      <div id={id} className="w-full space-y-4 animate-in fade-in duration-300">
        {/* ── PLAYLIST NAME HEADER ─── */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shrink-0 border border-white/10 shadow"
              style={{
                backgroundColor: `${config.primaryHex}20`,
                color: config.primaryHex,
              }}
            >
              🎵
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Playing From
              </span>
              <h2 className="text-sm sm:text-base font-bold text-white truncate leading-tight">
                {playlistName || "All Downloads"}
              </h2>
            </div>
          </div>

          <span
            className="text-[11px] font-mono font-medium px-2.5 py-1 rounded-full border shrink-0 transition-colors"
            style={{
              borderColor: `${config.primaryHex}35`,
              backgroundColor: `${config.primaryHex}15`,
              color: config.primaryHex,
            }}
          >
            {currentPlaylistFiles.length} {currentPlaylistFiles.length === 1 ? "song" : "songs"}
          </span>
        </div>

        {/* ── HERO MEDIA CARD (1:1.15 Modern Ratio, Lower Controls Only) ─── */}
        <div className="relative z-0 group">
          {/* Subtle ambient lighting behind hero equalized by theme */}
          <div
            className="absolute -inset-2 rounded-[32px] blur-2xl opacity-75 group-hover:opacity-100 transition-opacity"
            style={{ background: `radial-gradient(circle, ${config.glow} 0%, transparent 70%)` }}
          />

          <div className="relative w-full aspect-[1/1.1] sm:aspect-[4/3] rounded-3xl overflow-hidden bg-zinc-950 border border-white/10 shadow-2xl flex flex-col justify-end">
            {/* If YouTube Search Preview */}
            {currentFile.is_preview && currentFile.youtube_id ? (
              <div className="absolute inset-0 w-full h-full bg-black flex items-center justify-center select-auto">
                <iframe
                  key={currentFile.youtube_id}
                  src={`https://www.youtube-nocookie.com/embed/${currentFile.youtube_id}?autoplay=1&enablejsapi=1&playsinline=1`}
                  title={currentFile.clean_title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full border-0"
                />
              </div>
            ) : isVideo ? (
              /* Video Container - Strictly Display Only (No screen click conflicts) */
              <div className="absolute inset-0 w-full h-full bg-black flex items-center justify-center select-none">
                <video
                  ref={videoRef}
                  key={currentFile.filename}
                  src={mediaUrl}
                  playsInline
                  autoPlay
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={handleEnded}
                  onPlay={() => {
                    setIsPlaying(true);
                    onPlaybackStateChange?.(true);
                  }}
                  onPause={() => {
                    setIsPlaying(false);
                    onPlaybackStateChange?.(false);
                  }}
                  className="w-full h-full object-contain pointer-events-none"
                />
              </div>
            ) : (
              /* Music Artwork Container */
              <div className="absolute inset-0 w-full h-full overflow-hidden flex items-center justify-center bg-zinc-900 select-none">
                {/* Hidden Audio Element */}
                <audio
                  ref={audioRef}
                  key={currentFile.filename}
                  src={mediaUrl}
                  autoPlay
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={handleEnded}
                  onPlay={() => {
                    setIsPlaying(true);
                    onPlaybackStateChange?.(true);
                  }}
                  onPause={() => {
                    setIsPlaying(false);
                    onPlaybackStateChange?.(false);
                  }}
                />

                {currentFile.thumbnail_url ? (
                  <img
                    src={resolveMediaUrl(currentFile.thumbnail_url)}
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

            {/* Blended Dark Vignette with Full Song Name & Metadata */}
            <div className="relative z-10 p-5 sm:p-6 bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-16 pointer-events-none">
              <div className="flex items-center gap-2 pb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: config.primaryHex }}>
                  {currentFile.is_preview ? "YouTube Preview" : isVideo ? "Video Track" : "Audio Track"}
                </span>
                <span className="text-zinc-500">•</span>
                <span className="text-[10px] font-medium text-zinc-400">
                  {currentFile.size_bytes ? formatFileSize(currentFile.size_bytes) : "Online Stream"}
                </span>
              </div>

              <h1 className="text-base sm:text-xl font-bold text-white tracking-tight leading-snug drop-shadow line-clamp-2">
                {currentFile.clean_title}
              </h1>
            </div>
          </div>
        </div>

        {/* ── UNIFIED MINIMALIST CONTROLS BAR (For Both Audio & Video) ──── */}
        <div
          ref={controlsBarRef}
          id="now-playing-controls-bar"
          className="relative z-30 p-4 sm:p-5 rounded-3xl bg-zinc-900/60 backdrop-blur-xl border border-white/[0.08] shadow-xl space-y-4"
        >
          {/* Custom Pill Scrubber */}
          <div className="space-y-1.5">
            <div className="relative w-full flex items-center">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer transition-all"
                style={{
                  background: `linear-gradient(to right, ${config.primaryHex} ${progressPercent}%, rgba(255,255,255,0.1) ${progressPercent}%)`,
                  accentColor: config.primaryHex,
                }}
              />
            </div>

            <div className="flex justify-between text-[11px] font-mono text-zinc-400 px-0.5">
              <span>{formatDuration(currentTime)}</span>
              <span>{formatDuration(duration)}</span>
            </div>
          </div>

          {/* Minimalist Apple / Nothing Transport Controls */}
          <div className="flex items-center justify-between sm:justify-around px-2 pt-1 relative">
            {/* Repeat Toggle */}
            <button
              onClick={() => setIsRepeat(!isRepeat)}
              className={`p-2.5 rounded-full text-sm transition-all active:scale-95 ${
                isRepeat
                  ? "bg-white/10 border border-white/20 shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
              style={{ color: isRepeat ? config.primaryHex : undefined }}
              title={isRepeat ? "Repeat is ON" : "Repeat is OFF"}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            {/* Previous Track */}
            <button
              onClick={handlePlayPrevInActivePlaylist}
              disabled={currentPlaylistFiles.length <= 1}
              className="p-3 text-zinc-300 hover:text-white disabled:opacity-30 rounded-full hover:bg-white/5 active:scale-90 transition-all"
              title="Previous Track"
            >
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>

            {/* Center Circular Play/Pause (Exclusively controls video and music) */}
            <button
              onClick={togglePlayPause}
              className="w-16 h-16 rounded-full active:scale-95 text-white flex items-center justify-center shadow-xl border border-white/20 transition-all"
              style={{
                backgroundColor: config.primaryHex,
                boxShadow: `0 10px 30px -5px ${config.glow}`,
              }}
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
              onClick={handlePlayNextInActivePlaylist}
              disabled={currentPlaylistFiles.length <= 1}
              className="p-3 text-zinc-300 hover:text-white disabled:opacity-30 rounded-full hover:bg-white/5 active:scale-90 transition-all"
              title="Next Track"
            >
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>

            {/* Shuffle in Active Playlist (Unified in lower controls bar) */}
            <button
              onClick={handleShuffle}
              disabled={currentPlaylistFiles.length <= 1}
              className="p-2.5 text-zinc-400 hover:text-white disabled:opacity-30 rounded-full hover:bg-white/5 active:scale-90 transition-all"
              title="Shuffle in current playlist"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
              </svg>
            </button>

            {/* Dynamic Volume Control (Double-click/tap: Mute/Unmute, Click/Tap: Adjust vertical slider) */}
            <div id="volume-slider-container" className="relative z-40">
              <button
                onClick={handleVolumeButtonClick}
                onDoubleClick={toggleMute}
                className={`p-2.5 rounded-full transition-all active:scale-95 ${
                  showVolumeSlider
                    ? "bg-white/15 shadow-sm ring-1 ring-white/20"
                    : isMuted
                    ? "text-red-400 bg-red-500/15"
                    : "text-zinc-400 hover:text-white"
                }`}
                style={{
                  color: showVolumeSlider ? config.primaryHex : undefined,
                }}
                title="Double-click/tap to mute/unmute, click/tap to adjust volume"
              >
                {isMuted || volume === 0 ? (
                  <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                )}
              </button>

              {/* Vertical Popover Slider - Touch & Pointer Universal */}
              {showVolumeSlider && (
                <div
                  className="absolute bottom-14 right-0 z-50 bg-zinc-950/95 backdrop-blur-2xl border border-white/20 rounded-2xl p-3 shadow-2xl shadow-black flex flex-col items-center gap-2.5 animate-in fade-in zoom-in-95 duration-150 w-14 select-none"
                  style={{ touchAction: "none" }}
                >
                  <span className="text-[10px] font-mono font-bold text-zinc-300">
                    {isMuted ? "0%" : `${Math.round(volume * 100)}%`}
                  </span>

                  {/* Vertical Interactive Track */}
                  <div
                    ref={volumeTrackRef}
                    onPointerDown={handleVolumePointerDown}
                    onPointerMove={handleVolumePointerMove}
                    onPointerUp={handleVolumePointerUp}
                    onPointerCancel={handleVolumePointerUp}
                    className="relative w-8 h-28 flex items-center justify-center cursor-pointer py-1"
                    style={{ touchAction: "none" }}
                  >
                    {/* Groove */}
                    <div className="w-2.5 h-full bg-white/10 rounded-full overflow-hidden relative flex flex-col justify-end pointer-events-none">
                      {/* Active Volume Fill */}
                      <div
                        className="w-full rounded-full transition-all duration-75"
                        style={{
                          height: `${isMuted ? 0 : Math.round(volume * 100)}%`,
                          backgroundColor: config.primaryHex,
                          boxShadow: `0 0 8px ${config.glow}`,
                        }}
                      />
                    </div>

                    {/* Draggable Knob */}
                    <div
                      className="absolute left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white shadow-lg border border-white/40 pointer-events-none transition-all duration-75"
                      style={{
                        bottom: `calc(${isMuted ? 0 : Math.round(volume * 100)}% - 8px)`,
                      }}
                    />
                  </div>

                  <button
                    onClick={toggleMute}
                    className="text-[10px] font-bold text-zinc-400 hover:text-white transition-colors px-1 py-0.5 rounded hover:bg-white/10"
                  >
                    {isMuted ? "Unmute" : "Mute"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── PLAYLIST QUEUE / UP NEXT SONGS ──── */}
        {currentPlaylistFiles.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-300">
                  Playlist Queue
                </span>
              </div>
              <span className="text-xs text-zinc-400 font-mono">
                {Math.max(1, currentPlaylistFiles.findIndex((f) => f.filename === currentFile.filename) + 1)} of {currentPlaylistFiles.length}
              </span>
            </div>

            <div className="space-y-2 lg:max-h-[480px] lg:overflow-y-auto pr-1 custom-scrollbar">
              {currentPlaylistFiles.map((file, idx) => {
                const isCurrent = file.filename === currentFile.filename;
                return (
                  <div
                    key={`${file.filename}-${idx}`}
                    onClick={() => onSelectTrack(file)}
                    className={`group relative flex items-center gap-3 p-2.5 sm:p-3 rounded-2xl border transition-all cursor-pointer select-none ${
                      isCurrent
                        ? "shadow-lg"
                        : "bg-zinc-900/40 hover:bg-zinc-900/80 border-white/[0.06] hover:border-white/15"
                    }`}
                    style={
                      isCurrent
                        ? {
                            backgroundColor: `${config.primaryHex}18`,
                            borderColor: `${config.primaryHex}60`,
                            boxShadow: `0 4px 20px -2px ${config.glow}`,
                          }
                        : undefined
                    }
                  >
                    {/* Left active colored bar / status indicator */}
                    {isCurrent && (
                      <div
                        className="w-1 self-stretch rounded-full shrink-0"
                        style={{ backgroundColor: config.primaryHex }}
                      />
                    )}

                    {/* Track number or Playing equalizer/pulse */}
                    <div className="w-5 text-center shrink-0">
                      {isCurrent ? (
                        <div className="flex items-center justify-center">
                          <span className="flex h-2.5 w-2.5 relative">
                            <span
                              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                              style={{ backgroundColor: config.primaryHex }}
                            />
                            <span
                              className="relative inline-flex rounded-full h-2.5 w-2.5"
                              style={{ backgroundColor: config.primaryHex }}
                            />
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs font-mono text-zinc-500 group-hover:text-zinc-300">
                          {idx + 1}
                        </span>
                      )}
                    </div>

                    {/* Thumbnail */}
                    <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-xl overflow-hidden bg-zinc-950 shrink-0 border border-white/10 shadow">
                      {file.thumbnail_url ? (
                        <img
                          src={resolveMediaUrl(file.thumbnail_url)}
                          alt={file.clean_title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm bg-zinc-900">
                          {file.media_type === "video" ? "🎬" : "🎵"}
                        </div>
                      )}
                      {isCurrent && (
                        <div
                          className="absolute inset-0 flex items-center justify-center backdrop-blur-[1px]"
                          style={{ backgroundColor: `${config.primaryHex}25` }}
                        >
                          {isPlaying ? (
                            <svg className="w-4 h-4 text-white fill-current" viewBox="0 0 24 24">
                              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-white fill-current ml-0.5" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {isCurrent && (
                          <span
                            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded"
                            style={{
                              backgroundColor: `${config.primaryHex}25`,
                              color: config.primaryHex,
                            }}
                          >
                            Now Playing
                          </span>
                        )}
                      </div>
                      <h4
                        className={`text-xs sm:text-sm font-semibold truncate transition-colors ${
                          isCurrent ? "font-bold text-white" : "text-zinc-200 group-hover:text-white"
                        }`}
                        style={isCurrent ? { color: config.primaryHex } : undefined}
                      >
                        {file.clean_title}
                      </h4>
                      <p className="text-[11px] text-zinc-400">
                        {file.size_bytes ? formatFileSize(file.size_bytes) : "Online Stream"}
                      </p>
                    </div>

                    {/* Quick Play indicator */}
                    <div className="shrink-0 text-zinc-400 group-hover:text-white pr-1">
                      {isCurrent ? (
                        <span
                          className="text-xs font-bold"
                          style={{ color: config.primaryHex }}
                        >
                          ▶
                        </span>
                      ) : (
                        <span className="opacity-0 group-hover:opacity-100 text-xs transition-opacity">
                          ▶
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    );
  }
);
