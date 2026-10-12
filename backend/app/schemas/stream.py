"""
Pydantic schemas for the audio stream proxy (/api/stream/{video_id}).
"""

from pydantic import BaseModel


class StreamMetadata(BaseModel):
    """Metadata for an audio stream."""

    video_id: str
    title: str
    uploader: str | None = None
    duration: int | None = None
    format_id: str
    mime_type: str = "audio/mp4"
    filesize: int | None = None


class StreamErrorResponse(BaseModel):
    """Error payload returned when stream resolution fails."""

    error: str
    message: str
    video_id: str
