"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { FileInfo } from "@/lib/types";
import { getFileByNameUrl } from "@/lib/api";

interface NowPlayingSectionProps {
  id: string;
  currentFile: FileInfo | null;
  playlist: FileInfo[];
  onSelectTrack: (file: FileInfo) => void;
  onPlayNext: () => void;
  onPlayPrev: () => void;
  onGoToHistory: () => void;
}

function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function NowPlayingSection({
  id,
  currentFile,
  playlist,
  onSelectTrack,
  onPlayNext,
  onPlayPrev,
  onGoToHistory,
}: NowPlayingSectionProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isRepeat, setIsRepeat] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const isVideo = currentFile?.media_type === "video" || currentFile?.filename.toLowerCase().endsWith(".mp4");

  // Sync isPlaying when track changes
  useEffect(() => {
    setIsPlaying(true);
    setCurrentTime(0);
    setDuration(0);
  }, [currentFile?.filename]);

  const togglePlayPause = useCallback(() => {
    const el = isVideo ? videoRef.current : audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      el.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isPlaying, isVideo]);

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
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    const el = isVideo ? videoRef.current : audioRef.current;
    if (el) {
      el.currentTime = time;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    const el = isVideo ? videoRef.current : audioRef.current;
    if (el) {
      el.volume = val;
    }
  };

  const toggleMute = () => {
    const el = isVideo ? videoRef.current : audioRef.current;
    if (!el) return;
    if (isMuted) {
      el.volume = volume || 0.5;
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

  if (!currentFile) {
    return (
      <div id={id} className="glass-panel rounded-3xl p-8 sm:p-12 text-center space-y-6 animate-in fade-in-50 duration-300">
        <div className="w-24 h-24 mx-auto rounded-3xl bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center text-4xl shadow-xl shadow-indigo-600/10">
          🎧
        </div>
        <div className="space-y-2 max-w-md mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Nothing Playing Right Now
          </h2>
          <p className="text-xs sm:text-sm text-gray-400">
            Select any song or video from your Downloads History to start listening or watching continuously.
          </p>
        </div>
        <button
          onClick={onGoToHistory}
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 via-rose-600 to-indigo-600 hover:from-red-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-red-600/20 active:scale-95 transition-all"
        >
          <span>Browse Downloads History</span>
          <span className="text-lg">→</span>
        </button>
      </div>
    );
  }

  const mediaUrl = getFileByNameUrl(currentFile.filename, true);

  return (
    <div id={id} className="space-y-6 animate-in fade-in-50 duration-300">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-white/[0.08]">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
            {isVideo ? "🎬 Now Watching" : "🎵 Now Playing"}
          </span>
          <h2 className="text-sm font-semibold text-gray-300 truncate max-w-xs sm:max-w-md">
            {currentFile.clean_title}
          </h2>
        </div>

        <button
          onClick={onGoToHistory}
          className="self-start sm:self-auto text-xs font-medium text-gray-400 hover:text-white glass-card px-3 py-1.5 rounded-lg hover:border-white/20 transition-all flex items-center gap-1.5"
        >
          <span>← Back to Library</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main Stage (Player) */}
        <div className="lg:col-span-2 glass-panel rounded-3xl overflow-hidden border border-white/15 p-4 sm:p-6 shadow-2xl flex flex-col justify-between space-y-6">
          {isVideo ? (
            /* Video Player */
            <div className="relative aspect-video w-full bg-black/95 rounded-2xl overflow-hidden shadow-inner flex items-center justify-center border border-white/10">
              <video
                ref={videoRef}
                key={currentFile.filename}
                src={mediaUrl}
                controls
                autoPlay
                playsInline
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleEnded}
                className="w-full h-full object-contain"
              >
                Your browser does not support HTML5 video.
              </video>
            </div>
          ) : (
            /* Audio Music Player Stage */
            <div className="flex flex-col items-center justify-center py-6 sm:py-10 space-y-6 text-center">
              {/* Hidden HTML audio element */}
              <audio
                ref={audioRef}
                key={currentFile.filename}
                src={mediaUrl}
                autoPlay
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleEnded}
              />

              {/* Artwork Container with Ambient Glow */}
              <div className="relative group">
                {/* Glow backdrop */}
                <div className="absolute -inset-4 bg-gradient-to-r from-red-600/30 via-indigo-600/30 to-purple-600/30 rounded-3xl blur-2xl opacity-60 group-hover:opacity-100 transition-opacity" />

                <div className="relative w-48 h-48 sm:w-60 sm:h-60 rounded-3xl overflow-hidden border-2 border-white/20 shadow-2xl bg-slate-900 flex items-center justify-center">
                  {currentFile.thumbnail_url ? (
                    <img
                      src={currentFile.thumbnail_url}
                      alt={currentFile.clean_title}
                      className={`w-full h-full object-cover transition-transform duration-500 ${
                        isPlaying ? "scale-105" : "scale-100 opacity-90"
                      }`}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-indigo-950 to-slate-900 text-5xl">
                      🎵
                    </div>
                  )}

                  {/* Audio badge */}
                  <span className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/80 backdrop-blur-md text-white border border-white/20 flex items-center gap-1">
                    <span>🎵</span>
                    <span>MP3 Audio</span>
                  </span>
                </div>
              </div>

              {/* Title & Metadata */}
              <div className="space-y-1.5 max-w-lg px-4">
                <h3 className="text-base sm:text-xl font-bold text-white tracking-tight line-clamp-2">
                  {currentFile.clean_title}
                </h3>
                <p className="text-xs text-indigo-300 font-medium">
                  Downloaded Music Track • Offline Ready
                </p>
              </div>

              {/* Custom Music Controls & Scrubber */}
              <div className="w-full max-w-md space-y-3 pt-2">
                {/* Timeline Bar */}
                <div className="space-y-1">
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
                  />
                  <div className="flex justify-between text-[11px] font-mono text-gray-400">
                    <span>{formatDuration(currentTime)}</span>
                    <span>{formatDuration(duration)}</span>
                  </div>
                </div>

                {/* Playback Buttons */}
                <div className="flex items-center justify-center gap-5 sm:gap-6 pt-1">
                  {/* Repeat */}
                  <button
                    onClick={() => setIsRepeat(!isRepeat)}
                    className={`p-2 rounded-lg text-xs transition-colors ${
                      isRepeat ? "text-indigo-400 bg-indigo-500/20" : "text-gray-400 hover:text-white"
                    }`}
                    title={isRepeat ? "Repeat active" : "Repeat off"}
                  >
                    🔁
                  </button>

                  {/* Previous */}
                  <button
                    onClick={onPlayPrev}
                    disabled={playlist.length <= 1}
                    className="p-2.5 text-gray-300 hover:text-white disabled:opacity-30 rounded-full hover:bg-white/10 active:scale-95 transition-all"
                    title="Previous track"
                  >
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
                    </svg>
                  </button>

                  {/* Main Play / Pause */}
                  <button
                    onClick={togglePlayPause}
                    className="w-14 h-14 rounded-full bg-gradient-to-r from-red-600 to-indigo-600 hover:from-red-500 hover:to-indigo-500 text-white flex items-center justify-center shadow-xl shadow-red-600/30 active:scale-95 transition-all"
                    title={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? (
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>

                  {/* Next */}
                  <button
                    onClick={onPlayNext}
                    disabled={playlist.length <= 1}
                    className="p-2.5 text-gray-300 hover:text-white disabled:opacity-30 rounded-full hover:bg-white/10 active:scale-95 transition-all"
                    title="Next track"
                  >
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
                    </svg>
                  </button>

                  {/* Volume Toggle */}
                  <button
                    onClick={toggleMute}
                    className="p-2 text-gray-400 hover:text-white rounded-lg text-xs transition-colors"
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted || volume === 0 ? "🔇" : volume > 0.5 ? "🔊" : "🔉"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Quick Details Bar */}
          <div className="flex items-center justify-between pt-4 border-t border-white/[0.08] text-xs text-gray-400">
            <div className="flex items-center gap-2 truncate pr-2">
              <span className="font-semibold text-white truncate">{currentFile.clean_title}</span>
            </div>
            <a
              href={getFileByNameUrl(currentFile.filename)}
              download={currentFile.filename}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition-all font-medium text-xs shrink-0"
              title="Save to computer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Download File</span>
            </a>
          </div>
        </div>

        {/* Playlist Queue Sidebar */}
        <div className="glass-panel rounded-3xl border border-white/15 p-4 sm:p-5 space-y-3.5 flex flex-col h-[480px]">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Queue / Playlist</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-gray-300 font-mono">
                {playlist.length}
              </span>
            </h3>
            <span className="text-[10px] text-gray-400">Click to switch</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {playlist.map((item, idx) => {
              const isActive = item.filename === currentFile.filename;
              const itemIsVideo = item.media_type === "video" || item.filename.toLowerCase().endsWith(".mp4");

              return (
                <div
                  key={item.filename}
                  onClick={() => onSelectTrack(item)}
                  className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all duration-200 border ${
                    isActive
                      ? "bg-indigo-600/25 border-indigo-500/50 shadow-md shadow-indigo-600/10"
                      : "bg-white/[0.02] hover:bg-white/[0.06] border-white/5"
                  }`}
                >
                  {/* Thumbnail / Symbol */}
                  <div className="relative w-12 h-12 rounded-lg bg-slate-950 overflow-hidden shrink-0 border border-white/10 flex items-center justify-center">
                    {item.thumbnail_url ? (
                      <img
                        src={item.thumbnail_url}
                        alt={item.clean_title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-lg">{itemIsVideo ? "🎬" : "🎵"}</span>
                    )}

                    {/* Small symbol badge */}
                    <span className="absolute bottom-0.5 right-0.5 bg-black/85 text-[9px] px-1 rounded">
                      {itemIsVideo ? "🎬" : "🎵"}
                    </span>
                  </div>

                  {/* Title & Index */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isActive && (
                        <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                      )}
                      <p className={`text-xs font-medium truncate ${isActive ? "text-indigo-200 font-bold" : "text-gray-200"}`}>
                        {item.clean_title}
                      </p>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                      <span>#{idx + 1}</span>
                      <span>•</span>
                      <span>{itemIsVideo ? "Video" : "Audio"}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
