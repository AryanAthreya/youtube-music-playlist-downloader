"""
Filename sanitization utilities.

Provides safe, collision-resistant filename generation for downloaded files.
Uses {video_id}-{sanitized-slug}.{ext} convention so that:
  - Path traversal is structurally impossible (video_id is allowlist-validated)
  - Collisions between videos with the same title are impossible
  - OS-unsafe characters are always stripped

Never trust yt-dlp's raw `title` field as a path component.
"""

import re
import unicodedata


# Characters that are unsafe in filenames across Windows/Linux/macOS
_UNSAFE_CHARS_PATTERN = re.compile(r'[<>:"/\\|?*\x00-\x1f]')

# Collapse runs of whitespace/dashes/underscores into a single dash
_NORMALIZE_SEPARATORS = re.compile(r'[\s_-]+')

# Strip leading/trailing dashes
_STRIP_EDGE_DASHES = re.compile(r'^-+|-+$')

# Maximum slug length (total filename kept under 200 chars to be safe on all FS)
_MAX_SLUG_LENGTH = 80


def sanitize_title(title: str, max_length: int = _MAX_SLUG_LENGTH) -> str:
    """Sanitize a video title into a safe filesystem slug.

    Steps:
        1. Normalize unicode to NFC (composed form).
        2. Strip non-ASCII characters that can't be represented safely.
        3. Remove OS-unsafe characters (path separators, control chars, etc.).
        4. Normalize runs of separators to single dashes.
        5. Strip leading/trailing dashes.
        6. Truncate to max_length.
        7. Ensure result is non-empty (fallback to 'video').

    Args:
        title: Raw video title from yt-dlp metadata.
        max_length: Maximum length of the resulting slug (default 80).

    Returns:
        str: A lowercase, ASCII-safe slug suitable for use in a filename.
    """
    if not title:
        return "video"

    # Step 1: NFC normalize
    normalized = unicodedata.normalize("NFC", title)

    # Step 2: Transliterate non-ASCII to ASCII equivalents where possible
    ascii_approx = normalized.encode("ascii", errors="ignore").decode("ascii")

    # Step 3: Remove OS-unsafe characters
    safe = _UNSAFE_CHARS_PATTERN.sub("-", ascii_approx)

    # Step 3b: Remove dot sequences (could form path traversal like ..)
    safe = re.sub(r'\.+', '-', safe)

    # Step 4: Lowercase, normalize separators
    safe = safe.lower()
    safe = _NORMALIZE_SEPARATORS.sub("-", safe)

    # Step 5: Strip edge dashes
    safe = _STRIP_EDGE_DASHES.sub("", safe)

    # Step 6: Truncate
    safe = safe[:max_length]

    # Step 7: Fallback
    return safe if safe else "video"


def build_safe_filename(video_id: str, title: str, ext: str) -> str:
    """Build a collision-resistant, path-safe filename for a downloaded file.

    Format: ``{video_id}-{sanitized_slug}.{ext}``

    The video_id prefix makes the filename unique regardless of title collisions.
    The extension is sanitized to remove any unexpected characters.

    Args:
        video_id: The YouTube video ID (e.g. 'dQw4w9WgXcQ'). Must be alphanumeric.
        title: Raw video title from yt-dlp.
        ext: File extension without leading dot (e.g. 'mp4', 'webm', 'mp3').

    Returns:
        str: Safe filename like 'dQw4w9WgXcQ-never-gonna-give-you-up.mp4'.

    Raises:
        ValueError: If video_id contains non-alphanumeric characters.
    """
    if not re.match(r'^[a-zA-Z0-9_-]+$', video_id):
        raise ValueError(
            f"video_id '{video_id}' contains unsafe characters. "
            "Only alphanumeric, underscore, and dash are permitted."
        )

    slug = sanitize_title(title)
    safe_ext = re.sub(r'[^a-zA-Z0-9]', '', ext)[:10]  # Strip dots, slashes, etc.

    if not safe_ext:
        safe_ext = "bin"

    return f"{video_id}-{slug}.{safe_ext}"


def sanitize_extension(ext: str) -> str:
    """Sanitize a file extension to contain only safe characters.

    Args:
        ext: Raw extension string (with or without leading dot).

    Returns:
        str: Cleaned extension without leading dot (e.g. 'mp4').
    """
    # Remove leading dots
    ext = ext.lstrip(".")
    # Keep only alphanumeric characters
    return re.sub(r'[^a-zA-Z0-9]', '', ext)[:10] or "bin"
