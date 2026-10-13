/**
 * Persistent Audio Controller & Playback Lifecycle Manager.
 *
 * Coordinates:
 * - Single persistent HTMLAudioElement for uninterrupted playback across tab navigation
 * - Hidden secondary preloader (warmup next track when current is ~75% done or <20s remaining)
 * - Three-tier source resolution: Ephemeral Offline Blob -> Library File -> Stream Proxy
 * - Accurate listen-time qualification tracking (>=30s or >=50%)
 * - Long track resume position memory (>10 min)
 * - Sleep timer with 5s smooth fade-out
 * - Media Session API metadata & lock-screen scrubbing
 * - Stale stream retry recovery (?retry=1)
 */

import type { FileInfo } from "../types";
import { getFileByNameUrl, getStreamUrl, resolveMediaUrl } from "../api";
import {
  getOfflineTrack,
  recordPlayHistory,
  getEffectiveStreamingQuality,
  getCurrentStreamingQuality,
  type TrackRecord,
} from "../db";
import { PLAY_THRESHOLD_SEC, SKIP_THRESHOLD_SEC } from "./constants";
import type { ResolvedPlaybackSource } from "./types";

export interface AudioControllerCallbacks {
  onTimeUpdate: (currentTime: number, duration: number) => void;
  onPlayStateChange: (isPlaying: boolean) => void;
  onTrackEnded: () => void;
  onError: (error: string, isStaleStreamRetry: boolean) => void;
  onPreloadReady?: (trackId: string) => void;
}

export class AudioController {
  private audio: HTMLAudioElement | null = null;
  private preloadAudio: HTMLAudioElement | null = null;
  private currentTrack: FileInfo | null = null;
  private currentBlobUrl: string | null = null;
  private preloadBlobUrl: string | null = null;
  private preloadedTrackId: string | null = null;

  // Listen tracking
  private listenedElapsedSec: number = 0;
  private lastTimeUpdateTimestamp: number = 0;
  private historyRecordedForCurrentTrack: boolean = false;
  private retryAttemptedForCurrentTrack: boolean = false;

  // Sleep timer
  private sleepTimerTimeout: NodeJS.Timeout | null = null;
  private sleepTimerEndTime: number | null = null;
  private sleepTimerType: "15" | "30" | "60" | "track_end" | null = null;

  private callbacks: AudioControllerCallbacks;

  constructor(callbacks: AudioControllerCallbacks) {
    this.callbacks = callbacks;
    if (typeof window !== "undefined") {
      this.initElements();
    }
  }

  private initElements(): void {
    if (this.audio) return;

    this.audio = new Audio();
    this.audio.preload = "auto";

    this.preloadAudio = new Audio();
    this.preloadAudio.preload = "metadata"; // Lightweight warmup
    this.preloadAudio.volume = 0;

    // Attach listeners to primary audio element
    this.audio.addEventListener("timeupdate", this.handleTimeUpdate);
    this.audio.addEventListener("play", () => this.callbacks.onPlayStateChange(true));
    this.audio.addEventListener("pause", () => this.callbacks.onPlayStateChange(false));
    this.audio.addEventListener("ended", this.handleEnded);
    this.audio.addEventListener("error", this.handleError);

    this.preloadAudio.addEventListener("canplaythrough", () => {
      if (this.preloadedTrackId && this.callbacks.onPreloadReady) {
        this.callbacks.onPreloadReady(this.preloadedTrackId);
      }
    });
  }

  // ── Source Resolution ──────────────────────────────────────────────────────

