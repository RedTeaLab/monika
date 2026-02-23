"""Tests for output_formatter service (M6-026, M6-028, M6-029, M6-031, M6-032)."""

import pytest
import asyncio
from src.services.output_formatter import (
    truncate_at_sentence_boundary,
    truncate_chinese_text,
    compress_whitespace,
    OutputFormatter,
)


class TestTruncateAtSentenceBoundary:
    """Tests for sentence boundary truncation."""

    def test_truncate_short_text(self):
        """Test that short text is not truncated."""
        text = "这是一个简短的句子。"
        result = truncate_at_sentence_boundary(text, 100)
        assert result == text

    def test_truncate_at_period(self):
        """Test truncation at English period."""
        text = "First sentence. Second sentence. Third sentence."
        result = truncate_at_sentence_boundary(text, 15)
        assert result == "First sentence."
        assert len(result) <= 15

    def test_truncate_at_chinese_period(self):
        """Test truncation at Chinese period."""
        text = "第一句话。第二句话。第三句话。"
        result = truncate_at_sentence_boundary(text, 10)
        assert "。" in result
        assert len(result) <= 10

    def test_truncate_at_question_mark(self):
        """Test truncation at question mark."""
        text = "What is this? Why is it here?"
        result = truncate_at_sentence_boundary(text, 13)
        assert result == "What is this?"
        assert len(result) <= 13

    def test_truncate_at_exclamation(self):
        """Test truncation at exclamation mark."""
        text = "Be careful! Don't go there!"
        result = truncate_at_sentence_boundary(text, 12)
        assert result == "Be careful!"
        assert len(result) <= 12

    def test_truncate_no_boundary_found(self):
        """Test truncation when no boundary found within limit."""
        text = "This is a very long sentence without any punctuation"
        result = truncate_at_sentence_boundary(text, 20)
        assert len(result) <= 20


class TestTruncateChineseText:
    """Tests for Chinese text truncation."""

    def test_truncate_chinese_by_chars(self):
        """Test truncation by character count."""
        text = "这是一段很长的中文文本，需要被截断。"
        result = truncate_chinese_text(text, 10)
        assert len(result) <= 10
        assert "。" not in result or result.endswith("。")

    def test_truncate_english_by_chars(self):
        """Test English text truncation."""
        text = "This is a long English text that needs truncation."
        result = truncate_chinese_text(text, 20)
        assert len(result) <= 20


class TestOutputFormatter:
    """Tests for OutputFormatter class."""

    def test_format_brief(self):
        """Test brief output format."""
        formatter = OutputFormatter(format="brief")
        result = formatter.format(
            narrative="这是一段很长的叙述文本，包含很多细节和描述。" * 10,
            suggestions=["建议1", "建议2"],
            state_changes={"scene": "test"},
        )
        assert len(result["narrative"]) < len("这是一段很长的叙述文本，包含很多细节和描述。" * 10)

    def test_format_detailed(self):
        """Test detailed output format preserves content."""
        formatter = OutputFormatter(format="detailed")
        result = formatter.format(
            narrative="简短叙述", suggestions=["建议1", "建议2"], state_changes={"scene": "test"}
        )
        assert result["narrative"] == "简短叙述"

    def test_format_with_max_length(self):
        """Test format with max_length config."""
        formatter = OutputFormatter(max_length={"narrative": 50})
        result = formatter.format(
            narrative="这是一段非常长的叙述文本，需要被限制在指定的字数范围内。" * 5,
            suggestions=[],
            state_changes={},
        )
        assert len(result["narrative"]) <= 50

    def test_format_exclude_leads(self):
        """Test excluding leads from output."""
        formatter = OutputFormatter(include_leads=False)
        result = formatter.format(
            narrative="叙述", suggestions=["建议1", "建议2"], state_changes={}
        )
        assert "suggestions" not in result or result.get("suggestions") is None

    def test_format_exclude_state_changes(self):
        """Test excluding state changes from output."""
        formatter = OutputFormatter(include_state_changes=False)
        result = formatter.format(narrative="叙述", suggestions=[], state_changes={"scene": "test"})
        assert "state_changes" not in result or result.get("state_changes") is None


class TestTemplateEngine:
    """Tests for template variable substitution (M6-028)."""

    def test_substitute_character_name(self):
        """Test character name substitution."""
        formatter = OutputFormatter()
        template = "你好，{character_name}，欢迎来到{scene}。"
        result = formatter.substitute_variables(
            template, {"character_name": "张三", "scene": "阿卡姆镇"}
        )
        assert result == "你好，张三，欢迎来到阿卡姆镇。"

    def test_substitute_multiple_variables(self):
        """Test multiple variable substitution."""
        formatter = OutputFormatter()
        template = "{character_name}在{scene}发现了{object}。"
        result = formatter.substitute_variables(
            template, {"character_name": "调查员", "scene": "沼泽地", "object": "古老日记"}
        )
        assert result == "调查员在沼泽地发现了古老日记。"

    def test_substitute_missing_variable(self):
        """Test missing variable leaves placeholder."""
        formatter = OutputFormatter()
        template = "你好，{character_name}，现在是{time}。"
        result = formatter.substitute_variables(template, {"character_name": "张三"})
        assert result == "你好，张三，现在是{time}。"

    def test_substitute_empty_dict(self):
        """Test empty variable dict."""
        formatter = OutputFormatter()
        template = "没有变量替换。"
        result = formatter.substitute_variables(template, {})
        assert result == "没有变量替换。"


