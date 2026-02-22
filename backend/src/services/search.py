"""Search service for full-text and semantic search.

Implements keyword (full-text), semantic (vector), and hybrid search
across events, leads, and summaries.
"""

from typing import List, Optional, Tuple, Dict, Any, Literal
from datetime import datetime
import json
from uuid import UUID

from sqlalchemy import select, func, or_, and_, text
from sqlalchemy.orm import Session
from sqlalchemy.sql import Select

from src.models.event import Event, EventType, VisibilityLevel
from src.schemas.search import (
    SearchRequest,
    SearchResponse,
    SearchResultItem,
    SearchResultHighlight,
    SearchFilters,
    SearchSuggestion,
    SearchSuggestionResponse,
    SearchHistoryItem,
    SearchHistoryResponse,
)


class SearchService:
    """Service for searching events, leads, and summaries."""

    def __init__(self, db: Session):
        """Initialize search service.

        Args:
            db: Database session
        """
        self.db = db
        self._is_postgresql = self.db.bind.dialect.name == "postgresql"
        self._fts_available = None  # Will be lazily checked

    def _check_fts_available(self) -> bool:
        """Check if FTS tables are available.

        Returns:
            True if FTS is available, False otherwise
        """
        if self._fts_available is not None:
            return self._fts_available

        if self._is_postgresql:
            # PostgreSQL always has full-text search via tsvector
            self._fts_available = True
            return True

        # Check if SQLite FTS table exists
        try:
            result = self.db.execute(
                text("SELECT name FROM sqlite_master WHERE type='table' AND name='events_fts'")
            ).fetchone()
            self._fts_available = result is not None
        except Exception:
            self._fts_available = False

        return self._fts_available

    def search(
        self,
        query: str,
        filters: Optional[SearchFilters] = None,
        search_type: Literal["keyword", "semantic", "hybrid"] = "keyword",
        page: int = 1,
        page_size: int = 20,
        include_highlights: bool = True,
    ) -> SearchResponse:
        """Perform search across events, leads, and summaries.

        Args:
            query: Search query string
            filters: Optional search filters
            search_type: Type of search (keyword, semantic, hybrid)
            page: Page number (1-indexed)
            page_size: Results per page
            include_highlights: Whether to include highlighted fragments

        Returns:
            Search response with results and metadata
        """
        # Apply search based on type
        if search_type == "keyword":
            results, total_count = self._keyword_search(
                query, filters, page, page_size, include_highlights
            )
        elif search_type == "semantic":
            results, total_count = self._semantic_search(
                query, filters, page, page_size, include_highlights
            )
        else:  # hybrid
            results, total_count = self._hybrid_search(
                query, filters, page, page_size, include_highlights
            )

        total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 0

        return SearchResponse(
            results=results,
            total_count=total_count,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            query=query,
            search_type=search_type,
        )

    def _keyword_search(
        self,
        query: str,
        filters: Optional[SearchFilters],
        page: int,
        page_size: int,
        include_highlights: bool,
    ) -> Tuple[List[SearchResultItem], int]:
        """Perform full-text keyword search.

        Args:
            query: Search query string
            filters: Optional search filters
            page: Page number
            page_size: Results per page
            include_highlights: Whether to include highlights

        Returns:
            Tuple of (results, total_count)
        """
        # Build base query
        base_query = self._build_base_query(filters)

        # Apply full-text search or fallback to LIKE
        if self._is_postgresql and self._check_fts_available():
            # PostgreSQL full-text search
            search_query = self._apply_postgresql_fts(base_query, query)
        elif self._check_fts_available():
            # SQLite FTS5
            search_query = self._apply_sqlite_fts(base_query, query)
        else:
            # Fallback to LIKE-based search for testing/development
            search_query = self._apply_like_search(base_query, query)

        # Get total count - use simpler approach for count
        # Create a fresh query for counting to avoid any aliasing issues
        try:
            count_query = select(func.count()).select_from(self._build_base_query(filters).alias())
            # Apply same filters to count query
            if self._is_postgresql and self._check_fts_available():
                count_query = self._apply_postgresql_fts(count_query, query)
            elif self._check_fts_available():
                count_query = self._apply_sqlite_fts(count_query, query)
            else:
                count_query = self._apply_like_search(count_query, query)
            total_count = self.db.execute(count_query).scalar() or 0
        except Exception:
            # Fallback: execute search and count results
            results = self.db.execute(search_query).all()
            total_count = len(results)

        # Get paginated results
        offset = (page - 1) * page_size
        search_query = search_query.offset(offset).limit(page_size)

        # Use scalars() for simple queries without extra columns
        if not (self._is_postgresql and self._check_fts_available()):
            results = self.db.scalars(search_query).all()
        else:
            results = self.db.execute(search_query).all()

        # Convert to SearchResultItem
        search_results = []
        for row in results:
            item = self._row_to_search_result(row, include_highlights, query, "keyword")
            if item:
                search_results.append(item)

        return search_results, total_count

    def _semantic_search(
        self,
        query: str,
        filters: Optional[SearchFilters],
        page: int,
        page_size: int,
        include_highlights: bool,
    ) -> Tuple[List[SearchResultItem], int]:
        """Perform semantic vector search.

        Args:
            query: Search query string
            filters: Optional search filters
            page: Page number
            page_size: Results per page
            include_highlights: Whether to include highlights

        Returns:
            Tuple of (results, total_count)
        """
        # Semantic search requires PostgreSQL with pgvector
        if not self._is_postgresql:
            # Fall back to keyword search
            return self._keyword_search(query, filters, page, page_size, include_highlights)

        # TODO: Implement semantic search using embeddings
        # This requires:
        # 1. Generate embedding for query using OpenAI API
        # 2. Calculate cosine similarity with stored embeddings
        # 3. Rank results by similarity score

        # For now, fall back to keyword search
        return self._keyword_search(query, filters, page, page_size, include_highlights)

    def _hybrid_search(
        self,
        query: str,
        filters: Optional[SearchFilters],
        page: int,
        page_size: int,
        include_highlights: bool,
    ) -> Tuple[List[SearchResultItem], int]:
        """Perform hybrid search combining keyword and semantic.

        Args:
            query: Search query string
            filters: Optional search filters
            page: Page number
            page_size: Results per page
            include_highlights: Whether to include highlights

        Returns:
            Tuple of (results, total_count)
        """
        # Get keyword and semantic results
        keyword_results, keyword_count = self._keyword_search(
            query, filters, 1, page_size * 2, include_highlights
        )
        semantic_results, semantic_count = self._semantic_search(
            query, filters, 1, page_size * 2, include_highlights
        )

        # Combine and rank results
        combined_results = self._combine_results(keyword_results, semantic_results, page_size)

        # Apply pagination
        offset = (page - 1) * page_size
        paginated_results = combined_results[offset : offset + page_size]

        total_count = len(combined_results)

        return paginated_results, total_count

    def _build_base_query(self, filters: Optional[SearchFilters]) -> Select:
        """Build base query with filters applied.

        Args:
            filters: Optional search filters

        Returns:
            SQLAlchemy Select query
        """
        query = select(Event)

        # Apply filters
        if filters:
            if filters.session_id:
                query = query.where(Event.session_id == filters.session_id)

            if filters.event_types:
                query = query.where(Event.event_type.in_(filters.event_types))

            if filters.character_ids:
                query = query.where(Event.character_id.in_(filters.character_ids))

            if filters.start_time:
                query = query.where(Event.timestamp >= filters.start_time)

            if filters.end_time:
                query = query.where(Event.timestamp <= filters.end_time)

            if filters.visibility:
                query = query.where(Event.visibility.in_(filters.visibility))

        return query

    def _apply_postgresql_fts(self, base_query: Select, query_str: str) -> Select:
        """Apply PostgreSQL full-text search.

        Uses the GIN index on (description, narration, input_raw) for efficient
        full-text search across event text fields.

        Args:
            base_query: Base SQLAlchemy query
            query_str: Search query string

        Returns:
            Query with full-text search applied
        """
        # Use tsvector for full-text search across all indexed fields
        # This matches the GIN index created in migration 012
        search_query = base_query.add_columns(
            func.ts_rank(
                func.to_tsvector(
                    "english",
                    func.coalesce(Event.description, "")
                    + " "
                    + func.coalesce(Event.narration, "")
                    + " "
                    + func.coalesce(Event.input_raw, ""),
                ),
                func.plainto_tsquery("english", query_str),
            ).label("relevance_score")
        )

        # Filter by relevance using the same combined tsvector
        search_query = search_query.where(
            func.to_tsvector(
                "english",
                func.coalesce(Event.description, "")
                + " "
                + func.coalesce(Event.narration, "")
                + " "
                + func.coalesce(Event.input_raw, ""),
            ).op("@@")(func.plainto_tsquery("english", query_str))
        )

        # Order by relevance
        search_query = search_query.order_by(text("relevance_score DESC"))

        return search_query

    def _apply_sqlite_fts(self, base_query: Select, query_str: str) -> Select:
        """Apply SQLite FTS5 full-text search.

        Args:
            base_query: Base SQLAlchemy query
            query_str: Search query string

        Returns:
            Query with full-text search applied
        """
        # Join with FTS table
        search_query = base_query.join(text("events_fts"), text("events.id = events_fts.id"))

        # Filter by FTS match
        search_query = search_query.where(text("events_fts MATCH :query")).params(query=query_str)

        # Order by rank (BM25)
        search_query = search_query.order_by(text("bm25(events_fts)"))

        return search_query

    def _apply_like_search(self, base_query: Select, query_str: str) -> Select:
        """Apply LIKE-based search as fallback.

        Args:
            base_query: Base SQLAlchemy query
            query_str: Search query string

        Returns:
            Query with LIKE search applied
        """
        # Parse query for AND/OR logic
        keywords = self._parse_keywords(query_str)

        if not keywords:
            return base_query

        # Limit keywords to avoid SQLite expression tree depth limit (max 1000)
        # Using a conservative limit to stay well under the constraint
        MAX_KEYWORDS = 100
        if len(keywords) > MAX_KEYWORDS:
            keywords = keywords[:MAX_KEYWORDS]

        # Build search conditions
        search_conditions = []
        for keyword in keywords:
            keyword_lower = keyword.lower()
            # Search in description, narration, and input_raw
            search_conditions.append(
                or_(
                    Event.description.ilike(f"%{keyword_lower}%"),
                    Event.narration.ilike(f"%{keyword_lower}%"),
                    Event.input_raw.ilike(f"%{keyword_lower}%"),
                )
            )

        # Apply AND logic by default (all keywords must match)
        if len(search_conditions) > 1:
            base_query = base_query.where(and_(*search_conditions))
        else:
            base_query = base_query.where(search_conditions[0])

        return base_query

    def _parse_keywords(self, query_str: str) -> List[str]:
        """Parse search query into individual keywords.

        Handles AND/OR operators and extracts keywords.

        Args:
            query_str: Search query string

        Returns:
            List of individual keywords
        """
        if not query_str:
            return []

        # Remove common operators and normalize
        # Handle OR operator
        query_str = query_str.replace(" OR ", " ").replace(" or ", " ")

        # Split by whitespace
        keywords = query_str.split()

        # Filter out empty strings and very short keywords
        keywords = [k.strip() for k in keywords if k.strip() and len(k.strip()) > 0]

        return keywords

    def _row_to_search_result(
        self,
        row: Any,
        include_highlights: bool,
        query: str,
        search_type: str,
    ) -> Optional[SearchResultItem]:
        """Convert database row to SearchResultItem.

        Args:
            row: Database row
            include_highlights: Whether to include highlights
            query: Original search query
            search_type: Type of search performed

        Returns:
            SearchResultItem or None
        """
        # Extract event from row
        event = row[0] if isinstance(row, tuple) else row

        # Get relevance score
        relevance_score = 0.0
        if isinstance(row, tuple) and len(row) > 1:
            relevance_score = float(row[1]) if row[1] is not None else 0.0

        # Generate highlights
        highlights = []
        if include_highlights and event.description:
            highlights = self._generate_highlights(event.description, query)

        return SearchResultItem(
            id=event.id,
            type="event",
            session_id=event.session_id
            if event.session_id
            else UUID("00000000-0000-0000-0000-000000000000"),
            title=None,
            description=event.description or "",
            event_type=event.event_type.value if event.event_type else None,
            timestamp=event.timestamp or datetime.now(),
            highlights=highlights,
            relevance_score=relevance_score,
        )

    def _generate_highlights(
        self,
        text: str,
        query: str,
        fragment_size: int = 150,
        max_fragments: int = 3,
    ) -> List[SearchResultHighlight]:
        """Generate highlighted fragments from text.

        Args:
            text: Source text
            query: Search query
            fragment_size: Size of each fragment
            max_fragments: Maximum number of fragments

        Returns:
            List of highlighted fragments
        """
        if not text or not query:
            return []

        highlights = []
        query_lower = query.lower()
        text_lower = text.lower()

        # Find all matches
        offset = 0
        while len(highlights) < max_fragments:
            pos = text_lower.find(query_lower, offset)
            if pos == -1:
                break

            # Extract fragment around match
            start = max(0, pos - fragment_size // 2)
            end = min(len(text), pos + len(query) + fragment_size // 2)

            fragment = text[start:end]
            if start > 0:
                fragment = "..." + fragment
            if end < len(text):
                fragment = fragment + "..."

            highlights.append(
                SearchResultHighlight(
                    field="description",
                    fragment=fragment,
                    offset=start,
                )
            )

            offset = pos + 1

        return highlights

    def _combine_results(
        self,
        keyword_results: List[SearchResultItem],
        semantic_results: List[SearchResultItem],
        limit: int,
    ) -> List[SearchResultItem]:
        """Combine and rank keyword and semantic results.

        Args:
            keyword_results: Results from keyword search
            semantic_results: Results from semantic search
            limit: Maximum number of results to return

        Returns:
            Combined and ranked results
        """
        # Create map of results by ID
        results_map: Dict[UUID, SearchResultItem] = {}

        # Add keyword results with weight
        for result in keyword_results:
            if result.id not in results_map:
                results_map[result.id] = result
                result.relevance_score *= 0.6  # Weight for keyword search

        # Add or update with semantic results
        for result in semantic_results:
            if result.id in results_map:
                # Combine scores
                results_map[result.id].relevance_score += result.relevance_score * 0.4
            else:
                result.relevance_score *= 0.4  # Weight for semantic search
                results_map[result.id] = result

        # Sort by combined score
        combined = list(results_map.values())
        combined.sort(key=lambda x: x.relevance_score, reverse=True)

        return combined[:limit]

    def get_suggestions(self, query_prefix: str, limit: int = 10) -> SearchSuggestionResponse:
        """Get search suggestions based on query prefix.

        Args:
            query_prefix: Query prefix to match
            limit: Maximum number of suggestions

        Returns:
            Search suggestions
        """
        suggestions = []

        # Get event type suggestions
        event_types = self.db.execute(
            select(Event.event_type, func.count(Event.id))
            .where(Event.event_type.like(f"{query_prefix}%"))
            .group_by(Event.event_type)
            .order_by(func.count(Event.id).desc())
            .limit(limit)
        ).all()

        for event_type, count in event_types:
            suggestions.append(
                SearchSuggestion(
                    text=event_type.value if isinstance(event_type, EventType) else str(event_type),
                    type="event_type",
                    count=count,
                )
            )

        return SearchSuggestionResponse(
            suggestions=suggestions,
            query=query_prefix,
        )

    def save_search_history(
        self,
        user_id: int,
        query: str,
        filters: Optional[SearchFilters],
        results_count: int,
    ) -> None:
        """Save search to history.

        Args:
            user_id: User ID
            query: Search query
            filters: Search filters used
            results_count: Number of results returned
        """
        # TODO: Implement search history saving
        # This requires a SearchHistory model
        pass

    def get_search_history(
        self,
        user_id: int,
        page: int = 1,
        page_size: int = 20,
    ) -> SearchHistoryResponse:
        """Get user's search history.

        Args:
            user_id: User ID
            page: Page number
            page_size: Results per page

        Returns:
            Search history
        """
        # TODO: Implement search history retrieval
        # This requires a SearchHistory model
        return SearchHistoryResponse(
            history=[],
            total_count=0,
        )


class RankingService:
    """Service for ranking search results."""

    DEFAULT_EVENT_TYPE_WEIGHTS = {
        EventType.SAN_LOSS: 2.5,
        EventType.SAN_CHECK: 2.0,
        EventType.DAMAGE: 1.8,
        EventType.COMBAT_START: 1.5,
        EventType.ROLL: 1.0,
        EventType.MESSAGE: 1.0,
        EventType.CHASE_START: 1.4,
        EventType.SCENE_CHANGE: 1.3,
        EventType.NPC_APPEAR: 1.2,
    }

    def __init__(
        self,
        relevance_weight: float = 0.5,
        recency_weight: float = 0.3,
        event_type_weight: float = 0.2,
        recency_half_life_days: int = 7,
        event_type_weights: Optional[Dict[EventType, float]] = None,
    ):
        self.relevance_weight = relevance_weight
        self.recency_weight = recency_weight
        self.event_type_weight = event_type_weight
        self.recency_half_life_days = recency_half_life_days
        self.event_type_weights = event_type_weights or self.DEFAULT_EVENT_TYPE_WEIGHTS.copy()

    def rank_results(
        self,
        results: List[SearchResultItem],
        relevance_weight: Optional[float] = None,
        recency_weight: Optional[float] = None,
        event_type_weight: Optional[float] = None,
        keywords: Optional[List[str]] = None,
        deduplicate: bool = False,
    ) -> List[SearchResultItem]:
        """Rank search results by multiple factors.

        Args:
            results: Search results to rank
            relevance_weight: Override relevance weight
            recency_weight: Override recency weight
            event_type_weight: Override event type weight
            keywords: Keywords for exact match boosting
            deduplicate: Whether to remove duplicates

        Returns:
            Ranked results
        """
        if not results:
            return []

        rw = relevance_weight if relevance_weight is not None else self.relevance_weight
        cw = recency_weight if recency_weight is not None else self.recency_weight
        ew = event_type_weight if event_type_weight is not None else self.event_type_weight

        scored_results = []
        now = datetime.now()

        for result in results:
            relevance_score = result.relevance_score or 0.5

            recency_score = 0.5
            if result.timestamp:
                recency_score = self._calculate_recency_score(result.timestamp, now)

            event_type = EventType(result.event_type) if result.event_type else EventType.MESSAGE
            type_score = self._calculate_event_type_score(event_type)

            keyword_boost = 0.0
            if keywords:
                keyword_boost = self._calculate_keyword_boost(result, keywords)

            total_score = (
                relevance_score * rw + recency_score * cw + type_score * ew + keyword_boost
            )

            result_copy = result.model_copy()
            result_copy.relevance_score = total_score
            scored_results.append(result_copy)

        scored_results.sort(key=lambda x: x.relevance_score, reverse=True)

        if deduplicate:
            seen_ids = set()
            deduped = []
            for result in scored_results:
                if result.id not in seen_ids:
                    seen_ids.add(result.id)
                    deduped.append(result)
            return deduped

        return scored_results

    def _calculate_recency_score(
        self, timestamp: datetime, now: Optional[datetime] = None
    ) -> float:
        """Calculate recency score with exponential decay.

        Args:
            timestamp: Event timestamp
            now: Current time (for testing)

        Returns:
            Recency score between 0 and 1
        """
        if now is None:
            now = datetime.now()

        age_seconds = (now - timestamp).total_seconds()
        age_days = age_seconds / 86400

        if age_days < 0:
            return 0.5

        decay_factor = 0.5 ** (age_days / self.recency_half_life_days)
        return decay_factor

    def _calculate_event_type_score(self, event_type: EventType) -> float:
        """Calculate event type importance score.

        Args:
            event_type: Event type

        Returns:
            Event type score (default 0.5 if not in weights)
        """
        return self.event_type_weights.get(event_type, 0.5) / 2.5

    def _calculate_keyword_boost(self, result: SearchResultItem, keywords: List[str]) -> float:
        """Calculate boost for exact keyword matches.

        Args:
            result: Search result
            keywords: Keywords to match

        Returns:
            Keyword boost score
        """
        if not result.description:
            return 0.0

        text_lower = result.description.lower()
        match_count = sum(1 for kw in keywords if kw.lower() in text_lower)

        if len(keywords) == 0:
            return 0.0

        return (match_count / len(keywords)) * 0.3
