# Project Tasks: YT Music Online Player & PWA Upgrade

## Living Checklist

### Step 0: Planning & Setup
- [x] Run comprehensive read-only audit
- [x] Create feature branch `feature/music-player-pwa`
- [x] Create `TASKS.md`
- [x] Create `IMPLEMENTATION_PLAN.md`
- [x] Review plan with user and obtain approval before code changes

---

### Phase 1: Backend Streaming (Additive)
- [x] Pin `httpx==0.28.1` in `backend/requirements.txt`
- [x] Create `backend/app/schemas/stream.py` (stream metadata, error responses)
- [x] Create `backend/app/services/stream_service.py`:
  - [x] Format selection for progressive audio-only HTTPS (prefer m4a/AAC over opus/webm, exclude HLS/DASH)
  - [x] Handle `extract_info` returning `None` (`ignoreerrors: True`)
  - [x] Dedicated ThreadPoolExecutor (max 2 workers) + Semaphore for yt-dlp extraction
  - [x] In-memory TTL cache with capacity cap for resolved stream URLs
  - [x] Upstream range proxying via `httpx.AsyncClient` with chunked streaming and client abort handling
  - [x] Throttling prevention: fetch upstream in ranged chunks even when client sends no Range header
  - [x] Concurrency guard via `MAX_CONCURRENT_STREAMS` (default 3)
- [x] Create `backend/app/api/stream.py`:
  - [x] `GET /api/stream/{video_id}` with strict 11-char regex validation and Range 206 support
  - [x] `GET /api/thumb` thumbnail proxy (allowlisted to YouTube domains) for offline storage without CORS
- [x] Add optional `YTDLP_COOKIES_FILE` setting in `backend/app/config.py` and mount path
- [x] Add stale temp file cleaner for `downloads/temp` at startup (configurable retention hours, default on)
- [x] Register stream router in `backend/app/main.py` (additive, no changes to existing routes)
- [x] Write unit tests in `backend/tests/test_stream.py` (mocked yt-dlp and upstream HTTP, Range 206, invalid IDs, TTL cache)
- [x] Verify existing 57 tests + new tests pass (`PYTHONPATH=backend pytest backend/tests -v`, 85 passed)
- [x] Commit Phase 1 changes to git

---

### Phase 2: Frontend Stream Playback Integration
- [x] Add optional stream fields to `FileInfo` in `frontend/lib/types.ts` (`source_type`, `stream_url`, ephemeral `offline_blob_url`, `duration`, `artist`)
- [x] Add `getStreamUrl` and `getThumbProxyUrl` in `frontend/lib/api.ts`
- [x] Implement audio source resolution order: ephemeral offline blob (at play time only) → library file → stream URL
- [x] Enhance `frontend/components/SearchResults.tsx` with direct "Play" stream action alongside "Download" and iframe preview
- [x] Enhance `frontend/components/PlaylistVideoList.tsx` with "Play All" and track stream play
- [x] Add Media Session API handler in `frontend/components/NowPlayingSection.tsx` (lock screen metadata & controls)
- [x] Handle playback states: buffering, stream errors, auto-skip to next track on failure
- [x] Verify responsive layout, touch targets, and safe-area insets
- [x] Run `npm --prefix frontend run build` & lint
- [x] Commit Phase 2 changes to git

---

### Phase 3: IndexedDB Layer
- [x] Add `idb` dependency to `frontend/package.json`
- [x] Create `frontend/lib/db.ts` with stores:
  - [x] `tracks`: metadata for library & stream tracks
  - [x] `playlists`: custom stream/mixed playlists
  - [x] `history`: playback history (capped entries)
  - [x] `settings`: volume, repeat, shuffle, last queue position
  - [x] `offlineTracks`: audio Blob, thumbnail Blob, metadata, savedAt, size (NEVER store object URLs)
- [x] Implement one-time idempotent migration from `ytdl_custom_playlists_v1` in localStorage to IndexedDB (keep backup in localStorage)
- [x] Update `frontend/components/PlaylistsSection.tsx` to read/write through IndexedDB repository with fallback
- [x] Add queue restoration and settings persistence on app launch
- [x] Add JSON export / import for user library and playlists
- [x] Add storage quota estimation (`navigator.storage.estimate()`)
- [x] Run frontend build & typecheck
- [x] Commit Phase 3 changes to git

---

### Phase 4: PWA (Manifest & Hand-Written Service Worker)
- [x] Create `frontend/app/manifest.ts` (Next.js metadata route)
- [x] Generate real PWA icon assets (192x192, 512x512, maskable) into `frontend/public/icons/`
- [x] Create `frontend/app/offline/page.tsx` for clean offline fallback (used only if no cached shell exists)
- [x] Create `frontend/public/sw.js`:
  - [x] Cache-first for hashed `/_next/static/*` assets
  - [x] Real app shell caching: cache `/` on successful navigation and serve when offline
  - [x] Explicitly bypass `/api/stream/*`, `/api/download/*`, `/api/files/*` Range requests, and WebSocket
  - [x] Never cache cross-origin opaque thumbnails in Cache Storage (handled in IDB)
  - [x] Versioned cache lifecycle and old cache cleanup on activate
