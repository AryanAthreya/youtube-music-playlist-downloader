# Detailed Implementation Plan: YT Music Online Player & PWA Upgrade

## 1. Overview & Architectural Principles

The goal of this upgrade is to turn the existing local downloader into an installable **YT Music Online Player PWA** running on a lightweight (~2 GB RAM) Linux VM behind HTTPS with Caddy, serving 1 to ~10 concurrent users.

### Non-Negotiable Constraints & Design Pillars:
1. **Zero Regressions**: All 57 existing backend tests and all existing frontend features (video/audio downloads, ZIP archives, library browsing, theme system) must continue working without alterations to their contracts.
2. **Minimal & Additive Changes**: Existing files (`NowPlayingSection.tsx`, `page.tsx`, `files.py`, `job_manager.py`) receive small, backward-compatible additions rather than large structural rewrites.
3. **Low Memory Overhead (2 GB RAM target)**:
   - Stream YouTube audio directly via HTTPS proxy without running FFmpeg transcoding.
   - Pinned concurrency: `MAX_CONCURRENT_DOWNLOADS=1` (prod) and `MAX_CONCURRENT_STREAMS=3`.
   - Dedicated small executor (2 workers) for stream metadata extraction to avoid starving downloads or bloating memory.
4. **Local-First PWA**:
   - IndexedDB (`idb`) stores custom playlists, track metadata, and raw audio `Blob`s for offline tracks.
   - Hand-written `public/sw.js` caches the real app shell on successful navigation and serves it offline, so the app opens with offline-saved tracks even with no connection. `/offline` is used only as a last-resort fallback if no cached shell exists.
   - Streaming/Range requests strictly bypass the service worker.
   - Offline audio plays cleanly via ephemeral `URL.createObjectURL(blob)` created strictly at play time (never stored).

---

## 2. Audio Player Integration Model (`FileInfo` Mapping & URL Resolution)

### Track Representation
In `frontend/lib/types.ts`, `FileInfo` is extended with backward-compatible optional fields:

```typescript
export interface FileInfo {
  filename: string;
  clean_title: string;
  media_type: "video" | "audio" | "other";
  thumbnail_url?: string | null;
  size_bytes: number;
  created_at: string;         // ISO 8601
  modified_at: string;        // ISO 8601
  download_url: string;       // Relative: /api/files/{filename}
  album?: string | null;
  is_preview?: boolean;
  youtube_id?: string;

  // ── New additive properties for streaming & offline ──
  source_type?: "library" | "stream" | "offline";
  stream_url?: string;        // /api/stream/{youtube_id}
  offline_blob_url?: string;  // Ephemeral object URL (created at runtime, NEVER persisted)
  duration?: number | null;   // seconds
  artist?: string | null;
}
```

> **Crucial Rule on Object URLs**: `offline_blob_url` is purely an in-memory runtime property created via `URL.createObjectURL(blob)` when a track starts playing, and revoked via `URL.revokeObjectURL` on track transition or teardown. It is **never** written to IndexedDB or localStorage.

### URL Resolution Priority
When the player (`NowPlayingSection.tsx`) loads a track, the audio URL is resolved in the following priority order:

$$\text{URL} = \begin{cases} 
\text{track.offline\_blob\_url} & \text{if track is offline (ephemeral object URL generated from Blob)} \\
\text{getFileByNameUrl(track.filename, true)} & \text{if track is a downloaded library file} \\
\text{track.stream\_url} \lor \text{getStreamUrl(track.youtube\_id)} & \text{if track is an online YouTube stream}
\end{cases}$$

This guarantees that:
- Offline tracks play immediately with zero network requests and full native seeking.
- Downloaded library tracks continue using the existing `/api/files/{filename}?stream=true` endpoint.
- YouTube search results and playlist tracks stream instantly on demand via `/api/stream/{video_id}`.

---

## 3. File-by-File Changes & New Files

### New Files to Create:
| File | Purpose |
|---|---|
| `backend/app/schemas/stream.py` | Pydantic schemas for stream resolution info and errors |
| `backend/app/services/stream_service.py` | Stream extraction, format selection (m4a/AAC), TTL cache, and `httpx` async proxying with chunked ranged upstream fetches |
| `backend/app/api/stream.py` | FastAPI route: `GET /api/stream/{video_id}` (Range-aware) and `GET /api/thumb` |
| `backend/tests/test_stream.py` | Pytest unit tests for stream resolution, caching, and Range forwarding |
| `frontend/lib/db.ts` | IndexedDB layer powered by `idb` for playlists, tracks, history, and offline audio blobs |
| `frontend/lib/offlineManager.ts` | Sequential offline track saving with chunked download, progress, and storage quota checks |
| `frontend/app/manifest.ts` | Next.js 16 metadata route generating the PWA manifest |
| `frontend/public/sw.js` | Hand-written lightweight service worker caching the real app shell (`/`) |
| `frontend/app/offline/page.tsx` | Fallback page used only if no cached app shell exists |
| `docker-compose.prod.yml` | Production Docker Compose configuration with memory limits, build args, and internal ports |
| `Caddyfile` | Production reverse proxy configuration with automatic HTTPS, HTTP challenge, and basic auth |
| `scripts/auto-update-ytdlp.sh` | Bash script for safe testing, updating, and rolling back `yt-dlp` in production |
| `DEPLOYMENT.md` | Complete deployment documentation for 2 GB VM with 2 GB swap |

