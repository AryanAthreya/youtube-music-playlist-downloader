"""
Format selection logic for yt-dlp.

NO FastAPI imports — pure functions, independently unit-testable.

Derives the set of actually-available formats from yt-dlp's raw info dict
and builds dynamic format selector strings. Never hard-codes quality options.

Format selector fallback chain (per spec §5):
  1. Exact height match (best video at requested height + best audio)
  2. Next resolution down from requested height
  3. Best available (any resolution)
  4. Raise FormatUnavailableError if truly nothing usable
"""

import logging
from typing import Any

from app.errors.exceptions import FormatUnavailableError
from app.schemas.info import AudioOption, FormatInfo

logger = logging.getLogger(__name__)


def extract_available_formats(yt_info: dict[str, Any]) -> list[FormatInfo]:
    """Extract structured video format information from a yt-dlp info dict.

    Only returns formats with a video stream (vcodec != 'none').
    Sorted by height descending (best quality first).

    Args:
        yt_info: Raw yt-dlp info dictionary from extract_info().

    Returns:
        list[FormatInfo]: Video formats sorted by height descending.
    """
    raw_formats = yt_info.get("formats", [])
    video_formats: list[FormatInfo] = []

    for fmt in raw_formats:
        vcodec = fmt.get("vcodec", "none")
        if vcodec in (None, "none", ""):
            continue  # Skip audio-only formats

        height = fmt.get("height")
        width = fmt.get("width")
        resolution = f"{width}x{height}" if width and height else fmt.get("resolution", "unknown")

        video_formats.append(
            FormatInfo(
                format_id=fmt.get("format_id", ""),
                ext=fmt.get("ext", ""),
                resolution=resolution,
                height=height,
                width=width,
                fps=fmt.get("fps"),
                vcodec=vcodec,
                acodec=fmt.get("acodec"),
                tbr=fmt.get("tbr"),
                filesize=fmt.get("filesize"),
                filesize_approx=fmt.get("filesize_approx"),
                note=fmt.get("format_note"),
            )
        )

    # Sort by height descending; formats without height go last
    video_formats.sort(
        key=lambda f: (f.height or 0),
        reverse=True,
    )

    # Deduplicate by height, keeping the best (first after sort) per height
    seen_heights: set[int | None] = set()
    unique_formats: list[FormatInfo] = []
    for fmt in video_formats:
        if fmt.height not in seen_heights:
            seen_heights.add(fmt.height)
            unique_formats.append(fmt)

    logger.debug("Extracted %d unique video formats", len(unique_formats))
    return unique_formats


def extract_audio_options(yt_info: dict[str, Any]) -> list[AudioOption]:
    """Extract structured audio-only format information from a yt-dlp info dict.

    Only returns formats with no video stream (vcodec == 'none' or missing).
    Sorted by audio bitrate descending.

    Args:
        yt_info: Raw yt-dlp info dictionary from extract_info().

    Returns:
        list[AudioOption]: Audio formats sorted by bitrate descending.
    """
    raw_formats = yt_info.get("formats", [])
    audio_options: list[AudioOption] = []

    for fmt in raw_formats:
        vcodec = fmt.get("vcodec", "none")
        acodec = fmt.get("acodec", "none")

        # Must have no video and have an audio codec
        if vcodec not in (None, "none", ""):
            continue
        if acodec in (None, "none", ""):
            continue

        audio_options.append(
            AudioOption(
                format_id=fmt.get("format_id", ""),
                ext=fmt.get("ext", ""),
                acodec=acodec,
                abr=fmt.get("abr"),
                filesize=fmt.get("filesize"),
                filesize_approx=fmt.get("filesize_approx"),
                note=fmt.get("format_note"),
            )
        )

    # Sort by bitrate descending
    audio_options.sort(key=lambda a: (a.abr or 0), reverse=True)

    logger.debug("Extracted %d audio options", len(audio_options))
    return audio_options


def build_format_selector(
    mode: str,
    quality_id: str,
    yt_info: dict[str, Any],
) -> str:
    """Build a yt-dlp format selector string for the given mode and quality.

    For video mode: selects best video at or below the requested height
    combined with the best available audio, merged into mp4.
    Uses the fallback chain: exact → next lower → best available → error.

    For audio mode: selects the specific audio format by format_id,
    or falls back to best audio available.

    Args:
        mode: 'video' or 'audio'.
        quality_id: Format ID from the /api/info response. For video mode,
                    this may be a format_id or a height string like '1080'.
        yt_info: Raw yt-dlp info dict (used to validate the format exists).

    Returns:
        str: A valid yt-dlp format selector string.

    Raises:
        FormatUnavailableError: If no usable format can be found for the request.
    """
    if mode == "audio":
        return _build_audio_selector(quality_id, yt_info)
    return _build_video_selector(quality_id, yt_info)


