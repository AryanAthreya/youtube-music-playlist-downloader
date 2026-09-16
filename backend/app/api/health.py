"""
GET /api/health — Dependency health check.

Verifies that FastAPI is up AND that yt-dlp, FFmpeg, and Deno are
actually invocable. Returns a detailed status payload.

This endpoint does real checks — not just {"status": "ok"}.
A broken yt-dlp/FFmpeg/Deno chain causes loud failure here,
catching issues at container start rather than on the first user download.
"""

import asyncio
import logging
import subprocess
import sys
from typing import Any

import yt_dlp

from fastapi import APIRouter
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["health"])


async def _check_command(cmd: list[str], timeout: int = 10) -> dict[str, Any]:
    """Run an external command and return its version/status.

    Args:
        cmd: Command and arguments to run.
        timeout: Timeout in seconds.

    Returns:
        dict: {'ok': bool, 'version': str | None, 'error': str | None}
    """
    try:
        result = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            result.communicate(), timeout=timeout
        )
        if result.returncode == 0:
            version_line = (stdout or stderr).decode("utf-8", errors="replace").splitlines()
            version = version_line[0].strip() if version_line else "unknown"
            return {"ok": True, "version": version, "error": None}
        else:
            error = (stderr or stdout).decode("utf-8", errors="replace")[:200]
            return {"ok": False, "version": None, "error": error}
    except FileNotFoundError:
        return {"ok": False, "version": None, "error": f"Command not found: {cmd[0]}"}
    except asyncio.TimeoutError:
        return {"ok": False, "version": None, "error": f"Timed out after {timeout}s"}
    except Exception as exc:
        return {"ok": False, "version": None, "error": str(exc)}


@router.get("/health")
async def health_check() -> JSONResponse:
    """Verify that all required dependencies are functional.

    Checks:
        - yt-dlp: Python import + version attribute
        - FFmpeg: shells out to `ffmpeg -version`
        - Deno: shells out to `deno --version`

    Returns a 200 if all checks pass, 503 if any fail.
    The response body always contains detailed per-dependency status.
    """
    import yt_dlp.version as yt_dlp_ver

    # yt-dlp check — Python import + version (no subprocess needed)
    try:
        ytdlp_version = yt_dlp_ver.__version__
        ytdlp_check = {"ok": True, "version": ytdlp_version, "error": None}
    except Exception as exc:
        ytdlp_check = {"ok": False, "version": None, "error": str(exc)}

    # yt-dlp-ejs check
    try:
        import yt_dlp_ejs  # type: ignore
        ejs_version = getattr(yt_dlp_ejs, "__version__", "installed")
        ejs_check = {"ok": True, "version": ejs_version, "error": None}
    except ImportError as exc:
        ejs_check = {"ok": False, "version": None, "error": f"yt-dlp-ejs not importable: {exc}"}

    # FFmpeg and Deno checks run in parallel
    ffmpeg_task = asyncio.create_task(_check_command(["ffmpeg", "-version"]))
    deno_task = asyncio.create_task(_check_command(["deno", "--version"]))

    ffmpeg_check, deno_check = await asyncio.gather(ffmpeg_task, deno_task)

    all_ok = all([
        ytdlp_check["ok"],
        ejs_check["ok"],
        ffmpeg_check["ok"],
        deno_check["ok"],
    ])

    status_code = 200 if all_ok else 503

    payload = {
        "status": "healthy" if all_ok else "degraded",
        "python": sys.version,
        "dependencies": {
            "yt_dlp": ytdlp_check,
            "yt_dlp_ejs": ejs_check,
            "ffmpeg": ffmpeg_check,
            "deno": deno_check,
        },
    }

    if not all_ok:
        failed = [k for k, v in payload["dependencies"].items() if not v["ok"]]
        logger.error("Health check FAILED. Broken dependencies: %s", failed)
    else:
        logger.debug("Health check passed.")

    return JSONResponse(status_code=status_code, content=payload)
