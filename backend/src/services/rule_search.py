"""Rule search service for hybrid retrieval (keyword + vector similarity)."""
import logging
import pickle
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func

from src.models.rule import Rule, RuleFAQ
from src.schemas.rule import RuleCategory, RuleSearchResult, RuleSummary

logger = logging.getLogger(__name__)


class RuleSearchService:
    """
    Service for searching rules using hybrid retrieval.

    Combines vector similarity search (when embeddings are available)
    with keyword search fallback for maximum relevance.
    """

    def __init__(self, db: Session, embedding_service):
        """
        Initialize the rule search service.

        Args:
            db: SQLAlchemy database session
            embedding_service: RuleEmbeddingService instance for generating embeddings
        """
        self.db = db
        self.embedding_service = embedding_service

    async def search(
        self,
        query: str,
        category: Optional[RuleCategory] = None,
        limit: int = 10
    ) -> List[Dict]:
        """
        Search for rules using vector similarity with keyword fallback.

        Primary method: Uses vector similarity search when embeddings are available.
        Fallback: Uses keyword matching when embeddings are not available.

        Args:
            query: Search query string
            category: Optional category filter
            limit: Maximum number of results to return

        Returns:
            List of search results with relevance scores
        """
        if not query or not query.strip():
            return []

        # Try vector similarity search first
        try:
            results = await self._vector_search(query, category, limit)
            if results:
                return results
        except Exception as e:
            logger.warning(f"Vector search failed, falling back to keyword search: {e}")

        # Fall back to keyword search
        return await self._keyword_search(query, category, limit)

    async def _vector_search(
        self,
        query: str,
        category: Optional[RuleCategory],
        limit: int
    ) -> List[Dict]:
        """
        Perform vector similarity search using embeddings.

        Generates embedding for query and calculates cosine similarity
        with stored rule embeddings.

        Args:
            query: Search query string
            category: Optional category filter
            limit: Maximum number of results

        Returns:
            List of search results sorted by relevance
        """
        # Generate embedding for query
        try:
            query_embedding = await self.embedding_service.generate_embedding(query)
        except Exception as e:
            logger.error(f"Failed to generate query embedding: {e}")
            return []

        # Get all rules with embeddings
        rules_query = self.db.query(Rule).filter(Rule.embedding.isnot(None))

        # Apply category filter if specified
        if category:
            rules_query = rules_query.filter(Rule.category == category)

        rules = rules_query.all()

        # Calculate cosine similarity for each rule
        results = []
        for rule in rules:
            try:
                # Deserialize embedding from binary
                if isinstance(rule.embedding, bytes):
                    rule_embedding = pickle.loads(rule.embedding)
                else:
                    # Handle case where embedding is stored as list/JSON
                    rule_embedding = rule.embedding

                # Calculate cosine similarity
                similarity = self._cosine_similarity(query_embedding, rule_embedding)

                # Only include results with reasonable similarity
                if similarity > 0.1:  # Threshold for relevance
                    result = {
                        "id": str(rule.id),
                        "title": rule.title,
                        "category": rule.category,
                        "content": rule.content,
                        "relevance_score": similarity,
                        "related_rules": self._get_related_rules(rule)
                    }
                    results.append(result)
            except Exception as e:
                logger.warning(f"Failed to calculate similarity for rule {rule.id}: {e}")
                continue

        # Sort by relevance score (descending)
        results.sort(key=lambda x: x["relevance_score"], reverse=True)

        # Apply limit
        return results[:limit]

    async def _keyword_search(
        self,
        query: str,
        category: Optional[RuleCategory],
        limit: int
    ) -> List[Dict]:
        """
        Perform keyword-based search as fallback.

        Searches for query terms in title, content, and aliases.

        Args:
            query: Search query string
            category: Optional category filter
            limit: Maximum number of results

        Returns:
            List of search results with relevance scores
        """
        # Build keyword search query
        search_term = f"%{query}%"

        # Search in title, content, and aliases
        # Build filter conditions dynamically
        conditions = [
            Rule.title.ilike(search_term),
            Rule.content.ilike(search_term)
        ]

        # Note: tags and aliases are stored as JSON in SQLite, so we skip them
        # in keyword search. They'll be matched in vector search instead.

        rules_query = self.db.query(Rule).filter(or_(*conditions))

        # Apply category filter if specified
        if category:
            rules_query = rules_query.filter(Rule.category == category)

        rules = rules_query.limit(limit).all()

        # Convert to result format with mock relevance scores
        results = []
        for rule in rules:
            # Calculate simple relevance score based on matches
            score = self._calculate_keyword_score(query, rule)

            result = {
                "id": str(rule.id),
                "title": rule.title,
                "category": rule.category,
                "content": rule.content,
                "relevance_score": score,
                "related_rules": self._get_related_rules(rule)
            }
            results.append(result)

        # Sort by relevance score
        results.sort(key=lambda x: x["relevance_score"], reverse=True)

        return results

    def _calculate_keyword_score(self, query: str, rule: Rule) -> float:
        """
        Calculate a simple relevance score for keyword search.

        Higher score for exact title matches, content matches, etc.

        Args:
            query: Search query
            rule: Rule to score

        Returns:
            Relevance score between 0 and 1
        """
        query_lower = query.lower()
        score = 0.0

        # Exact title match gets highest score
        if query_lower == rule.title.lower():
            score += 1.0
        elif query_lower in rule.title.lower():
            score += 0.8

        # Content match
        if query_lower in rule.content.lower():
            score += 0.5

        # Tags/aliases match
        if rule.tags:
            for tag in rule.tags:
                if query_lower in tag.lower():
                    score += 0.3
                    break

        # Alias match
        if rule.aliases:
            for alias in rule.aliases:
                if query_lower in alias.lower():
                    score += 0.3
                    break

        # Normalize to 0-1 range
        return min(score, 1.0)

    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """
        Calculate cosine similarity between two vectors.

        Args:
            vec1: First vector
            vec2: Second vector

        Returns:
            Cosine similarity score between 0 and 1
        """
        try:
            import numpy as np

            # Convert to numpy arrays
            a = np.array(vec1)
            b = np.array(vec2)

            # Calculate cosine similarity
            dot_product = np.dot(a, b)
            norm_a = np.linalg.norm(a)
            norm_b = np.linalg.norm(b)

            if norm_a == 0 or norm_b == 0:
                return 0.0

            similarity = dot_product / (norm_a * norm_b)

            # Ensure result is between 0 and 1
            return max(0.0, min(1.0, float(similarity)))

        except ImportError:
            # Fallback without numpy
            dot_product = sum(a * b for a, b in zip(vec1, vec2))
            norm_a = sum(a * a for a in vec1) ** 0.5
            norm_b = sum(b * b for b in vec2) ** 0.5

            if norm_a == 0 or norm_b == 0:
                return 0.0

            similarity = dot_product / (norm_a * norm_b)
            return max(0.0, min(1.0, similarity))

    def _get_related_rules(self, rule: Rule) -> List[Dict]:
        """
        Get related rules for a given rule.

        Args:
            rule: Rule to get related rules for

        Returns:
            List of related rule summaries
        """
        if not rule.related_rule_ids:
            return []

        related = []
        for rule_id in rule.related_rule_ids:
            related_rule = self.db.query(Rule).filter(Rule.id == str(rule_id)).first()
            if related_rule:
                related.append({
                    "id": str(related_rule.id),
                    "title": related_rule.title,
                    "category": related_rule.category,
                    "content": related_rule.content[:200] + "..." if len(related_rule.content) > 200 else related_rule.content
                })

        return related

    def _suggest_alternatives(self, query: str) -> List[Dict]:
        """
        Suggest alternative rules when no results found.

        Returns a list of popular rules or rules from common categories.

        Args:
            query: Original search query

        Returns:
            List of suggested rules
        """
        # Get some sample rules from different categories
        suggestions = self.db.query(Rule).limit(5).all()

        return [
            {
                "id": str(rule.id),
                "title": rule.title,
                "category": rule.category
            }
            for rule in suggestions
        ]

    async def get_rule_detail(self, rule_id: str) -> Optional[Dict]:
        """
        Get full rule detail with related content.

        Args:
            rule_id: UUID of the rule

        Returns:
            Full rule detail or None if not found
        """
        rule = self.db.query(Rule).filter(Rule.id == rule_id).first()

        if not rule:
            return None

        return {
            "id": str(rule.id),
            "title": rule.title,
            "category": rule.category,
            "subcategory": rule.subcategory,
            "content": rule.content,
            "example": rule.example,
            "mechanics": rule.mechanics,
            "aliases": rule.aliases or [],
            "tags": rule.tags or [],
            "related_rule_ids": [str(rid) for rid in (rule.related_rule_ids or [])],
            "related_rules": self._get_related_rules(rule),
            "created_at": rule.created_at.isoformat() if rule.created_at else None,
            "updated_at": rule.updated_at.isoformat() if rule.updated_at else None
        }

    async def get_categories(self) -> List[str]:
        """
        Get all distinct rule categories.

        Returns:
            List of category strings
        """
        categories = self.db.query(Rule.category).distinct().all()

        return [cat[0] for cat in categories if cat[0]]
