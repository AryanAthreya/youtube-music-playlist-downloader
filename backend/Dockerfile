# ─────────────────────────────────────────────────────────────────────────────
# YouTube Downloader — Backend Dockerfile
#
# PINNED VERSIONS (must be updated together — see README for why):
#   yt-dlp      2026.8.19
#   yt-dlp-ejs  0.8.0
#   deno        v2.9.6
#
# YouTube extraction breaks on version skew between these three packages.
# When updating, check the yt-dlp GitHub releases for the matching ejs version.
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.12-slim AS base

# Install system deps: ffmpeg, curl (for deno install), unzip, ca-certs
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg \
        curl \
        unzip \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ── Install Deno v2.9.6 ────────────────────────────────────────────────────
# Pinned exact version. Do NOT use `curl -fsSL https://deno.land/x/install/install.sh | sh`
# (that always fetches latest). We pin by specifying the exact tag.
ENV DENO_VERSION=v2.9.6
ENV DENO_INSTALL=/usr/local
RUN curl -fsSL "https://github.com/denoland/deno/releases/download/${DENO_VERSION}/deno-x86_64-unknown-linux-gnu.zip" \
        -o /tmp/deno.zip \
    && unzip /tmp/deno.zip -d /tmp/deno-bin \
    && mv /tmp/deno-bin/deno /usr/local/bin/deno \
    && chmod +x /usr/local/bin/deno \
    && rm -rf /tmp/deno.zip /tmp/deno-bin \
    && deno --version

# ── Create non-root user ───────────────────────────────────────────────────
RUN groupadd --gid 1001 appgroup \
    && useradd --uid 1001 --gid appgroup --shell /bin/bash --create-home appuser

# ── Install Python dependencies ────────────────────────────────────────────
WORKDIR /app
COPY requirements.txt ./

# Install as root first (writes to system site-packages), then chown later
RUN pip install --no-cache-dir -r requirements.txt

# ── Copy application code ──────────────────────────────────────────────────
COPY app/ ./app/

# ── Create download directories ────────────────────────────────────────────
RUN mkdir -p /app/downloads/jobs /app/downloads/completed /app/downloads/temp \
    && chown -R appuser:appgroup /app

# ── Switch to non-root user ────────────────────────────────────────────────
USER appuser

# ── Runtime config ─────────────────────────────────────────────────────────
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV DOWNLOADS_BASE_PATH=/app/downloads

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "info"]
