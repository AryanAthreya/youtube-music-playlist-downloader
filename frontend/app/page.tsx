"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { UrlInputForm } from "@/components/UrlInputForm";
import { VideoInfoCard } from "@/components/VideoInfoCard";
import { PlaylistVideoList } from "@/components/PlaylistVideoList";
import { ProgressBar } from "@/components/ProgressBar";
import { ErrorBanner } from "@/components/ErrorBanner";
import { FileList } from "@/components/FileList";
import { SearchResults } from "@/components/SearchResults";
import { NowPlayingSection, type NowPlayingSectionHandle } from "@/components/NowPlayingSection";
import { BottomNavBar } from "@/components/BottomNavBar";
import { DownloadCompleteNotification } from "@/components/DownloadCompleteNotification";
import { RecentAndActiveSection } from "@/components/RecentAndActiveSection";
import { MiniPlayerBar } from "@/components/MiniPlayerBar";
import { PlaylistsSection } from "@/components/PlaylistsSection";
import { ThemeSelectorModal } from "@/components/ThemeSelectorModal";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { fetchInfo, searchYouTube, createDownload, deleteJob, getFileUrl, getFiles } from "@/lib/api";
import { createJobWebSocket } from "@/lib/websocket";
import type {
  InfoResponse,
  VideoInfoResponse,
  PlaylistInfoResponse,
  DownloadRequest,
  WebSocketFrame,
  SearchResultItem,
  FileInfo,
} from "@/lib/types";

type AppState =
  | { phase: "idle" }
  | { phase: "fetching" }
  | { phase: "searching"; query: string }
  | { phase: "search_results"; query: string; results: SearchResultItem[] }
  | { phase: "info"; data: InfoResponse; selectedVideoIds: string[] }
  | { phase: "downloading"; jobId: string; latestFrame: WebSocketFrame | null }
  | { phase: "done"; jobId: string; frame: WebSocketFrame }
  | { phase: "error"; message: string; code: string };

