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

### Phase 2b: Pure Music-Player Engine & Queue Controller
- [ ] Implement `frontend/lib/player/types.ts`:
  - [ ] `QueueItem` ({ qid, trackId }), `RepeatMode` ("off" | "all" | "one"), `PersistedPlayerState`
- [ ] Implement `frontend/lib/player/queue.ts` (pure framework-agnostic queue engine):
  - [ ] `play`, `playNow`, `playNext`, `addToQueue`, `remove`, `clear`, `move`, `jumpToIndex`
  - [ ] Fisher-Yates shuffle with current track pinned and `originalOrder` restoration
  - [ ] Shuffle `historyStack` for previous navigation
  - [ ] Repeat modes (`off`, `all`, `one`) with autoplay vs manual next handling
  - [ ] Previous track logic (restart if >3s, else go to previous)
  - [ ] State serialization and restoration
- [ ] Write unit tests in `frontend/lib/player/queue.test.ts`:
  - [ ] Shuffle with original order restoration
  - [ ] Repeat modes (off/all/one) and boundary wrapping
  - [ ] Previous restart (>3s) vs advance
  - [ ] Reorder, remove-current, and queue restore
- [ ] Run queue unit tests with `node --test` and verify 100% pass
- [ ] Implement `frontend/lib/player/audioController.ts` & `useMusicPlayer`:
  - [ ] Single persistent audio element + hidden secondary warmup preload audio element
  - [ ] Next track preloading at ~75% or <20s remaining (disabled when offline or on data-saver)
  - [ ] Listen time qualification tracker (>=30s or >=50% duration)
  - [ ] Long track resume position saving for tracks >10 min
  - [ ] Sleep timer (15, 30, 60 min, end of track) with 5s fade-out
  - [ ] Media Session API updates (`setPositionState`, lock-screen scrubbing, play/pause/prev/next/seek)
  - [ ] Desktop keyboard shortcuts (Space, Left/Right seek, Shift+Left/Right track, M mute)
  - [ ] Stale stream retry once (`?retry=1`) and 3-consecutive-error auto-skip limit

---

### Phase 3b: Extended IndexedDB Data Model, Smart Playlists & UI
- [ ] Update `frontend/lib/db.ts` to `DB_VERSION = 2`:
  - [ ] New/updated stores: `tracks`, `playlists` (with `kind` and `trackIds`), `history` (auto key), `playCounts`, `likedTracks`
  - [ ] Idempotent migration from v1 `CustomPlaylist` to v2 `PlaylistRecord` mapping to `lib:<filename>`
  - [ ] History qualification: record only when listened >=30s or >=50%
  - [ ] Capped history log (max 500 entries) with de-duplicated **Recently Played** (last 50 unique tracks)
  - [ ] Aggregate **Most Played** query from `playCounts`
  - [ ] **Liked Songs** toggle and query
  - [ ] YouTube playlist import and refresh via `/api/info`
- [ ] Minimal UI updates in `frontend/components/NowPlayingSection.tsx`:
  - [ ] Preserve existing props (`currentFile`, `playlist`, `allFiles`, etc.)
  - [ ] 3-state Repeat button, Shuffle button, Like heart button, Sleep timer menu
  - [ ] Touch-friendly slide-over Queue Drawer ("Now Playing" + "Up Next" with drag/pointer reorder, remove, clear)
- [ ] Minimal UI updates in `frontend/components/MiniPlayerBar.tsx`:
  - [ ] Add compact Prev & Next buttons and top edge progress line
- [ ] Minimal UI updates in `frontend/components/PlaylistsSection.tsx`:
  - [ ] Smart Playlists section: **Recently Played**, **Most Played**, **Liked Songs**, **Saved Offline**
  - [ ] YouTube import badge, "Refresh Playlist" action, track reordering
- [ ] Minimal UI updates in `frontend/app/page.tsx`:
  - [ ] Sync shared queue state while preserving Downloader tab and existing flows
- [ ] Run full test suites:
  - [ ] Unit tests for queue and history logic pass
  - [ ] All backend tests pass (`python -m pytest backend/tests`)
  - [ ] `npm --prefix frontend run build` passes with zero type errors

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
- [x] Full regression testing:
  - [x] Single video download (video & audio)
  - [x] Playlist download with ZIP creation
  - [x] WebSocket live progress
  - [x] Library files view & delete
  - [x] Existing themes
- [x] New features testing:
  - [x] On-demand audio streaming with Range seek
  - [x] Playlist streaming (next, previous, repeat, shuffle)
  - [x] Offline track saving and playback with network disconnected
  - [x] PWA installation and offline shell load
- [x] Update `README.md` (correct test count to 91, new features, architecture, deployment)
- [x] Final audit summary and merge preparation

---

### LAN / Mobile Testing Support (Optional Chore)
- [x] Dynamic runtime backend URL derivation in `frontend/lib/api.ts` and `frontend/lib/websocket.ts`
  - [x] Undefined fallback in browser: derives `${location.protocol}//${location.hostname}:8000`
  - [x] Server / SSR fallback: `http://localhost:8000` / `ws://localhost:8000`
  - [x] Preserved 3-way behavior: undefined (LAN derivation), non-empty string (custom), empty string `""` (prod same-origin)