  /**
   * Resolve playback source in order: Ephemeral Offline Blob -> Library File -> Stream URL.
   */
  public async resolvePlaybackSource(
    track: FileInfo,
    isRetry: boolean = false,
  ): Promise<ResolvedPlaybackSource> {
    const videoId = track.youtube_id;
    const cleanFilename = track.filename.replace(/^lib:/, "");

    // 1. Check Offline Storage
    if (videoId) {
      try {
        const offline = await getOfflineTrack(videoId);
        if (offline && offline.audioBlob) {
          const blobUrl = URL.createObjectURL(offline.audioBlob);
          return {
            type: "offline",
            url: blobUrl,
            isEphemeralBlobUrl: true,
          };
        }
      } catch {}
    }

    // 2. Check Downloaded Library File
    if (
      track.source_type === "library" ||
      track.filename.startsWith("lib:") ||
      (!videoId && cleanFilename)
    ) {
      return {
        type: "library",
        url: getFileByNameUrl(cleanFilename, true),
        isEphemeralBlobUrl: false,
      };
    }

    // 3. YouTube Audio Stream Proxy
    if (videoId) {
      const effQuality = getEffectiveStreamingQuality(getCurrentStreamingQuality());
      let streamUrl = getStreamUrl(videoId, effQuality);
      if (isRetry) {
        streamUrl += `${streamUrl.includes("?") ? "&" : "?"}retry=1`;
      }
      return {
        type: "stream",
        url: streamUrl,
        isEphemeralBlobUrl: false,
      };
    }

    // Fallback
    return {
      type: "library",
      url: getFileByNameUrl(cleanFilename, true),
      isEphemeralBlobUrl: false,
    };
  }

  // ── Track Loading & Playback ───────────────────────────────────────────────

  public async loadTrack(track: FileInfo, autoPlay: boolean = true): Promise<void> {
    this.initElements();
    if (!this.audio) return;

    // Flush history for previous track before swapping
    this.checkAndFlushHistoryRecord();

    // Revoke previous ephemeral object URL
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }

    this.currentTrack = track;
    this.listenedElapsedSec = 0;
    this.lastTimeUpdateTimestamp = Date.now();
    this.historyRecordedForCurrentTrack = false;
    this.retryAttemptedForCurrentTrack = false;

    // Check if this track was already preloaded in preloadAudio
    const canSwapPreload =
      this.preloadedTrackId &&
      ((track.youtube_id && this.preloadedTrackId === track.youtube_id) ||
        this.preloadedTrackId === track.filename);

    let resolvedSource: ResolvedPlaybackSource;

    if (canSwapPreload && this.preloadAudio && this.preloadAudio.src) {
      resolvedSource = {
        type: this.preloadBlobUrl ? "offline" : "stream",
        url: this.preloadAudio.src,
        isEphemeralBlobUrl: !!this.preloadBlobUrl,
      };
      this.currentBlobUrl = this.preloadBlobUrl;
      this.preloadBlobUrl = null;
      this.preloadedTrackId = null;
    } else {
      resolvedSource = await this.resolvePlaybackSource(track, false);
      if (resolvedSource.isEphemeralBlobUrl) {
        this.currentBlobUrl = resolvedSource.url;
      }
    }

    this.audio.src = resolvedSource.url;

    // Check long-track resume position (> 10 min)
    if (track.duration && track.duration > 600) {
      const resumeKey = `ytdl_resume_${track.youtube_id || track.filename}`;
      const savedPos = parseFloat(localStorage.getItem(resumeKey) || "0");
      if (!isNaN(savedPos) && savedPos > 5 && savedPos < track.duration - 15) {
        this.audio.currentTime = savedPos;
      }
    }

    this.updateMediaSession(track);