### Minimal Edits to Existing Files:
| File | Target Lines / Scope | Exact Minimal Changes |
|---|---|---|
| `backend/requirements.txt` | Line 18 | Add pinned `httpx==0.28.1` |
| `backend/app/config.py` | Config class | Add `max_concurrent_streams: int = 3`, `ytdlp_cookies_file: Path \| None = None`, `temp_cleanup_hours: int = 24` |
| `backend/app/main.py` | Line 21, 76, 118 | Import and include `stream.router`; invoke `stream_service.cleanup_temp_files()` on startup |
| `backend/app/services/yt_dlp_client.py` | `_build_base_options` | Inject `cookiefile: str(settings.ytdlp_cookies_file)` if the configured cookies file exists |
| `backend/Dockerfile` | Line 28 | Detect architecture (`uname -m`) to download `x86_64` vs `aarch64` Deno v2.9.6 binary |
| `frontend/package.json` | Dependencies | Add `"idb": "^8.0.2"` |
| `frontend/lib/types.ts` | Line 168 (`FileInfo`) | Add optional fields: `source_type`, `stream_url`, `offline_blob_url`, `duration`, `artist` |
| `frontend/lib/api.ts` | Line 185 | Add `getStreamUrl(videoId)` and `getThumbProxyUrl(videoId)` |
| `frontend/lib/websocket.ts` | Line 13 | When `NEXT_PUBLIC_WS_URL` is empty, derive WebSocket protocol and host dynamically from `window.location` |
| `frontend/components/NowPlayingSection.tsx` | Lines 352, 439, 442 | Resolve media URL using the 3-tier priority order; register Media Session API metadata and action handlers |
| `frontend/components/SearchResults.tsx` | Results item actions | Add direct "Stream / Play" button next to existing preview and download buttons |
| `frontend/components/PlaylistVideoList.tsx` | Header actions | Add "Play All via Stream" button |
| `frontend/components/PlaylistsSection.tsx` | Storage calls | Query IndexedDB `db.ts` with transparent fallback and one-time migration from `localStorage` |
| `frontend/app/page.tsx` | Player queue state | Support mixed queues containing both stream tracks and local files |
| `frontend/app/layout.tsx` | Head / Body | Register Service Worker in production mode; inject PWA meta tags |
| `frontend/Dockerfile` | Builder stage | Add `ARG NEXT_PUBLIC_API_URL="http://localhost:8000"` and `ARG NEXT_PUBLIC_WS_URL="ws://localhost:8000"` preserving dev defaults |
| `.env.example` | Storage / Stream settings | Add `MAX_CONCURRENT_STREAMS`, `YTDLP_COOKIES_FILE`, `TEMP_CLEANUP_HOURS` |
| `README.md` | Overview & Specs | Correct test count to 57+, document new PWA/streaming architecture and link `DEPLOYMENT.md` |

*(Note: `.github/workflows/ci.yml` is untouched; it already runs `PYTHONPATH=backend pytest backend/tests -v` which will automatically execute the new test suite).*

---

## 4. Phase-by-Phase Technical Details

### Phase 1: Backend Streaming
1. **Route `GET /api/stream/{video_id}`**:
   - Validate `video_id` via regex `^[A-Za-z0-9_-]{11}$` (strict SSRF prevention).
   - Dedicated ThreadPoolExecutor (`max_workers=2`) extracts audio format via `yt_dlp_client.fetch_info`.
   - **Handling `ignoreerrors: True`**: yt-dlp `extract_info` can return `None` or a dictionary with no streams. Safely check for `info is None` and raise typed `VideoUnavailableError`.
   - Prefer progressive HTTPS audio: `140` (m4a/AAC 128k) or highest quality `m4a`, avoiding HLS/DASH fragments.
   - Stream caching: store resolved direct CDN URL and expiration timestamp in an in-memory TTL dictionary capped at 200 entries.
   - **Throttling Protection**: If client sends **no Range header**, the proxy will **still fetch upstream with ranged chunks** (e.g. 512 KB chunks sequentially) to prevent YouTube CDN from throttling unranged requests.
   - If client sends a Range header, forward that byte range upstream to YouTube's CDN.
   - If YouTube CDN responds with 403/410 (expired token), invalidate cache entry, re-extract once, and retry.
   - Return `206 Partial Content` (or `200 OK` for full file) with `Accept-Ranges: bytes`, `Content-Range`, `Content-Length`, and `audio/mp4`.
   - Handle client disconnect by catching `CancelledError` and terminating the upstream `httpx` stream cleanly.
   - Concurrency guard: `asyncio.Semaphore(settings.max_concurrent_streams)`. If busy, return `503 Service Unavailable` with `Retry-After: 5`.
2. **Route `GET /api/thumb?id={video_id}`**:
   - Validate `video_id` format.
   - Proxy `https://i.ytimg.com/vi/{video_id}/hqdefault.jpg` via `httpx`, returning `image/jpeg` with `Cache-Control: public, max-age=86400`.
3. **Cookie Support & Temp Cleanup**:
   - If `settings.ytdlp_cookies_file` exists on disk, pass `"cookiefile": str(path)` in `_build_base_options`.
   - On startup, delete files in `downloads/temp` with modification times older than `settings.temp_cleanup_hours`.

