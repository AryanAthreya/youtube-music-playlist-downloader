"""
Match Service for Playlist Importer.

Matches track metadata (artist, title, album, duration) against YouTube video IDs.
Features:
- Pure heuristic scoring algorithm (token similarity, duration delta, Topic/VEVO bonuses, cover/live/remix penalties)
- In-memory bounded LRU cache (max 500 items)
- Dedicated execution on stream ThreadPoolExecutor (never download pool)
- Per-item timeout (8s) and fault isolation (individual item failure never fails batch)
"""

import asyncio
from collections import OrderedDict
import logging
import re
import threading
from typing import Any
import unicodedata

from app.schemas.import_match import (
    CandidateMatch,
    ItemMatchResult,
    MatchItemRequest,
)
from app.services import stream_service, yt_dlp_client

logger = logging.getLogger(__name__)

# Bounded LRU Cache for search matches
_CACHE_MAX_ENTRIES = 500
_match_cache: OrderedDict[str, ItemMatchResult] = OrderedDict()
_cache_lock = threading.Lock()

PENALTY_KEYWORDS = {
    "cover": 35,
    "karaoke": 35,
    "live": 25,
    "remix": 25,
    "sped up": 30,
    "speed up": 30,
    "slowed": 30,
    "8d": 30,
    "reverb": 25,
    "lyrics": 10,
    "instrumental": 25,
}


def normalize_string(text: str) -> str:
    """Normalize text by stripping accents, punctuation, feat. clauses, and brackets.

    Args:
        text: Raw text string.

    Returns:
        Clean, lowercased ASCII token-friendly string.
    """
    if not text:
        return ""
    # Strip accents / diacritics
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = text.lower()
    # Strip feat. / ft. / featuring clauses
    text = re.sub(r"\b(feat|ft|featuring)\.?\b.*", "", text)
    # Remove bracketed/parenthesized extra notes (e.g. [official audio], (remastered 2021))
    text = re.sub(r"[\(\[\{].*?[\)\]\}]", "", text)
    # Replace non-alphanumeric with spaces
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    # Collapse consecutive spaces
    return re.sub(r"\s+", " ", text).strip()


def tokenize(text: str) -> set[str]:
    """Extract significant lowercase tokens from text."""
    norm = normalize_string(text)
    return {t for t in norm.split() if len(t) > 1}


def score_candidate(source: MatchItemRequest, candidate: dict[str, Any]) -> int:
    """Calculate match score (0-100) between source metadata and a YouTube search result.

    Pure function with no network calls or external dependencies.

    Args:
        source: Source track metadata (title, artist, durationSec, etc.).
        candidate: Candidate dictionary from search (title, uploader, duration, etc.).

    Returns:
        Integer score between 0 and 100.
    """
    cand_title = candidate.get("title") or ""
    cand_channel = candidate.get("uploader") or candidate.get("channel") or ""
    cand_duration = candidate.get("duration")

    src_title_norm = normalize_string(source.title)
    src_artist_norm = normalize_string(source.artist)
    cand_title_norm = normalize_string(cand_title)
    cand_channel_norm = normalize_string(cand_channel)

    src_title_tokens = tokenize(source.title)
    src_artist_tokens = tokenize(source.artist)
    cand_title_tokens = tokenize(cand_title)
    cand_channel_tokens = tokenize(cand_channel)

    # 1. Title Token Overlap (up to 40 points)
    if src_title_tokens:
        overlap = len(src_title_tokens & cand_title_tokens) / len(src_title_tokens)
        title_score = round(overlap * 40)
    else:
        title_score = 0

    # Exact normalized title match bonus
    if src_title_norm and src_title_norm in cand_title_norm:
        title_score = min(40, title_score + 10)

    # 2. Artist Presence (up to 25 points)
    # Checks if source artist is in candidate channel or candidate title
    all_cand_tokens = cand_title_tokens | cand_channel_tokens
    if src_artist_tokens:
        artist_overlap = len(src_artist_tokens & all_cand_tokens) / len(src_artist_tokens)
        artist_score = round(artist_overlap * 25)
    else:
        artist_score = 0

    if src_artist_norm and (src_artist_norm in cand_channel_norm or src_artist_norm in cand_title_norm):
        artist_score = min(25, artist_score + 5)

    base_score = title_score + artist_score

    # 3. Duration Closeness (up to +25 points, or -25 penalty)
    duration_delta_score = 0
    if source.durationSec is not None and cand_duration is not None and cand_duration > 0:
        delta = abs(source.durationSec - cand_duration)
        if delta <= 3:
            duration_delta_score = 25
        elif delta <= 8:
            duration_delta_score = 18
        elif delta <= 15:
            duration_delta_score = 10
        elif delta > 60:
            duration_delta_score = -25

    # 4. Official Audio & Topic Bonuses (up to +20 points)
    channel_bonus = 0
    raw_channel_lower = cand_channel.lower()
    raw_title_lower = cand_title.lower()

    if raw_channel_lower.endswith("- topic"):
        channel_bonus += 15
    elif "vevo" in raw_channel_lower:
        channel_bonus += 10

    if "official audio" in raw_title_lower or "official track" in raw_title_lower:
        channel_bonus += 10
    elif "audio" in raw_title_lower:
        channel_bonus += 5

    # 5. Penalties for live/cover/remix/karaoke (unless requested in source)
    penalties = 0
    src_combined_raw = f"{source.title} {source.artist} {source.album or ''}".lower()

    for kw, penalty_val in PENALTY_KEYWORDS.items():
        if kw in raw_title_lower and kw not in src_combined_raw:
            penalties += penalty_val

    total = base_score + duration_delta_score + channel_bonus - penalties
    return max(0, min(100, total))