- [x] Add Service Worker registration helper in `frontend/app/layout.tsx` (production only)
- [x] Add in-app update prompt ("New version available")
- [x] Implement install prompt button (`beforeinstallprompt`) and iOS "Add to Home Screen" instructions
- [x] Implement offline state detection and banner in `frontend/app/page.tsx`
- [x] Commit Phase 4 changes to git

---

### Phase 5: Offline Tracks
- [x] Implement sequential offline download manager in `frontend/lib/offlineManager.ts`:
  - [x] Stream chunk-by-chunk download with progress feedback
  - [x] Blob assembly and storage into IndexedDB `offlineTracks` store
  - [x] Thumbnail caching via `/api/thumb`
  - [x] Cancel, delete, and storage quota protection
  - [x] Sequential saves only (low memory)
- [x] Add "Save Offline" action to `NowPlayingSection`, `SearchResults`, `FileList`, and `PlaylistsSection`
- [x] Provide "Saved Offline" filter in library view
- [x] Support object URL lifecycle (`URL.createObjectURL` at play time / `URL.revokeObjectURL` on switch/teardown)
- [x] Document iOS Safari storage quotas and background download limitations in README
- [x] Test offline playback behavior
- [x] Commit Phase 5 changes to git

---

### Phase 6: Production Deployment on ~2 GB VM
- [x] Update `frontend/Dockerfile`:
  - [x] Add `ARG NEXT_PUBLIC_API_URL="http://localhost:8000"` and `ARG NEXT_PUBLIC_WS_URL="ws://localhost:8000"` with dev defaults
- [x] In `frontend/lib/websocket.ts`, derive `wss://${window.location.host}/api/...` when `NEXT_PUBLIC_WS_URL` is empty
- [x] Update `backend/Dockerfile`:
  - [x] Make Deno download architecture-aware (`x86_64` vs `aarch64`)
- [x] Create `docker-compose.prod.yml`:
  - [x] Pass empty `NEXT_PUBLIC_*` build args for same-origin relative URLs
  - [x] Memory limits (`mem_limit`): backend ~700m, frontend ~350m, caddy ~64m
  - [x] Internal ports only (no host port publication for backend/frontend)
  - [x] Restart policies, volume bindings, and healthchecks
- [x] Create `Caddyfile`:
  - [x] Automatic HTTPS configuration via HTTP challenge for DuckDNS
  - [x] Proxy `/api/*` directly to backend with WebSocket support and `flush_interval -1`
  - [x] Proxy remaining routes to frontend
  - [x] Basic auth named matcher `@protected { not path /manifest.webmanifest /sw.js /icons/* /offline }` and `basic_auth @protected { ... }`
- [x] Create `scripts/auto-update-ytdlp.sh` (safe test, bump, rebuild, rollback)
- [x] Create `DEPLOYMENT.md` with 2 GB swap setup, DuckDNS guide, cookie export instructions, and troubleshooting
- [x] Commit Phase 6 changes to git

---

### Phase 7: QA, Regression Verification & Documentation
- [ ] Full regression testing:
  - [ ] Single video download (video & audio)
  - [ ] Playlist download with ZIP creation
  - [ ] WebSocket live progress
  - [ ] Library files view & delete
  - [ ] Existing themes
- [ ] New features testing:
  - [ ] On-demand audio streaming with Range seek
  - [ ] Playlist streaming (next, previous, repeat, shuffle)
  - [ ] Offline track saving and playback with network disconnected
  - [ ] PWA installation and offline shell load
- [ ] Update `README.md` (correct test count to 57+, new features, architecture, deployment)
- [ ] Final audit summary and merge preparation

---

## Decisions / Known Issues

1. **Service Worker Strategy**: Hand-written `public/sw.js` chosen over `next-pwa` (unmaintained) and `@serwist/next` (bundler coupling risk with Next.js 16 App Router).
2. **Audio Offline Storage**: Stored as `Blob` in IndexedDB played via ephemeral `URL.createObjectURL(blob)` created strictly at play time. Never persist object URLs. This completely avoids Service Worker range request interception complexities and works consistently on iOS Safari.
3. **VM Memory Constraints (~2 GB RAM)**:
   - No audio transcoding on the fly: proxy direct AAC/m4a stream from YouTube.
   - Streaming executor isolated with max 2 workers and `MAX_CONCURRENT_STREAMS=3`.
   - Swap space (2 GB) required during `next build` on the VM.
4. **Stream Proxy Throttling**: Upstream is always fetched with ranged chunks (e.g. 512 KB chunks) even when client sends no Range header, preventing YouTube CDN bandwidth throttling.
5. **Existing Tests**: 57 tests in `backend/tests/` remain intact and all must pass after every phase.
