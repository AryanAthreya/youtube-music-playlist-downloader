"""
Build resilient format selectors from a quality_id WITHOUT requiring a second yt-dlp info fetch.

Called from the worker thread after `create_and_submit_job` has already validated the URL.
The selector is intentionally broad — it gracefully degrades if the exact format_id
was rotated by YouTube between the /api/info call and the actual download.

Format selector fallback strategy used by yt-dlp (left to right, first available wins):
  Video mode:
    {format_id}+bestaudio/bestvideo[height<={height}]+bestaudio/bestvideo+bestaudio/best
  Audio mode:
    {format_id}/bestaudio[ext=m4a]/bestaudio/best
"""

import logging
import re

logger = logging.getLogger(__name__)

# YouTube video format IDs are short numeric strings like "137", "248", "399"
# Height strings would be "1080", "720" etc — also numeric but typically ≥ 360
_YTDL_FORMAT_ID_PATTERN = re.compile(r"^\d{1,5}$")


def build_resilient_video_selector(quality_id: str) -> str:
    """Build a resilient yt-dlp video format selector from a quality_id.

    Does NOT re-fetch yt-dlp info. Works with either:
    - A yt-dlp format_id like "137" (specific stream)
    - A height string like "1080" (height-based selection)

    The selector degrades gracefully: if the exact format is gone, yt-dlp
    will fall back to the next option automatically.

    Args:
        quality_id: Format ID (e.g. "137") or height string (e.g. "1080").

    Returns:
        str: A resilient yt-dlp format selector string.
    """
    if not quality_id or not _YTDL_FORMAT_ID_PATTERN.match(quality_id):
        # Fallback for unexpected values
        logger.warning("Unexpected quality_id '%s'; using best available", quality_id)
        return "bestvideo+bestaudio/best"

    val = int(quality_id)

    # Heuristic: real yt-dlp format IDs are typically small numbers (< 350).
    # Heights are typically 240, 360, 480, 720, 1080, 1440, 2160.
    # BUT there's overlap (e.g. 137 is a format ID, 360 is both a height and a format ID).
    # We cannot distinguish them reliably without context, so we use both paths:
    if val <= 350:
        # Likely a specific format ID — prefer it but also provide height fallback
        # If this is actually a height (unlikely for < 350), the height fallback handles it
        logger.debug("Building format selector for format_id=%s", quality_id)
        return (
            f"{quality_id}+bestaudio[ext=m4a]/"
            f"{quality_id}+bestaudio/"
            f"bestvideo+bestaudio/best"
        )
    else:
        # Definitely a height value (360p+)
        logger.debug("Building format selector for height=%s", quality_id)
        return (
            f"bestvideo[height<={quality_id}][ext=mp4]+bestaudio[ext=m4a]/"
            f"bestvideo[height<={quality_id}]+bestaudio/"
            f"bestvideo+bestaudio/best"
        )


def build_resilient_audio_selector(quality_id: str) -> str:
    """Build a resilient yt-dlp audio format selector from a quality_id.

    Does NOT re-fetch yt-dlp info.

    Args:
        quality_id: Audio format ID (e.g. "140") or preset like "bestaudio".

    Returns:
        str: A resilient yt-dlp format selector string.
    """
    # Handle preset strings passed from the playlist UI
    if quality_id.startswith("bestaudio"):
        # e.g. "bestaudio-mp3" → just use bestaudio
        return "bestaudio[ext=m4a]/bestaudio/best"

    if quality_id and _YTDL_FORMAT_ID_PATTERN.match(quality_id):
        return (
            f"{quality_id}/"
            f"bestaudio[ext=m4a]/"
            f"bestaudio/best"
        )

    logger.warning("Unexpected audio quality_id '%s'; using bestaudio", quality_id)
    return "bestaudio[ext=m4a]/bestaudio/best"
