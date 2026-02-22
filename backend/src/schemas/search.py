"""Search schemas for request/response validation."""
from datetime import datetime
from typing import Optional, List, Literal, Any
from pydantic import BaseModel, Field
from uuid import UUID


class SearchFilters(BaseModel):
    """Filters for search queries."""

    event_types: Optional[List[str]] = Field(None, description="Filter by event types")
    character_ids: Optional[List[int]] = Field(None, description="Filter by character IDs")
    start_time: Optional[datetime] = Field(None, description="Filter events after this time")
    end_time: Optional[datetime] = Field(None, description="Filter events before this time")
    visibility: Optional[List[str]] = Field(None, description="Filter by visibility levels")
    session_id: Optional[UUID] = Field(None, description="Filter by session ID")


class SearchResultHighlight(BaseModel):
    """Highlighted text fragment in search results."""

    field: str = Field(..., description="Field name containing the highlight")
    fragment: str = Field(..., description="Highlighted text fragment")
    offset: int = Field(..., description="Character offset in original text")


class SearchResultItem(BaseModel):
    """Single search result item."""

    id: UUID = Field(..., description="Event ID")
    type: Literal["event", "lead", "summary"] = Field(..., description="Result type")
    session_id: UUID = Field(..., description="Session ID")
    title: Optional[str] = Field(None, description="Title (for leads/summaries)")
    description: str = Field(..., description="Description or content")
    event_type: Optional[str] = Field(None, description="Event type (for events)")
    timestamp: datetime = Field(..., description="Event timestamp")
    highlights: List[SearchResultHighlight] = Field(default_factory=list, description="Search highlights")
    relevance_score: float = Field(..., description="Relevance score (0-1)")


class SearchRequest(BaseModel):
    """Search request."""

    query: str = Field(..., min_length=1, description="Search query")
    filters: Optional[SearchFilters] = Field(None, description="Search filters")
    search_type: Literal["keyword", "semantic", "hybrid"] = Field(
        default="keyword",
        description="Search type: keyword (full-text), semantic (vector), or hybrid"
    )
    page: int = Field(default=1, ge=1, description="Page number (1-indexed)")
    page_size: int = Field(default=20, ge=1, le=100, description="Results per page")
    include_highlights: bool = Field(default=True, description="Include highlighted fragments")


class SearchResponse(BaseModel):
    """Search response."""

    results: List[SearchResultItem] = Field(..., description="Search results")
    total_count: int = Field(..., description="Total number of results")
    page: int = Field(..., description="Current page number")
    page_size: int = Field(..., description="Results per page")
    total_pages: int = Field(..., description="Total number of pages")
    query: str = Field(..., description="Original search query")
    search_type: str = Field(..., description="Search type used")


class SearchSuggestion(BaseModel):
    """Search suggestion."""

    text: str = Field(..., description="Suggested search text")
    type: Literal["query", "event_type", "character"] = Field(..., description="Suggestion type")
    count: int = Field(..., description="Number of matching results")


class SearchSuggestionResponse(BaseModel):
    """Search suggestions response."""

    suggestions: List[SearchSuggestion] = Field(..., description="Search suggestions")
    query: str = Field(..., description="Original query prefix")


class SearchHistoryItem(BaseModel):
    """Search history item."""

    id: UUID = Field(..., description="History entry ID")
    query: str = Field(..., description="Search query")
    filters: Optional[SearchFilters] = Field(None, description="Search filters used")
    results_count: int = Field(..., description="Number of results returned")
    created_at: datetime = Field(..., description="When search was performed")


class SearchHistoryResponse(BaseModel):
    """Search history response."""

    history: List[SearchHistoryItem] = Field(..., description="Search history items")
    total_count: int = Field(..., description="Total number of history items")