### Phase 2: Frontend Stream Playback Integration
1. Extend `FileInfo` mapping:
   - Search results convert to `FileInfo` with `source_type: "stream"`, `filename: f"stream_{item.video_id}.m4a"`, `download_url: getStreamUrl(item.video_id)`.
   - Playlist items convert to `FileInfo` identically.
2. In `NowPlayingSection.tsx`:
   - URL resolution evaluates `offline_blob_url` -> `download_url` (library) -> `stream_url`.
   - Media Session API:
     ```typescript
     if ("mediaSession" in navigator && currentFile) {
       navigator.mediaSession.metadata = new MediaMetadata({
         title: currentFile.clean_title,
         artist: currentFile.artist ?? "YouTube Music",
         artwork: currentFile.thumbnail_url ? [{ src: resolveMediaUrl(currentFile.thumbnail_url), sizes: "512x512", type: "image/jpeg" }] : [],
       });
       navigator.mediaSession.setActionHandler("play", () => playerHandleRef.current?.togglePlayPause());
       navigator.mediaSession.setActionHandler("pause", () => playerHandleRef.current?.togglePlayPause());
       navigator.mediaSession.setActionHandler("nexttrack", () => playerHandleRef.current?.playNext());
       navigator.mediaSession.setActionHandler("previoustrack", () => playerHandleRef.current?.playPrev());
     }
     ```
   - Auto-skip on unrecoverable media error: if `audioRef.current` triggers `onError`, notify user briefly and call `onPlayNext()`.

### Phase 3: IndexedDB Storage Layer
1. Add `idb` library.
2. Create `frontend/lib/db.ts` with database `yt_music_player_db` (version 1):
   - Stores:
     - `playlists`: `keyPath: "id"`
     - `tracks`: `keyPath: "id"`
     - `history`: `keyPath: "timestamp"` (auto-trimmed to 100 items)
     - `settings`: `keyPath: "key"`
     - `offlineTracks`: `keyPath: "id"` (stores raw `Blob` and metadata; NEVER stores object URLs)
3. Idempotent Migration:
   - On initial database initialization, read `localStorage.getItem("ytdl_custom_playlists_v1")`.
   - If present, import playlists into the `playlists` store.
   - Do **NOT** remove the localStorage key, preserving it as an emergency backup.
4. Export / Import: Provide JSON export and import functions for playlists and track bookmarks.

### Phase 4: PWA (Manifest & Hand-Written Service Worker)
1. **Manifest** (`frontend/app/manifest.ts`):
   - Defines `name: "YT Music Online Player"`, `short_name: "YT Music"`, `display: "standalone"`, `theme_color: "#080c14"`, `background_color: "#080c14"`.
   - Real PNG icons generated into `frontend/public/icons/` (`icon-192.png`, `icon-512.png`, `maskable-512.png`).
2. **Service Worker** (`frontend/public/sw.js`):
   - **Real App Shell Caching**: Cache the HTML shell (`/`) on successful navigation. When offline, serve this cached shell so the app boots and loads offline-saved tracks from IndexedDB.
   - If no cached shell exists (e.g. first visit offline), serve `/offline`.
   - Cache static assets (`/_next/static/*`, `/icons/*`, `/manifest.webmanifest`).
   - **Strict exclusion**: Bypass all `/api/stream/*`, `/api/files/*`, `/api/download/*`, and WebSocket connections.
   - Never cache opaque cross-origin thumbnails; thumbnails are stored as blobs in IndexedDB via `/api/thumb`.
   - Broadcast update channel on service worker update.
3. Install Prompt:
   - Capture `beforeinstallprompt` event and render install button in navigation.

### Phase 5: Offline Tracks
1. Storage strategy:
   - Audio is fetched in sequential chunks, assembled into an `audio/mp4` `Blob`, and stored in IndexedDB `offlineTracks`.
   - Thumbnails are fetched via `/api/thumb?id={video_id}` and stored as `image/jpeg` `Blob`.
   - During playback, an ephemeral object URL is created via `URL.createObjectURL(blob)`.
   - When switching tracks or unmounting, the previous object URL is revoked via `URL.revokeObjectURL(url)`.
2. UI controls:
   - "Save Offline" icon button in `NowPlayingSection`, `SearchResults`, and `FileList`.
   - Progress feedback during offline saving.
   - Ability to filter library by "Offline Saved".

### Phase 6: Production Deployment (~2 GB VM)
1. **Same-Origin Networking**:
   - `frontend/Dockerfile` receives build args:
     ```dockerfile
     ARG NEXT_PUBLIC_API_URL="http://localhost:8000"
     ARG NEXT_PUBLIC_WS_URL="ws://localhost:8000"
     ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
     ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
     ```
   - In dev / standard compose, default localhost is used.
   - In `docker-compose.prod.yml`, build args pass empty strings (`""`), causing browser to use relative `/api/...`.
   - `lib/websocket.ts` dynamically derives `wss://${window.location.host}/api/download/${jobId}/ws` when `NEXT_PUBLIC_WS_URL` is empty.
2. **Architecture-Aware Deno Installation**:
   - In `backend/Dockerfile`, query `dpkg --print-architecture`:
     - `amd64` -> `x86_64-unknown-linux-gnu`
     - `arm64` -> `aarch64-unknown-linux-gnu`
