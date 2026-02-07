"""Tests for rule embedding service."""
import pytest
from unittest.mock import AsyncMock, MagicMock
from src.models.rule import Rule, RuleFAQ


@pytest.fixture
async def mock_llm_provider():
    """Fixture that provides a mocked LLM provider with embedding API."""
    provider = AsyncMock()

    # Mock the embeddings.create method
    mock_embedding_create = AsyncMock()
    provider.client.embeddings.create = mock_embedding_create

    return provider, mock_embedding_create


@pytest.mark.asyncio
async def test_generate_embedding(mock_llm_provider):
    """Test that embeddings are generated correctly."""
    provider, mock_create = mock_llm_provider

    # Mock embedding response
    mock_response = MagicMock()
    mock_response.data = [MagicMock(embedding=[0.1] * 1536)]
    mock_create.return_value = mock_response

    from src.services.rule_embedding import RuleEmbeddingService

    service = RuleEmbeddingService(provider)
    embedding = await service.generate_embedding("暗视")

    # Verify embedding dimensions
    assert len(embedding) == 1536
    assert all(isinstance(x, float) for x in embedding)

    # Verify the API was called correctly
    mock_create.assert_called_once_with(
        model="text-embedding-3-small",
        input="暗视"
    )


@pytest.mark.asyncio
async def test_embed_rule(mock_llm_provider):
    """Test that rule embedding combines title, content, and example."""
    provider, mock_create = mock_llm_provider

    # Mock embedding response
    mock_response = MagicMock()
    mock_response.data = [MagicMock(embedding=[0.2] * 1536)]
    mock_create.return_value = mock_response

    from src.services.rule_embedding import RuleEmbeddingService

    service = RuleEmbeddingService(provider)

    rule = Rule(
        title="暗视",
        category="skill",
        content="暗视允许调查员在几乎完全黑暗的环境中进行检定...",
        example="例如，在完全黑暗的房间中，暗视50的调查员可以进行检定。"
    )

    embedding = await service.embed_rule(rule)

    # Verify embedding dimensions
    assert len(embedding) == 1536

    # Verify the API was called with combined text
    call_args = mock_create.call_args
    input_text = call_args[1]["input"]

    # Check that title, content, and example are all included
    assert "暗视" in input_text
    assert "几乎完全黑暗" in input_text
    assert "完全黑暗的房间中" in input_text


@pytest.mark.asyncio
async def test_embed_rule_without_example(mock_llm_provider):
    """Test that rule embedding works when example is None."""
    provider, mock_create = mock_llm_provider

    # Mock embedding response
    mock_response = MagicMock()
    mock_response.data = [MagicMock(embedding=[0.3] * 1536)]
    mock_create.return_value = mock_response

    from src.services.rule_embedding import RuleEmbeddingService

    service = RuleEmbeddingService(provider)

    rule = Rule(
        title="闪避",
        category="skill",
        content="闪避技能用于躲避攻击和意外...",
        example=None
    )

    embedding = await service.embed_rule(rule)

    # Verify embedding dimensions
    assert len(embedding) == 1536

    # Verify the API was called
    mock_create.assert_called_once()
    call_args = mock_create.call_args
    input_text = call_args[1]["input"]

    # Check that title and content are included
    assert "闪避" in input_text
    assert "躲避攻击" in input_text


@pytest.mark.asyncio
async def test_embed_faq(mock_llm_provider):
    """Test that FAQ embedding combines question and answer."""
    provider, mock_create = mock_llm_provider

    # Mock embedding response
    mock_response = MagicMock()
    mock_response.data = [MagicMock(embedding=[0.4] * 1536)]
    mock_create.return_value = mock_response

    from src.services.rule_embedding import RuleEmbeddingService

    service = RuleEmbeddingService(provider)

    faq = RuleFAQ(
        question="如何计算闪避的难度等级？",
        answer="闪避技能的难度等级根据具体情况而定。常规闪避使用常规难度..."
    )

    embedding = await service.embed_faq(faq)

    # Verify embedding dimensions
    assert len(embedding) == 1536

    # Verify the API was called with combined text
    call_args = mock_create.call_args
    input_text = call_args[1]["input"]

    # Check that question and answer are both included
    assert "如何计算闪避的难度等级" in input_text
    assert "常规闪避使用常规难度" in input_text


@pytest.mark.asyncio
async def test_embedding_caching(mock_llm_provider):
    """Test that generate_embedding uses caching."""
    provider, mock_create = mock_llm_provider

    # Mock embedding response
    mock_response = MagicMock()
    mock_response.data = [MagicMock(embedding=[0.5] * 1536)]
    mock_create.return_value = mock_response

    from src.services.rule_embedding import RuleEmbeddingService

    service = RuleEmbeddingService(provider)

    # Call with same text twice
    text1 = "暗视技能检定"
    text2 = "暗视技能检定"

    embedding1 = await service.generate_embedding(text1)
    embedding2 = await service.generate_embedding(text2)

    # Verify embeddings are identical
    assert embedding1 == embedding2

    # Verify API was called only once due to caching
    assert mock_create.call_count == 1


@pytest.mark.asyncio
async def test_embedding_different_texts(mock_llm_provider):
    """Test that different texts generate different API calls."""
    provider, mock_create = mock_llm_provider

    # Mock embedding response
    mock_response = MagicMock()
    mock_response.data = [MagicMock(embedding=[0.6] * 1536)]
    mock_create.return_value = mock_response

    from src.services.rule_embedding import RuleEmbeddingService

    service = RuleEmbeddingService(provider)

    # Call with different texts
    await service.generate_embedding("暗视")
    await service.generate_embedding("闪避")

    # Verify API was called twice
    assert mock_create.call_count == 2
