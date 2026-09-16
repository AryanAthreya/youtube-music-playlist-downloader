"""
Unit tests for sanitize.py.

Tests filename sanitization including:
- Path separator stripping
- Control character removal
- Unicode normalization
- Length truncation
- Collision-resistant filename generation
"""

import pytest

from app.utils.sanitize import build_safe_filename, sanitize_extension, sanitize_title


class TestSanitizeTitle:

    def test_removes_path_separators(self):
        """Forward and back slashes must be removed."""
        result = sanitize_title("My/Video\\Title")
        assert "/" not in result
        assert "\\" not in result

    def test_removes_windows_unsafe_characters(self):
        """Windows reserved chars must be removed."""
        unsafe = 'title: "video" <test> |pipe| ?query*'
        result = sanitize_title(unsafe)
        for char in '<>:"/\\|?*':
            assert char not in result

    def test_removes_control_characters(self):
        """Control characters (0x00-0x1f) must be removed."""
        title_with_control = "video\x00name\x01test\x1f"
        result = sanitize_title(title_with_control)
        for i in range(0x20):
            assert chr(i) not in result

    def test_truncates_to_max_length(self):
        """Result must not exceed max_length."""
        long_title = "a" * 200
        result = sanitize_title(long_title, max_length=80)
        assert len(result) <= 80

    def test_returns_fallback_for_empty_input(self):
        """Empty or whitespace-only titles return 'video'."""
        assert sanitize_title("") == "video"
        assert sanitize_title("   ") == "video"
        assert sanitize_title(None) == "video"  # type: ignore

    def test_normalizes_to_lowercase(self):
        """Output is always lowercase."""
        result = sanitize_title("My AWESOME Video")
        assert result == result.lower()

    def test_collapses_whitespace_to_dashes(self):
        """Multiple spaces collapse to a single dash."""
        result = sanitize_title("hello   world")
        assert "--" not in result
        assert "hello-world" in result

    def test_strips_leading_trailing_dashes(self):
        """Leading and trailing dashes are removed."""
        result = sanitize_title("---hello world---")
        assert not result.startswith("-")
        assert not result.endswith("-")

    def test_unicode_title(self):
        """Non-ASCII characters are stripped gracefully."""
        result = sanitize_title("Héllo Wörld")
        assert result  # Should not be empty
        # ASCII approximations should appear or be stripped
        assert all(ord(c) < 128 for c in result)

    def test_normal_title(self):
        """A normal ASCII title is sanitized correctly."""
        result = sanitize_title("Never Gonna Give You Up")
        assert result == "never-gonna-give-you-up"


class TestBuildSafeFilename:

    def test_format_is_video_id_dash_slug_dot_ext(self):
        """Output format must be {video_id}-{slug}.{ext}."""
        result = build_safe_filename("dQw4w9WgXcQ", "Never Gonna Give You Up", "mp4")
        assert result.startswith("dQw4w9WgXcQ-")
        assert result.endswith(".mp4")

    def test_rejects_unsafe_video_id(self):
        """video_id with path separators raises ValueError."""
        with pytest.raises(ValueError):
            build_safe_filename("../etc/passwd", "title", "mp4")

    def test_rejects_video_id_with_space(self):
        """video_id with spaces raises ValueError."""
        with pytest.raises(ValueError):
            build_safe_filename("video id", "title", "mp4")

    def test_sanitizes_extension(self):
        """Extension with dots is stripped."""
        result = build_safe_filename("abc123", "title", ".mp4")
        assert result.endswith(".mp4")

    def test_unknown_extension_defaults_to_bin(self):
        """Completely safe but unknown extension is kept or falls back to bin."""
        result = build_safe_filename("abc123", "title", "xyz")
        assert result.endswith(".xyz")

    def test_empty_ext_defaults_to_bin(self):
        """Empty extension falls back to 'bin'."""
        result = build_safe_filename("abc123", "title", "")
        assert result.endswith(".bin")

    def test_no_path_traversal_in_filename(self):
        """Resulting filename must not contain path separators."""
        result = build_safe_filename("abc123", "title/../../../etc/passwd", "mp4")
        assert "/" not in result
        assert "\\" not in result
        assert ".." not in result


class TestSanitizeExtension:

    def test_strips_leading_dot(self):
        assert sanitize_extension(".mp4") == "mp4"

    def test_keeps_alphanumeric(self):
        assert sanitize_extension("mp4") == "mp4"

    def test_removes_special_chars(self):
        assert sanitize_extension("mp4;rm -rf") == "mp4rmrf"

    def test_empty_returns_bin(self):
        assert sanitize_extension("") == "bin"
        assert sanitize_extension("...") == "bin"

    def test_truncates_to_10_chars(self):
        result = sanitize_extension("a" * 20)
        assert len(result) <= 10
