"""
URL validation utilities — allowlist-based YouTube URL validation.

Uses strict regex allowlist patterns to validate URLs before passing them
to yt-dlp. Never constructs shell strings from user input.

Raises:
    InvalidURLError: If the URL is malformed or empty.
    UnsupportedURLError: If the URL doesn't match any supported YouTube pattern.
"""

import re

from app.errors.exceptions import InvalidURLError, UnsupportedURLError

# Allowlist of accepted YouTube URL patterns.
# Only these patterns are permitted — anything else is rejected.
_YOUTUBE_PATTERNS: list[re.Pattern[str]] = [
    # Standard watch URLs: https://www.youtube.com/watch?v=VIDEO_ID
    re.compile(
        r"^https?://(www\.)?youtube\.com/watch\?(?:[^&]*&)*v=([a-zA-Z0-9_-]{11})(?:&[^\s]*)?$"
    ),
    # Short URLs: https://youtu.be/VIDEO_ID
    re.compile(
        r"^https?://youtu\.be/([a-zA-Z0-9_-]{11})(?:\?[^\s]*)?$"
    ),
    # Playlist URLs: https://www.youtube.com/playlist?list=PLAYLIST_ID
    re.compile(
        r"^https?://(www\.)?youtube\.com/playlist\?(?:[^&]*&)*list=([a-zA-Z0-9_-]+)(?:&[^\s]*)?$"
    ),
    # Watch + playlist context: ?v=ID&list=ID
    re.compile(
        r"^https?://(www\.)?youtube\.com/watch\?(?:[^&]*&)*v=([a-zA-Z0-9_-]{11})(?:&[^\s]*)*list=([a-zA-Z0-9_-]+)(?:&[^\s]*)?$"
    ),
    # YouTube Music: https://music.youtube.com/watch?v=VIDEO_ID
    re.compile(
        r"^https?://music\.youtube\.com/watch\?(?:[^&]*&)*v=([a-zA-Z0-9_-]{11})(?:&[^\s]*)?$"
    ),
    # Embed URLs (less common but valid for single videos)
    re.compile(
        r"^https?://(www\.)?youtube\.com/embed/([a-zA-Z0-9_-]{11})(?:\?[^\s]*)?$"
    ),
    # Shorts: https://www.youtube.com/shorts/VIDEO_ID
    re.compile(
        r"^https?://(www\.)?youtube\.com/shorts/([a-zA-Z0-9_-]{11})(?:\?[^\s]*)?$"
    ),
]

# Maximum URL length to prevent excessively long inputs
_MAX_URL_LENGTH = 2048


def validate_youtube_url(url: str) -> str:
    """Validate and normalise a YouTube URL against the allowlist.

    Checks that the URL is non-empty, within length bounds, and matches
    one of the accepted YouTube URL patterns. Does not make network calls.

    Args:
        url: The raw URL string provided by the client.

    Returns:
        str: The stripped, validated URL ready to pass to yt-dlp.

    Raises:
        InvalidURLError: If the URL is empty, too long, or not a valid URL.
        UnsupportedURLError: If the URL is a valid URL but not a supported YouTube URL.
    """
    if not url or not url.strip():
        raise InvalidURLError("URL must not be empty.")

    url = url.strip()

    if len(url) > _MAX_URL_LENGTH:
        raise InvalidURLError(
            f"URL exceeds maximum allowed length of {_MAX_URL_LENGTH} characters."
        )

    # Basic structural check: must start with http:// or https://
    if not re.match(r"^https?://", url, re.IGNORECASE):
        raise InvalidURLError(
            "URL must begin with 'http://' or 'https://'.",
        )

    # Allowlist check
    for pattern in _YOUTUBE_PATTERNS:
        if pattern.match(url):
            return url

    # URL looks like a URL but isn't a supported YouTube URL
    raise UnsupportedURLError(
        "URL is not a supported YouTube video, playlist, or short. "
        "Supported: youtube.com/watch, youtu.be, youtube.com/playlist, "
        "youtube.com/shorts, music.youtube.com/watch",
    )


def is_playlist_url(url: str) -> bool:
    """Return True if the validated URL points to a playlist.

    Must be called after validate_youtube_url — does not re-validate.

    Args:
        url: A previously validated YouTube URL.

    Returns:
        bool: True if the URL contains a playlist parameter without a video ID,
              or is a pure /playlist? URL.
    """
    playlist_only = re.compile(
        r"^https?://(www\.)?youtube\.com/playlist\?(?:[^&]*&)*list=([a-zA-Z0-9_-]+)"
    )
    return bool(playlist_only.match(url))