3. **Caddy Reverse Proxy (`Caddyfile`)**:
   - Automatic HTTPS with DuckDNS subdomain via standard HTTP challenge (no custom DNS plugin required).
   - Routes `/api/*` directly to `backend:8000` with WebSocket upgrades and `flush_interval -1`.
   - Routes all other traffic to `frontend:3000`.
   - Named matcher for basic auth:
     ```caddy
     @protected {
         not path /manifest.webmanifest /sw.js /icons/* /offline
     }
     basic_auth @protected {
         {$AUTH_USER} {$AUTH_HASH}
     }
     ```
4. **Memory Guarding (`docker-compose.prod.yml`)**:
   - Limits: `backend: mem_limit: 700m`, `frontend: mem_limit: 350m`, `caddy: mem_limit: 64m`.
   - Enforce `MAX_CONCURRENT_DOWNLOADS=1` and `MAX_CONCURRENT_STREAMS=3` to guarantee memory stability on a 2 GB RAM server.
5. **Auto-Update Script (`scripts/auto-update-ytdlp.sh`)**:
   - Tests extraction of video `jNQXAC9IVRw` inside container.
   - On failure, queries PyPI for latest `yt-dlp`, bumps `requirements.txt`, rebuilds backend container, and verifies health.
   - Rolls back automatically if verification fails.

---

## 5. Risks & Mitigation Plan

| Risk | Severity | Mitigation Strategy |
|---|---|---|
| YouTube CDN blocks or throttles audio stream proxying | High | Use progressive m4a audio formats; forward yt-dlp HTTP headers; implement ranged upstream chunks even for unranged client requests; fallback to `YTDLP_COOKIES_FILE`. |
| Next.js build causes Out-Of-Memory (OOM) on 2 GB VM | High | Require and document 2 GB swap file in `DEPLOYMENT.md`; build with Node memory limits; optional GHCR image pull. |
| iOS Safari storage eviction of offline tracks | Medium | Call `navigator.storage.persist()`; inform user in README of iOS Safari 7-day eviction behavior without app usage. |
| Mixed content errors on WebSockets behind HTTPS | Medium | Derive WebSocket URL dynamically (`wss://`) when `NEXT_PUBLIC_WS_URL` is empty. |
| Service worker intercepts Range requests and breaks seeking | High | Explicit URL exclusion rules in `public/sw.js` ensuring all `/api/stream/*` and `/api/files/*` bypass SW. |
| `extract_info` returns None due to `ignoreerrors: True` | Medium | Explicitly guard `if info is None` in `stream_service.py` and raise typed `VideoUnavailableError`. |

---

## 6. Phase 2b & 3b: Music Player Engine, Queue, Extended Playlists & History

### Architectural Objective
Upgrade the player from a simple file/stream player to a full Spotify / YouTube Music style engine with:
- Pure, unit-tested queue management (`lib/player/queue.ts`)
- Persistent single audio element with secondary warmup preload
- IndexedDB v2 schema migration for unified track records, play counts, history, liked tracks, and YouTube playlist imports
- Smart computed playlists (**Recently Played**, **Most Played**, **Liked Songs**, **Saved Offline**)
- Minimal, additive touchpoints in existing UI components (`NowPlayingSection`, `MiniPlayerBar`, `page.tsx`, `PlaylistsSection`)

### Data Model & IndexedDB Migration (v2 in `lib/db.ts`)
Upgrade `DB_VERSION` from `1` to `2` with an automated migration preserving existing v1 custom playlists:
```typescript
// Unified track record shared across all playlists
export interface TrackRecord {
  id: string; // YouTube video ID or "lib:<filename>"
  title: string;
  artist: string;
  durationSec: number;
  thumbnailUrl?: string | null;
  source: "youtube" | "library";
  unavailable?: boolean;
  addedAt: number;
}

// User and imported playlists
export interface PlaylistRecord {
  id: string; // UUID
  name: string;
  kind: "user" | "youtube-import";
  sourceUrl?: string;
  trackIds: string[]; // Order = array order
  coverTrackId?: string;
  createdAt: number;
  updatedAt: number;
}

// Playback history entry (capped at 500 entries)
export interface PlayHistoryEntry {
  key?: number; // Auto-increment
  trackId: string;
  playedAt: number; // Timestamp
  listenedSec: number;
  completed: boolean;
}

// Aggregated play counts for "Most Played"
export interface PlayCountEntry {
  trackId: string;
  count: number;
  lastPlayedAt: number;
}

// Liked tracks store
export interface LikedTrackEntry {
  trackId: string;
  likedAt: number;
}

// Persisted player state (saved throttled every ~5s, on pause, and on track change)
export interface PersistedPlayerState {
  queue: QueueItem[];
  currentIndex: number;
  positionSec: number;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  volume: number;
  muted: boolean;
}
```

#### Migration Logic:
- In `upgrade(db, oldVersion, newVersion, transaction)`:
  - If `oldVersion < 2`:
    - Read existing `playlists` store (`CustomPlaylist` with `songFilenames: string[]`).
    - Map each playlist to `PlaylistRecord` with `kind: "user"` and `trackIds = songFilenames.map(f => f.startsWith('lib:') ? f : 'lib:' + f)`.
    - Create new object stores: `playCounts` (keyPath `trackId`), `likedTracks` (keyPath `trackId`), and indexes on `history` (`by-trackId`, `by-playedAt`).
    - Create `tracks` records for all legacy library files so they are immediately queryable.