def _build_video_selector(quality_id: str, yt_info: dict[str, Any]) -> str:
    """Build the format selector for video+audio download.

    Args:
        quality_id: Either a yt-dlp format_id or a height integer string.
        yt_info: Raw yt-dlp info dict.

    Returns:
        str: yt-dlp format selector string.

    Raises:
        FormatUnavailableError: If no usable video format exists.
    """
    available_formats = extract_available_formats(yt_info)

    if not available_formats:
        raise FormatUnavailableError(
            "No video formats are available for this video.",
            detail=f"quality_id={quality_id}",
        )

    # First, check if quality_id is a direct yt-dlp format_id (highest priority)
    all_format_ids = {fmt.format_id for fmt in available_formats}
    audio_ids = {a.format_id for a in extract_audio_options(yt_info)}
    all_known_ids = all_format_ids | audio_ids

    if quality_id in all_known_ids:
        # For a specific video format ID, pair with best audio
        return f"{quality_id}+bestaudio/best"

    # Then try to interpret quality_id as a height number
    requested_height: int | None = None
    try:
        requested_height = int(quality_id)
    except ValueError:
        pass

    if requested_height is not None:
        return _build_selector_for_height(requested_height, available_formats)

    raise FormatUnavailableError(
        f"Format '{quality_id}' is not available for this video. "
        "It may have expired since the info was fetched. Please refresh and try again.",
        detail=f"quality_id={quality_id} not in available format IDs",
    )


def _build_selector_for_height(
    requested_height: int,
    available_formats: list[FormatInfo],
) -> str:
    """Build a format selector using the fallback chain for a given height.

    Fallback chain:
        1. Best video at exactly requested_height
        2. Best video at next lower height
        3. Best available video (any height)
        4. Raise FormatUnavailableError

    Args:
        requested_height: Requested video height in pixels.
        available_formats: Sorted (desc) list of available video formats.

    Returns:
        str: yt-dlp format selector string.

    Raises:
        FormatUnavailableError: If no video formats exist at all.
    """
    if not available_formats:
        raise FormatUnavailableError("No video formats available for this video.")

    # Step 1: Exact match at requested height
    exact = [f for f in available_formats if f.height == requested_height]
    if exact:
        logger.debug("Video selector: exact match at height %d", requested_height)
        return f"bestvideo[height={requested_height}]+bestaudio/bestvideo[height<={requested_height}]+bestaudio/best"

    # Step 2: Next lower height
    lower = [f for f in available_formats if f.height is not None and f.height < requested_height]
    if lower:
        next_height = lower[0].height  # Already sorted desc, so first is highest below
        logger.debug(
            "Video selector: falling back from %d to %d",
            requested_height,
            next_height,
        )
        return f"bestvideo[height<={requested_height}]+bestaudio/best"

    # Step 3: Best available (higher than requested, or no height info)
    logger.warning(
        "Video selector: no format at or below %dpx; using best available",
        requested_height,
    )
    return "bestvideo+bestaudio/best"


def _build_audio_selector(quality_id: str, yt_info: dict[str, Any]) -> str:
    """Build the format selector for audio-only download.

    Args:
        quality_id: Format ID from the /api/info audio_options list.
        yt_info: Raw yt-dlp info dict.

    Returns:
        str: yt-dlp format selector string.

    Raises:
        FormatUnavailableError: If the audio format is not available.
    """
    audio_options = extract_audio_options(yt_info)

    if not audio_options:
        raise FormatUnavailableError(
            "No audio formats are available for this video.",
            detail=f"quality_id={quality_id}",
        )

    known_ids = {a.format_id for a in audio_options}

    if quality_id in known_ids:
        return quality_id

    # Fallback: best audio
    logger.warning(
        "Audio format '%s' not found; falling back to bestaudio", quality_id
    )
    return "bestaudio/best"


def get_format_estimated_size(
    quality_id: str,
    yt_info: dict[str, Any],
    mode: str,
) -> int | None:
    """Estimate the file size for a given format selection.

    Returns the filesize or filesize_approx from yt-dlp's format metadata.
    Returns None if no size information is available.

    Args:
        quality_id: Format ID or height string.
        yt_info: Raw yt-dlp info dict.
        mode: 'video' or 'audio'.

    Returns:
        int | None: Estimated file size in bytes, or None.
    """
    raw_formats = yt_info.get("formats", [])

    for fmt in raw_formats:
        if fmt.get("format_id") == quality_id:
            return fmt.get("filesize") or fmt.get("filesize_approx")

    # For height-based selection, find the best match
    try:
        height = int(quality_id)
        for fmt in raw_formats:
            if fmt.get("height") == height:
                return fmt.get("filesize") or fmt.get("filesize_approx")
    except ValueError:
        pass

    return None
