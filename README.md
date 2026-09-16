# YouTube Video & Music Playlist Downloader

[![CI/CD Pipeline](https://github.com/AryanAthreya/youtube-music-playlist-downloader/actions/workflows/ci.yml/badge.svg)](https://github.com/AryanAthreya/youtube-music-playlist-downloader/actions/workflows/ci.yml)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2016-000000.svg?logo=next.js&logoColor=white)](https://nextjs.org)
[![Docker Compose](https://img.shields.io/badge/Container-Docker%20Compose-2496ED.svg?logo=docker&logoColor=white)](https://www.docker.com)
[![yt-dlp](https://img.shields.io/badge/Extractor-yt--dlp-FF0000.svg?logo=youtube&logoColor=white)](https://github.com/yt-dlp/yt-dlp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A modern, production-grade, locally-run web application to search and download YouTube videos (up to 4K/1080p), high-quality MP3 audio (320kbps), and entire playlists with automatic ZIP packaging via `yt-dlp` and `FFmpeg`. Runs containerized via Docker Compose with zero external cloud dependencies.

---

## Features

- 🔍 **Keyword Search**: Type any song, artist, or query to browse the top 15 results directly inside the app with live thumbnails, view counts, and durations.
- ⚡ **High Quality Video & Audio**: Up to 4K / 1080p 60fps MP4 video and 320kbps MP3 audio extraction with metadata tagging.
- 📜 **Full Playlist Support**: Download complete playlists or selectively choose individual tracks. Automatically bundles finished playlist items into a `.zip` archive.
- 🚀 **Direct Browser Downloads**: Triggers native browser download tray (`Ctrl + J`) directly into your computer's Downloads folder.
- 🎵 **Built-in Media Player & History**: Stream and preview downloaded audio/video directly in your browser without re-downloading.
- 🔄 **Real-Time WebSocket Progress**: Live byte counter, transfer speed, and completion percentage updates.
- 🛡️ **Containerized & Safe**: Sandboxed with Docker Compose, running non-root users, non-blocking ThreadPoolExecutor, and sanitized filenames.

---

## Quick Start

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

## Architecture

```
Browser (Next.js 16 :3000)
    │
    ├─ REST (HTTP)  ──► FastAPI :8000
    └─ WebSocket    ──► FastAPI :8000
                              │
                    ThreadPoolExecutor (MAX_CONCURRENT_DOWNLOADS)
                              │
                    yt-dlp (Python API)  ──►  Deno (JS runtime)
                              │
                         FFmpeg (Merging & Audio Transcoding)
                              │
                    Docker Volume: downloads/
                    ├── completed/   ← Persists on host (./downloads/completed)
                    ├── jobs/
                    └── temp/        ← Cleaned on failure/cancel
```

---

## Pinned Dependency Versions

> ⚠️ YouTube extraction relies on synchronized versions of `yt-dlp`, `yt-dlp-ejs`, and `Deno` to solve YouTube bot detection challenges.

| Package | Pinned Version | Notes |
|---------|---------------|-------|
| `yt-dlp` | `2026.8.19` | Core YouTube extractor |
| `yt-dlp-ejs` | `0.8.0` | External JavaScript solver |
| `deno` | `v2.9.6` | High-performance JS runtime |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
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

---

## Project Structure

```
youtube-music-playlist-downloader/
├── .github/
│   └── workflows/
│       └── ci.yml               # Automated CI/CD pipeline (Tests, Build, Docker)
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app/
│   │   ├── api/                 # FastAPI routes (info, search, download, files, ws)
│   │   ├── services/            # yt_dlp_client, format_selector, job_manager
│   │   ├── models/              # Job dataclasses & enums
│   │   └── schemas/             # Pydantic request/response schemas
│   └── tests/                   # Pytest test suite (70 tests)
├── frontend/
│   ├── Dockerfile
│   ├── app/                     # Next.js App Router (homepage, layout, styling)
│   ├── components/              # VideoInfoCard, SearchResults, FileList, etc.
│   └── lib/                     # API client, WebSocket handlers, TypeScript types
├── downloads/                   # Persistent host-mounted storage
│   ├── completed/
│   ├── jobs/
│   └── temp/
├── docker-compose.yml           # Multi-container orchestration
└── .env.example                 # Default environment template
```

---

## CI / CD Pipeline

The automated GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and pull request to `main`:
1. **Backend Tests**: Sets up Python 3.12, installs dependencies, and runs the 70-test pytest suite.
2. **Frontend Typecheck & Build**: Sets up Node.js 22, performs TypeScript verification, and generates static Next.js pages.
3. **Docker Validation**: Verifies `docker-compose.yml` config and builds both production images.

---

## Author & License

Made with ❤️ by [aryanathreya](https://github.com/aryanathreya)

- GitHub: [@aryanathreya](https://github.com/aryanathreya)
- LinkedIn: [Aryan Athreya](https://www.linkedin.com/in/aryanathreya)

Released under the [MIT License](LICENSE).
