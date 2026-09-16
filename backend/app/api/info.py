"""
POST /api/info — Fetch video or playlist metadata and available formats.

Thin route handler: validates URL, delegates to yt_dlp_client, formats response.
No business logic here — all logic lives in services/.
"""

import asyncio
import logging

from fastapi import APIRouter

from app.config import get_settings
from app.schemas.info import (
    AudioOption,
    FormatInfo,
    InfoRequest,
    PlaylistInfoResponse,
    PlaylistVideoItem,
    SearchRequest,
    SearchResponse,
    SearchResultItem,
    VideoInfoResponse,
)
from app.services import yt_dlp_client
from app.services.format_selector import extract_audio_options, extract_available_formats
from app.utils.url_validation import validate_youtube_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["info"])


@router.post("/info", response_model=VideoInfoResponse | PlaylistInfoResponse)
async def fetch_info(request: InfoRequest) -> VideoInfoResponse | PlaylistInfoResponse:
    """Fetch metadata and available formats for a YouTube URL.

    Accepts single video URLs or playlist URLs. Returns the real list
    of available formats as reported by yt-dlp (never hard-coded).

    For playlists, returns per-video metadata including title, thumbnail,
    and duration for each entry.

    Args:
        request: InfoRequest with the YouTube URL.

    Returns:
        VideoInfoResponse | PlaylistInfoResponse: Metadata and format list.

    Raises:
        InvalidURLError: If the URL is malformed or not a YouTube URL.
        VideoUnavailableError: If the video is private or deleted.
        ExtractionError: For unexpected yt-dlp failures.
    """
    settings = get_settings()
    url = validate_youtube_url(request.url)

    # Run yt-dlp in a thread to avoid blocking the event loop
    info = await asyncio.to_thread(
        yt_dlp_client.fetch_info,
        url,
        socket_timeout=settings.ytdlp_socket_timeout,
        retries=settings.ytdlp_retries,
    )

    # Determine if this is a playlist
    info_type = info.get("_type", "video")

    if info_type == "playlist":
        return _build_playlist_response(info)

    return _build_video_response(info)


def _build_video_response(info: dict) -> VideoInfoResponse:
    """Build a VideoInfoResponse from a yt-dlp info dict.

    Args:
        info: Raw yt-dlp info dictionary.

    Returns:
        VideoInfoResponse: Structured response with real format list.
    """
    formats = extract_available_formats(info)
    audio_options = extract_audio_options(info)

    return VideoInfoResponse(
        video_id=info.get("id", ""),
        title=info.get("title", "Unknown"),
        thumbnail=info.get("thumbnail"),
        duration=info.get("duration"),
        uploader=info.get("uploader") or info.get("channel"),
        upload_date=info.get("upload_date"),
        view_count=info.get("view_count"),
        formats=formats,
        audio_options=audio_options,
    )


def _build_playlist_response(info: dict) -> PlaylistInfoResponse:
    """Build a PlaylistInfoResponse from a yt-dlp playlist info dict.

    Args:
        info: Raw yt-dlp playlist info dictionary.

    Returns:
        PlaylistInfoResponse: Playlist metadata with per-video items.
    """
    entries = info.get("entries", []) or []
    videos: list[PlaylistVideoItem] = []

    for entry in entries:
        if not entry:
            continue
        video_id = entry.get("id", "")
        videos.append(
            PlaylistVideoItem(
                video_id=video_id,
                title=entry.get("title", "Unknown"),
                thumbnail=entry.get("thumbnail"),
                duration=entry.get("duration"),
                url=f"https://www.youtube.com/watch?v={video_id}",
            )
        )

    return PlaylistInfoResponse(
        playlist_id=info.get("id", ""),
        title=info.get("title", "Unknown Playlist"),
        uploader=info.get("uploader") or info.get("channel"),
        video_count=len(videos),
        videos=videos,
    )


@router.post("/search", response_model=SearchResponse)
async def search_videos(request: SearchRequest) -> SearchResponse:
    """Search YouTube for videos by keywords and return top results.

    Args:
        request: SearchRequest containing query keywords and optional limit.

    Returns:
        SearchResponse: List of matching YouTube videos with metadata.
    """
    raw_results = await asyncio.to_thread(
        yt_dlp_client.search_youtube,
        request.query,
        request.limit,
    )

    items = [SearchResultItem(**item) for item in raw_results]
    return SearchResponse(
        query=request.query,
        count=len(items),
        results=items,
    )
