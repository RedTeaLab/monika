"""Rule embedding service for generating vector embeddings using OpenAI API."""
from functools import lru_cache
from typing import List, Dict
from src.models.rule import Rule, RuleFAQ


class RuleEmbeddingService:
    """
    Service for generating vector embeddings for rules and FAQs.

    Uses OpenAI's text-embedding-3-small model (1536 dimensions).
    Includes caching for frequently queried texts.
    """

    def __init__(self, llm_provider):
        """
        Initialize the embedding service.

        Args:
            llm_provider: LLM provider instance with OpenAI client
        """
        self.llm_provider = llm_provider
        self.embedding_model = "text-embedding-3-small"
        self._cache: Dict[str, List[float]] = {}

    async def generate_embedding(self, text: str) -> List[float]:
        """
        Generate an embedding vector for the given text.

        Args:
            text: The text to generate an embedding for

        Returns:
            A list of floats representing the embedding vector (1536 dimensions)
        """
        # Check cache first
        if text in self._cache:
            return self._cache[text]

        # Generate new embedding
        response = await self.llm_provider.client.embeddings.create(
            model=self.embedding_model,
            input=text
        )

        # Extract the embedding vector from the response
        embedding = response.data[0].embedding

        # Cache the result (maintain LRU behavior by limiting cache size)
        if len(self._cache) >= 1000:
            # Remove oldest entry (first key)
            oldest_key = next(iter(self._cache))
            del self._cache[oldest_key]

        self._cache[text] = embedding
        return embedding

    async def embed_rule(self, rule: Rule) -> List[float]:
        """
        Generate an embedding for a rule by combining title, content, and example.

        Combines multiple fields to create a rich semantic representation
        of the rule for better search relevance.

        Args:
            rule: A Rule model instance

        Returns:
            A list of floats representing the embedding vector
        """
        # Combine title, content, and example for better semantic search
        parts = [f"标题: {rule.title}", f"内容: {rule.content}"]

        if rule.example:
            parts.append(f"示例: {rule.example}")

        combined_text = "\n".join(parts)
        return await self.generate_embedding(combined_text)

    async def embed_faq(self, faq: RuleFAQ) -> List[float]:
        """
        Generate an embedding for an FAQ by combining question and answer.

        Args:
            faq: A RuleFAQ model instance

        Returns:
            A list of floats representing the embedding vector
        """
        # Combine question and answer for semantic search
        combined_text = f"问题: {faq.question}\n答案: {faq.answer}"
        return await self.generate_embedding(combined_text)