#### History & Qualification Rule:
- A play is recorded to `history` **only** after listening for **≥ 30 seconds** OR **≥ 50% of the track duration** (whichever is smaller).
- Skipping after <30s (and <50%) is discarded.
- Re-playing a track keeps the full log (capped at 500 records), and moves the track to the top of the de-duplicated **Recently Played** computed list (top 50 unique tracks).

### Queue Engine Architecture (`frontend/lib/player/queue.ts`)
A framework-agnostic, pure TypeScript class/module with zero DOM/React dependencies, fully testable via Node unit tests:
```typescript
export interface QueueItem {
  qid: string;     // Unique UUID/nonce per queue entry (allows duplicate songs in queue)
  trackId: string; // References TrackRecord.id
}

export type RepeatMode = "off" | "all" | "one";
```
- **State**:
  - `items: QueueItem[]`
  - `currentIndex: number`
  - `shuffle: boolean`
  - `repeat: RepeatMode`
  - `originalOrder: QueueItem[]` (stored upon shuffle activation)
  - `historyStack: number[]` (indexes traversed while in shuffle mode, so "prev" retraces previous tracks rather than generating random picks)
- **Core Operations**:
  - `setQueue(items, startIndex, shuffle)`: Loads a playlist/album context.
  - `playNow(trackId)`: Inserts track immediately at or after `currentIndex` and plays it.
  - `playNext(trackId)`: Inserts track immediately at `currentIndex + 1`.
  - `addToQueue(trackId)`: Appends track to the tail of `items` (and `originalOrder`).
  - `remove(qid)`: Removes item; if currently playing item is removed, smoothly advances to next.
  - `clear()`: Clears upcoming queue items while retaining the current track.
  - `move(fromIndex, toIndex)`: Reorders queue items in place.
  - `next(isAutoplay)`:
    - If `repeat === "one"` and `isAutoplay`: repeats current track.
    - If manual `next`: advances to next track even if repeat one is active.
    - If at end of queue: if `repeat === "all"` wraps to 0; if `repeat === "off"` stops and resets to first track paused.
  - `prev(currentTimeSec)`:
    - If `currentTimeSec > 3`: restarts current track (`currentTime = 0`).
    - If `currentTimeSec <= 3`:
      - If `shuffle` and `historyStack.length > 0`: pops and returns previous index from `historyStack`.
      - Otherwise: decrements `currentIndex` (wraps if `repeat === "all"`).
  - `toggleShuffle()`:
    - On: pins current item at index 0, Fisher-Yates shuffles remaining items, saves `originalOrder`, resets `historyStack = [0]`.
    - Off: restores `originalOrder`, finds current item's new index in `originalOrder`.
  - `toggleRepeat()`: Cycles `"off"` -> `"all"` -> `"one"` -> `"off"`.

### Playback Controller & Preload Manager
- **Single persistent audio element**: reused to maintain background playback on mobile and survive tab switching.
- **Next-track preloading**:
  - When `currentTime / duration >= 0.75` or `duration - currentTime <= 20`:
  - If user is NOT offline and streaming quality is NOT `saver`:
  - Inspect next queue item. Warm up upstream metadata via a secondary hidden `Audio` element (`preload="metadata"` to conserve VM memory and client data).
  - Respect `MAX_CONCURRENT_STREAMS = 3`.
- **Long-track resume**:
  - For tracks with `durationSec > 600` (10 minutes), save progress to IndexedDB and prompt/auto-resume position.
- **Sleep timer**:
  - Selectable intervals: 15 min, 30 min, 60 min, or "End of track".
  - Fades out volume over 5s and pauses audio element upon expiration.
- **Media Session API**:
  - Updates title, artist, artwork on track change.
  - Registers `play`, `pause`, `previoustrack`, `nexttrack`, `seekto`, `seekbackward`, `seekforward`.
  - Calls `navigator.mediaSession.setPositionState` for smooth lock-screen scrubbing.
- **Keyboard shortcuts**:
  - Space: toggle play/pause
  - ArrowLeft / ArrowRight: seek -5s / +5s
  - Shift + ArrowLeft / ArrowRight: previous / next track
  - M: toggle mute
  - Discarded when user is typing in `input`, `textarea`, or search bar.
- **Stale stream recovery**:
  - On audio element `error` for a stream URL, retry once with `?retry=1` cache buster before flagging track as `unavailable` and auto-skipping.
  - Stop auto-skipping after 3 consecutive failures to prevent infinite loops.

### UI Integration Plan (Minimal & Additive Touchpoints)
1. **`NowPlayingSection.tsx`**:
   - Retain all existing props (`currentFile`, `playlist`, `allFiles`, `playlistName`, `onSelectTrack`, `onPlayNext`, `onPlayPrev`, `onPlaybackStateChange`, `onControlsVisibilityChange`).
   - Add top-right/bottom control triggers:
     - 3-state Repeat button (off / all / one with badge)
     - Shuffle button (active highlight)
     - Like button (heart icon, toggle in IndexedDB)
     - Queue drawer toggle button
     - Sleep timer menu
   - Slide-over **Queue Drawer**:
     - Shows "Now Playing" card + "Up Next" list
     - Drag/drop or native pointer touch reorder
     - "Play Next" context action, remove item button, "Clear Queue"
