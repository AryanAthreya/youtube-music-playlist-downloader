"""
POST /api/import/match — Batch match playlist track metadata against YouTube video IDs.
"""

import logging
from fastapi import APIRouter

from app.schemas.import_match import (
    ImportMatchBatchRequest,
    ImportMatchBatchResponse,
)
from app.services import match_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("/match", response_model=ImportMatchBatchResponse)
async def match_import_tracks(request: ImportMatchBatchRequest) -> ImportMatchBatchResponse:
    """Match up to 25 playlist items against YouTube.

    Returns scored candidates, best match, and confidence tier (high/medium/low/none).
    """
    logger.info("Batch match request received: %d items", len(request.items))
    results = await match_service.match_batch(request.items)
    return ImportMatchBatchResponse(results=results)
