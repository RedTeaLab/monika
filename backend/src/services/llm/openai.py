from typing import AsyncIterator, Optional
from openai import AsyncOpenAI

from src.core.config import settings
from .base import LLMProvider


class OpenAIProvider(LLMProvider):
    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        # Use provided params or fall back to settings
        self.api_key = api_key or settings.OPENAI_API_KEY
        self.model = model or settings.OPENAI_MODEL
        self.base_url = base_url or settings.OPENAI_BASE_URL

        if not self.api_key:
            raise ValueError("OPENAI_API_KEY is required")

        self.client = AsyncOpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
        )

    async def stream_chat(
        self, messages: list[dict], system_prompt: str
    ) -> AsyncIterator[str]:
        full_messages = [{"role": "system", "content": system_prompt}]
        full_messages.extend(messages)

        stream = await self.client.chat.completions.create(
            model=self.model,
            messages=full_messages,
            stream=True,
            temperature=0.8,
            max_tokens=2000,
        )

        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def get_context_limit(self) -> int:
        return 8192

    async def health_check(self) -> bool:
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": "test"}],
                max_tokens=1,
            )
            return True
        except Exception:
            return False

