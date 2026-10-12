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
