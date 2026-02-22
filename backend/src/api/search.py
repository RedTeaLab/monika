"""Search API endpoints.

Provides REST API for searching events, leads, and summaries
using full-text, semantic, and hybrid search.
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.core.database import get_db
from src.schemas.search import (
    SearchRequest,
    SearchResponse,
    SearchSuggestionResponse,
    SearchHistoryResponse,
)
from src.services.search import SearchService
from src.core.auth import get_current_user_optional
from src.models.user import User


router = APIRouter(prefix="/search", tags=["search"])


@router.post("", response_model=SearchResponse)
async def search(
    request: SearchRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> SearchResponse:
    """Perform search across events, leads, and summaries.

    Args:
        request: Search request with query, filters, and pagination
        db: Database session
        current_user: Optional authenticated user

    Returns:
        Search response with results and metadata
    """
    search_service = SearchService(db)

    # Apply visibility filter based on user role
    filters = request.filters
    if not filters:
        from src.schemas.search import SearchFilters
        filters = SearchFilters()

    # Filter results based on user role
    if current_user and current_user.role == "kp":
        # Keepers can see everything
        pass
    else:
        # Players can only see public and their own player-prefixed events
        if not filters.visibility:
            filters.visibility = ["public"]
        if current_user:
            player_visibility = f"player:{current_user.id}"
            if player_visibility not in filters.visibility:
                filters.visibility.append(player_visibility)

    results = search_service.search(
        query=request.query,
        filters=filters,
        search_type=request.search_type,
        page=request.page,
        page_size=request.page_size,
        include_highlights=request.include_highlights,
    )

    # Save to search history if authenticated
    if current_user:
        search_service.save_search_history(
            user_id=current_user.id,
            query=request.query,
            filters=filters,
            results_count=results.total_count,
        )

    return results


@router.get("/suggestions", response_model=SearchSuggestionResponse)
async def get_search_suggestions(
    q: str = Query(..., min_length=1, description="Query prefix"),
    limit: int = Query(10, ge=1, le=50, description="Maximum number of suggestions"),
    db: Session = Depends(get_db),
) -> SearchSuggestionResponse:
    """Get search suggestions based on query prefix.

    Args:
        q: Query prefix to match
        limit: Maximum number of suggestions
        db: Database session

    Returns:
        Search suggestions
    """
    search_service = SearchService(db)
    return search_service.get_suggestions(query_prefix=q, limit=limit)


@router.get("/history", response_model=SearchHistoryResponse)
async def get_search_history(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Results per page"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_optional),
) -> SearchHistoryResponse:
    """Get user's search history.

    Args:
        page: Page number
        page_size: Results per page
        db: Database session
        current_user: Authenticated user

    Returns:
        Search history
    """
    if not current_user:
        return SearchHistoryResponse(history=[], total_count=0)

    search_service = SearchService(db)
    return search_service.get_search_history(
        user_id=current_user.id,
        page=page,
        page_size=page_size,
    )
