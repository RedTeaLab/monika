"""Output formatter service (M6-026, M6-028, M6-029, M6-031, M6-032)."""

import asyncio
import re
from typing import Optional, AsyncIterator

from src.schemas.output_config import OutputFormat, OutputConfig


SENTENCE_ENDINGS = [".", "。", "！", "？", "!", "?"]


def truncate_at_sentence_boundary(text: str, max_length: int) -> str:
    """Truncate text at the nearest sentence boundary.

    Args:
        text: Text to truncate
        max_length: Maximum length

    Returns:
        Truncated text
    """
    if len(text) <= max_length:
        return text

    search_text = text[: max_length + 1]

    for ending in SENTENCE_ENDINGS:
        pos = search_text.find(ending)
        if pos >= 0:
            return search_text[: pos + 1]

    return text[:max_length]


def truncate_chinese_text(text: str, max_length: int) -> str:
    """Truncate Chinese text properly.

    Args:
        text: Text to truncate
        max_length: Maximum character length

    Returns:
        Truncated text
    """
    if len(text) <= max_length:
        return text

    search_text = text[: max_length + 1]

    for ending in SENTENCE_ENDINGS:
        pos = search_text.find(ending)
        if pos >= 0:
            return search_text[: pos + 1]

    return text[:max_length]


def compress_whitespace(text: str) -> str:
    """Remove redundant whitespace.

    Args:
        text: Text to compress

    Returns:
        Compressed text
    """
    text = re.sub(r"\n+", "\n", text)
    text = re.sub(r" +", " ", text)
    text = re.sub(r"\n ", "\n", text)
    return text.strip()


class OutputFormatter:
    """Formats LLM output based on configuration."""

    FORMAT_LIMITS = {
        OutputFormat.BRIEF: {
            "narrative": 200,
            "description": 100,
        },
        OutputFormat.NORMAL: {
            "narrative": 500,
            "description": 200,
        },
        OutputFormat.DETAILED: None,
    }

    def __init__(
        self,
        format: str = "normal",
        max_length: Optional[dict] = None,
        include_state_changes: bool = True,
        include_leads: bool = True,
        include_hints: bool = True,
    ):
        self.config = OutputConfig(
            format=OutputFormat(format),
            max_length=max_length,
            include_state_changes=include_state_changes,
            include_leads=include_leads,
            include_hints=include_hints,
        )

    def format(
        self,
        narrative: str,
        suggestions: Optional[list] = None,
        state_changes: Optional[dict] = None,
    ) -> dict:
        """Format output based on configuration.

        Args:
            narrative: Main narrative text
            suggestions: Player suggestions/leads
            state_changes: State changes to include

        Returns:
            Formatted output dict
        """
        result = {}

        narrative = compress_whitespace(narrative)

        max_len = self._get_max_length("narrative")
        if max_len:
            narrative = truncate_chinese_text(narrative, max_len)

        result["narrative"] = narrative

        if self.config.include_state_changes and state_changes:
            result["state_changes"] = state_changes

        if self.config.include_leads and suggestions:
            result["suggestions"] = (
                suggestions[:3] if self.config.format == OutputFormat.BRIEF else suggestions
            )

        return result

    def _get_max_length(self, field: str) -> Optional[int]:
        """Get max length for a field.

        Args:
            field: Field name

        Returns:
            Max length or None
        """
        if self.config.max_length and field in self.config.max_length:
            return self.config.max_length[field]

        limits = self.FORMAT_LIMITS.get(self.config.format)
        if limits and field in limits:
            return limits[field]

        return None

    def chunk_text(self, text: str, chunk_size: int = 200) -> list[str]:
        """Split text into chunks.

        Args:
            text: Text to chunk
            chunk_size: Size of each chunk

        Returns:
            List of text chunks
        """
        if len(text) <= chunk_size:
            return [text]

        chunks = []
        current = ""

        for char in text:
            current += char
            if len(current) >= chunk_size:
                for ending in SENTENCE_ENDINGS:
                    if current.rfind(ending) > len(current) - 20:
                        pos = current.rfind(ending)
                        chunks.append(current[: pos + 1])
                        current = current[pos + 1 :]
                        break
                else:
                    chunks.append(current)
                    current = ""

        if current:
            chunks.append(current)

        return chunks

    def substitute_variables(self, template: str, variables: dict) -> str:
        """Substitute template variables with values.

        Args:
            template: Template string with {variable} placeholders
            variables: Dict of variable name -> value

        Returns:
            Template with variables substituted
        """
        result = template
        for key, value in variables.items():
            result = result.replace(f"{{{key}}}", str(value))
        return result

    def process_conditionals(self, template: str, context: dict) -> str:
        """Process conditional content in template.

        Args:
            template: Template with {if condition}...{endif} blocks
            context: Context dict for condition evaluation

        Returns:
            Template with conditionals processed
        """
        pattern = r"\{if\s+([^}]+)\}(.*?)\{endif\}"

        def replace_conditional(match):
            condition = match.group(1).strip()
            content = match.group(2)

            for key, value in context.items():
                condition = condition.replace(key, f'"{value}"')

            try:
                if eval(condition, {"__builtins__": {}}, {}):
                    return content
            except Exception:
                pass
            return ""

        result = re.sub(pattern, replace_conditional, template, flags=re.DOTALL)
        result = re.sub(r"\s+", " ", result)
        return result.strip()

    async def async_chunk_text(self, text: str, chunk_size: int = 200) -> AsyncIterator[str]:
        """Async generator that yields text chunks progressively.

        Args:
            text: Text to chunk
            chunk_size: Size of each chunk

        Yields:
            Text chunks
        """
        if not text:
            return

        if len(text) <= chunk_size:
            yield text
            return

        chunks = self.chunk_text(text, chunk_size)
        for chunk in chunks:
            yield chunk
            await asyncio.sleep(0)

    def format_markdown(
        self,
        text: str,
        add_headers: bool = False,
        emphasize_words: Optional[list] = None,
    ) -> str:
        """Format text with markdown.

        Args:
            text: Text to format
            add_headers: Whether to add header to first line
            emphasize_words: Words to emphasize

        Returns:
            Markdown formatted text
        """
        result = text

        if add_headers and result:
            lines = result.split("\n")
            if lines:
                lines[0] = "# " + lines[0]
            result = "\n".join(lines)

        if emphasize_words:
            for word in emphasize_words:
                result = result.replace(word, f"**{word}**")

        return result

    def format_as_list(self, items: list) -> str:
        """Format list items as markdown list.

        Args:
            items: List of items

        Returns:
            Markdown formatted list
        """
        if not items:
            return ""
        return "\n".join(f"- {item}" for item in items)
