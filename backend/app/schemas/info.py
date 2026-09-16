"""
Pydantic request/response schemas for the /api/info endpoint.

These are the single source of truth for request/response shapes.
Mirror any changes here into frontend/lib/types.ts manually (no codegen in V1).
"""

from typing import Literal

from pydantic import BaseModel, HttpUrl, field_validator


class InfoRequest(BaseModel):
    """Request body for POST /api/info.

    Args:
        url: YouTube video or playlist URL to fetch metadata for.
    """

    url: str

    @field_validator("url")
    @classmethod
    def url_not_empty(cls, v: str) -> str:
        """Ensure URL is not blank."""
        if not v or not v.strip():
            raise ValueError("url must not be empty")
        return v.strip()


class FormatInfo(BaseModel):
    """Metadata for a single available video format reported by yt-dlp.

    Never hard-coded — derived directly from yt-dlp's format list.
    """

    format_id: str
    ext: str
    resolution: str          # e.g. "1920x1080" or "audio only"
    height: int | None = None
    width: int | None = None
    fps: float | None = None
    vcodec: str | None = None
    acodec: str | None = None
    tbr: float | None = None  # total bitrate kbps
    filesize: int | None = None        # bytes, may be None
    filesize_approx: int | None = None # approximate bytes
    note: str | None = None            # yt-dlp human-readable format note


class AudioOption(BaseModel):
    """Metadata for a single available audio-only format.

    Derived from formats where vcodec == 'none'.
    """

    format_id: str
    ext: str
    acodec: str | None = None
    abr: float | None = None    # audio bitrate kbps
    filesize: int | None = None
    filesize_approx: int | None = None
    note: str | None = None


class VideoInfoResponse(BaseModel):
    """Response for a single video URL.

    Contains real format list from yt-dlp — never hard-coded quality options.
    """

    type: Literal["video"] = "video"
    video_id: str
    title: str
    thumbnail: str | None = None
    duration: int | None = None     # seconds
    uploader: str | None = None
    upload_date: str | None = None  # YYYYMMDD
    view_count: int | None = None
    formats: list[FormatInfo]       # all available video formats
    audio_options: list[AudioOption] # all available audio-only formats


class PlaylistVideoItem(BaseModel):
    """Compact metadata for a single video within a playlist."""

    video_id: str
    title: str
    thumbnail: str | None = None
    duration: int | None = None
    url: str


class PlaylistInfoResponse(BaseModel):
    """Response for a playlist URL."""

    type: Literal["playlist"] = "playlist"
    playlist_id: str
    title: str
    uploader: str | None = None
    video_count: int
    videos: list[PlaylistVideoItem]


class SearchRequest(BaseModel):
    """Request body for POST /api/search."""
    query: str
    limit: int = 15

    @field_validator("query")
    @classmethod
    def query_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("query must not be empty")
        return v.strip()


class SearchResultItem(BaseModel):
    """A single YouTube video result from keyword search."""
    video_id: str
    url: str
    title: str
    uploader: str
    duration: int | None = None
    thumbnail: str | None = None
    view_count: int | None = None


class SearchResponse(BaseModel):
    """Response for POST /api/search."""
    query: str
    count: int
    results: list[SearchResultItem]
