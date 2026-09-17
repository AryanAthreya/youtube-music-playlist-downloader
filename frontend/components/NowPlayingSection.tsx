"use client";

import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import type { FileInfo } from "@/lib/types";
import { getFileByNameUrl, resolveMediaUrl } from "@/lib/api";
import { formatFileSize } from "@/lib/websocket";

export interface NowPlayingSectionHandle {
  togglePlayPause: () => void;
  playNext: () => void;
  playPrev: () => void;
}

interface CustomPlaylist {
  id: string;
  name: string;
  songFilenames: string[];
}

interface NowPlayingSectionProps {
  id: string;
  currentFile: FileInfo | null;
  allFiles: FileInfo[];
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

const LOCAL_STORAGE_PLAYLISTS_KEY = "ytdl_user_playlists_v1";

export const NowPlayingSection = forwardRef<NowPlayingSectionHandle, NowPlayingSectionProps>(
  function NowPlayingSection(
    {
      id,
      currentFile,
      allFiles,
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
    const [showVolumeSlider, setShowVolumeSlider] = useState(false);

    // Playlists state
    const [customPlaylists, setCustomPlaylists] = useState<CustomPlaylist[]>([]);
    const [activePlaylistTab, setActivePlaylistTab] = useState<string>("all");
    const [showNewPlaylistModal, setShowNewPlaylistModal] = useState(false);
    const [newPlaylistName, setNewPlaylistName] = useState("");
    const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<FileInfo | null>(null);

    // Load custom playlists from localStorage
    useEffect(() => {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_PLAYLISTS_KEY);
        if (stored) {
          setCustomPlaylists(JSON.parse(stored));
        }
      } catch (e) {
        console.warn("Failed to load custom playlists:", e);
      }
    }, []);

    // Save custom playlists to localStorage
    const saveCustomPlaylists = (updated: CustomPlaylist[]) => {
      setCustomPlaylists(updated);
      try {
        localStorage.setItem(LOCAL_STORAGE_PLAYLISTS_KEY, JSON.stringify(updated));
      } catch (e) {
        console.warn("Failed to save custom playlists:", e);
      }
    };

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

    // Close volume slider when clicked outside
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest("#volume-slider-container")) {
          setShowVolumeSlider(false);
        }
      };
      if (showVolumeSlider) {
        document.addEventListener("mousedown", handleClickOutside);
      }
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [showVolumeSlider]);

    const handleEnded = () => {
      if (isRepeat) {
        const el = isVideo ? videoRef.current : audioRef.current;
        if (el) {
          el.currentTime = 0;
          el.play().catch(() => {});
        }
      } else {
        handlePlayNextInActivePlaylist();
      }
    };

    // ── Playlist Filtering & Cycling ──────────────────────────────────────────
    // Base source of files: use allFiles if available, else playlist
    const sourceFiles = allFiles && allFiles.length > 0 ? allFiles : playlist;

    const currentPlaylistFiles: FileInfo[] = (() => {
      if (activePlaylistTab === "all") {
        return sourceFiles;
      }
      if (activePlaylistTab === "music") {
        return sourceFiles.filter(
          (f) => f.media_type === "audio" || !f.filename.toLowerCase().endsWith(".mp4")
        );
      }
      if (activePlaylistTab === "videos") {
        return sourceFiles.filter(
          (f) => f.media_type === "video" || f.filename.toLowerCase().endsWith(".mp4")
        );
      }
      // Custom playlist
      const cp = customPlaylists.find((p) => p.id === activePlaylistTab);
      if (cp) {
        return sourceFiles.filter((f) => cp.songFilenames.includes(f.filename));
      }
      return sourceFiles;
    })();

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

    // Create New Custom Playlist
    const handleCreatePlaylist = (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = newPlaylistName.trim();
      if (!trimmed) return;
      const newPlaylist: CustomPlaylist = {
        id: `pl-${Date.now()}`,
        name: trimmed,
        songFilenames: currentFile ? [currentFile.filename] : [],
      };
      const updated = [...customPlaylists, newPlaylist];
      saveCustomPlaylists(updated);
      setActivePlaylistTab(newPlaylist.id);
      setNewPlaylistName("");
      setShowNewPlaylistModal(false);
    };

    // Toggle track in a custom playlist (unique in that playlist)
    const toggleTrackInPlaylist = (playlistId: string, filename: string) => {
      const updated = customPlaylists.map((pl) => {
        if (pl.id !== playlistId) return pl;
        const exists = pl.songFilenames.includes(filename);
        return {
          ...pl,
          songFilenames: exists
            ? pl.songFilenames.filter((f) => f !== filename)
            : [...pl.songFilenames, filename],
        };
      });
      saveCustomPlaylists(updated);
    };

    // Delete custom playlist
    const handleDeletePlaylist = (playlistId: string) => {
      const updated = customPlaylists.filter((pl) => pl.id !== playlistId);
      saveCustomPlaylists(updated);
      if (activePlaylistTab === playlistId) {
        setActivePlaylistTab("all");
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
      <div id={id} className="w-full space-y-4 animate-in fade-in duration-300">
        {/* ── HERO MEDIA CARD (1:1.15 Modern Ratio, Lower Controls Only) ─── */}
        <div className="relative group">
          {/* Subtle ambient lighting behind hero */}
          <div className="absolute -inset-2 bg-gradient-to-tr from-red-600/20 via-indigo-600/15 to-transparent rounded-[32px] blur-2xl opacity-75 group-hover:opacity-100 transition-opacity" />

          <div className="relative w-full aspect-[1/1.1] sm:aspect-[4/3] rounded-3xl overflow-hidden bg-zinc-950 border border-white/10 shadow-2xl flex flex-col justify-end">
            {/* Media Type Badge on top right of the square (No wasted header row) */}
            <div className="absolute top-3.5 right-3.5 z-20 pointer-events-none">
              <span className="px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md text-white border border-white/20 text-[10px] font-mono font-bold tracking-wider flex items-center gap-1 shadow-lg shadow-black/50">
                <span>{isVideo ? "🎬" : "🎵"}</span>
                <span>{isVideo ? "VID" : "MP3"}</span>
              </span>
            </div>

            {isVideo ? (
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
          <div className="flex items-center justify-between sm:justify-around px-2 pt-1 relative">
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

            {/* Dynamic Volume Control (Double-click: Mute/Unmute, Click/Hold: Adjust vertical slider) */}
            <div id="volume-slider-container" className="relative">
              <button
                onClick={() => setShowVolumeSlider(!showVolumeSlider)}
                onDoubleClick={toggleMute}
                className={`p-2.5 rounded-full transition-colors active:scale-95 ${
                  showVolumeSlider
                    ? "text-red-400 bg-white/10"
                    : isMuted
                    ? "text-red-500 bg-red-500/10"
                    : "text-zinc-400 hover:text-white"
                }`}
                title="Double-click to mute/unmute, click/hold to adjust volume"
              >
                {isMuted || volume === 0 ? (
                  <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                )}
              </button>

              {/* Vertical Popover Slider */}
              {showVolumeSlider && (
                <div className="absolute bottom-14 right-0 z-50 bg-zinc-950/95 backdrop-blur-2xl border border-white/20 rounded-2xl p-3 shadow-2xl shadow-black flex flex-col items-center gap-3 animate-in fade-in zoom-in-95 duration-150 w-12">
                  <span className="text-[10px] font-mono font-bold text-zinc-300">
                    {isMuted ? "0%" : `${Math.round(volume * 100)}%`}
                  </span>

                  <div className="h-28 flex items-center justify-center">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={isMuted ? 0 : volume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="w-24 h-2 accent-red-500 cursor-pointer -rotate-90 origin-center bg-white/10 rounded-lg appearance-none"
                    />
                  </div>

                  <button
                    onClick={toggleMute}
                    className="text-[10px] font-bold text-zinc-400 hover:text-white"
                  >
                    {isMuted ? "Unmute" : "Mute"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── PLAYLISTS & QUEUE SECTION ─────────────────────────────────── */}
        <div className="pt-2 space-y-4">
          {/* Section Header */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Playlists & Queue
              </h3>
            </div>
            <button
              onClick={() => setShowNewPlaylistModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-xs font-semibold active:scale-95 transition-all"
            >
              <span>+ New Playlist</span>
            </button>
          </div>

          {/* Horizontal Playlist Selector Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {/* Fixed 1: All Downloads */}
            <button
              onClick={() => setActivePlaylistTab("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                activePlaylistTab === "all"
                  ? "bg-red-600 text-white shadow-md shadow-red-600/20"
                  : "bg-zinc-900 text-zinc-400 hover:text-white border border-white/5"
              }`}
            >
              📥 All Downloads ({sourceFiles.length})
            </button>

            {/* Fixed 2: Music Only */}
            <button
              onClick={() => setActivePlaylistTab("music")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                activePlaylistTab === "music"
                  ? "bg-red-600 text-white shadow-md shadow-red-600/20"
                  : "bg-zinc-900 text-zinc-400 hover:text-white border border-white/5"
              }`}
            >
              🎵 Music (
              {
                sourceFiles.filter(
                  (f) => f.media_type === "audio" || !f.filename.toLowerCase().endsWith(".mp4")
                ).length
              }
              )
            </button>

            {/* Fixed 3: Videos Only */}
            <button
              onClick={() => setActivePlaylistTab("videos")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                activePlaylistTab === "videos"
                  ? "bg-red-600 text-white shadow-md shadow-red-600/20"
                  : "bg-zinc-900 text-zinc-400 hover:text-white border border-white/5"
              }`}
            >
              🎬 Videos (
              {
                sourceFiles.filter(
                  (f) => f.media_type === "video" || f.filename.toLowerCase().endsWith(".mp4")
                ).length
              }
              )
            </button>

            {/* Custom User Playlists */}
            {customPlaylists.map((pl) => (
              <div key={pl.id} className="relative flex items-center shrink-0 group">
                <button
                  onClick={() => setActivePlaylistTab(pl.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    activePlaylistTab === pl.id
                      ? "bg-red-600 text-white shadow-md shadow-red-600/20"
                      : "bg-zinc-900 text-zinc-400 hover:text-white border border-white/5"
                  }`}
                >
                  🌟 {pl.name} ({pl.songFilenames.length})
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete playlist "${pl.name}"?`)) {
                      handleDeletePlaylist(pl.id);
                    }
                  }}
                  className="ml-1 text-zinc-500 hover:text-red-400 text-xs p-1 rounded"
                  title="Delete playlist"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Numbered Playlist Items (Image 2 style) */}
          <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
            {currentPlaylistFiles.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-zinc-900/30 border border-white/5 space-y-2">
                <p className="text-sm text-zinc-400">No tracks in this playlist yet.</p>
                <p className="text-xs text-zinc-500">
                  Add tracks from "All Downloads" using the "+ Playlist" button.
                </p>
              </div>
            ) : (
              currentPlaylistFiles.map((track, idx) => {
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

                      {/* Rounded Thumbnail Avatar */}
                      <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-zinc-950 shrink-0 shadow border border-white/10">
                        {track.thumbnail_url ? (
                          <img
                            src={resolveMediaUrl(track.thumbnail_url)}
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

                    {/* Right side actions */}
                    <div className="flex items-center gap-1.5 pl-2" onClick={(e) => e.stopPropagation()}>
                      {/* Add to Playlist button */}
                      <button
                        onClick={() => setAddToPlaylistTrack(track)}
                        className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                        title="Add to playlist"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                      </button>

                      {isActive ? (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                          Playing
                        </span>
                      ) : (
                        <button
                          onClick={() => onSelectTrack(track)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg text-zinc-400 hover:text-white"
                        >
                          ▶
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── MODAL: Create New Playlist ────────────────────────────────── */}
        {showNewPlaylistModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowNewPlaylistModal(false);
            }}
          >
            <div className="w-full max-w-sm bg-zinc-900 border border-white/15 rounded-3xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">Create New Playlist</h3>
                <button
                  onClick={() => setShowNewPlaylistModal(false)}
                  className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreatePlaylist} className="space-y-4">
                <input
                  type="text"
                  placeholder="e.g. Chill Vibes, Workout, Rap"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 text-sm"
                />

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowNewPlaylistModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-600/30 active:scale-95 transition-all"
                  >
                    Create
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── MODAL: Add Track to Custom Playlist ───────────────────────── */}
        {addToPlaylistTrack && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
            onClick={(e) => {
              if (e.target === e.currentTarget) setAddToPlaylistTrack(null);
            }}
          >
            <div className="w-full max-w-sm bg-zinc-900 border border-white/15 rounded-3xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0 pr-2">
                  <h3 className="text-sm font-bold text-white truncate">Add to Playlist</h3>
                  <p className="text-xs text-zinc-400 truncate">{addToPlaylistTrack.clean_title}</p>
                </div>
                <button
                  onClick={() => setAddToPlaylistTrack(null)}
                  className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white shrink-0"
                >
                  ✕
                </button>
              </div>

              {customPlaylists.length === 0 ? (
                <div className="p-4 rounded-xl bg-zinc-950 border border-white/5 text-center space-y-3">
                  <p className="text-xs text-zinc-400">No custom playlists created yet.</p>
                  <button
                    onClick={() => {
                      setAddToPlaylistTrack(null);
                      setShowNewPlaylistModal(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-bold"
                  >
                    + Create a Playlist First
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {customPlaylists.map((pl) => {
                    const isInPlaylist = pl.songFilenames.includes(addToPlaylistTrack.filename);
                    return (
                      <button
                        key={pl.id}
                        onClick={() => toggleTrackInPlaylist(pl.id, addToPlaylistTrack.filename)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-left text-xs font-semibold transition-all ${
                          isInPlaylist
                            ? "bg-red-950/40 border-red-500/40 text-red-300"
                            : "bg-zinc-950/60 border-white/5 text-zinc-300 hover:bg-zinc-800"
                        }`}
                      >
                        <span>🌟 {pl.name}</span>
                        <span>{isInPlaylist ? "✓ In Playlist" : "+ Add"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
);