function HomePageContent() {
  const { config } = useTheme();
  const [activeTab, setActiveTab] = useState<"downloader" | "history" | "playlists" | "player">("downloader");
  const [state, setState] = useState<AppState>({ phase: "idle" });
  const [wsHandle, setWsHandle] = useState<{ close: () => void } | null>(null);
  const [historyCount, setHistoryCount] = useState<number>(0);
  const [recentFiles, setRecentFiles] = useState<FileInfo[]>([]);
  const [allDownloadedFiles, setAllDownloadedFiles] = useState<FileInfo[]>([]);
  const [currentPlayingFile, setCurrentPlayingFile] = useState<FileInfo | null>(null);
  const [playerQueue, setPlayerQueue] = useState<FileInfo[]>([]);
  const [isPlayerPlaying, setIsPlayerPlaying] = useState<boolean>(true);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState<boolean>(false);
  const playerHandleRef = useRef<NowPlayingSectionHandle | null>(null);
  const [downloadNotification, setDownloadNotification] = useState<{
    jobId: string;
    frame: WebSocketFrame;
  } | null>(null);
  const autoDownloadedJobRef = useRef<string | null>(null);

  // Fetch all and recent files and update count
  const refreshFiles = useCallback(() => {
    getFiles()
      .then((res) => {
        setHistoryCount(res.files.length);
        setRecentFiles(res.files);
        setAllDownloadedFiles(res.files);
        setCurrentPlayingFile((curr) => {
          if (!curr && res.files.length > 0) {
            setPlayerQueue(res.files);
            return res.files[0];
          }
          return curr;
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshFiles();
  }, [refreshFiles]);

  // Touch Swipe Handling for Mobile (< md)
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartX.current || !touchStartY.current) return;
    const diffX = touchStartX.current - e.changedTouches[0].clientX;
    const diffY = touchStartY.current - e.changedTouches[0].clientY;

    // Minimum swipe threshold 60px, mostly horizontal
    if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
      if (diffX > 0) {
        // Swipe left -> Next tab
        if (activeTab === "downloader") setActiveTab("history");
        else if (activeTab === "history") setActiveTab("playlists");
        else if (activeTab === "playlists") setActiveTab("player");
      } else {
        // Swipe right -> Prev tab
        if (activeTab === "player") setActiveTab("playlists");
        else if (activeTab === "playlists") setActiveTab("history");
        else if (activeTab === "history") setActiveTab("downloader");
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handlePlayTrack = (file: FileInfo, queue?: FileInfo[]) => {
    if (queue && queue.length > 0) {
      setPlayerQueue(queue);
    }
    setCurrentPlayingFile(file);
    setIsPlayerPlaying(true);
  };

  const handlePlayYouTubePreview = useCallback((item: SearchResultItem) => {
    const previewTrack: FileInfo = {
      filename: `${item.video_id}.mp4`,
      clean_title: item.title,
      media_type: "video",
      thumbnail_url: item.thumbnail,
      size_bytes: 0,
      created_at: new Date().toISOString(),
      modified_at: new Date().toISOString(),
      download_url: "",
      is_preview: true,
      youtube_id: item.video_id,
    };
    setCurrentPlayingFile(previewTrack);
    setIsPlayerPlaying(true);
  }, []);

  const handlePlayNext = () => {
    const queue = playerQueue.length > 0 ? playerQueue : allDownloadedFiles;
    if (queue.length === 0 || !currentPlayingFile) return;
    const idx = queue.findIndex((f) => f.filename === currentPlayingFile.filename);
    if (idx !== -1 && idx < queue.length - 1) {
      setCurrentPlayingFile(queue[idx + 1]);
    } else {
      setCurrentPlayingFile(queue[0]);
    }
  };

  const handlePlayPrev = () => {
    const queue = playerQueue.length > 0 ? playerQueue : allDownloadedFiles;
    if (queue.length === 0 || !currentPlayingFile) return;
    const idx = queue.findIndex((f) => f.filename === currentPlayingFile.filename);
    if (idx > 0) {
      setCurrentPlayingFile(queue[idx - 1]);
    } else {
      setCurrentPlayingFile(queue[queue.length - 1]);
    }
  };

  const handleFetchOrSearch = useCallback(async (input: string, isSearch: boolean) => {
    wsHandle?.close();
    setWsHandle(null);

    if (isSearch) {
      setState({ phase: "searching", query: input });
      try {
        const data = await searchYouTube(input);
        setState({ phase: "search_results", query: input, results: data.results });
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        setState({
          phase: "error",
          message: e.message ?? "Search failed. Please try again.",
          code: e.code ?? "SEARCH_FAILED",
        });
      }
    } else {
      setState({ phase: "fetching" });
      try {
        const data = await fetchInfo(input);
        const selectedVideoIds =
          data.type === "playlist"
            ? (data as PlaylistInfoResponse).videos.map((v) => v.video_id)
            : [];
        setState({ phase: "info", data, selectedVideoIds });
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        setState({
          phase: "error",
          message: e.message ?? "Failed to fetch media info.",
          code: e.code ?? "FETCH_FAILED",
        });
      }
    }
  }, [wsHandle]);

  const handleVideoSelection = useCallback((selectedVideoIds: string[]) => {
    setState((prev) => {
      if (prev.phase !== "info") return prev;
      return { ...prev, selectedVideoIds };
    });
  }, []);

  const handleDownload = useCallback(
    async (request: Omit<DownloadRequest, "playlist_video_ids">) => {
      if (state.phase !== "info") return;

      const isPlaylist = state.data.type === "playlist";
      const fullRequest: DownloadRequest = {
        ...request,
        playlist_video_ids: isPlaylist ? state.selectedVideoIds : null,
      };

      try {
        const { job_id } = await createDownload(fullRequest);

        setState({
          phase: "downloading",
          jobId: job_id,
          latestFrame: null,
        });

        const handle = createJobWebSocket(
          job_id,
          (frame) => {
            setState((prev) => {
              if (prev.phase !== "downloading") return prev;
              return { ...prev, latestFrame: frame };
            });
          },
          (frame) => {
            setDownloadNotification({ jobId: job_id, frame });
            setState({ phase: "idle" });
            setWsHandle(null);
            refreshFiles();
          },
          (errMsg) => {
            console.warn("WS error:", errMsg);
          },
        );

        setWsHandle(handle);
      } catch (err: unknown) {
        const e = err as { code?: string; message?: string };
        setState({
          phase: "error",
          message: e.message ?? "Failed to start download.",
          code: e.code ?? "UNKNOWN_ERROR",
        });
      }
    },
    [state, refreshFiles],
  );

  const handleCancel = useCallback(async () => {
    if (state.phase !== "downloading") return;
    wsHandle?.close();
    setWsHandle(null);
    try {
      await deleteJob(state.jobId);
    } catch {}
    setState({ phase: "idle" });
  }, [state, wsHandle]);

  const handleReset = useCallback(() => {
    wsHandle?.close();
    setWsHandle(null);
    setState({ phase: "idle" });
  }, [wsHandle]);

  return (
    <main
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col justify-between ${
        currentPlayingFile && activeTab !== "player" ? "pb-32 md:pb-6" : "pb-20 md:pb-0"
      } select-none md:select-auto`}
    >
      {/* Background ambient lighting equalized by theme */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[750px] h-[400px] blur-3xl opacity-60 transition-all duration-700"
          style={{ background: `radial-gradient(ellipse at center, ${config.glow} 0%, transparent 70%)` }}
        />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl" />
        <div className="absolute top-2/3 -left-40 w-96 h-96 bg-red-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 flex-1">
        {/* Top Header */}
        <header className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 mb-6 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-2xl bg-gradient-to-tr ${config.gradient} flex items-center justify-center shadow-lg shrink-0`}
              style={{ boxShadow: `0 8px 20px -4px ${config.glow}` }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-white">
                <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                <span>YT Downloader</span>
                <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-white/10 text-zinc-300 border border-white/20">
                  Pro
                </span>
              </h1>
              <p className="text-xs text-gray-400">Direct yt-dlp & FFmpeg Local Engine</p>
            </div>
          </div>

          {/* Navigation Tabs (Hidden on mobile) */}
          <div className="hidden sm:flex items-center gap-1.5 p-1 rounded-2xl bg-slate-900/90 border border-white/10 glass-card">
            <button
              onClick={() => setActiveTab("downloader")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeTab === "downloader" || activeTab === "player"
                  ? `bg-gradient-to-r ${config.gradient} text-white shadow-md`
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Downloader</span>
            </button>

            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeTab === "history"
                  ? `bg-gradient-to-r ${config.gradient} text-white shadow-md`
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span>Downloads History</span>
              {historyCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-white/20 text-white">
                  {historyCount}
                </span>
              )}
            </button>

            {/* Playlists Tab */}
            <button
              onClick={() => setActiveTab("playlists")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeTab === "playlists"
                  ? `bg-gradient-to-r ${config.gradient} text-white shadow-md`
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <span>Playlists</span>
            </button>

            {/* Theme Equalizer Button */}
            <button
              onClick={() => setIsThemeModalOpen(true)}
              className="p-2 text-zinc-300 hover:text-white rounded-xl hover:bg-white/10 transition-colors ml-1 border border-white/10"
              title="Theme Color Equalizer"
            >
              <span className="text-sm">{config.emoji}</span>
            </button>
          </div>
        </header>

        {/* Split View Container on PC (lg:) / Single Active Tab View on Mobile */}
        <div className="flex flex-col lg:flex-row gap-8 items-start w-full">
          {/* LEFT COLUMN: Downloader, Downloads History, or Playlists (hidden on mobile when in player tab) */}
          <div className={`flex-1 min-w-0 w-full ${activeTab === "player" ? "hidden lg:block" : "block"}`}>
            {activeTab === "history" ? (
              <div className="space-y-6">
                <FileList
                  id="library-files-list"
                  onCountChange={setHistoryCount}
                  onPlayTrack={handlePlayTrack}
                />
              </div>
            ) : activeTab === "playlists" ? (
              <div className="space-y-6">
                <PlaylistsSection
                  id="playlists-section"
                  allFiles={allDownloadedFiles}
                  currentPlayingFile={currentPlayingFile}
                  onPlayPlaylist={(tracks, startIdx = 0) => {
                    if (tracks.length > 0) {
                      setPlayerQueue(tracks);
                      setCurrentPlayingFile(tracks[startIdx] || tracks[0]);
                      setIsPlayerPlaying(true);
                    }
                  }}
                  onSelectTrack={(track, queue) => {
                    setPlayerQueue(queue);
                    setCurrentPlayingFile(track);
                    setIsPlayerPlaying(true);
                  }}
                />
              </div>
            ) : (
              <div className="space-y-8">
                {/* Error Banner */}
                {state.phase === "error" && (
                  <ErrorBanner
                    id="main-error-banner"
                    message={state.message}
                    code={state.code}
                    onDismiss={handleReset}
                  />
                )}

                {/* URL Input / Search Form */}
                {(state.phase === "idle" || state.phase === "error") && (
                  <div className="space-y-4">
                    <div className="text-center sm:text-left space-y-1">
                      <h2 className="text-lg sm:text-xl font-bold text-white">
                        Paste Link or Search Any Song/Video
                      </h2>
                      <p className="text-xs sm:text-sm text-gray-400">
                        Paste a YouTube link or type keywords (e.g. artist, title) to browse top results.
                      </p>
                    </div>
                    <UrlInputForm
                      id="url-input-form"
                      onSubmit={handleFetchOrSearch}
                      loading={false}
                    />

                    {/* Continue Playing / You are Playing & Recently Downloaded */}
                    {state.phase === "idle" && (
                      <RecentAndActiveSection
                        id="recent-and-active-section"
                        currentFile={currentPlayingFile}
                        recentFiles={recentFiles}
                        totalCount={historyCount}
                        onPlayTrack={(file) => handlePlayTrack(file, recentFiles)}
                        onOpenPlayer={() => setActiveTab("player")}
                        onViewLibrary={() => setActiveTab("history")}
                      />
                    )}
                  </div>
                )}

                {state.phase === "fetching" && (
                  <div className="space-y-4">
                    <div className="text-center sm:text-left space-y-1">
                      <h2 className="text-lg sm:text-xl font-bold text-white">
                        Analyzing YouTube URL...
                      </h2>
                      <p className="text-xs sm:text-sm text-gray-400">
                        Fetching metadata, audio bitrates, and video resolutions.
                      </p>
                    </div>
                    <UrlInputForm
                      id="url-input-form-loading"
                      onSubmit={handleFetchOrSearch}
                      loading={true}
                    />
                  </div>
                )}

                {state.phase === "searching" && (
                  <div className="space-y-4">
                    <div className="text-center sm:text-left space-y-1">
                      <h2 className="text-lg sm:text-xl font-bold text-white">
                        Searching YouTube...
                      </h2>
                      <p className="text-xs sm:text-sm text-gray-400">
                        Finding the top 15 related results for "{state.query}".
                      </p>
                    </div>
                    <UrlInputForm
                      id="url-input-form-searching"
                      onSubmit={handleFetchOrSearch}
                      loading={true}
                    />
                  </div>
                )}

                {/* Search Results */}
                {state.phase === "search_results" && (
                  <SearchResults
                    id="search-results-list"
                    query={state.query}
                    results={state.results}
                    onSelectVideo={(url) => handleFetchOrSearch(url, false)}
                    onPlayPreview={handlePlayYouTubePreview}
                    onReset={handleReset}
                  />
                )}

                {/* Single Video Card */}
                {state.phase === "info" && state.data.type === "video" && (
                  <VideoInfoCard
                    id="video-info-card"
                    info={state.data as VideoInfoResponse}
                    onDownload={handleDownload}
                    onReset={handleReset}
                  />
                )}

                {/* Playlist Video List */}
                {state.phase === "info" && state.data.type === "playlist" && (
                  <PlaylistVideoList
                    id="playlist-video-list"
                    info={state.data as PlaylistInfoResponse}
                    selectedIds={state.selectedVideoIds}
                    onSelectionChange={handleVideoSelection}
                    onDownload={handleDownload}
                    onReset={handleReset}
                  />
                )}

                {/* Downloading Progress */}
                {state.phase === "downloading" && (
                  <ProgressBar
                    id="download-progress"
                    jobId={state.jobId}
                    frame={state.latestFrame}
                    onCancel={handleCancel}
                  />
                )}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Docked Player (Persistent on PC lg:block, full player tab on mobile activeTab === "player") */}
          <div
            className={`w-full lg:w-[410px] xl:w-[450px] lg:sticky lg:top-6 lg:shrink-0 ${
              activeTab === "player" ? "block animate-in fade-in duration-200" : "hidden lg:block"
            }`}
          >
            <NowPlayingSection
              ref={playerHandleRef}
              id="now-playing-section"
              currentFile={currentPlayingFile}
              allFiles={allDownloadedFiles}
              playlist={playerQueue.length > 0 ? playerQueue : allDownloadedFiles}
              onSelectTrack={(file) => setCurrentPlayingFile(file)}
              onPlayNext={handlePlayNext}
              onPlayPrev={handlePlayPrev}
              onGoToHistory={() => setActiveTab("history")}
              onPlaybackStateChange={(playing) => setIsPlayerPlaying(playing)}
            />
          </div>
        </div>
      </div>

      {/* Floating Mini Player Bar (Visible on mobile Downloader, Library, and Playlists tabs during playback) */}
      {activeTab !== "player" && currentPlayingFile && (
        <div className="lg:hidden">
          <MiniPlayerBar
            currentFile={currentPlayingFile}
            isPlaying={isPlayerPlaying}
            onTogglePlayPause={() => playerHandleRef.current?.togglePlayPause()}
            onOpenPlayer={() => setActiveTab("player")}
          />
        </div>
      )}

      {/* Download Complete Pop-Up (PC) & Header Notification (Mobile) */}
      {downloadNotification && (
        <DownloadCompleteNotification
          jobId={downloadNotification.jobId}
          frame={downloadNotification.frame}
          onDismiss={() => setDownloadNotification(null)}
          onViewInLibrary={() => {
            setDownloadNotification(null);
            setActiveTab("history");
          }}
        />
      )}

      {/* Mobile Bottom Navigation Bar */}
      <BottomNavBar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        fileCount={historyCount}
        hasActiveTrack={currentPlayingFile !== null}
      />

      {/* Theme Color Selector Modal */}
      <ThemeSelectorModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
      />

      {/* FOOTER */}
      <footer className="relative z-10 py-8 border-t border-white/[0.08] bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-400">
          {/* Made by banner */}
          <div className="flex items-center gap-2 font-medium text-gray-300">
            <span>Made with</span>
            <span className="text-red-500 animate-pulse text-sm">❤️</span>
            <span>by</span>
            <span className="font-bold text-white tracking-wide">aryanathreya</span>
          </div>

          {/* Social Links */}
          <div className="flex items-center gap-5">
            <a
              href="https://github.com/aryanathreya"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              <span>GitHub</span>
            </a>

            <a
              href="https://www.linkedin.com/in/aryanathreya"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-gray-400 hover:text-indigo-400 transition-colors"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
              </svg>
              <span>LinkedIn</span>
            </a>

            <span className="text-gray-600 hidden sm:inline">•</span>

            <span className="text-gray-500">
              © 2026 aryanathreya. All rights reserved.
            </span>
          </div>
        </div>
      </footer>
    </main>
  );
}

export default function HomePage() {
  return (
    <ThemeProvider>
      <HomePageContent />
    </ThemeProvider>
  );
}
