/**
 * React hook for YT Music Player engine.
 *
 * Integrates QueueEngine and AudioController with reactive React state.
 * Features:
 * - Queue management & synchronization
 * - Persistent playback surviving tab navigation
 * - Next-track warmup preloading
 * - Throttled state persistence (saved ~5s, restored on app start paused)
 * - Desktop keyboard shortcuts
 * - Liked track tracking
 * - Sleep timer management
 * - Automatic recovery from stale stream URLs
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { FileInfo } from "../types";
import { QueueEngine } from "./queue";
import { AudioController } from "./audioController";
import type { QueueItem, RepeatMode, PersistedPlayerState } from "./types";
import {
  getTrack,
  upsertTrack,
  fileInfoToTrackRecord,
  trackRecordToFileInfo,
  isTrackLiked,
  toggleLikeTrack,
  getPersistedPlayerState,
  savePersistedPlayerState,
} from "../db";
import { toggleLikedOptimistic, isTrackLikedSync } from "./useLiked";

export interface UseMusicPlayerReturn {
  currentTrack: FileInfo | null;
  queue: QueueItem[];
  queueTracks: FileInfo[];
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  isLiked: boolean;
  sleepTimerMode: "15" | "30" | "60" | "track_end" | null;
  sleepRemainingSec: number | null;
  volume: number;
  isMuted: boolean;

  // Actions
  playTrack: (track: FileInfo, contextTracks?: FileInfo[], startIndex?: number) => Promise<void>;
  togglePlayPause: () => void;
  playNext: () => void;
  playPrev: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  toggleLike: () => Promise<void>;
  playNow: (track: FileInfo) => void;
  playNextTrack: (track: FileInfo) => void;
  addToQueue: (track: FileInfo) => void;
  removeFromQueue: (qid: string) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  jumpToQueueIndex: (index: number) => void;
  setSleepTimer: (mode: "15" | "30" | "60" | "track_end" | null) => void;
  cancelSleepTimer: () => void;
}

export function useMusicPlayer(): UseMusicPlayerReturn {
  const queueEngineRef = useRef<QueueEngine>(new QueueEngine());
  const controllerRef = useRef<AudioController | null>(null);

  const [currentTrack, setCurrentTrack] = useState<FileInfo | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueTracks, setQueueTracks] = useState<FileInfo[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [volume, setVolumeState] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [sleepTimerMode, setSleepTimerMode] = useState<"15" | "30" | "60" | "track_end" | null>(null);
  const [sleepRemainingSec, setSleepRemainingSec] = useState<number | null>(null);

  // In-memory track metadata cache for queue items
  const trackCacheRef = useRef<Map<string, FileInfo>>(new Map());
  const consecutiveErrorsRef = useRef<number>(0);
  const lastStateSaveRef = useRef<number>(0);

  // ── Sync QueueTracks from Cache / DB ─────────────────────────────────────

  const syncQueueTracks = useCallback(async (items: QueueItem[]) => {
    const resolved: FileInfo[] = [];
    const missingIds: string[] = [];

    for (const item of items) {
      const cached = trackCacheRef.current.get(item.trackId);
      if (cached) {
        resolved.push(cached);
      } else {
        missingIds.push(item.trackId);
      }
    }

    if (missingIds.length > 0) {
      for (const id of missingIds) {
        try {
          const record = await getTrack(id);
          if (record) {
            const fi = trackRecordToFileInfo(record);
            trackCacheRef.current.set(id, fi);
          }
        } catch {}
      }
    }

    const finalList = items.map((item) => {
      return (
        trackCacheRef.current.get(item.trackId) || {
          filename: item.trackId.startsWith("lib:") ? item.trackId.replace(/^lib:/, "") : `${item.trackId}.m4a`,
          clean_title: item.trackId.startsWith("lib:") ? item.trackId.replace(/^lib:/, "") : item.trackId,
          media_type: "audio" as const,
          size_bytes: 0,
          created_at: new Date().toISOString(),
          modified_at: new Date().toISOString(),
          download_url: "",
          youtube_id: item.trackId.startsWith("lib:") ? undefined : item.trackId,
        }
      );
    });

    setQueueTracks(finalList);
  }, []);

  // ── Throttled State Persistence ──────────────────────────────────────────

  const persistPlayerState = useCallback((posSec?: number) => {
    const now = Date.now();
    lastStateSaveRef.current = now;

    const state: PersistedPlayerState = {
      queue: queueEngineRef.current.getItems(),
      currentIndex: queueEngineRef.current.getCurrentIndex(),
      positionSec: typeof posSec === "number" ? posSec : currentTime,
      shuffle: queueEngineRef.current.isShuffle(),
      repeat: queueEngineRef.current.getRepeatMode(),
      volume,
      muted: isMuted,
      savedAt: now,
    };

    savePersistedPlayerState(state).catch(() => {});
  }, [currentTime, volume, isMuted]);

  // ── Track Loading ────────────────────────────────────────────────────────

  const loadAndPlayItem = useCallback(
    async (item: QueueItem | null, autoPlay: boolean = true) => {
      if (!item || !controllerRef.current) return;

      let fileInfo = trackCacheRef.current.get(item.trackId);
      if (!fileInfo) {
        const record = await getTrack(item.trackId);
        if (record) {
          fileInfo = trackRecordToFileInfo(record);
          trackCacheRef.current.set(item.trackId, fileInfo);
        }
      }

      if (!fileInfo) {
        fileInfo = {
          filename: item.trackId.startsWith("lib:") ? item.trackId.replace(/^lib:/, "") : `${item.trackId}.m4a`,
          clean_title: item.trackId.startsWith("lib:") ? item.trackId.replace(/^lib:/, "") : item.trackId,
          media_type: "audio",
          size_bytes: 0,
          created_at: new Date().toISOString(),
          modified_at: new Date().toISOString(),
          download_url: "",
          youtube_id: item.trackId.startsWith("lib:") ? undefined : item.trackId,
        };
      }

      setCurrentTrack(fileInfo);
      setCurrentIndex(queueEngineRef.current.getCurrentIndex());

      // Update liked status
      const trackId = fileInfo.youtube_id || `lib:${fileInfo.filename}`;
      isTrackLiked(trackId).then(setIsLiked);

      await controllerRef.current.loadTrack(fileInfo, autoPlay);
      persistPlayerState(0);
    },
    [persistPlayerState]
  );

  // ── Navigation Callbacks ─────────────────────────────────────────────────

  const handleNextTrack = useCallback(
    (isAutoplay: boolean = false) => {
      const res = queueEngineRef.current.next(isAutoplay);
      if (res.action === "play") {
        const nextItem = queueEngineRef.current.getCurrentItem();
        loadAndPlayItem(nextItem, true);
      } else {
        setIsPlaying(false);
        persistPlayerState(0);
      }
    },
    [loadAndPlayItem, persistPlayerState]
  );

  const handlePrevTrack = useCallback(() => {
    const res = queueEngineRef.current.prev(currentTime);
    if (res.action === "restart") {
      controllerRef.current?.seek(0);
      setCurrentTime(0);
    } else {
      const prevItem = queueEngineRef.current.getCurrentItem();
      loadAndPlayItem(prevItem, true);
    }
  }, [currentTime, loadAndPlayItem]);

  // ── AudioController Initialization ───────────────────────────────────────

  useEffect(() => {
    controllerRef.current = new AudioController({
      onTimeUpdate: (time, dur) => {
        setCurrentTime(time);
        setDuration(dur);

        // Preload next track at ~75% or <20s remaining
        if (dur > 0 && (time / dur >= 0.75 || dur - time <= 20)) {
          const items = queueEngineRef.current.getItems();
          const currIdx = queueEngineRef.current.getCurrentIndex();
          if (currIdx >= 0 && currIdx + 1 < items.length) {
            const nextItem = items[currIdx + 1];
            const nextTrack = trackCacheRef.current.get(nextItem.trackId);
            if (nextTrack) {
              controllerRef.current?.preloadNextTrack(nextTrack);
            }
          }
        }

        // Throttle state saving every ~5s while playing
        const now = Date.now();
        if (now - lastStateSaveRef.current > 5000) {
          persistPlayerState(time);
        }
      },
      onPlayStateChange: (playing) => {
        setIsPlaying(playing);
        consecutiveErrorsRef.current = 0;
      },
      onTrackEnded: () => {
        handleNextTrack(true);
      },
      onError: (err, isStaleRetry) => {
        if (!isStaleRetry) {
          consecutiveErrorsRef.current++;
          if (consecutiveErrorsRef.current >= 3) {
            console.warn("Stopped auto-skip after 3 consecutive playback errors");
            setIsPlaying(false);
          } else {
            // Auto skip to next track on failure
            handleNextTrack(true);
          }
        }
      },
    });

    // Restore saved playerState paused on startup
    getPersistedPlayerState().then(async (saved) => {
      if (saved && Array.isArray(saved.queue) && saved.queue.length > 0) {
        queueEngineRef.current.restore({
          items: saved.queue,
          currentIndex: saved.currentIndex,
          shuffle: saved.shuffle,
          repeat: saved.repeat,
        });

        setQueue(queueEngineRef.current.getItems());
        setCurrentIndex(queueEngineRef.current.getCurrentIndex());
        setIsShuffle(saved.shuffle);
        setRepeatMode(saved.repeat);

        await syncQueueTracks(saved.queue);

        const currentItem = queueEngineRef.current.getCurrentItem();
        if (currentItem) {
          loadAndPlayItem(currentItem, false); // Paused on startup
          if (typeof saved.positionSec === "number" && saved.positionSec > 0) {
            setTimeout(() => {
              controllerRef.current?.seek(saved.positionSec);
              setCurrentTime(saved.positionSec);
            }, 300);
          }
        }
      }
    });

    return () => {
      controllerRef.current?.destroy();
    };
  }, [handleNextTrack, loadAndPlayItem, persistPlayerState, syncQueueTracks]);

  // ── Sleep Timer Tick ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!sleepTimerMode) {
      setSleepRemainingSec(null);
      return;
    }

    const interval = setInterval(() => {
      if (controllerRef.current) {
        const rem = controllerRef.current.getSleepTimerRemainingSec();
        setSleepRemainingSec(rem);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sleepTimerMode]);

  // ── Desktop Keyboard Shortcuts ───────────────────────────────────────────

  const toggleLikeRef = useRef<() => void>(() => {});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      switch (e.code) {
        case "Space":
          e.preventDefault();
          controllerRef.current?.togglePlayPause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) {
            handlePrevTrack();
          } else {
            const newPos = Math.max(0, currentTime - 5);
            controllerRef.current?.seek(newPos);
            setCurrentTime(newPos);
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) {
            handleNextTrack(false);
          } else {
            const newPos = Math.min(duration, currentTime + 5);
            controllerRef.current?.seek(newPos);
            setCurrentTime(newPos);
          }
          break;
        case "KeyM":
          e.preventDefault();
          setIsMuted((prev) => {
            const next = !prev;
            controllerRef.current?.setMuted(next);
            return next;
          });
          break;
        case "KeyL":
          e.preventDefault();
          toggleLikeRef.current();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentTime, duration, handleNextTrack, handlePrevTrack]);

  // ── Public API Operations ────────────────────────────────────────────────

  const playTrack = useCallback(
    async (track: FileInfo, contextTracks?: FileInfo[], startIndex: number = 0) => {
      const trackId = track.youtube_id || `lib:${track.filename}`;
      trackCacheRef.current.set(trackId, track);
      upsertTrack(fileInfoToTrackRecord(track)).catch(() => {});

      if (contextTracks && contextTracks.length > 0) {
        for (const t of contextTracks) {
          const tid = t.youtube_id || `lib:${t.filename}`;
          trackCacheRef.current.set(tid, t);
          upsertTrack(fileInfoToTrackRecord(t)).catch(() => {});
        }

        const ids = contextTracks.map((t) => t.youtube_id || `lib:${t.filename}`);
        queueEngineRef.current.setQueue(ids, startIndex, isShuffle);
      } else {
        queueEngineRef.current.playNow(trackId);
      }

      const items = queueEngineRef.current.getItems();
      setQueue(items);
      setCurrentIndex(queueEngineRef.current.getCurrentIndex());
      await syncQueueTracks(items);

      const currentItem = queueEngineRef.current.getCurrentItem();
      await loadAndPlayItem(currentItem, true);
    },
    [isShuffle, loadAndPlayItem, syncQueueTracks]
  );

  const togglePlayPause = useCallback(() => {
    controllerRef.current?.togglePlayPause();
  }, []);

  const playNext = useCallback(() => {
    handleNextTrack(false);
  }, [handleNextTrack]);

  const playPrev = useCallback(() => {
    handlePrevTrack();
  }, [handlePrevTrack]);

  const seekTo = useCallback((seconds: number) => {
    controllerRef.current?.seek(seconds);
    setCurrentTime(seconds);
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    controllerRef.current?.setVolume(v);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      controllerRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const toggleRepeat = useCallback(() => {
    const nextMode = queueEngineRef.current.cycleRepeatMode();
    setRepeatMode(nextMode);
    persistPlayerState();
  }, [persistPlayerState]);

  const toggleShuffle = useCallback(() => {
    const nextShuffle = queueEngineRef.current.toggleShuffle();
    setIsShuffle(nextShuffle);
    const items = queueEngineRef.current.getItems();
    setQueue(items);
    setCurrentIndex(queueEngineRef.current.getCurrentIndex());
    syncQueueTracks(items);
    persistPlayerState();
  }, [persistPlayerState, syncQueueTracks]);

  const toggleLike = useCallback(async () => {
    if (!currentTrack) return;
    const trackId = currentTrack.youtube_id || (currentTrack.filename.startsWith("lib:") ? currentTrack.filename : `lib:${currentTrack.filename}`);
    const nextLiked = await toggleLikedOptimistic(trackId, currentTrack);
    setIsLiked(nextLiked);
  }, [currentTrack]);

  useEffect(() => {
    toggleLikeRef.current = toggleLike;
  }, [toggleLike]);

  useEffect(() => {
    const handleLikedChanged = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      if (!currentTrack) return;
      const trackId = currentTrack.youtube_id || (currentTrack.filename.startsWith("lib:") ? currentTrack.filename : `lib:${currentTrack.filename}`);
      if (detail && detail.trackId) {
        if (detail.trackId === trackId) {
          setIsLiked(Boolean(detail.liked));
        }
      } else {
        setIsLiked(isTrackLikedSync(trackId));
      }
    };
    window.addEventListener("ytdl_liked_changed", handleLikedChanged);
    return () => window.removeEventListener("ytdl_liked_changed", handleLikedChanged);
  }, [currentTrack]);

  const playNow = useCallback(
    (track: FileInfo) => {
      const tid = track.youtube_id || `lib:${track.filename}`;
      trackCacheRef.current.set(tid, track);
      upsertTrack(fileInfoToTrackRecord(track)).catch(() => {});

      queueEngineRef.current.playNow(tid);
      const items = queueEngineRef.current.getItems();
      setQueue(items);
      setCurrentIndex(queueEngineRef.current.getCurrentIndex());
      syncQueueTracks(items);

      const currentItem = queueEngineRef.current.getCurrentItem();
      loadAndPlayItem(currentItem, true);
    },
    [loadAndPlayItem, syncQueueTracks]
  );

  const playNextTrack = useCallback(
    (track: FileInfo) => {
      const tid = track.youtube_id || `lib:${track.filename}`;
      trackCacheRef.current.set(tid, track);
      upsertTrack(fileInfoToTrackRecord(track)).catch(() => {});

      queueEngineRef.current.playNext(tid);
      const items = queueEngineRef.current.getItems();
      setQueue(items);
      syncQueueTracks(items);
    },
    [syncQueueTracks]
  );

  const addToQueue = useCallback(
    (track: FileInfo) => {
      const tid = track.youtube_id || `lib:${track.filename}`;
      trackCacheRef.current.set(tid, track);
      upsertTrack(fileInfoToTrackRecord(track)).catch(() => {});

      queueEngineRef.current.addToQueue(tid);
      const items = queueEngineRef.current.getItems();
      setQueue(items);
      syncQueueTracks(items);
    },
    [syncQueueTracks]
  );

  const removeFromQueue = useCallback(
    (qid: string) => {
      const currentQid = queueEngineRef.current.getCurrentItem()?.qid;
      queueEngineRef.current.remove(qid);
      const items = queueEngineRef.current.getItems();
      setQueue(items);
      setCurrentIndex(queueEngineRef.current.getCurrentIndex());
      syncQueueTracks(items);

      // If removed track was playing, load the new current track
      if (currentQid === qid) {
        const nextItem = queueEngineRef.current.getCurrentItem();
        loadAndPlayItem(nextItem, isPlaying);
      }
    },
    [isPlaying, loadAndPlayItem, syncQueueTracks]
  );

  const reorderQueue = useCallback(
    (fromIndex: number, toIndex: number) => {
      queueEngineRef.current.move(fromIndex, toIndex);
      const items = queueEngineRef.current.getItems();
      setQueue(items);
      setCurrentIndex(queueEngineRef.current.getCurrentIndex());
      syncQueueTracks(items);
    },
    [syncQueueTracks]
  );

  const clearQueue = useCallback(() => {
    queueEngineRef.current.clearUpcoming();
    const items = queueEngineRef.current.getItems();
    setQueue(items);
    setCurrentIndex(queueEngineRef.current.getCurrentIndex());
    syncQueueTracks(items);
  }, [syncQueueTracks]);

  const jumpToQueueIndex = useCallback(
    (index: number) => {
      if (queueEngineRef.current.jumpToIndex(index)) {
        setCurrentIndex(index);
        const item = queueEngineRef.current.getCurrentItem();
        loadAndPlayItem(item, true);
      }
    },
    [loadAndPlayItem]
  );

  const setSleepTimer = useCallback((mode: "15" | "30" | "60" | "track_end" | null) => {
    setSleepTimerMode(mode);
    controllerRef.current?.setSleepTimer(mode);
  }, []);

  const cancelSleepTimer = useCallback(() => {
    setSleepTimerMode(null);
    controllerRef.current?.cancelSleepTimer();
  }, []);

  return {
    currentTrack,
    queue,
    queueTracks,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    repeatMode,
    isShuffle,
    isLiked,
    sleepTimerMode,
    sleepRemainingSec,
    volume,
    isMuted,

    playTrack,
    togglePlayPause,
    playNext,
    playPrev,
    seekTo,
    setVolume,
    toggleMute,
    toggleRepeat,
    toggleShuffle,
    toggleLike,
    playNow,
    playNextTrack,
    addToQueue,
    removeFromQueue,
    reorderQueue,
    clearQueue,
    jumpToQueueIndex,
    setSleepTimer,
    cancelSleepTimer,
  };
}
