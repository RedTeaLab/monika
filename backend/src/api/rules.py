"""Rules API routes for CoC 7e rules knowledge base."""
from typing import List, Optional
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.core.database import get_db
from src.schemas.rule import (
    RuleCategory,
    RuleSearchResponse,
    RuleSearchResult,
    RuleResponse,
    RuleImportData,
    RuleImportResponse,
    RuleCreate,
    FAQCreate,
)
from src.services.rule_search import RuleSearchService
from src.services.rule_embedding import RuleEmbeddingService
from src.services.llm.openai import OpenAIProvider
from src.models.rule import Rule, RuleFAQ

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rules", tags=["rules"])


def get_embedding_service():
    """Get or create embedding service instance."""
    try:
        # Try to get OpenAI provider from environment
        import os
        from src.core.config import settings

        if hasattr(settings, 'OPENAI_API_KEY') and settings.OPENAI_API_KEY:
            llm_provider = OpenAIProvider(
                api_key=settings.OPENAI_API_KEY,
                model=getattr(settings, 'OPENAI_MODEL', 'gpt-4o-mini'),
                base_url=getattr(settings, 'OPENAI_BASE_URL', None)
            )
            return RuleEmbeddingService(llm_provider)
    except Exception as e:
        logger.warning(f"Failed to initialize embedding service: {e}")

    return None


@router.get("/search", response_model=RuleSearchResponse)
async def search_rules(
    query: str,
    category: Optional[RuleCategory] = None,
    limit: int = 10,
    db: Session = Depends(get_db),
):
    """
    Search for rules using hybrid retrieval (vector + keyword).

    Args:
        query: Search query string
        category: Optional category filter
        limit: Maximum number of results (default: 10)
        db: Database session

    Returns:
        Search results with relevance scores
    """
    if not query or not query.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Query parameter is required"
        )

    # Validate limit
    if limit < 1 or limit > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Limit must be between 1 and 100"
        )

    # Initialize services
    embedding_service = get_embedding_service()
    search_service = RuleSearchService(db, embedding_service)

    # Perform search
    try:
        results = await search_service.search(
            query=query,
            category=category,
            limit=limit
        )

        # Convert to response format
        search_results = [
            RuleSearchResult(
                id=r["id"],
                title=r["title"],
                category=r["category"],
                content=r["content"],
                relevance_score=r["relevance_score"],
                related_rules=r.get("related_rules", [])
            )
            for r in results
        ]

        return RuleSearchResponse(
            results=search_results,
            total=len(search_results),
            query=query
        )

    except Exception as e:
        logger.error(f"Error searching rules: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to search rules"
        )


@router.get("/{rule_id}", response_model=RuleResponse)
async def get_rule(
    rule_id: str,
    db: Session = Depends(get_db),
):
    """
    Get full rule detail by ID.

    Args:
        rule_id: UUID of the rule
        db: Database session

    Returns:
        Full rule detail with examples, mechanics, and related rules
    """
    if not rule_id or not rule_id.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rule ID is required"
        )

    # Initialize services
    embedding_service = get_embedding_service()
    search_service = RuleSearchService(db, embedding_service)

    # Get rule detail
    try:
        rule = await search_service.get_rule_detail(rule_id)

        if not rule:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Rule with ID {rule_id} not found"
            )

        return RuleResponse(
            id=rule["id"],
            title=rule["title"],
            category=rule["category"],
            subcategory=rule.get("subcategory"),
            content=rule["content"],
            example=rule.get("example"),
            mechanics=rule.get("mechanics"),
            aliases=rule.get("aliases", []),
            tags=rule.get("tags", []),
            related_rule_ids=rule.get("related_rule_ids", []),
            created_at=rule.get("created_at"),
            updated_at=rule.get("updated_at")
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting rule {rule_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get rule detail"
        )


@router.get("/categories/list", response_model=List[str])
async def get_categories(
    db: Session = Depends(get_db),
):
    """
    Get all distinct rule categories.

    Args:
        db: Database session

    Returns:
        List of category strings
    """
    try:
        # Initialize services
        embedding_service = get_embedding_service()
        search_service = RuleSearchService(db, embedding_service)

        categories = await search_service.get_categories()

        return categories

    except Exception as e:
        logger.error(f"Error getting categories: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get categories"
        )


@router.post("/import", response_model=RuleImportResponse)
async def import_rules(
    data: RuleImportData,
    db: Session = Depends(get_db),
):
    """
    Import bulk rules and FAQs into the database.

    Args:
        data: Import data containing rules and FAQs
        db: Database session

    Returns:
        Import results with counts and any errors
    """
    imported = 0
    failed = 0
    errors = []

    # Import rules
    for rule_data in data.rules:
        try:
            rule = Rule(
                title=rule_data.title,
                category=rule_data.category.value,
                subcategory=rule_data.subcategory,
                content=rule_data.content,
                example=rule_data.example,
                mechanics=rule_data.mechanics,
                aliases=rule_data.aliases,
                tags=rule_data.tags,
                related_rule_ids=rule_data.related_rule_ids
            )
            db.add(rule)
            imported += 1
        except Exception as e:
            failed += 1
            errors.append(f"Failed to import rule '{rule_data.title}': {str(e)}")
            logger.error(f"Failed to import rule '{rule_data.title}': {e}")

    # Import FAQs
    for faq_data in data.faqs:
        try:
            faq = RuleFAQ(
                question=faq_data.question,
                answer=faq_data.answer,
                category=faq_data.category,
                related_rule_ids=faq_data.related_rule_ids
            )
            db.add(faq)
            imported += 1
        except Exception as e:
            failed += 1
            errors.append(f"Failed to import FAQ: {str(e)}")
            logger.error(f"Failed to import FAQ: {e}")

    # Commit all changes
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to commit import: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to commit import: {str(e)}"
        )

    return RuleImportResponse(
        imported=imported,
        failed=failed,
        errors=errors
    )


@router.post("/", response_model=RuleResponse)
async def create_rule(
    rule_data: RuleCreate,
    db: Session = Depends(get_db),
):
    """
    Create a single new rule.

    Args:
        rule_data: Rule creation data
        db: Database session

    Returns:
        Created rule
    """
    try:
        rule = Rule(
            title=rule_data.title,
            category=rule_data.category.value,
            subcategory=rule_data.subcategory,
            content=rule_data.content,
            example=rule_data.example,
            mechanics=rule_data.mechanics,
            aliases=rule_data.aliases,
            tags=rule_data.tags,
            related_rule_ids=rule_data.related_rule_ids
        )
        db.add(rule)
        db.commit()
        db.refresh(rule)

        return RuleResponse.model_validate(rule)

    except Exception as e:
        db.rollback()
        logger.error(f"Failed to create rule: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create rule: {str(e)}"
        )
