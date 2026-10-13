"""
Unit tests for match_service.py.

Tests metadata normalization, heuristic scoring, bonuses, penalties,
confidence categorization, and item error isolation.
Zero network dependencies — uses fixtures and mocks only.
"""

from unittest.mock import patch
import pytest

from app.schemas.import_match import MatchItemRequest
from app.services.match_service import (
    determine_confidence,
    normalize_string,
    score_candidate,
    match_item,
)


class TestStringNormalization:

    def test_strips_accents_and_lowercases(self):
        assert normalize_string("Beyoncé") == "beyonce"
        assert normalize_string("Mötley Crüe") == "motley crue"

    def test_strips_feat_clauses(self):
        assert normalize_string("Levitating feat. DaBaby") == "levitating"
        assert normalize_string("Industry Baby ft. Jack Harlow") == "industry baby"
        assert normalize_string("Stay featuring Justin Bieber") == "stay"

    def test_strips_brackets_and_parentheses(self):
        assert normalize_string("Blinding Lights (Remix)") == "blinding lights"
        assert normalize_string("Starboy [Official Video]") == "starboy"

    def test_strips_punctuation_and_whitespace(self):
        assert normalize_string("  AC/DC - Highway to Hell!  ") == "ac dc highway to hell"


class TestCandidateScoring:

    def test_high_score_for_exact_match_with_topic_channel(self):
        source = MatchItemRequest(
            title="Starboy",
            artist="The Weeknd",
            durationSec=230.0,
        )
        candidate = {
            "title": "The Weeknd - Starboy (Official Audio)",
            "uploader": "The Weeknd - Topic",
            "duration": 230,
        }
        score = score_candidate(source, candidate)
        assert score >= 75
        assert determine_confidence(score) == "high"

    def test_duration_delta_scoring(self):
        source = MatchItemRequest(
            title="Bohemian Rhapsody",
            artist="Queen",
            durationSec=354.0,
        )
        # Close duration (+25)
        close_cand = {
            "title": "Queen - Bohemian Rhapsody",
            "uploader": "Queen Official",
            "duration": 355,
        }
        # Far duration (>60s delta penalty)
        far_cand = {
            "title": "Queen - Bohemian Rhapsody (Extended Cut)",
            "uploader": "Queen Official",
            "duration": 480,
        }
        close_score = score_candidate(source, close_cand)
        far_score = score_candidate(source, far_cand)
        assert close_score > far_score
        assert close_score - far_score >= 30

    def test_penalty_for_unrequested_cover_or_live(self):
        source = MatchItemRequest(
            title="Flowers",
            artist="Miley Cyrus",
            durationSec=200.0,
        )
        cover_cand = {
            "title": "Miley Cyrus - Flowers (Acoustic Cover)",
            "uploader": "Random Singer",
            "duration": 200,
        }
        karaoke_cand = {
            "title": "Flowers - Miley Cyrus [Karaoke Version]",
            "uploader": "Karaoke Sing",
            "duration": 200,
        }
        official_cand = {
            "title": "Miley Cyrus - Flowers (Official Audio)",
            "uploader": "MileyCyrusVEVO",
            "duration": 200,
        }
        assert score_candidate(source, official_cand) >= 75
        assert score_candidate(source, cover_cand) < score_candidate(source, official_cand)
        assert score_candidate(source, karaoke_cand) < score_candidate(source, official_cand)

    def test_no_penalty_when_source_specifically_requests_live_or_remix(self):
        source_live = MatchItemRequest(
            title="Hotel California (Live)",
            artist="Eagles",
            durationSec=420.0,
        )
        cand_live = {
            "title": "Eagles - Hotel California (Live 1977)",
            "uploader": "Eagles - Topic",
            "duration": 420,
        }
        score = score_candidate(source_live, cand_live)
        # Should NOT suffer the 25 point penalty because source has "live"
        assert score >= 75


class TestConfidenceClassification:

    def test_confidence_tiers(self):
        assert determine_confidence(85) == "high"
        assert determine_confidence(75) == "high"
        assert determine_confidence(74) == "medium"
        assert determine_confidence(50) == "medium"
        assert determine_confidence(49) == "low"
        assert determine_confidence(25) == "low"
        assert determine_confidence(24) == "none"
        assert determine_confidence(0) == "none"


@pytest.mark.asyncio
class TestMatchItemErrorIsolation:

    async def test_search_exception_returns_clean_none_result(self):
        source = MatchItemRequest(title="Test Song", artist="Test Artist")
        with patch("app.services.yt_dlp_client.search_youtube", side_effect=RuntimeError("Search offline")):
            result = await match_item(source)
            assert result.source == source
            assert result.candidates == []
            assert result.bestMatch is None
            assert result.confidence == "none"


class TestImportMatchEndpoint:

    @pytest.mark.asyncio
    async def test_post_import_match_endpoint(self):
        import httpx
        from fastapi import FastAPI
        from app.api.import_match import router as import_router

        app = FastAPI()
        app.include_router(import_router)

        mock_search_results = [
            {
                "video_id": "dQw4w9WgXcQ",
                "title": "Rick Astley - Never Gonna Give You Up (Official Music Video)",
                "uploader": "Rick Astley",
                "duration": 212,
                "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
            }
        ]

        with patch("app.services.yt_dlp_client.search_youtube", return_value=mock_search_results):
            payload = {
                "items": [
                    {
                        "title": "Never Gonna Give You Up",
                        "artist": "Rick Astley",
                        "durationSec": 212.0,
                    }
                ]
            }
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
                res = await ac.post("/api/import/match", json=payload)
                assert res.status_code == 200
                data = res.json()
                assert "results" in data
                assert len(data["results"]) == 1
                item_res = data["results"][0]
                assert item_res["source"]["title"] == "Never Gonna Give You Up"
                assert item_res["bestMatch"] is not None
                assert item_res["bestMatch"]["videoId"] == "dQw4w9WgXcQ"
                assert item_res["confidence"] in ("high", "medium")
