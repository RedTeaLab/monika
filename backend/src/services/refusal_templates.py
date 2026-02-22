"""Refusal templates service for handling out-of-bounds user requests in CoC TRPG."""

from dataclasses import dataclass
from enum import Enum
from typing import List, Optional, Dict, Any
import re


class RefusalType(Enum):
    """Types of refusal responses."""

    OUT_OF_BOUNDS = "out_of_bounds"
    CANNOT_UNDERSTAND = "cannot_understand"
    CHECK_NOT_AVAILABLE = "check_not_available"


@dataclass
class RefusalTemplate:
    """Template for refusal responses."""

    message: str
    alternatives: List[str]
    next_suggestions: List[str]

    def to_dict(self, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Convert template to dictionary with optional context rendering."""
        msg = self.message
        if context:
            msg = msg.format(**context)

        return {
            "message": msg,
            "alternatives": self.alternatives,
            "next_suggestions": self.next_suggestions,
        }


class RefusalService:
    """Service for handling refusal templates and classification."""

    OUT_OF_BOUNDS_PATTERNS = [
        r"手机|电话|电脑|互联网|网络",
        r"202\d年|20\d{2}年|21\d{2}年",
        r"新冠|疫情|covid",
        r"飞机|高铁|地铁|汽车|火车",
        r"银行|信用卡|支付宝|微信支付",
        r"现代|当代",
        r"google|百度|维基",
        r"推特|facebook|微博|抖音",
        r"ai|人工智能|chatgpt",
        r"自动驾驶|电动车",
    ]

    CANNOT_UNDERSTAND_PATTERNS = [
        r"^[a-zA-Z]+$",
        r"^[0-9]+$",
        r"^[\s\d\W]+$",
        r"^.{0,2}$",
    ]

    CHECK_NOT_AVAILABLE_PATTERNS = [
        r"射击|射击|开枪|开火",
        r"攻击|砍杀|刺杀",
        r"武器|手枪|步枪|冲锋枪",
    ]

    TEMPLATES: Dict[RefusalType, RefusalTemplate] = {
        RefusalType.OUT_OF_BOUNDS: RefusalTemplate(
            message="我理解你想了解这个话题，但在 CoC 跑团中，我们专注于1920年代的调查员故事。",
            alternatives=[
                "在图书馆查阅关于这个主题的旧资料",
                "向 NPC 询问相关信息",
                "调查这个地点",
            ],
            next_suggestions=[
                '试试说："我在图书馆查阅关于[主题]的资料"',
                '试试说："我想向 NPC 询问这个话题"',
            ],
        ),
        RefusalType.CANNOT_UNDERSTAND: RefusalTemplate(
            message="我不太确定你想做什么。能换种说法吗？",
            alternatives=[
                "更详细地描述你的行动",
                "使用标准命令",
                "查看可用命令",
            ],
            next_suggestions=[
                '试试说："我想[动词][目标]"',
                "输入 /help 查看可用命令",
            ],
        ),
        RefusalType.CHECK_NOT_AVAILABLE: RefusalTemplate(
            message="现在不能进行检定。",
            alternatives=[
                "等待合适的时机",
                "尝试其他行动",
                "查看当前状态",
            ],
            next_suggestions=[
                "输入 /status 查看当前状态",
                "输入 /leads 查看可选行动",
            ],
        ),
    }

    def __init__(self):
        """Initialize the refusal service with compiled patterns."""
        self._out_of_bounds_re = [re.compile(p, re.IGNORECASE) for p in self.OUT_OF_BOUNDS_PATTERNS]
        self._cannot_understand_re = [re.compile(p) for p in self.CANNOT_UNDERSTAND_PATTERNS]
        self._check_not_available_re = [
            re.compile(p, re.IGNORECASE) for p in self.CHECK_NOT_AVAILABLE_PATTERNS
        ]

    def classify_input(self, user_input: str) -> RefusalType:
        """Classify the user input to determine the refusal type.

        Args:
            user_input: The raw user input string

        Returns:
            The appropriate RefusalType for the input
        """
        if not user_input or not user_input.strip():
            return RefusalType.CANNOT_UNDERSTAND

        user_input = user_input.strip()

        if self._matches_any(user_input, self._out_of_bounds_re):
            return RefusalType.OUT_OF_BOUNDS

        if self._matches_any(user_input, self._cannot_understand_re):
            return RefusalType.CANNOT_UNDERSTAND

        if self._matches_any(user_input, self._check_not_available_re):
            return RefusalType.CHECK_NOT_AVAILABLE

        return RefusalType.CANNOT_UNDERSTAND

    def _matches_any(self, text: str, patterns: List[re.Pattern]) -> bool:
        """Check if text matches any of the patterns."""
        for pattern in patterns:
            if pattern.search(text):
                return True
        return False

    def get_refusal(self, refusal_type: RefusalType) -> RefusalTemplate:
        """Get the refusal template for the given type.

        Args:
            refusal_type: The type of refusal

        Returns:
            The RefusalTemplate for the given type
        """
        return self.TEMPLATES.get(refusal_type, self.TEMPLATES[RefusalType.CANNOT_UNDERSTAND])

    def get_refusal_for_input(self, user_input: str) -> RefusalTemplate:
        """Get the appropriate refusal template for the given user input.

        Args:
            user_input: The raw user input string

        Returns:
            The appropriate RefusalTemplate
        """
        refusal_type = self.classify_input(user_input)
        return self.get_refusal(refusal_type)

    def render_refusal(
        self, user_input: str, context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Render a refusal response for the given user input.

        Args:
            user_input: The raw user input string
            context: Optional context for template rendering

        Returns:
            Dictionary containing the refusal response
        """
        template = self.get_refusal_for_input(user_input)
        refusal_type = self.classify_input(user_input)

        return {
            "type": refusal_type.value,
            "template": template.to_dict(context),
        }
