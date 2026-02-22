"""Search API endpoints.

Provides REST API for searching events, leads, summaries, rules, and scripts
using full-text, semantic, and hybrid search.
"""

from typing import Optional, List
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
from src.services.rule_search import RuleSearchService
from src.core.auth import get_current_user_optional
from src.models.user import User


router = APIRouter(prefix="/search", tags=["search"])


@router.post("", response_model=SearchResponse)
async def search(
    request: SearchRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
) -> SearchResponse:
    """Perform search across events, leads, summaries, rules, and scripts.

    Args:
        request: Search request with query, filters, and pagination
        db: Database session
        current_user: Optional authenticated user

    Returns:
        Search response with results and metadata
    """
    search_service = SearchService(db)

    filters = request.filters
    if not filters:
        from src.schemas.search import SearchFilters

        filters = SearchFilters()

    if current_user and current_user.role == "kp":
        pass
    else:
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

    if current_user:
        search_service.save_search_history(
            user_id=current_user.id,
            query=request.query,
            filters=filters,
            results_count=results.total_count,
        )

    return results


@router.post("/unified")
async def unified_search(
    request: SearchRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """Perform unified search across all resources.

    Searches events, leads, summaries, rules, and scripts.
    Returns combined results sorted by relevance.
    """
    all_results = []

    event_service = SearchService(db)
    event_results = event_service.search(
        query=request.query,
        filters=request.filters,
        search_type=request.search_type,
        page=1,
        page_size=request.page_size,
    )
    for r in event_results.results:
        r.source = "events"
        all_results.append(r)

    rule_service = RuleSearchService(db)
    rule_results = rule_service.search(
        query=request.query,
        category=request.filters.rule_category if request.filters else None,
        limit=request.page_size,
    )
    for r in rule_results.results:
        from src.schemas.search import SearchResultItem

        all_results.append(
            SearchResultItem(
                id=r.id,
                type="rule",
                session_id=None,
                title=r.title,
                description=r.content[:500] if r.content else None,
                event_type=None,
                timestamp=None,
                highlights=[],
                relevance_score=r.score,
                source="rules",
            )
        )

    from src.models.script import Script
    from sqlalchemy import select, or_

    script_query = select(Script).where(
        or_(
            Script.name.ilike(f"%{request.query}%"),
            Script.description.ilike(f"%{request.query}%"),
        )
    )
    if current_user:
        script_query = script_query.where(
            or_(Script.owner_id == current_user.id, Script.is_public == True)
        )
    else:
        script_query = script_query.where(Script.is_public == True)

    scripts = db.scalars(script_query.limit(request.page_size)).all()
    for script in scripts:
        from src.schemas.search import SearchResultItem

        all_results.append(
            SearchResultItem(
                id=script.id,
                type="script",
                session_id=None,
                title=script.name,
                description=script.description,
                event_type=None,
                timestamp=script.updated_at,
                highlights=[],
                relevance_score=0.5,
                source="scripts",
            )
        )

    all_results.sort(key=lambda x: x.relevance_score or 0, reverse=True)

    page = request.page
    page_size = request.page_size
    start = (page - 1) * page_size
    end = start + page_size
    paginated = all_results[start:end]

    from src.schemas.search import SearchResponse

    return SearchResponse(
        results=paginated,
        total_count=len(all_results),
        page=page,
        page_size=page_size,
        total_pages=(len(all_results) + page_size - 1) // page_size,
        query=request.query,
        search_type=request.search_type,
    )


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
