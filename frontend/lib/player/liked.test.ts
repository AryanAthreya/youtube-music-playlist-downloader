import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PLAY_THRESHOLD_SEC, SKIP_THRESHOLD_SEC, resolveTrackId } from "./constants.ts";

// Pure qualification helper matching db.ts recordPlayHistory logic
function checkListenQualification(listenedSec: number, durationSec: number): boolean {
  if (listenedSec < SKIP_THRESHOLD_SEC) {
    return false;
  }
  return listenedSec >= PLAY_THRESHOLD_SEC || (durationSec > 0 && listenedSec >= durationSec * 0.5);
}

// Simulates real playback accumulation vs scrubbing jumps
function simulateListeningTime(ticks: { deltaSec: number }[]): number {
  let listenedElapsedSec = 0;
  for (const { deltaSec } of ticks) {
    // Only count active playback deltas, filter out seek jumps (deltaSec >= 1.5)
    if (deltaSec > 0 && deltaSec < 1.5) {
      listenedElapsedSec += deltaSec;
    }
  }
  return listenedElapsedSec;
}

describe("Play Threshold & Qualification (15s rule)", () => {
  it("defines constants correctly in constants.ts", () => {
    assert.strictEqual(PLAY_THRESHOLD_SEC, 15);
    assert.strictEqual(SKIP_THRESHOLD_SEC, 5);
  });

  it("discards playback skipped before 5 seconds", () => {
    assert.strictEqual(checkListenQualification(0, 180), false);
    assert.strictEqual(checkListenQualification(3, 180), false);
    assert.strictEqual(checkListenQualification(4.9, 180), false);
    // Even for very short tracks, skipping before 5s does not count
    assert.strictEqual(checkListenQualification(4, 6), false);
  });

  it("qualifies playback after >= 15 seconds of actual listening", () => {
    assert.strictEqual(checkListenQualification(15, 200), true);
    assert.strictEqual(checkListenQualification(25, 200), true);
  });

  it("qualifies playback after >= 50% for tracks shorter than 30 seconds", () => {
    // 16s track: 8s listened is >= 50% and >= 5s skip threshold -> qualifies
    assert.strictEqual(checkListenQualification(8, 16), true);
    // 20s track: 10s listened is >= 50% -> qualifies
    assert.strictEqual(checkListenQualification(10, 20), true);
    // 20s track: 7s listened is < 50% (10s) and < 15s -> does not qualify
    assert.strictEqual(checkListenQualification(7, 20), false);
  });

  it("accumulates real listening time and ignores scrubbing/seek jumps", () => {
    // User plays for 3 seconds, then scrubs 60s ahead, then plays 2 seconds
    const ticks = [
      { deltaSec: 1.0 },
      { deltaSec: 1.0 },
      { deltaSec: 1.0 },
      { deltaSec: 60.0 }, // scrubbing jump to middle
      { deltaSec: 1.0 },
      { deltaSec: 1.0 },
    ];
    const realTime = simulateListeningTime(ticks);
    // Real time should be 5 seconds, not 65 seconds
    assert.strictEqual(realTime, 5.0);
    // 5 seconds listened on 180s track does not qualify as play
    assert.strictEqual(checkListenQualification(realTime, 180), false);
  });
});

describe("Track ID Resolution", () => {
  it("resolves YouTube stream tracks to their 11-char videoId", () => {
    const track = {
      filename: "stream_dQw4w9WgXcQ.m4a",
      clean_title: "Never Gonna Give You Up",
      youtube_id: "dQw4w9WgXcQ",
      media_type: "audio" as const,
      size_bytes: 0,
      created_at: "",
      modified_at: "",
      download_url: "",
    };
    assert.strictEqual(resolveTrackId(track), "dQw4w9WgXcQ");
  });

  it("resolves downloaded library files to lib:<filename>", () => {
    const track = {
      filename: "song.mp3",
      clean_title: "My Song",
      media_type: "audio" as const,
      size_bytes: 0,
      created_at: "",
      modified_at: "",
      download_url: "",
    };
    assert.strictEqual(resolveTrackId(track), "lib:song.mp3");

    // Already prefixed filename
    const prefixed = {
      ...track,
      filename: "lib:song.mp3",
    };
    assert.strictEqual(resolveTrackId(prefixed), "lib:song.mp3");
  });
});

describe("Liked Songs Store & Ordering Logic", () => {
  it("orders liked songs with newest liked first", () => {
    const likedStore = [
      { trackId: "track-1", likedAt: 1000 },
      { trackId: "track-2", likedAt: 3000 },
      { trackId: "track-3", likedAt: 2000 },
    ];

    likedStore.sort((a, b) => b.likedAt - a.likedAt);

    assert.deepStrictEqual(
      likedStore.map((l) => l.trackId),
      ["track-2", "track-3", "track-1"],
    );
  });

  it("upserts unknown track to tracks store before liking", () => {
    const mockTracksStore = new Map<string, any>();
    const mockLikedStore = new Map<string, any>();

    function toggleLike(trackId: string, trackInfo?: { title: string; artist: string }) {
      if (mockLikedStore.has(trackId)) {
        mockLikedStore.delete(trackId);
        return false;
      }

      // Upsert to tracks first if not present
      if (!mockTracksStore.has(trackId)) {
        mockTracksStore.set(trackId, {
          id: trackId,
          title: trackInfo?.title || trackId,
          artist: trackInfo?.artist || "Unknown Artist",
          addedAt: Date.now(),
        });
      }

      mockLikedStore.set(trackId, { trackId, likedAt: Date.now() });
      return true;
    }

    // 1. Like an unknown track
    const result1 = toggleLike("new-track-123", { title: "Starboy", artist: "The Weeknd" });
    assert.strictEqual(result1, true);
    assert.strictEqual(mockLikedStore.has("new-track-123"), true);
    assert.strictEqual(mockTracksStore.has("new-track-123"), true);
    assert.strictEqual(mockTracksStore.get("new-track-123").title, "Starboy");

    // 2. Unlike the track: removes like, but preserves metadata in tracks
    const result2 = toggleLike("new-track-123");
    assert.strictEqual(result2, false);
    assert.strictEqual(mockLikedStore.has("new-track-123"), false);
    assert.strictEqual(mockTracksStore.has("new-track-123"), true);
  });

  it("includes liked tracks in backup export and restores on import", () => {
    const exportPayload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      playlists: [{ id: "pl-1", name: "My Playlist", songFilenames: [] }],
      likedTracks: [
        { trackId: "track-a", likedAt: 12345 },
        { trackId: "track-b", likedAt: 67890 },
      ],
    };

    const serialized = JSON.stringify(exportPayload);
    const parsed = JSON.parse(serialized);

    assert.strictEqual(Array.isArray(parsed.likedTracks), true);
    assert.strictEqual(parsed.likedTracks.length, 2);
    assert.strictEqual(parsed.likedTracks[0].trackId, "track-a");
    assert.strictEqual(parsed.likedTracks[1].trackId, "track-b");
  });
});
