"""Tests for rule search service."""
import pytest
from unittest.mock import AsyncMock, MagicMock
from sqlalchemy.orm import Session
from src.models.rule import Rule, RuleFAQ
from src.schemas.rule import RuleCategory


@pytest.fixture
async def mock_llm_provider():
    """Fixture that provides a mocked LLM provider with embedding API."""
    provider = AsyncMock()

    # Mock the embeddings.create method
    mock_embedding_create = AsyncMock()
    provider.client.embeddings.create = mock_embedding_create

    return provider, mock_embedding_create


@pytest.fixture
def sample_rules(test_db):
    """Create sample rules in the database for testing."""
    rules = [
        Rule(
            title="暗视",
            category=RuleCategory.SKILL,
            subcategory="探索技能",
            content="暗视允许调查员在几乎完全黑暗的环境中进行检定。暗视数值通常在10-30之间，只有在几乎完全黑暗的环境中才能使用。",
            example="在完全黑暗的地下室中，暗视20的调查员可以进行检定。",
            tags=["视觉", "黑暗"],
            aliases=["夜视"]
        ),
        Rule(
            title="闪避",
            category=RuleCategory.SKILL,
            subcategory="战斗技能",
            content="闪避技能用于躲避攻击和意外。闪避检定的成功率取决于角色的敏捷值。在战斗中，闪避是重要的防御手段。",
            example="当敌人攻击时，调查员可以使用闪避技能进行躲避。",
            tags=["防御", "战斗"],
            aliases=["躲避"]
        ),
        Rule(
            title="理智检定",
            category=RuleCategory.SANITY,
            subcategory="基础规则",
            content="理智检定用于确定角色在面对恐怖事物时的心理承受能力。检定失败会导致理智值下降，并可能诱发临时疯狂。",
            example="遇到恐怖的怪物时，需要进行0/1d4的理智检定。",
            tags=["理智", "疯狂"],
            aliases=["SAN检定", "Sanity Check"]
        ),
        Rule(
            title="战斗轮次",
            category=RuleCategory.COMBAT,
            subcategory="战斗流程",
            content="战斗按轮次进行，每一轮中所有参与者根据敏捷值排序行动。高敏捷的角色先行动。",
            example="敏捷15的调查员会在敏捷10的敌人之前行动。",
            tags=["战斗", "轮次"],
            aliases=["回合"]
        ),
    ]

    for rule in rules:
        test_db.add(rule)
    test_db.commit()

    return rules


@pytest.mark.asyncio
async def test_search_by_embedding(test_db, sample_rules, mock_llm_provider):
    """Test that search returns relevant rules based on vector similarity."""
    provider, mock_create = mock_llm_provider

    # Mock embedding response for query
    mock_response = MagicMock()
    # Create a mock embedding that will be "similar" to the first rule
    mock_response.data = [MagicMock(embedding=[0.1] * 1536)]
    mock_create.return_value = mock_response

    from src.services.rule_embedding import RuleEmbeddingService
    from src.services.rule_search import RuleSearchService

    # Initialize services
    embedding_service = RuleEmbeddingService(provider)
    search_service = RuleSearchService(test_db, embedding_service)

    # Add mock embeddings to rules (simulate they have embeddings stored)
    import pickle
    for rule in sample_rules:
        embedding = await embedding_service.embed_rule(rule)
        rule.embedding = pickle.dumps(embedding)
    test_db.commit()

    # Perform search
    results = await search_service.search("如何在黑暗中看见东西", limit=3)

    # Verify results
    assert len(results) > 0
    assert results[0]["title"] == "暗视"  # Should match the query about seeing in dark
    assert "relevance_score" in results[0]


@pytest.mark.asyncio
async def test_search_with_category_filter(test_db, sample_rules, mock_llm_provider):
    """Test that search respects category filter."""
    provider, mock_create = mock_llm_provider

    # Mock embedding response
    mock_response = MagicMock()
    mock_response.data = [MagicMock(embedding=[0.2] * 1536)]
    mock_create.return_value = mock_response

    from src.services.rule_embedding import RuleEmbeddingService
    from src.services.rule_search import RuleSearchService

    # Initialize services
    embedding_service = RuleEmbeddingService(provider)
    search_service = RuleSearchService(test_db, embedding_service)

    # Add mock embeddings to rules
    import pickle
    for rule in sample_rules:
        embedding = await embedding_service.embed_rule(rule)
        rule.embedding = pickle.dumps(embedding)
    test_db.commit()

    # Perform search with category filter
    results = await search_service.search(
        "闪避",
        category=RuleCategory.COMBAT,
        limit=5
    )

    # Verify that only combat rules are returned
    assert all(r["category"] == RuleCategory.COMBAT for r in results)
    # "闪避" is a SKILL, not COMBAT, so should not appear in results
    assert not any(r["title"] == "闪避" for r in results)


