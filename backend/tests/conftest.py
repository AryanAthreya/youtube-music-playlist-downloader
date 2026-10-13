"""
Shared pytest configuration and fixtures for backend test suite.
"""

import sys
from unittest.mock import MagicMock

# Safe mock for yt-dlp if running in an environment where yt-dlp is not installed on host
if "yt_dlp" not in sys.modules:
    try:
        import yt_dlp
    except ImportError:
        mock_ytdlp = MagicMock()
        mock_utils = MagicMock()

        class _DownloadError(Exception): pass
        class _ExtractorError(Exception): pass
        class _GeoRestrictedError(Exception): pass
        class _UnsupportedError(Exception): pass

        mock_utils.DownloadError = _DownloadError
        mock_utils.ExtractorError = _ExtractorError
        mock_utils.GeoRestrictedError = _GeoRestrictedError
        mock_utils.UnsupportedError = _UnsupportedError
        mock_ytdlp.utils = mock_utils
        mock_ytdlp.version = MagicMock(__version__="2026.8.19")
        sys.modules["yt_dlp"] = mock_ytdlp
        sys.modules["yt_dlp.utils"] = mock_utils
        sys.modules["yt_dlp.version"] = mock_ytdlp.version
