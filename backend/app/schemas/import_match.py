"""
Pydantic schemas for the /api/import/match endpoint.

Used for batch matching external playlist tracks (CSV / pasted text) to YouTube video candidates.
"""

from typing import Literal
from pydantic import BaseModel, Field, field_validator


class MatchItemRequest(BaseModel):
    """Single item to match from an imported playlist."""

    title: str = Field(..., min_length=1, max_length=200, description="Track title")
    artist: str = Field(..., min_length=1, max_length=200, description="Artist name")
    album: str | None = Field(default=None, max_length=200, description="Optional album name")
    durationSec: float | None = Field(default=None, ge=0, le=86400, description="Track duration in seconds")

    @field_validator("title", "artist")
    @classmethod
    def strip_and_validate(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Field must not be empty or whitespace only")
        return s


class ImportMatchBatchRequest(BaseModel):
    """Batch of tracks to match against YouTube (max 25 items)."""

    items: list[MatchItemRequest] = Field(..., min_length=1, max_length=25, description="Batch of items to match")


class CandidateMatch(BaseModel):
    """Single scored YouTube candidate for an imported track."""

    videoId: str
    title: str
    channel: str
    durationSec: float | None = None
    thumbnail: str | None = None
    score: int = Field(ge=0, le=100, description="Heuristic match score from 0 to 100")


class ItemMatchResult(BaseModel):
    """Match result for a single imported track item."""

    source: MatchItemRequest
    candidates: list[CandidateMatch]
    bestMatch: CandidateMatch | None = None
    confidence: Literal["high", "medium", "low", "none"]


class ImportMatchBatchResponse(BaseModel):
    """Response containing match results for the submitted batch."""

    results: list[ItemMatchResult]
