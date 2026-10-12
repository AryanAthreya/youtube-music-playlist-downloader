"""
Audio stream and thumbnail proxy routes:
  GET /api/stream/{video_id} -> Stream YouTube audio on-demand with Range support
  GET /api/thumb             -> Proxy YouTube thumbnail image to avoid CORS issues
"""

import logging
from urllib.parse import quote

from fastapi import APIRouter, Header, Query, Response, status
from fastapi.responses import JSONResponse, StreamingResponse
import httpx

from app.utils.range_parser import parse_range_header
from app.errors.exceptions import VideoUnavailableError
from app.services import stream_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["stream"])


@router.get("/stream/{video_id}")
async def stream_audio(
    video_id: str,
    range: str | None = Header(default=None),
) -> Response:
    """Stream YouTube audio on-demand as progressive audio/mp4 (Range-aware).

    Fetches direct audio stream from YouTube CDN via chunked ranged proxy,
    bypassing YouTube throttling. Fully supports seeking via HTTP 206 Partial Content.

    Args:
        video_id: 11-character YouTube video ID.
        range: Standard HTTP Range header (e.g. 'bytes=0-1048576').

    Returns:
        StreamingResponse: Chunked audio stream with Range headers.
    """
    stream_service.validate_video_id(video_id)

    # Concurrency guard: check semaphore without blocking indefinitely
    semaphore = stream_service.get_stream_semaphore()
    if semaphore.locked():
        return Response(
            content="Stream capacity reached. Please try again shortly.",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            headers={"Retry-After": "5"},
        )

    # Acquire semaphore for this stream session
    await semaphore.acquire()

    try:
        stream_info = await stream_service.resolve_stream(video_id)

        # Determine total size
        total_size = stream_info.filesize
        if not total_size or total_size <= 0:
            # Probe upstream with Range: bytes=0-0 to get real total size
            async with httpx.AsyncClient(timeout=10.0) as client:
                probe_resp = await client.get(
                    stream_info.url,
                    headers={**stream_info.http_headers, "Range": "bytes=0-0"},
                )
                cr = probe_resp.headers.get("content-range")
                if cr and "/" in cr:
                    total_size = int(cr.split("/")[-1])
                    stream_info.filesize = total_size
                else:
                    total_size = int(probe_resp.headers.get("content-length", 10_000_000))
                    stream_info.filesize = total_size

        try:
            start, end = parse_range_header(range, total_size)
        except ValueError:
            start, end = 0, total_size - 1

        content_length = end - start + 1
        is_partial = range is not None

        headers = {
            "Content-Type": stream_info.mime_type,
            "Content-Length": str(content_length),
            "Accept-Ranges": "bytes",
            "Content-Range": f"bytes {start}-{end}/{total_size}",
            "Content-Disposition": f'inline; filename="{video_id}.m4a"',
        }

        async def stream_generator():
            try:
                async for chunk in stream_service.stream_audio_proxy(
                    stream_info,
                    start_byte=start,
                    end_byte=end,
                    total_size=total_size,
                ):
                    yield chunk
            finally:
                # Release semaphore when streaming completes or client disconnects
                semaphore.release()

        return StreamingResponse(
            stream_generator(),
            status_code=status.HTTP_206_PARTIAL_CONTENT if is_partial else status.HTTP_200_OK,
            headers=headers,
            media_type=stream_info.mime_type,
        )

    except Exception:
        semaphore.release()
        raise


@router.get("/thumb")
async def proxy_thumbnail(
    id: str = Query(..., description="11-character YouTube video ID"),
) -> Response:
    """Proxy a YouTube video thumbnail to prevent CORS issues when saving offline.

    Allowlisted to official YouTube image CDN (i.ytimg.com).
    """
    stream_service.validate_video_id(id)
    target_url = f"https://i.ytimg.com/vi/{id}/hqdefault.jpg"

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(target_url)
        if resp.status_code == 404:
            # Fallback to standard quality thumbnail
            fallback_url = f"https://i.ytimg.com/vi/{id}/default.jpg"
            resp = await client.get(fallback_url)

        if resp.status_code != 200:
            return JSONResponse(
                status_code=resp.status_code,
                content={"error": "THUMBNAIL_NOT_FOUND", "message": f"Thumbnail not found for {id}"},
            )

        return Response(
            content=resp.content,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"},
        )