- [x] Backend CORS for private LAN origins:
  - [x] Added `CORS_ALLOW_LAN` (default `false`) in `config.py`
  - [x] Added `allow_origin_regex` for private IP ranges on port 3000 in `main.py`
  - [x] Expose `CORS_ALLOW_LAN=${CORS_ALLOW_LAN:-false}` in `docker-compose.yml` and `.env.example`
- [x] Created PowerShell helper `scripts/lan-up.ps1` (detects LAN IP, checks firewall, starts stack, tests health)
- [x] Created `scripts/lan-down.ps1` (stops stack)
- [x] Documented LAN phone testing, HTTPS limitations, and troubleshooting in `README.md`

---

### Phase 2b: Pure Queue Engine & Audio Playback Controller
- [x] Create pure, framework-agnostic `QueueEngine` (`frontend/lib/player/queue.ts`):
  - [x] Queue items with stable UUIDs (`QueueItem { qid, trackId }`)
  - [x] Fisher-Yates shuffle pinning current track with `originalOrder` restoration
  - [x] Shuffle history stack for deterministic `prev`
  - [x] 3-state repeat modes: `off`, `all`, `one`
  - [x] `playNow`, `playNext`, `addToQueue`, `remove`, `move`, `jumpToIndex`
  - [x] Unit test suite (`frontend/lib/player/queue.test.ts`, 11/11 tests pass)
- [x] Create persistent `AudioController` (`frontend/lib/player/audioController.ts`):
  - [x] Single persistent `HTMLAudioElement` for uninterrupted playback across tab switches
  - [x] Secondary preloader (`preload="metadata"` at ~75% or <20s remaining, disabled on saver/offline)
  - [x] Three-tier source resolution: Ephemeral Offline Blob -> Library File -> Stream Proxy
  - [x] Listen-time qualification (>=30s or >=50% of track)
  - [x] Long-track position resume memory (>10 min)
  - [x] Sleep timer (15, 30, 60 min, track end) with 5s smooth fade-out
  - [x] Media Session API metadata & lockscreen scrubbing
  - [x] Automatic stale stream recovery (`?retry=1`)
- [x] Create `useMusicPlayer` hook (`frontend/lib/player/useMusicPlayer.ts`):
  - [x] Connects `QueueEngine` & `AudioController` with reactive React state
  - [x] Throttled persistence to IndexedDB (saved every ~5s, restored on app start paused)
  - [x] Desktop keyboard shortcuts (Space, ArrowLeft/Right, Shift+ArrowLeft/Right, M)
- [x] MiniPlayerBar & NowPlaying enhancements:
  - [x] Added `onPlayNext`, `onPlayPrev`, and top progress accent line to `MiniPlayerBar`
  - [x] Added 3-state repeat, shuffle, like button, sleep timer menu to `NowPlayingSection`
  - [x] Slide-over touch/pointer `<QueueDrawer />` with reordering, removal, and clear

---

### Phase 3b: Enhanced Playlists & "Recently Played" Engine
- [x] IndexedDB v2 upgrade in `frontend/lib/db.ts`:
  - [x] Stores: `tracks`, `playlists` (with `kind` & `trackIds`), `history` (capped at 500), `playCounts`, `likedTracks`
  - [x] Automated migration from v1 to v2 while preserving backwards compatibility
  - [x] Unified track conversions (`fileInfoToTrackRecord`, `trackRecordToFileInfo`)
- [x] Smart Playlists shelf in `PlaylistsSection`:
  - [x] **Recently Played**: De-duplicated top 50 recent qualified tracks + horizontal carousel
  - [x] **Most Played**: Top tracks by qualified listen count
  - [x] **Liked Songs**: Hearted tracks collection
  - [x] **Saved Offline**: Direct access to cached offline tracks
- [x] YouTube Playlist Import & Refresh:
  - [x] Imported playlists marked with YouTube badge
  - [x] "Refresh Playlist" action calling `/api/info` to discover new additions
- [x] Seamless Integration in `page.tsx`:
  - [x] Synchronized `useMusicPlayer` with player and miniplayer
  - [x] Preserved zero regressions across downloader, history, and theme settings

---

### Phase 8: Playlist Import (CSV / Pasted Text -> YouTube Matching)
- [x] Backend stateless matching endpoint (`POST /api/import/match`):
  - [x] Create schemas in `backend/app/schemas/import_match.py` (`MatchItemRequest`, `CandidateMatch`, `ItemMatchResult`, `ImportMatchBatchResponse`)
  - [x] Implement `backend/app/services/match_service.py`:
    - [x] String normalization (clean punctuation, "feat.", "ft.", brackets, extra whitespace)
    - [x] Token overlap scoring between source metadata and candidate YouTube metadata
    - [x] Duration closeness scoring (+30 within 3s, +20 within 8s, -30 beyond 60s)
    - [x] Channel and official audio bonuses ("- Topic", VEVO, "Official Audio")
    - [x] Negative penalties for live/cover/remix/karaoke/8D unless source includes keyword
    - [x] Score clamping (0-100) and confidence classification (`high`, `medium`, `low`, `none`)
    - [x] In-memory bounded LRU cache (max 500 items)
    - [x] Execution on `stream_service._stream_executor` (isolated 2-worker pool, never download pool)
    - [x] Per-item timeout (8s) and individual exception isolation
  - [x] Create router in `backend/app/api/import_match.py` and register in `backend/app/main.py`
  - [x] Add unit tests in `backend/tests/test_match_service.py` (fixtures only, no network calls)