    if (autoPlay) {
      try {
        await this.audio.play();
      } catch (err: any) {
        // Autoplay may be restricted by iOS gesture policy
        this.callbacks.onPlayStateChange(false);
      }
    } else {
      this.callbacks.onPlayStateChange(false);
    }
  }

  public async play(): Promise<void> {
    if (!this.audio) return;
    try {
      await this.audio.play();
    } catch {}
  }

  public pause(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.checkAndFlushHistoryRecord();
  }

  public togglePlayPause(): void {
    if (!this.audio) return;
    if (this.audio.paused) {
      this.play();
    } else {
      this.pause();
    }
  }

  public seek(positionSec: number): void {
    if (!this.audio) return;
    this.audio.currentTime = positionSec;
    this.lastTimeUpdateTimestamp = Date.now();
  }

  public setVolume(volume: number): void {
    if (!this.audio) return;
    this.audio.volume = Math.max(0, Math.min(1, volume));
  }

  public setMuted(muted: boolean): void {
    if (!this.audio) return;
    this.audio.muted = muted;
  }

  public setPlaybackRate(rate: number): void {
    if (!this.audio) return;
    this.audio.playbackRate = rate;
  }

  // ── Next Track Warmup Preloading ───────────────────────────────────────────

  public async preloadNextTrack(nextTrack: FileInfo): Promise<void> {
    if (!this.preloadAudio || typeof window === "undefined") return;

    const nextId = nextTrack.youtube_id || nextTrack.filename;
    if (this.preloadedTrackId === nextId) return;

    // Skip preloading if data-saver quality is active
    if (getCurrentStreamingQuality() === "saver") return;

    // Revoke old preload blob URL if present
    if (this.preloadBlobUrl) {
      URL.revokeObjectURL(this.preloadBlobUrl);
      this.preloadBlobUrl = null;
    }

    try {
      const source = await this.resolvePlaybackSource(nextTrack, false);
      this.preloadAudio.src = source.url;
      this.preloadedTrackId = nextId;
      if (source.isEphemeralBlobUrl) {
        this.preloadBlobUrl = source.url;
      }
      this.preloadAudio.load();
    } catch {}
  }

  // ── Listen Qualification & Time Update ─────────────────────────────────────

  private handleTimeUpdate = (): void => {
    if (!this.audio || !this.currentTrack) return;

    const now = Date.now();
    if (!this.audio.paused && this.lastTimeUpdateTimestamp > 0) {
      const deltaSec = (now - this.lastTimeUpdateTimestamp) / 1000;
      // Filter out massive jump deltas (e.g. seeking or tab-switch sleep wakes)
      // Only count real listening time when actively playing
      if (deltaSec > 0 && deltaSec < 1.5) {
        this.listenedElapsedSec += deltaSec;
      }
    }
    this.lastTimeUpdateTimestamp = now;

    const currentTime = this.audio.currentTime;
    const duration = this.audio.duration || this.currentTrack.duration || 0;

    this.callbacks.onTimeUpdate(currentTime, duration);

    // Save position for long tracks (> 10 min)
    if (duration > 600 && Math.floor(currentTime) % 5 === 0) {
      const resumeKey = `ytdl_resume_${this.currentTrack.youtube_id || this.currentTrack.filename}`;
      localStorage.setItem(resumeKey, currentTime.toFixed(1));
    }

    // Check listen qualification threshold (>= 15s or >= 50% of track)
    if (!this.historyRecordedForCurrentTrack) {
      const thresholdReached =
        this.listenedElapsedSec >= PLAY_THRESHOLD_SEC ||
        (duration > 0 && this.listenedElapsedSec >= duration * 0.5);

      if (thresholdReached) {
        this.historyRecordedForCurrentTrack = true;
        const trackId = this.currentTrack.youtube_id || `lib:${this.currentTrack.filename}`;
        recordPlayHistory(trackId, this.listenedElapsedSec, duration, this.currentTrack);
      }
    }

    // Media Session position update
    if (
      typeof navigator !== "undefined" &&
      navigator.mediaSession &&
      navigator.mediaSession.setPositionState &&
      duration > 0
    ) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: this.audio.playbackRate || 1,
          position: Math.min(currentTime, duration),
        });
      } catch {}
    }
  };

  private handleEnded = (): void => {
    this.checkAndFlushHistoryRecord();

    // Clear long track resume on completed playback
    if (this.currentTrack) {
      const resumeKey = `ytdl_resume_${this.currentTrack.youtube_id || this.currentTrack.filename}`;
      localStorage.removeItem(resumeKey);
    }

    // Sleep timer "track_end" check
    if (this.sleepTimerType === "track_end") {
      this.cancelSleepTimer();
      this.pause();
      return;
    }

    this.callbacks.onTrackEnded();
  };

  private handleError = async (): Promise<void> => {
    if (!this.audio || !this.currentTrack) return;

    // Stale stream retry logic
    const isStream =
      this.currentTrack.source_type === "stream" || !!this.currentTrack.youtube_id;

    if (isStream && !this.retryAttemptedForCurrentTrack) {
      this.retryAttemptedForCurrentTrack = true;
      try {
        const retrySource = await this.resolvePlaybackSource(this.currentTrack, true);
        this.audio.src = retrySource.url;
        await this.audio.play();
        this.callbacks.onError("Retrying stream with refreshed cache...", true);
        return;
      } catch {}
    }

    this.callbacks.onError("Playback error: unable to play track", false);
  };

  private checkAndFlushHistoryRecord(): void {
    if (
      !this.historyRecordedForCurrentTrack &&
      this.currentTrack &&
      this.audio
    ) {
      const duration = this.audio.duration || this.currentTrack.duration || 0;
      if (
        this.listenedElapsedSec >= PLAY_THRESHOLD_SEC ||
        (duration > 0 && this.listenedElapsedSec >= duration * 0.5)
      ) {
        this.historyRecordedForCurrentTrack = true;
        const trackId = this.currentTrack.youtube_id || `lib:${this.currentTrack.filename}`;
        recordPlayHistory(trackId, this.listenedElapsedSec, duration, this.currentTrack);
      }
    }
  }

  // ── Sleep Timer ────────────────────────────────────────────────────────────

  public setSleepTimer(mode: "15" | "30" | "60" | "track_end" | null): void {
    this.cancelSleepTimer();
    this.sleepTimerType = mode;

    if (!mode || mode === "track_end") return;

    const minutes = parseInt(mode, 10);
    this.sleepTimerEndTime = Date.now() + minutes * 60 * 1000;

    this.sleepTimerTimeout = setTimeout(() => {
      this.executeSleepFadeOut();
    }, minutes * 60 * 1000);
  }

  public getSleepTimerRemainingSec(): number | null {
    if (this.sleepTimerType === "track_end") return -1;
    if (!this.sleepTimerEndTime) return null;
    const remaining = Math.max(0, Math.floor((this.sleepTimerEndTime - Date.now()) / 1000));
    return remaining;
  }

  public cancelSleepTimer(): void {
    if (this.sleepTimerTimeout) {
      clearTimeout(this.sleepTimerTimeout);
      this.sleepTimerTimeout = null;
    }
    this.sleepTimerEndTime = null;
    this.sleepTimerType = null;
  }

  private executeSleepFadeOut(): void {
    if (!this.audio) return;
    const originalVolume = this.audio.volume;
    let step = 0;
    const fadeInterval = setInterval(() => {
      step++;
      if (this.audio) {
        this.audio.volume = Math.max(0, originalVolume * (1 - step / 10));
      }
      if (step >= 10) {
        clearInterval(fadeInterval);
        this.pause();
        if (this.audio) this.audio.volume = originalVolume;
        this.cancelSleepTimer();
      }
    }, 500); // 5-second fade-out
  }

  // ── Media Session API ──────────────────────────────────────────────────────

  private updateMediaSession(track: FileInfo): void {
    if (typeof navigator === "undefined" || !navigator.mediaSession) return;

    const title = track.clean_title || track.filename;
    const artist = track.artist || "YouTube Music";
    const artworkUrl = track.thumbnail_url
      ? resolveMediaUrl(track.thumbnail_url)
      : "/icons/icon-512x512.png";

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: track.album || "YT Music Player",
      artwork: [
        { src: artworkUrl, sizes: "192x192", type: "image/png" },
        { src: artworkUrl, sizes: "512x512", type: "image/png" },
      ],
    });
  }

  // ── Teardown ───────────────────────────────────────────────────────────────

  public destroy(): void {
    this.checkAndFlushHistoryRecord();
    this.cancelSleepTimer();

    if (this.audio) {
      this.audio.pause();
      this.audio.removeEventListener("timeupdate", this.handleTimeUpdate);
      this.audio.src = "";
      this.audio = null;
    }

    if (this.preloadAudio) {
      this.preloadAudio.src = "";
      this.preloadAudio = null;
    }

    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }

    if (this.preloadBlobUrl) {
      URL.revokeObjectURL(this.preloadBlobUrl);
      this.preloadBlobUrl = null;
    }
  }
}