def determine_confidence(score: int) -> str:
    """Classify numeric score into confidence tier."""
    if score >= 75:
        return "high"
    if score >= 50:
        return "medium"
    if score >= 25:
        return "low"
    return "none"


def _make_cache_key(item: MatchItemRequest) -> str:
    return f"{normalize_string(item.artist)}|{normalize_string(item.title)}"


def _search_and_score_item_sync(item: MatchItemRequest) -> ItemMatchResult:
    """Synchronous worker function executed on stream executor."""
    query = f"{item.artist} {item.title}"
    raw_results = yt_dlp_client.search_youtube(query, limit=5)

    candidates: list[CandidateMatch] = []
    for cand in raw_results:
        vid_id = cand.get("video_id")
        if not vid_id:
            continue
        sc = score_candidate(item, cand)
        candidates.append(
            CandidateMatch(
                videoId=vid_id,
                title=cand.get("title") or "Unknown Title",
                channel=cand.get("uploader") or cand.get("channel") or "Unknown Artist",
                durationSec=cand.get("duration"),
                thumbnail=cand.get("thumbnail"),
                score=sc,
            )
        )

    # Sort descending by score
    candidates.sort(key=lambda c: c.score, reverse=True)
    top_candidates = candidates[:3]

    best_match = top_candidates[0] if top_candidates and top_candidates[0].score >= 25 else None
    confidence = determine_confidence(best_match.score) if best_match else "none"

    return ItemMatchResult(
        source=item,
        candidates=top_candidates,
        bestMatch=best_match,
        confidence=confidence,  # type: ignore[arg-type]
    )


async def match_item(item: MatchItemRequest) -> ItemMatchResult:
    """Match a single item with in-memory caching and 8-second timeout."""
    cache_key = _make_cache_key(item)

    with _cache_lock:
        if cache_key in _match_cache:
            cached = _match_cache[cache_key]
            # Move to end for LRU
            _match_cache.move_to_end(cache_key)
            return ItemMatchResult(
                source=item,
                candidates=cached.candidates,
                bestMatch=cached.bestMatch,
                confidence=cached.confidence,
            )

    loop = asyncio.get_running_loop()
    try:
        # Run on isolated stream executor with 8s timeout
        result = await asyncio.wait_for(
            loop.run_in_executor(
                stream_service._stream_executor,
                _search_and_score_item_sync,
                item,
            ),
            timeout=8.0,
        )
    except Exception as exc:
        logger.warning(
            "Match error or timeout for item '%s - %s': %s",
            item.artist,
            item.title,
            exc,
        )
        result = ItemMatchResult(
            source=item,
            candidates=[],
            bestMatch=None,
            confidence="none",
        )

    with _cache_lock:
        _match_cache[cache_key] = result
        if len(_match_cache) > _CACHE_MAX_ENTRIES:
            _match_cache.popitem(last=False)

    return result


async def match_batch(items: list[MatchItemRequest]) -> list[ItemMatchResult]:
    """Match a batch of items (up to 25) with individual error isolation."""
    # Process items with gather so cached/network calls complete quickly without blocking each other
    tasks = [match_item(item) for item in items]
    return await asyncio.gather(*tasks)
