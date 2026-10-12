#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Safe yt-dlp Auto-Update & Test Script
#
# Updates yt-dlp inside the running backend container, tests extraction on a
# reference video, and automatically rolls back if extraction fails.
#
# Usage:
#   chmod +x scripts/auto-update-ytdlp.sh
#   ./scripts/auto-update-ytdlp.sh [container_name]
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

CONTAINER="${1:-ytdl-backend-prod}"
TEST_URL="https://www.youtube.com/watch?v=dQw4w9WgXcQ"

echo "=== yt-dlp Safe Update Utility ==="
echo "Target container: ${CONTAINER}"

# 1. Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo "ERROR: Container '${CONTAINER}' is not currently running."
    echo "Active containers:"
    docker ps --format '  - {{.Names}}'
    exit 1
fi

# 2. Record current version
OLD_VERSION=$(docker exec "${CONTAINER}" yt-dlp --version 2>/dev/null || echo "unknown")
echo "Current yt-dlp version: ${OLD_VERSION}"

# 3. Upgrade yt-dlp and matching yt-dlp-ejs plugin
echo "Updating yt-dlp inside container..."
docker exec -u 0 "${CONTAINER}" pip install --no-cache-dir --upgrade yt-dlp yt-dlp-ejs

NEW_VERSION=$(docker exec "${CONTAINER}" yt-dlp --version)
echo "New yt-dlp version installed: ${NEW_VERSION}"

if [ "${OLD_VERSION}" = "${NEW_VERSION}" ]; then
    echo "yt-dlp is already at the latest version (${NEW_VERSION}). No restart required."
    exit 0
fi

# 4. Perform extraction smoke test
echo "Running extraction verification test on reference video..."
if docker exec "${CONTAINER}" yt-dlp --dump-json --no-warnings --no-playlist "${TEST_URL}" > /dev/null 2>&1; then
    echo "SUCCESS: Extraction verification test passed."
    echo "Reloading backend application..."
    docker restart "${CONTAINER}"
    echo "Update complete: ${OLD_VERSION} -> ${NEW_VERSION}"
else
    echo "WARNING: Test extraction failed with new version ${NEW_VERSION}!"
    echo "Rolling back to previous working version: ${OLD_VERSION}..."
    docker exec -u 0 "${CONTAINER}" pip install --no-cache-dir "yt-dlp==${OLD_VERSION}"
    echo "Rollback completed. Restored ${OLD_VERSION}."
    exit 1
fi