@pytest.mark.asyncio
async def test_keyword_search_fallback(test_db, sample_rules):
    """Test that keyword search is used when embeddings are not available."""
    from src.services.rule_embedding import RuleEmbeddingService
    from src.services.rule_search import RuleSearchService

    # Mock embedding service that returns None (no embeddings available)
    embedding_service = AsyncMock()
    embedding_service.generate_embedding = AsyncMock(return_value=None)

    search_service = RuleSearchService(test_db, embedding_service)

    # Perform search - should fall back to keyword search
    results = await search_service.search("暗视", limit=5)

    # Verify results from keyword search
    assert len(results) > 0
    assert any("暗视" in r["title"] or "暗视" in r["content"] for r in results)


@pytest.mark.asyncio
async def test_suggest_alternatives(test_db, sample_rules):
    """Test that alternatives are suggested when no results found."""
    from src.services.rule_embedding import RuleEmbeddingService
    from src.services.rule_search import RuleSearchService

    embedding_service = AsyncMock()
    search_service = RuleSearchService(test_db, embedding_service)

    # Search for something that doesn't exist
    alternatives = search_service._suggest_alternatives("xyzabc")

    # Verify alternatives are suggested
    assert len(alternatives) > 0
    assert all("title" in alt and "category" in alt for alt in alternatives)


@pytest.mark.asyncio
async def test_get_rule_detail(test_db, sample_rules):
    """Test retrieving full rule detail with related content."""
    from src.services.rule_embedding import RuleEmbeddingService
    from src.services.rule_search import RuleSearchService

    embedding_service = AsyncMock()
    search_service = RuleSearchService(test_db, embedding_service)

    # Get detail of first rule
    rule = sample_rules[0]
    detail = await search_service.get_rule_detail(str(rule.id))

    # Verify detail contains all fields
    assert detail["id"] == str(rule.id)
    assert detail["title"] == rule.title
    assert detail["category"] == rule.category
    assert detail["content"] == rule.content
    assert detail["example"] == rule.example
    assert "tags" in detail
    assert "aliases" in detail


@pytest.mark.asyncio
async def test_get_rule_detail_not_found(test_db):
    """Test that get_rule_detail returns None for non-existent rule."""
    from src.services.rule_embedding import RuleEmbeddingService
    from src.services.rule_search import RuleSearchService

    embedding_service = AsyncMock()
    search_service = RuleSearchService(test_db, embedding_service)

    # Try to get non-existent rule
    detail = await search_service.get_rule_detail("00000000-0000-0000-0000-000000000000")

    # Verify None is returned
    assert detail is None


@pytest.mark.asyncio
async def test_get_categories(test_db, sample_rules):
    """Test retrieving all distinct categories."""
    from src.services.rule_embedding import RuleEmbeddingService
    from src.services.rule_search import RuleSearchService

    embedding_service = AsyncMock()
    search_service = RuleSearchService(test_db, embedding_service)

    # Get all categories
    categories = await search_service.get_categories()

    # Verify categories
    assert len(categories) > 0
    assert RuleCategory.SKILL in categories
    assert RuleCategory.SANITY in categories
    assert RuleCategory.COMBAT in categories


@pytest.mark.asyncio
async def test_search_empty_query(test_db, sample_rules):
    """Test that search handles empty query gracefully."""
    from src.services.rule_embedding import RuleEmbeddingService
    from src.services.rule_search import RuleSearchService

    embedding_service = AsyncMock()
    search_service = RuleSearchService(test_db, embedding_service)

    # Search with empty query
    results = await search_service.search("", limit=5)

    # Should return empty results or handle gracefully
    assert isinstance(results, list)


@pytest.mark.asyncio
async def test_search_limit(test_db, sample_rules, mock_llm_provider):
    """Test that search respects the limit parameter."""
    provider, mock_create = mock_llm_provider

    # Mock embedding response
    mock_response = MagicMock()
    mock_response.data = [MagicMock(embedding=[0.3] * 1536)]
    mock_create.return_value = mock_response

    from src.services.rule_embedding import RuleEmbeddingService
    from src.services.rule_search import RuleSearchService

    # Initialize services
    embedding_service = RuleEmbeddingService(provider)
    search_service = RuleSearchService(test_db, embedding_service)

    # Add mock embeddings to rules
    import pickle
    for rule in sample_rules:
        embedding = await embedding_service.embed_rule(rule)
        rule.embedding = pickle.dumps(embedding)
    test_db.commit()

    # Perform search with limit
    results = await search_service.search("技能", limit=2)

    # Verify limit is respected
    assert len(results) <= 2
