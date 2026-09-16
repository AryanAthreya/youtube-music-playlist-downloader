"""
Unit tests for url_validation.py.

Tests the YouTube URL allowlist including:
- Valid standard video URLs
- Valid playlist URLs
- Valid short URLs (youtu.be)
- Valid YouTube Shorts
- Valid YouTube Music URLs
- Invalid domains (rejected)
- Empty/malformed URLs (rejected)
- URLs with path traversal or injection attempts (rejected)
"""

import pytest

from app.errors.exceptions import InvalidURLError, UnsupportedURLError
from app.utils.url_validation import is_playlist_url, validate_youtube_url


class TestValidYouTubeURLs:

    @pytest.mark.parametrize("url", [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com/watch?v=dQw4w9WgXcQ",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42",
        "https://youtu.be/dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ?si=abc123",
        "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
        "https://www.youtube.com/playlist?list=PLrEnWoR732-BHrPp_Pm8_VleD68f9s14-",
    ])
    def test_accepts_valid_urls(self, url: str):
        """Valid YouTube URLs should be accepted and returned unchanged."""
        result = validate_youtube_url(url)
        assert result == url.strip()

    @pytest.mark.parametrize("url", [
        "  https://www.youtube.com/watch?v=dQw4w9WgXcQ  ",
    ])
    def test_strips_whitespace(self, url: str):
        """Leading/trailing whitespace is stripped."""
        result = validate_youtube_url(url)
        assert result == url.strip()


class TestInvalidURLs:

    def test_rejects_empty_string(self):
        with pytest.raises(InvalidURLError):
            validate_youtube_url("")

    def test_rejects_whitespace_only(self):
        with pytest.raises(InvalidURLError):
            validate_youtube_url("   ")

    def test_rejects_no_scheme(self):
        with pytest.raises(InvalidURLError):
            validate_youtube_url("youtube.com/watch?v=dQw4w9WgXcQ")

    def test_rejects_ftp_scheme(self):
        with pytest.raises(InvalidURLError):
            validate_youtube_url("ftp://youtube.com/watch?v=dQw4w9WgXcQ")

    def test_rejects_too_long_url(self):
        """URLs exceeding 2048 chars are rejected."""
        long_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&" + "a" * 2010
        with pytest.raises(InvalidURLError):
            validate_youtube_url(long_url)


class TestUnsupportedURLs:

    @pytest.mark.parametrize("url", [
        "https://www.vimeo.com/12345",
        "https://www.dailymotion.com/video/x123",
        "https://www.twitch.tv/videos/123",
        "https://evil.com/https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://not-youtube.com/watch?v=dQw4w9WgXcQ",
    ])
    def test_rejects_non_youtube_domains(self, url: str):
        """Non-YouTube domains raise UnsupportedURLError."""
        with pytest.raises(UnsupportedURLError):
            validate_youtube_url(url)

    def test_rejects_youtube_homepage(self):
        """Just https://www.youtube.com is not a video URL."""
        with pytest.raises(UnsupportedURLError):
            validate_youtube_url("https://www.youtube.com/")

    def test_rejects_youtube_channel(self):
        """Channel URLs are not supported."""
        with pytest.raises(UnsupportedURLError):
            validate_youtube_url("https://www.youtube.com/@channel_name")

    def test_rejects_youtube_search(self):
        """Search URLs are not supported."""
        with pytest.raises(UnsupportedURLError):
            validate_youtube_url("https://www.youtube.com/results?search_query=test")


class TestIsPlaylistURL:

    def test_pure_playlist_url(self):
        """Pure playlist URLs are detected."""
        assert is_playlist_url("https://www.youtube.com/playlist?list=PLtest123") is True

    def test_video_url_is_not_playlist(self):
        """Single video URLs are not playlists."""
        assert is_playlist_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ") is False

    def test_watch_with_list_is_not_pure_playlist(self):
        """Watch URLs with list= parameter are not pure playlists."""
        url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLtest"
        assert is_playlist_url(url) is False

    def test_youtu_be_is_not_playlist(self):
        assert is_playlist_url("https://youtu.be/dQw4w9WgXcQ") is False