2. **`MiniPlayerBar.tsx`**:
   - Add compact "Next" and "Prev" control buttons alongside Play/Pause.
   - Add a subtle top-border progress bar showing playback percentage.
   - Retain full click-to-expand behavior.
3. **`PlaylistsSection.tsx`**:
   - Add top section for Smart Playlists:
     - **Recently Played** (horizontal scroll cards, last 50 unique tracks)
     - **Most Played** (top tracks by play count)
     - **Liked Songs** (heart icon, all tracks liked by user)
     - **Saved Offline** (instant offline playback filter)
   - For YouTube imported playlists:
     - Display import badge + "Refresh Playlist" button (re-queries `/api/info`, updates track list, alerts on added/removed items)
4. **`app/page.tsx`**:
   - Retain existing tab layout (`downloader`, `history`, `playlists`, `player`).
   - Initialize and synchronize the shared queue and playback engine.
   - Keep downloader UI and all download flows completely unchanged.

---

## 5. Playback Qualification & Unified Liked Engine Specifications

### 1. Play Threshold ($15\text{s}$) & Listening Qualification
- **Constants File (`frontend/lib/player/constants.ts`)**:
  - `PLAY_THRESHOLD_SEC = 15`: Minimum accumulated listening time required before a play is registered.
  - `SKIP_THRESHOLD_SEC = 5`: Skipping before 5 seconds is discarded immediately as a skip, never counting towards history or play count.
- **Real Listening Time Accumulation**:
  - `AudioController` accumulates `listenedElapsedSec += delta` solely during active playing time (`timeupdate` delta $< 1.5\text{s}$). Scrubbing/seeking directly moves `currentTime` but does **not** artificially increase accumulated listening time.
  - Qualification rule: `listenedSec >= PLAY_THRESHOLD_SEC || (durationSec > 0 && listenedSec >= durationSec * 0.5)`.
  - Skipping before `SKIP_THRESHOLD_SEC` (5s) never writes to history.

### 2. Unified "Liked Songs" & Global Heart Component
- **Data Model**:
  - Store: `likedTracks` in IndexedDB with `{ trackId, likedAt }`.
  - Liking an unknown track upserts its `TrackRecord` into `tracks` before adding to `likedTracks`.
  - Unliking removes only the entry from `likedTracks`.
  - Preserved in JSON export/import (`exportPlaylistsAsJson` & `importPlaylistsFromJson`).
- **Reactive Liked Store & Hook (`frontend/lib/player/useLiked.ts`)**:
  - Backed by an in-memory `Set<string>` of liked track IDs synchronized across all mounted components via `"ytdl_liked_changed"` custom events.
  - Optimistic UI updates with instant toggle and micro-animation.
  - Accessible `aria-label` and `aria-pressed`.
- **Global Placement (`LikeButton.tsx`)**:
  - `NowPlayingSection`: Large heart next to controls + double-tap artwork gesture to toggle like.
  - `MiniPlayerBar`: Compact heart icon alongside playback controls.
  - `QueueDrawer`: Per-row heart icon.
  - `SearchResults`: Heart button on every search result row.
  - `PlaylistsSection`: Heart button on every track row.
  - `FileList`: Heart button on downloaded library track rows.
- **Desktop Keyboard Shortcut**:
  - `L` key toggles like for the currently playing track (ignored when user is typing in `input`, `textarea`, or contenteditable).
- **Built-in "Liked Songs" Smart Playlist**:
  - Displayed prominently at the top of Playlists Hub.
  - Newest liked first.
  - Features: "Play All", "Shuffle All", "Save all offline", track count.
  - Non-deletable and non-renamable.

---

## 4. Phase 8: Playlist Import (CSV / Pasted Text -> YouTube Matching)

### Architectural Overview
Spotify, Apple Music, and Deezer cannot be directly streamed or scraped, and Spotify's Web API imposes severe developer restrictions. Phase 8 introduces a **stateless, file- and text-based import pipeline** that matches track metadata against YouTube video IDs via yt-dlp flat-search, scores candidates with a pure heuristic algorithm, presents an interactive review screen, and saves the verified tracks into the local IndexedDB player playlist store.

