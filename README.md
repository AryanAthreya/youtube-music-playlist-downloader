# YouTube Video & Music Playlist Downloader + PWA Player

[![CI/CD Pipeline](https://github.com/AryanAthreya/youtube-music-playlist-downloader/actions/workflows/ci.yml/badge.svg)](https://github.com/AryanAthreya/youtube-music-playlist-downloader/actions/workflows/ci.yml)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2016-000000.svg?logo=next.js&logoColor=white)](https://nextjs.org)
[![PWA](https://img.shields.io/badge/PWA-Installable-purple.svg?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![Docker Compose](https://img.shields.io/badge/Container-Docker%20Compose-2496ED.svg?logo=docker&logoColor=white)](https://www.docker.com)
[![yt-dlp](https://img.shields.io/badge/Extractor-yt--dlp-FF0000.svg?logo=youtube&logoColor=white)](https://github.com/yt-dlp/yt-dlp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A modern, production-grade, locally-run and cloud-deployable web application and installable PWA to stream YouTube music on-demand, save tracks offline, manage custom playlists, and download 4K videos, 320kbps MP3s, and complete playlists with automatic ZIP packaging via `yt-dlp` and `FFmpeg`. Runs in Docker with zero external database dependencies.

---

## Features

- 🎧 **On-Demand Audio Streaming**: Instantly stream high-bitrate audio from search results and playlists without downloading files to disk. Supports byte-range scrubbing and seek.
- 📱 **Installable PWA**: Install directly to iOS, Android, macOS, or Windows home screens. Uses a custom Service Worker that caches the app shell (`/`) for instant startup.
- ⚡ **Offline Mode (IndexedDB)**: Save individual tracks directly to browser IndexedDB as audio Blobs. Play completely offline with zero network connectivity. Includes storage quota indicators and cleanup controls.
- 🔒 **Lock-Screen & Media Controls**: Integrated Media Session API displaying track artwork, artist, title, playback state, and lock-screen seek / skip controls.
- 📋 **Persistent Playlists & History**: Client-side IndexedDB persistence for user playlists, playback history, and play queues. Easily export or import playlists as JSON.
- 🔍 **Live Keyword Search**: Instant YouTube search with live thumbnails, view counts, and durations.
- 📥 **High Quality Video & Audio Downloads**: Up to 4K / 1080p 60fps MP4 video and 320kbps MP3 audio extraction with metadata tagging.
- 📜 **Full Playlist Download Support**: Download complete playlists or selectively choose individual tracks. Automatically bundles finished playlist items into a `.zip` archive.
- 🚀 **Direct Browser Downloads**: Triggers native browser download tray (`Ctrl + J`) directly into your computer's Downloads folder.
- 🔄 **Real-Time WebSocket Progress**: Live byte counter, transfer speed, and completion percentage updates.
- 🛡️ **Resource-Constrained VM Ready**: Multi-arch Docker images (x86_64 / ARM aarch64), memory limits (fits comfortably within a 2 GB RAM VM), upstream chunked range buffering to counter YouTube throttling, and automatic Caddy HTTPS with DuckDNS.

---

## Quick Start (Local Development)

```bash
# 1. Clone the repository
git clone https://github.com/AryanAthreya/youtube-music-playlist-downloader.git
cd youtube-music-playlist-downloader

# 2. Copy and configure environment variables (optional)
cp .env.example .env

# 3. Build and launch Docker containers
docker compose up --build -d

# 4. Open in browser
# Frontend: http://localhost:3000
# Backend Health Check: http://localhost:8000/api/health
```

---

## Production Deployment (~2 GB RAM Linux VM)

For hosting on a cloud VM (e.g., Oracle Cloud Free Tier, Hetzner, DigitalOcean) with automatic HTTPS via DuckDNS and Caddy:

1. Follow the step-by-step instructions in [DEPLOYMENT.md](DEPLOYMENT.md).
2. Uses `docker-compose.prod.yml` with strict memory limits (`backend: 1000M`, `frontend: 512M`, `caddy: 128M`).
3. Includes `scripts/auto-update-ytdlp.sh` for safe self-healing updates and automatic rollback.

```bash
# Deploy with production compose
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Architecture

```
Internet / Client Browser (PWA)
    │
    ▼ [HTTPS :443 / :80]
Caddy Reverse Proxy (Auto TLS / DuckDNS HTTP Challenge)
    ├── /_next/*, /, /manifest.webmanifest, /sw.js, /offline ──► Frontend (Next.js 16 :3000)
    │                                                               │
    │                                                               ├── Service Worker (App Shell Cache)
    │                                                               └── IndexedDB (Playlists, Blobs, History)
    │
    └── /api/*, /ws/* ──────────────────────────────────────────► Backend (FastAPI :8000)
                                                                    │
                                                                    ├── /api/stream/{id} (httpx 512KB chunk proxy)
                                                                    │       └── yt-dlp direct audio URL cache
                                                                    │
                                                                    └── /api/download (ThreadPoolExecutor)
                                                                            ├── yt-dlp (Python API) ──► Deno (JS Solver)
                                                                            ├── FFmpeg (Transcoding / Muxing)
                                                                            └── Host Volume: downloads/
                                                                                ├── completed/
                                                                                ├── jobs/
                                                                                └── temp/
```

---

## Pinned Dependency Versions

> ⚠️ YouTube extraction relies on synchronized versions of `yt-dlp`, `yt-dlp-ejs`, and `Deno` to solve YouTube bot detection challenges.

| Package | Pinned Version | Notes |
|---------|---------------|-------|
| `yt-dlp` | `2026.8.19` | Core YouTube extractor |
| `yt-dlp-ejs` | `0.8.0` | External JavaScript solver |
| `deno` | `v2.9.6` | High-performance JS runtime (multi-arch x86_64 / aarch64) |
| `httpx` | `0.28.1` | Asynchronous streaming HTTP client for stream proxy |
| `idb` | `^8.0.3` | Lightweight promise-based IndexedDB wrapper |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/stream/{video_id}?q=auto\|compatible\|saver` | Range-aware chunked audio stream (512 KB upstream chunks, direct from YouTube). Supports `auto` (Opus ~160k with browser support), `compatible` (M4A/AAC ~128k), or `saver` (M4A ~48k). |
| `GET` | `/api/thumb?id={video_id}` | Proxied YouTube video thumbnail (prevents referrer leakage and mixed-content issues) |
| `POST` | `/api/search` | Search YouTube keywords; returns top 15 matches |
| `POST` | `/api/info` | Fetch video/playlist metadata + available resolutions/bitrates |
| `POST` | `/api/download` | Create download job; returns `job_id` |
| `GET` | `/api/download/{job_id}` | Poll job status/progress |
| `WS` | `/api/download/{job_id}/ws` | Real-time progress WebSocket stream |
| `GET` | `/api/download/{job_id}/file` | Download completed file or playlist `.zip` (Range-aware) |
| `DELETE` | `/api/download/{job_id}` | Cancel active job or delete completed job + file |
| `GET` | `/api/files` | List all files in `completed/` (disk-backed) |
| `GET` | `/api/files/{filename}` | Stream / download file by filename |
| `DELETE` | `/api/files/{filename}` | Delete completed file from disk |
| `GET` | `/api/health` | Comprehensive dependency check (FastAPI, yt-dlp, FFmpeg, Deno) |

> 💡 **Audio Quality Note**: YouTube streaming audio natively tops out around 128–160 kbps (Opus `itag 251` ~160 kbps, AAC `itag 140` ~128 kbps). Higher bitrate 256 kbps AAC (`itag 141`) is only served by YouTube for accounts authenticated with YouTube Premium cookies.

---

## Project Structure

```
youtube-music-playlist-downloader/
├── .github/
│   └── workflows/
│       └── ci.yml               # Automated CI/CD pipeline (Tests, Build, Docker)
├── backend/
│   ├── Dockerfile               # Multi-arch (x86_64 / aarch64) with Deno & FFmpeg
│   ├── requirements.txt
│   ├── app/
│   │   ├── api/                 # FastAPI routes (info, search, download, files, stream, ws)
│   │   ├── services/            # yt_dlp_client, format_selector, job_manager, stream_service
│   │   ├── models/              # Job dataclasses & enums
│   │   └── schemas/             # Pydantic request/response schemas
│   └── tests/                   # Pytest test suite (91 tests)
├── frontend/
│   ├── Dockerfile               # Multi-stage Next.js 16 standalone build
│   ├── app/                     # Next.js App Router (homepage, layout, manifest, offline)
│   ├── components/              # NowPlayingSection, SearchResults, FileList, etc.
│   ├── lib/                     # API client, db (IndexedDB), offlineManager, WebSocket
│   └── public/
│       ├── sw.js                # Custom Service Worker (app shell cache)
│       └── icons/               # 192px, 512px, maskable PWA icons
├── downloads/                   # Persistent host-mounted storage
│   ├── completed/
│   ├── jobs/
│   └── temp/
├── scripts/
│   └── auto-update-ytdlp.sh     # Safe yt-dlp auto-updater with smoke test & rollback
├── Caddyfile                    # Caddy reverse proxy config (DuckDNS HTTP challenge, HTTPS)
├── docker-compose.yml           # Local dev multi-container orchestration
├── docker-compose.prod.yml      # Production compose with Caddy & memory limits
├── DEPLOYMENT.md                # Complete 2 GB VM deployment guide
└── .env.example                 # Default environment template
```

---

## CI / CD Pipeline

The automated GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and pull request to `main`:
1. **Backend Tests**: Sets up Python 3.12, installs dependencies, and runs the 91-test pytest suite.
2. **Frontend Typecheck & Build**: Sets up Node.js 22, performs TypeScript verification, and generates static Next.js pages.
3. **Docker Validation**: Verifies `docker-compose.yml` config and builds both images.

---

## Author & License

Made with ❤️ by [aryanathreya](https://github.com/aryanathreya)

- GitHub: [@aryanathreya](https://github.com/aryanathreya)
- LinkedIn: [Aryan Athreya](https://www.linkedin.com/in/aryanathreya)

Released under the [MIT License](LICENSE).
