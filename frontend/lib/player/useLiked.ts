"use client";

import { useState, useEffect, useCallback } from "react";
import type { FileInfo } from "../types";
import {
  getAllLikedTrackIds,
  toggleLikeTrack,
} from "../db";
import { resolveTrackId } from "./constants";

export { resolveTrackId };

// ── Shared In-Memory Set for 0ms Instantaneous Lookups ───────────────────────

const likedTracksMemorySet = new Set<string>();
let isHydrated = false;
let hydrationPromise: Promise<void> | null = null;

export function isTrackLikedSync(trackOrId: FileInfo | string | null | undefined): boolean {
  const id = resolveTrackId(trackOrId);
  return id ? likedTracksMemorySet.has(id) : false;
}

export async function hydrateLikedTracksCache(): Promise<void> {
  if (isHydrated) return;
  if (hydrationPromise) return hydrationPromise;

  hydrationPromise = (async () => {
    try {
      const ids = await getAllLikedTrackIds();
      likedTracksMemorySet.clear();
      for (const id of ids) {
        likedTracksMemorySet.add(id);
      }
      isHydrated = true;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("ytdl_liked_changed", { detail: { hydrated: true } }));
      }
    } catch (err) {
      console.warn("Failed to hydrate liked tracks cache:", err);
    } finally {
      hydrationPromise = null;
    }
  })();

  return hydrationPromise;
}

/**
 * Optimistically toggle liked state for a track, keeping all consumers
 * synchronized across the entire application immediately.
 */
export async function toggleLikedOptimistic(
  trackOrId: FileInfo | string,
  trackInfo?: FileInfo,
): Promise<boolean> {
  const trackId = resolveTrackId(trackOrId);
  if (!trackId) return false;

  const info: FileInfo | undefined =
    trackInfo || (typeof trackOrId === "object" ? trackOrId : undefined);

  const currentlyLiked = likedTracksMemorySet.has(trackId);
  const nextLiked = !currentlyLiked;

  // 1. Instant optimistic update to in-memory Set
  if (nextLiked) {
    likedTracksMemorySet.add(trackId);
  } else {
    likedTracksMemorySet.delete(trackId);
  }

  // 2. Broadcast change event immediately so all mounted components update instantly
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("ytdl_liked_changed", {
        detail: { trackId, liked: nextLiked, optimistic: true },
      }),
    );
  }

  // 3. Persist asynchronously in IndexedDB
  try {
    const persistedResult = await toggleLikeTrack(trackId, info);
    // If discrepancy with DB result, realign in-memory Set
    if (persistedResult !== nextLiked) {
      if (persistedResult) {
        likedTracksMemorySet.add(trackId);
      } else {
        likedTracksMemorySet.delete(trackId);
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("ytdl_liked_changed", {
            detail: { trackId, liked: persistedResult, rollback: true },
          }),
        );
      }
    }
    return persistedResult;
  } catch (err) {
    // Rollback on error
    if (currentlyLiked) {
      likedTracksMemorySet.add(trackId);
    } else {
      likedTracksMemorySet.delete(trackId);
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("ytdl_liked_changed", {
          detail: { trackId, liked: currentlyLiked, rollback: true },
        }),
      );
    }
    throw err;
  }
}

/**
 * Reactive hook to observe and toggle liked status for any track.
 */
export function useLiked(trackOrId: FileInfo | string | null | undefined) {
  const trackId = resolveTrackId(trackOrId);
  const [isLiked, setIsLiked] = useState<boolean>(() => isTrackLikedSync(trackId));

  useEffect(() => {
    // Trigger initial hydration if not yet loaded
    if (!isHydrated) {
      hydrateLikedTracksCache();
    }

    // Set initial state from current in-memory store
    setIsLiked(isTrackLikedSync(trackId));

    const handleLikedChanged = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;

      if (!trackId) {
        setIsLiked(false);
        return;
      }

      if (detail && detail.trackId) {
        if (detail.trackId === trackId) {
          setIsLiked(Boolean(detail.liked));
        }
      } else {
        // Hydration or mass import event: recheck cache
        setIsLiked(likedTracksMemorySet.has(trackId));
      }
    };

    window.addEventListener("ytdl_liked_changed", handleLikedChanged);
    return () => {
      window.removeEventListener("ytdl_liked_changed", handleLikedChanged);
    };
  }, [trackId]);

  const toggle = useCallback(
    async (infoOverride?: FileInfo): Promise<boolean> => {
      if (!trackId) return false;
      const fileInfo =
        infoOverride || (typeof trackOrId === "object" && trackOrId ? trackOrId : undefined);
      return toggleLikedOptimistic(trackId, fileInfo);
    },
    [trackId, trackOrId],
  );

  return {
    isLiked,
    toggleLike: toggle,
    trackId,
  };
}
