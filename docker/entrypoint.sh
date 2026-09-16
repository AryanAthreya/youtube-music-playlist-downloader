#!/bin/bash
# Backend container entrypoint
# Creates download directories and verifies write permissions before starting uvicorn.

set -e

DOWNLOADS_BASE="${DOWNLOADS_BASE_PATH:-/app/downloads}"

echo "=== YouTube Downloader Entrypoint ==="
echo "Creating download directories under: ${DOWNLOADS_BASE}"

mkdir -p "${DOWNLOADS_BASE}/jobs"
mkdir -p "${DOWNLOADS_BASE}/completed"
mkdir -p "${DOWNLOADS_BASE}/temp"

# Verify write permissions
WRITE_TEST="${DOWNLOADS_BASE}/temp/.write_test"
echo "ok" > "${WRITE_TEST}" && rm -f "${WRITE_TEST}"
echo "✓ Download directories are writable"

# Log dependency versions for debugging
echo "=== Dependency Versions ==="
python -c "import yt_dlp; print('yt-dlp:', yt_dlp.version.__version__)" || echo "yt-dlp: NOT FOUND"
python -c "import yt_dlp_ejs; print('yt-dlp-ejs:', getattr(yt_dlp_ejs, '__version__', 'installed'))" 2>/dev/null || echo "yt-dlp-ejs: NOT FOUND"
deno --version | head -1 || echo "deno: NOT FOUND"
ffmpeg -version 2>&1 | head -1 || echo "ffmpeg: NOT FOUND"

echo "=== Starting uvicorn ==="
exec "$@"
