"""Tests for output_formatter service (M6-026)."""

import pytest
from src.services.output_formatter import (
    truncate_at_sentence_boundary,
    truncate_chinese_text,
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