```
+-----------------------------------------------------------------------------------------+
|                                    FRONTEND                                             |
|  [Import Playlist Modal]                                                                |
|   ├── Option 1: YouTube Playlist URL -> /api/info (existing flow)                       |
|   ├── Option 2: CSV File Upload (Exportify, TuneMyMusic, Soundiiz, etc.)                |
|   └── Option 3: Paste Text ("Artist - Title" or "Title - Artist" with flip toggle)      |
|                                                                                         |
|  [Client Parser] (Pure TypeScript, BOM-aware, RFC 4180 quotes, header auto-detection)  |
|        │                                                                                |
|        ▼ (Chunks of 25 items, sequential batches with Cancel & Resume)                  |
|  POST /api/import/match ──────────────────────────────────────────────────┐             |
+───────────────────────────────────────────────────────────────────────────┼─────────────+
                                                                            │
+───────────────────────────────────────────────────────────────────────────┼─────────────+
|                                    BACKEND                                │             |
|  `api/import_match.py`                                                    ▼             |
|   └── `services/match_service.py`                                                       |
|        ├── In-Memory LRU Cache (max 500 items, keyed by normalized `artist|title`)      |
|        ├── Dedicated Stream ThreadPoolExecutor (max 2 workers, NEVER download pool)     |
|        ├── Flat Search: `ytsearch5:"<artist> <title>"` (timeout 8s/item)                |
|        ├── Scoring Algorithm (0-100 score):                                             |
|        │    • Title/Artist token overlap & normalization (remove feat/ft/brackets)      |
|        │    • Duration closeness (|Δ| <= 3s: +30, |Δ| <= 8s: +20, |Δ| > 60s: -30)       |
|        │    • Channel boost ("- Topic", VEVO: +15; "Official Audio": +15)               |
|        │    • Penalties: live, cover, remix, sped up, karaoke, 8D unless in source       |
|        └── Output: Top 3 candidates + bestMatch + confidence (high/medium/low/none)     |
+───────────────────────────────────────────────────────────────────────────┼─────────────+
                                                                            │
+───────────────────────────────────────────────────────────────────────────┼─────────────+
|                                    FRONTEND                               ▼             |
|  [Review Screen]                                                                        |
|   ├── Confidence filter: High (green), Medium (yellow), Low (amber), None (red)         |
|   ├── Low / None confidence items highlighted and surfaced first                        |
|   ├── "Select All High-Confidence" one-click shortcut                                   |
|   ├── Per-row actions: Preview audio (10s stream), pick candidate, manual search, skip  |
|   └── Confirm Import:                                                                   |
|        • Duplicate detection (merge vs add all)                                         |
|        • Upsert tracks into IndexedDB `tracks` store                                    |
|        • Save playlist into IndexedDB `playlists` store                                 |
|        • Post-import report with downloadable `unmatched.csv`                           |
+-----------------------------------------------------------------------------------------+
```

### Detailed Backend Specifications
1. **New Schema (`backend/app/schemas/import_match.py`)**:
   - `MatchItemRequest`: `title` (str, 1-200), `artist` (str, 1-200), `album` (optional str, 0-200), `durationSec` (optional float).
   - `ImportMatchBatchRequest`: `items` (list of `MatchItemRequest`, max 25 items).
   - `CandidateMatch`: `videoId` (str), `title` (str), `channel` (str), `durationSec` (float | None), `thumbnail` (str | None), `score` (int 0-100).
   - `ItemMatchResult`: `source` (MatchItemRequest), `candidates` (list of up to 3 CandidateMatch), `bestMatch` (CandidateMatch | None), `confidence` ("high" | "medium" | "low" | "none").
   - `ImportMatchBatchResponse`: `results` (list of ItemMatchResult).

2. **New Service (`backend/app/services/match_service.py`)**:
   - `normalize_string(text: str) -> str`: Lowercase, strip accents/punctuation, remove `feat.`, `ft.`, `featuring`, parentheses, and extra whitespace.
   - `score_candidate(source: MatchItemRequest, candidate: dict) -> int`:
     - Base token overlap score between normalized source title/artist and candidate title/channel (up to 50 pts).
     - Duration closeness: $\pm 3\text{s} \to +30$, $\pm 8\text{s} \to +20$, $\pm 15\text{s} \to +10$, $> 60\text{s} \to -30$.
     - Channel boost: Channel ends with `"- Topic"` or contains `"VEVO"`: $+15$. Title contains `"Official Audio"`: $+15$.
     - Negative penalties: If candidate title contains `"live"`, `"cover"`, `"remix"`, `"sped up"`, `"slowed"`, `"karaoke"`, `"8d"`, `"reverb"`, or `"lyrics"` while source title does NOT: deduct $25$ to $40$ pts.
     - Final clamped score between $0$ and $100$.
   - `determine_confidence(score: int) -> str`:
     - $\ge 75 \to \text{"high"}$
     - $\ge 50 \to \text{"medium"}$
     - $\ge 25 \to \text{"low"}$
     - $< 25 \to \text{"none"}$
   - In-memory bounded LRU cache (`_match_cache`, max 500 entries) keyed by `f"{norm_artist}|{norm_title}"`.
   - Execution on `stream_service._stream_executor` (2 worker pool), with per-item 8s timeout and individual try/except block so no item failure breaks the batch.

3. **New API Route (`backend/app/api/import_match.py`)**:
   - Endpoint: `POST /api/import/match` -> returns `ImportMatchBatchResponse`.

4. **Pure Unit Tests (`backend/tests/test_match_service.py`)**:
   - Test normalization functions.
   - Test scoring with fixtures: exact title/artist match, topic channel boost, duration delta scoring, penalty deductions for live/cover/karaoke, and confidence classification. Zero network dependencies.