class TestConditionalContent:
    """Tests for conditional content (M6-028)."""

    def test_conditional_if_true(self):
        """Test if block renders when condition is true."""
        formatter = OutputFormatter()
        template = "开始{if scene == 'combat'} 战斗模式！{endif}继续"
        result = formatter.process_conditionals(template, {"scene": "combat"})
        assert "战斗模式！" in result

    def test_conditional_if_false(self):
        """Test if block is removed when condition is false."""
        formatter = OutputFormatter()
        template = "开始{if scene == 'combat'} 战斗模式！{endif}继续"
        result = formatter.process_conditionals(template, {"scene": "explore"})
        assert "战斗模式！" not in result
        assert "开始继续" in result

    def test_conditional_nested_variables(self):
        """Test conditional with variable comparison."""
        formatter = OutputFormatter()
        template = "{if urgency == 'high'}快跑！{endif}{if urgency == 'low'}慢慢探索。{endif}"
        result = formatter.process_conditionals(template, {"urgency": "high"})
        assert "快跑！" in result
        assert "慢慢探索。" not in result

    def test_conditional_multiple_blocks(self):
        """Test multiple conditional blocks."""
        formatter = OutputFormatter()
        template = "{if tone == 'horror'}恐怖氛围{endif}{if tone == 'action'}动作场景{endif}"
        result = formatter.process_conditionals(template, {"tone": "horror"})
        assert "恐怖氛围" in result
        assert "动作场景" not in result


class TestAsyncChunkedGeneration:
    """Tests for async chunked generation (M6-029)."""

    @pytest.mark.asyncio
    async def test_async_chunk_text(self):
        """Test async chunk text generator."""
        formatter = OutputFormatter()
        text = "这是一个测试文本。" * 50
        chunks = []
        async for chunk in formatter.async_chunk_text(text, chunk_size=50):
            chunks.append(chunk)
        assert len(chunks) > 1
        full_text = "".join(chunks)
        assert full_text == text

    @pytest.mark.asyncio
    async def test_async_chunk_small_text(self):
        """Test async chunk with text smaller than chunk size."""
        formatter = OutputFormatter()
        text = "短文本"
        chunks = []
        async for chunk in formatter.async_chunk_text(text, chunk_size=100):
            chunks.append(chunk)
        assert len(chunks) == 1
        assert chunks[0] == "短文本"

    @pytest.mark.asyncio
    async def test_async_chunk_empty_text(self):
        """Test async chunk with empty text."""
        formatter = OutputFormatter()
        chunks = []
        async for chunk in formatter.async_chunk_text("", chunk_size=50):
            chunks.append(chunk)
        assert len(chunks) == 0


class TestCompression:
    """Tests for output compression (M6-031)."""

    def test_compress_whitespace(self):
        """Test whitespace compression."""
        text = "这    是    一个   测试"
        result = compress_whitespace(text)
        assert "    " not in result
        assert result == "这 是 一个 测试"

    def test_compress_multiple_newlines(self):
        """Test multiple newline compression."""
        text = "第一行\n\n\n第二行\n\n第三行"
        result = compress_whitespace(text)
        assert result.count("\n") <= 2

    def test_compress_extra_spaces(self):
        """Test extra space removal."""
        text = "内容    很多   空格"
        result = compress_whitespace(text)
        assert "   " not in result

    def test_strip_leading_trailing(self):
        """Test stripping leading/trailing whitespace."""
        text = "   文字内容   "
        result = compress_whitespace(text)
        assert result == "文字内容"


class TestMarkdownFormatting:
    """Tests for markdown formatting (M6-032)."""

    def test_add_headers(self):
        """Test adding headers to narrative."""
        formatter = OutputFormatter()
        text = "这是场景描述"
        result = formatter.format_markdown(text, add_headers=True)
        assert result.startswith("# ")

    def test_format_list_items(self):
        """Test formatting list items."""
        formatter = OutputFormatter()
        items = ["调查线索", "询问证人", "检查现场"]
        result = formatter.format_as_list(items)
        assert "- 调查线索" in result
        assert "- 询问证人" in result
        assert "- 检查现场" in result

    def test_format_with_emphasis(self):
        """Test emphasis formatting."""
        formatter = OutputFormatter()
        text = "你发现了重要线索"
        result = formatter.format_markdown(text, emphasize_words=["重要线索"])
        assert "**" in result or "《" in result

    def test_preserve_paragraphs(self):
        """Test paragraph preservation."""
        formatter = OutputFormatter()
        text = "第一段内容\n\n第二段内容"
        result = formatter.format_markdown(text)
        assert "第一段内容" in result
        assert "第二段内容" in result
