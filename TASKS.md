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
- [ ] Add `idb` dependency to `frontend/package.json`
- [ ] Create `frontend/lib/db.ts` with stores:
  - [ ] `tracks`: metadata for library & stream tracks
  - [ ] `playlists`: custom stream/mixed playlists
  - [ ] `history`: playback history (capped entries)
  - [ ] `settings`: volume, repeat, shuffle, last queue position
  - [ ] `offlineTracks`: audio Blob, thumbnail Blob, metadata, savedAt, size (NEVER store object URLs)
- [ ] Implement one-time idempotent migration from `ytdl_custom_playlists_v1` in localStorage to IndexedDB (keep backup in localStorage)
- [ ] Update `frontend/components/PlaylistsSection.tsx` to read/write through IndexedDB repository with fallback
- [ ] Add queue restoration and settings persistence on app launch
- [ ] Add JSON export / import for user library and playlists
- [ ] Add storage quota estimation (`navigator.storage.estimate()`)
- [ ] Run frontend build & typecheck
- [ ] Commit Phase 3 changes to git

---

### Phase 4: PWA (Manifest & Hand-Written Service Worker)
- [ ] Create `frontend/app/manifest.ts` (Next.js metadata route)
- [ ] Generate real PWA icon assets (192x192, 512x512, maskable) into `frontend/public/icons/`
- [ ] Create `frontend/app/offline/page.tsx` for clean offline fallback (used only if no cached shell exists)
- [ ] Create `frontend/public/sw.js`:
  - [ ] Cache-first for hashed `/_next/static/*` assets
  - [ ] Real app shell caching: cache `/` on successful navigation and serve when offline
  - [ ] Explicitly bypass `/api/stream/*`, `/api/download/*`, `/api/files/*` Range requests, and WebSocket
  - [ ] Never cache cross-origin opaque thumbnails in Cache Storage (handled in IDB)
  - [ ] Versioned cache lifecycle and old cache cleanup on activate
- [ ] Add Service Worker registration helper in `frontend/app/layout.tsx` (production only)
- [ ] Add in-app update prompt ("New version available")
- [ ] Implement install prompt button (`beforeinstallprompt`) and iOS "Add to Home Screen" instructions
- [ ] Implement offline state detection and banner in `frontend/app/page.tsx`
- [ ] Commit Phase 4 changes to git

---

### Phase 5: Offline Tracks
- [ ] Implement sequential offline download manager in `frontend/lib/offlineManager.ts`:
  - [ ] Stream chunk-by-chunk download with progress feedback
  - [ ] Blob assembly and storage into IndexedDB `offlineTracks` store
  - [ ] Thumbnail caching via `/api/thumb`
  - [ ] Cancel, delete, and storage quota protection
  - [ ] Sequential saves only (low memory)
- [ ] Add "Save Offline" action to `NowPlayingSection`, `SearchResults`, `FileList`, and `PlaylistsSection`
- [ ] Provide "Saved Offline" filter in library view
- [ ] Support object URL lifecycle (`URL.createObjectURL` at play time / `URL.revokeObjectURL` on switch/teardown)
- [ ] Document iOS Safari storage quotas and background download limitations in README
- [ ] Test offline playback behavior
- [ ] Commit Phase 5 changes to git

---

### Phase 6: Production Deployment on ~2 GB VM
- [ ] Update `frontend/Dockerfile`:
  - [ ] Add `ARG NEXT_PUBLIC_API_URL="http://localhost:8000"` and `ARG NEXT_PUBLIC_WS_URL="ws://localhost:8000"` with dev defaults
- [ ] In `frontend/lib/websocket.ts`, derive `wss://${window.location.host}/api/...` when `NEXT_PUBLIC_WS_URL` is empty
- [ ] Update `backend/Dockerfile`:
  - [ ] Make Deno download architecture-aware (`x86_64` vs `aarch64`)
- [ ] Create `docker-compose.prod.yml`:
  - [ ] Pass empty `NEXT_PUBLIC_*` build args for same-origin relative URLs
  - [ ] Memory limits (`mem_limit`): backend ~700m, frontend ~350m, caddy ~64m
  - [ ] Internal ports only (no host port publication for backend/frontend)
  - [ ] Restart policies, volume bindings, and healthchecks
- [ ] Create `Caddyfile`:
  - [ ] Automatic HTTPS configuration via HTTP challenge for DuckDNS
  - [ ] Proxy `/api/*` directly to backend with WebSocket support and `flush_interval -1`
  - [ ] Proxy remaining routes to frontend
  - [ ] Basic auth named matcher `@protected { not path /manifest.webmanifest /sw.js /icons/* /offline }` and `basic_auth @protected { ... }`
- [ ] Create `scripts/auto-update-ytdlp.sh` (safe test, bump, rebuild, rollback)
- [ ] Create `DEPLOYMENT.md` with 2 GB swap setup, DuckDNS guide, cookie export instructions, and troubleshooting
- [ ] Commit Phase 6 changes to git

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