### Detailed Frontend Specifications
1. **Client-side CSV Parser (`frontend/lib/importer/csvParser.ts`)**:
   - RFC 4180 compliant CSV parser without external dependencies.
   - BOM stripping (`\uFEFF`), comma and semicolon delimiter detection, quoted multiline cells, escaped double quotes (`""`).
   - Column auto-detection mapping variations of Title/Artist/Album/Duration from Spotify, Exportify, Soundiiz, TuneMyMusic:
     - Title: `"Track Name"`, `"Track"`, `"Title"`, `"Song"`, `"Name"`
     - Artist: `"Artist Name(s)"`, `"Artist Name"`, `"Artist"`, `"Artists"`, `"Performer"`
     - Album: `"Album Name"`, `"Album"`
     - Duration: `"Duration (ms)"`, `"Duration"`, `"Time"`, `"Length"` (converts ms -> seconds).
   - Text parser supporting `Artist - Title`, `Title - Artist` (with flip option) or line-by-line titles.
   - Unit tests: `frontend/lib/importer/csvParser.test.ts`.

2. **Import Modal & Workflow (`frontend/components/PlaylistImportModal.tsx`)**:
   - Tab 1: **YouTube URL** -> reuses `/api/info` import.
   - Tab 2: **CSV File** -> file upload or drag-and-drop, displays detected columns and parsed track count.
   - Tab 3: **Paste Text** -> multiline textarea with flip order toggle.
   - Batch runner: 25 items per batch, sequential calls to `/api/import/match`, progress bar, cancel, resume.
   - Review Screen:
     - Confidence filter chips (All, Needs Review, High Confidence).
     - Row cards: Artwork, Title, Channel, Duration, Confidence badge.
     - Row actions: Preview audio stream, dropdown of other candidates, manual search modal, skip toggle.
     - "Select all high-confidence" shortcut.
   - Confirmation & Saving:
     - Playlist name field.
     - Duplicate check (merge vs add all).
     - Writes to IndexedDB `tracks` & `playlists`.
     - Import report with summary counts and "Download unmatched.csv" action.

3. **Integration**:
   - `frontend/components/PlaylistsSection.tsx`: Wire the "Import" button to trigger `PlaylistImportModal`.
   - Downloader, history, library, and theme features remain completely untouched.

---

## 5. Change Request: Play Threshold (15s) & Liked Engine

### 1. Play Threshold (15 seconds)
- **Problem**: Previously 30s listen time was required before recording a track in `history` and `playCounts`.
- **New Requirement**:
  - A track is recorded in `history` and counted in `playCounts` / "Recently Played" after **$\ge 15$ seconds of actual listening or $\ge 50$% of the track duration**, whichever comes first.
  - Count **real listening time** (accumulated while playing), NOT seek position. Scrubbing directly to the middle does not count as playback time.
  - Skipping before 5s is not a play.
  - Values extracted into dedicated constants: `frontend/lib/player/constants.ts`:
    ```typescript
    export const PLAY_THRESHOLD_SEC = 15;
    export const SKIP_THRESHOLD_SEC = 5;
    ```
  - In `frontend/lib/player/audioController.ts`, track `listenedElapsedSec` by measuring delta timestamps during `timeupdate` (ignoring discontinuous seek jumps where $|delta| > 1.5$s).
  - Update `frontend/lib/db.ts` `recordPlayHistory()` to use `PLAY_THRESHOLD_SEC` and `SKIP_THRESHOLD_SEC`.

### 2. Like Button (Heart) & "Liked Songs" Engine
- **Data Model**:
  - `likedTracks` IndexedDB store: `{ trackId: string, likedAt: number }`.
  - Track metadata persists in the `tracks` store.
  - Liking an unrecorded track automatically upserts it into `tracks` before adding to `likedTracks`.
  - Unliking deletes only the `likedTracks` record, keeping metadata in `tracks`.
  - Offline compatibility: IndexedDB only.
  - JSON Backup / Restore: included in `exportPlaylistsAsJson()` and `importPlaylistsFromJson()`.
  - Survives migration from localStorage playlists.
- **Smart Playlist: "Liked Songs"**:
  - Virtual/built-in smart playlist at the very top of `PlaylistsSection` (above custom playlists).
  - Not deletable and not renamable.
  - Sorted newest liked first (`likedAt` descending).
  - Features: Track count badge, "Play All", "Shuffle All", "Save all offline".
- **Unified `<LikeButton />` Component**:
  - Reusable across:
    1. Now Playing screen (large icon + double-tap artwork gesture to like)
    2. Mini-player bar
    3. Queue drawer rows
    4. Search results cards
    5. Playlist track rows
    6. History / Library rows
    7. Context / 3-dot menus ("Like / Remove from Liked Songs")
  - Works consistently for stream tracks, offline tracks, and library files (using `lib:<filename>`).
  - Optimistic toggle with micro-animation (`scale-110 active:scale-125 transition-transform`).
  - Accessible labels: `aria-label="Like track"`, `aria-pressed={isLiked}`.
  - Color: Filled heart in theme accent color when liked; stroke outline when unliked.
  - Shared reactive hook `useLiked(trackId)` / `useLikedTrack(track)`:
    - In-memory `Set<string>` cache for instant $0$ms lookups.
    - Synchronized across all components simultaneously via custom event `ytdl_liked_changed`.
- **Desktop Keyboard Shortcut**:
  - Key `'l'` / `'L'` toggles like state of currently playing track (ignored inside `input`, `textarea`, `contenteditable`).
- **Testing**:
  - Unit tests for threshold constants and calculation logic.
  - Unit tests for like/unlike toggling, upserting unknown tracks, newest-first ordering, and synchronizing across consumers.