- [x] Frontend CSV & text parsers:
  - [x] Create `frontend/lib/importer/csvParser.ts` (BOM-safe, RFC 4180 quotes/commas/semicolons, column auto-detection for Title/Artist/Album/Duration across Spotify/Exportify/TuneMyMusic/Soundiiz)
  - [x] Add text parser supporting `Artist - Title`, `Title - Artist` (with flip option), and single title per line
  - [x] Add unit tests in `frontend/lib/importer/csvParser.test.ts`
- [x] Frontend import modal & review UI:
  - [x] Create `frontend/components/PlaylistImportModal.tsx` with 3 entry tabs: YouTube URL, CSV File upload, and Paste Text
  - [x] Batch execution runner: sequential 25-item batches with live progress bar, cancel, and resume
  - [x] Interactive Review Screen:
    - [x] Confidence badge filtering (High, Medium, Low, None) with low/none surfaced first
    - [x] "Select all high-confidence" quick toggle
    - [x] Per-row actions: audio preview (10s stream), alternate candidate selection, manual search modal, exclude/skip toggle
  - [x] Confirmation and saving:
    - [x] Custom playlist name field
    - [x] Duplicate detection by video ID with merge vs add-all options
    - [x] Write tracks to IndexedDB `tracks` store and playlist to `playlists` store
    - [x] Post-import summary report with "Download unmatched.csv" export
- [x] Integration & Documentation:
  - [x] Connect Import button in `frontend/components/PlaylistsSection.tsx` to `PlaylistImportModal`
  - [x] Update `README.md` with an "Import Playlists" guide explaining how to export CSV from Spotify/Apple Music and best-effort matching limitations
- [x] Verification:
  - [x] Run backend tests (`pytest backend/tests` - 103/103 passed)
  - [x] Run frontend unit tests (`npm test` - 18/18 passed)
  - [x] Run frontend production build (`npm run build` - clean)

---

### Change Request: 15s Play Threshold & Liked Engine
- [x] Constants and playback listening threshold:
  - [x] Create `frontend/lib/player/constants.ts` with `PLAY_THRESHOLD_SEC = 15` and `SKIP_THRESHOLD_SEC = 5`
  - [x] Update `frontend/lib/player/audioController.ts` to measure real accumulated listening time (ignoring scrubbing)
  - [x] Update `frontend/lib/db.ts` `recordPlayHistory()` with $\ge 15$s or $\ge 50$% condition and discard $< 5$s skips
- [x] Data layer and persistence (`frontend/lib/db.ts`):
  - [x] Liking an unknown track automatically upserts into `tracks` before adding to `likedTracks`
  - [x] Unliking deletes only from `likedTracks`
  - [x] Export / import JSON includes `likedTracks`
  - [x] Preserve liked tracks during legacy localStorage migration
- [x] Liked state sync & UI components:
  - [x] Shared hook `frontend/lib/player/useLiked.ts` with instant in-memory `Set` and `ytdl_liked_changed` event
  - [x] Unified `<LikeButton />` (`frontend/components/LikeButton.tsx`) with animated toggle, accent color, and `aria-pressed`
  - [x] Connect `<LikeButton />` in:
    - [x] `NowPlayingSection.tsx` (large heart + double-tap artwork gesture to like)
    - [x] `MiniPlayerBar.tsx` (compact heart)
    - [x] `QueueDrawer.tsx` (per-row heart)
    - [x] `SearchResults.tsx` (per-card heart)
    - [x] `PlaylistsSection.tsx` (per-track row heart)
    - [x] `FileList.tsx` (history/library rows)
    - [x] Context menus ("Like / Remove from Liked Songs")
- [x] Built-in smart playlist "Liked Songs":
  - [x] Display at the top of Library/Playlists
  - [x] Non-deletable and non-renamable
  - [x] Sorted newest liked first (`likedAt` descending)
  - [x] Actions: Play All, Shuffle All, Save all offline, track count badge
- [x] Desktop keyboard shortcut:
  - [x] Pressing `L` toggles like state of currently playing track (ignored in input/textarea/contenteditable)
- [x] Unit tests & verification:
  - [x] Create `frontend/lib/player/liked.test.ts` for thresholds, toggling, ordering, upserting, and store sync
  - [x] Run backend pytest tests (103/103 passed)
  - [x] Run frontend unit tests (`npm test` - 28/28 passed)
  - [x] Run `npm run build` with zero errors

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
