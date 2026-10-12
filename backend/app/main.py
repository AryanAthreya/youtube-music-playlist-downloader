"""
FastAPI application entry point.

Responsibilities (ONLY):
- Create the FastAPI app instance
- Mount all API routers
- Register exception handlers
- Define startup/shutdown lifecycle events
- Configure CORS middleware

No business logic lives here.
"""

import asyncio
import logging
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import download, files, health, info, stream, websocket
from app.config import get_settings
from app.errors.exceptions import register_exception_handlers
from app.services import file_manager, job_manager, stream_service
from app.services import yt_dlp_client

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s job_id=%(job_id)s %(message)s"
    if False  # Use simple format by default; structured format when needed
    else "%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger(__name__)


# ── App creation ──────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    """Create and configure the FastAPI application.

    Returns:
        FastAPI: Configured application instance with all routers, middleware,
                 and exception handlers registered.
    """
    settings = get_settings()

    app = FastAPI(
        title="YouTube Downloader",
        description="Local YouTube video and playlist downloader powered by yt-dlp",
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )

    # ── CORS ──────────────────────────────────────────────────────────────
    cors_kwargs = {
        "allow_origins": settings.cors_origins_list,
        "allow_credentials": True,
        "allow_methods": ["GET", "POST", "DELETE", "OPTIONS"],
        "allow_headers": ["*"],
    }
    if settings.cors_allow_lan:
        cors_kwargs["allow_origin_regex"] = (
            r"^https?://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:3000)?$"
        )

    app.add_middleware(CORSMiddleware, **cors_kwargs)

    # ── Exception handlers ────────────────────────────────────────────────
    register_exception_handlers(app)

    # ── Routers ───────────────────────────────────────────────────────────
    app.include_router(health.router)
    app.include_router(info.router)
    app.include_router(download.router)
    app.include_router(files.router)
    app.include_router(stream.router)
    app.include_router(websocket.router)

    # ── Lifecycle events ──────────────────────────────────────────────────
    @app.on_event("startup")
    async def on_startup() -> None:
        """Application startup tasks.

        1. Verify download directories exist and are writable.
        2. Initialize the job manager (ThreadPoolExecutor).
        3. Log pinned dependency versions for version-skew debugging.
        4. Start the retention sweep background task.
        """
        # Step 1: Verify directories
        try:
            file_manager.ensure_directories()
        except (PermissionError, OSError) as exc:
            logger.critical("STARTUP FAILED: %s", exc)
            raise

        # Step 2: Initialize job manager with the running event loop
        loop = asyncio.get_running_loop()
        job_manager.initialize(loop)

        # Step 3: Log pinned versions for debugging
        ytdlp_version = yt_dlp_client.get_yt_dlp_version()
        try:
            import yt_dlp_ejs  # type: ignore
            ejs_version = getattr(yt_dlp_ejs, "__version__", "installed")
        except ImportError:
            ejs_version = "NOT FOUND — YouTube extraction will fail!"
            logger.critical("yt-dlp-ejs is not installed! YouTube extraction requires it.")

        logger.info("=" * 60)
        logger.info("YouTube Downloader starting up")
        logger.info("  yt-dlp version:     %s", ytdlp_version)
        logger.info("  yt-dlp-ejs version: %s", ejs_version)
        logger.info("  Downloads path:     %s", settings.downloads_base_path)
        logger.info("  Max concurrent:     %d", settings.max_concurrent_downloads)
        logger.info("  Retention:          %dh", settings.download_retention_hours)
        logger.info("=" * 60)

        # Step 4: Start retention sweep & clean stale temp files
        await file_manager.start_retention_sweep_task()
        try:
            stream_service.cleanup_stale_temp_files()
        except Exception as exc:
            logger.warning("Failed to clean stale temp files: %s", exc)

        logger.info("Startup complete.")

    @app.on_event("shutdown")
    async def on_shutdown() -> None:
        """Application shutdown — gracefully stop the executor."""
        logger.info("Shutting down YouTube Downloader...")
        job_manager.shutdown()
        logger.info("Shutdown complete.")

    return app


# ── Module-level app instance (used by uvicorn) ────────────────────────────
app = create_app()
