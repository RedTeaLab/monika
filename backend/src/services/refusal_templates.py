"""Refusal templates service for handling out-of-bounds user requests in CoC TRPG."""

from dataclasses import dataclass
from enum import Enum
from typing import List, Optional, Dict, Any
import re


class RefusalType(Enum):
    """Types of refusal responses."""

    VALID = "valid"
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
        r"^[\U00010000-\U0010ffff]+$",
        r"^[😀-🿿]+$",
        r"^[!?@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/]+$",
    ]

    CHECK_NOT_AVAILABLE_PATTERNS = [
        r"射击|开枪|开火",
        r"攻击|砍杀|刺杀",
        r"武器|手枪|步枪|冲锋枪",
        r"逃跑|逃走|逃离",
        r"闪避|躲避|回避",
        r"枪战|搏斗|对决",
    ]

    TEMPLATES: Dict[RefusalType, Dict[str, RefusalTemplate]] = {
        RefusalType.VALID: {
            "zh": RefusalTemplate(
                message="",
                alternatives=[],
                next_suggestions=[],
            ),
            "en": RefusalTemplate(
                message="",
                alternatives=[],
                next_suggestions=[],
            ),
        },
        RefusalType.OUT_OF_BOUNDS: {
            "zh": RefusalTemplate(
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
            "en": RefusalTemplate(
                message="I understand you want to learn about this topic, but in CoC TRPG, we focus on 1920s investigator stories.",
                alternatives=[
                    "Research this topic at the library",
                    "Ask NPCs for information",
                    "Investigate the location",
                ],
                next_suggestions=[
                    'Try: "I research [topic] at the library"',
                    'Try: "I want to ask NPCs about this"',
                ],
            ),
        },
        RefusalType.CANNOT_UNDERSTAND: {
            "zh": RefusalTemplate(
                message="我不太确定你想做什么。能换种说法吗？比如更详细地描述你的行动或目标。",
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
            "en": RefusalTemplate(
                message="I'm not sure what you want to do. Could you rephrase? Try describing your action or target more clearly.",
                alternatives=[
                    "Describe your action in more detail",
                    "Use standard commands",
                    "View available commands",
                ],
                next_suggestions=[
                    'Try: "I want to [verb] [target]"',
                    "Type /help to see available commands",
                ],
            ),
        },
        RefusalType.CHECK_NOT_AVAILABLE: {
            "zh": RefusalTemplate(
                message="现在不能进行这个动作。",
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
            "en": RefusalTemplate(
                message="You can't perform this action right now.",
                alternatives=[
                    "Wait for the right moment",
                    "Try another action",
                    "Check current status",
                ],
                next_suggestions=[
                    "Type /status to check current status",
                    "Type /leads to see available actions",
                ],
            ),
        },
    }

    CONTEXT_AWARE_MESSAGES: Dict[str, Dict[str, Dict[str, str]]] = {
        "zh": {
            "combat_active": {
                "check_not_available": "现在正在战斗中，请使用 /combat action 来进行战斗行动。",
                "out_of_bounds": "战斗中无法讨论这个话题，专注于生存！",
            },
            "low_hp": {
                "check_not_available": "你受伤严重，需要先处理伤口才能继续行动。",
            },
            "low_san": {
                "check_not_available": "你正处于恐惧中，难以集中精神进行这个动作。",
            },
        },
        "en": {
            "combat_active": {
                "check_not_available": "You are in combat. Use /combat action to take combat actions.",
                "out_of_bounds": "Can't discuss this during combat. Focus on survival!",
            },
            "low_hp": {
                "check_not_available": "You are badly wounded. Tend to your injuries first.",
            },
            "low_san": {
                "check_not_available": "You are terrified. Hard to concentrate on this action.",
            },
        },
    }

    CLARIFICATION_TEMPLATES: Dict[str, List[str]] = {
        "zh": [
            "你具体想做什么？",
            "你能详细说明一下吗？",
            "你的目标是什么？",
            "请告诉我你想采取什么行动？",
        ],
        "en": [
            "What exactly do you want to do?",
            "Could you elaborate?",
            "What is your target?",
            "What action do you want to take?",
        ],
    }

    GUIDED_STEPS: Dict[str, Dict[str, List[str]]] = {
        "zh": {
            "cannot_understand": [
                "描述你想做什么（例如：调查、交谈、搜索）",
                "明确你的目标（例如：门、尸体、NPC名字）",
                "如果不确定，可以输入 /help 查看可用命令",
            ],
            "out_of_bounds": [
                "尝试用1920年代的方式表达",
                "寻找相关的旧书籍或报纸",
                "向当时的人询问",
            ],
            "check_not_available": [
                "检查当前状态（/status）",
                "查看可用的行动（/leads）",
                "等待合适的时机",
            ],
        },
        "en": {
            "cannot_understand": [
                "Describe what you want to do (e.g., investigate, talk, search)",
                "Specify your target (e.g., door, body, NPC name)",
                "If unsure, type /help for available commands",
            ],
            "out_of_bounds": [
                "Try expressing it in 1920s terms",
                "Look for old books or newspapers",
                "Ask people from that era",
            ],
            "check_not_available": [
                "Check current status (/status)",
                "View available actions (/leads)",
                "Wait for the right moment",
            ],
        },
    }

    FALLBACK_SUGGESTIONS: Dict[str, List[str]] = {
        "zh": [
            "输入 /leads 查看可选行动",
            "输入 /help 查看所有命令",
            "输入 /status 查看当前状态",
        ],
        "en": [
            "Type /leads to see available actions",
            "Type /help to see all commands",
            "Type /status to check current status",
        ],
    }

    SKILL_SUGGESTIONS: Dict[str, Dict[str, str]] = {
        "zh": {
            "侦查": "尝试搜索或调查周围环境",
            "图书馆": "去图书馆查阅资料",
            "说服": "尝试与 NPC 交谈",
            "潜行": "尝试悄悄接近目标",
            "急救": "尝试治疗伤员",
            "估价": "尝试评估物品价值",
            "追踪": "尝试追踪目标",
            "攀爬": "尝试攀爬障碍物",
            "格斗": "尝试徒手战斗",
            "射击": "尝试使用武器战斗",
        },
        "en": {
            "spot": "Try searching or investigating the area",
            "library": "Go to the library to research",
            "persuade": "Try talking to NPCs",
            "sneak": "Try approaching quietly",
            "first_aid": "Try treating the wounded",
            "appraise": "Try appraising the item",
            "track": "Try tracking the target",
            "climb": "Try climbing obstacles",
            "fight": "Try fighting hand-to-hand",
            "firearms": "Try using weapons in combat",
        },
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

        return RefusalType.VALID

    def _matches_any(self, text: str, patterns: List[re.Pattern]) -> bool:
        """Check if text matches any of the patterns."""
        for pattern in patterns:
            if pattern.search(text):
                return True
        return False

    def _detect_locale(self, user_input: str) -> str:
        """Auto-detect locale from user input."""
        if re.search(r"[\u4e00-\u9fff]", user_input):
            return "zh"
        return "en"

    def get_refusal(self, refusal_type: RefusalType, locale: str = "zh") -> RefusalTemplate:
        """Get the refusal template for the given type.

        Args:
            refusal_type: The type of refusal
            locale: Language locale (zh/en)

        Returns:
            The RefusalTemplate for the given type
        """
        templates = self.TEMPLATES.get(refusal_type, self.TEMPLATES[RefusalType.CANNOT_UNDERSTAND])
        return templates.get(locale) or templates.get("zh")

    def get_refusal_for_input(
        self, user_input: str, locale: Optional[str] = None
    ) -> RefusalTemplate:
        """Get the appropriate refusal template for the given user input.

        Args:
            user_input: The raw user input string
            locale: Optional locale override

        Returns:
            The appropriate RefusalTemplate
        """
        refusal_type = self.classify_input(user_input)
        if locale is None:
            locale = self._detect_locale(user_input)
        return self.get_refusal(refusal_type, locale)

    def get_context_aware_refusal(
        self, refusal_type: RefusalType, context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Get context-aware refusal with customized messages.

        Args:
            refusal_type: The type of refusal
            containing scene, character state, context: Context etc.

        Returns:
            Dictionary with context-aware message and suggestions
        """
        locale = context.get("locale", "zh")
        template = self.get_refusal(refusal_type, locale)

        message = template.message
        alternatives = list(template.alternatives)
        suggestions = list(template.next_suggestions)

        if context.get("combat_active"):
            combat_msgs = self.CONTEXT_AWARE_MESSAGES.get(locale, {}).get("combat_active", {})
            if refusal_type.value in combat_msgs:
                message = combat_msgs[refusal_type.value]

        if context.get("character_hp", 100) <= 0:
            low_hp_msgs = self.CONTEXT_AWARE_MESSAGES.get(locale, {}).get("low_hp", {})
            if refusal_type.value in low_hp_msgs:
                message = low_hp_msgs[refusal_type.value]

        if context.get("character_san", 50) <= 5:
            low_san_msgs = self.CONTEXT_AWARE_MESSAGES.get(locale, {}).get("low_san", {})
            if refusal_type.value in low_san_msgs:
                message = low_san_msgs[refusal_type.value]

        leads = context.get("leads", [])
        if leads:
            lead_suggestions = self.generate_suggestions_from_leads(leads, locale)
            suggestions.extend(lead_suggestions)

        skills = context.get("skills", {})
        if skills and not leads:
            skill_suggestions = self.generate_suggestions_from_skills(skills, locale)
            suggestions.extend(skill_suggestions)

        return {
            "message": message,
            "alternatives": alternatives,
            "next_suggestions": suggestions[:5],
        }

    def generate_suggestions_from_leads(
        self, leads: List[Dict[str, Any]], locale: str = "zh"
    ) -> List[str]:
        """Generate suggestions from available leads.

        Args:
            leads: List of lead dictionaries
            locale: Language locale

        Returns:
            List of suggestion strings
        """
        suggestions = []
        lead_verbs = {
            "zh": {
                "investigate": "调查",
                "interact": "与",
                "travel": "前往",
                "combat": "战斗",
                "rest": "休息",
            },
            "en": {
                "investigate": "Investigate",
                "interact": "Talk to",
                "travel": "Go to",
                "combat": "Fight",
                "rest": "Rest",
            },
        }

        for lead in leads[:3]:
            lead_type = lead.get("type", "investigate")
            title = lead.get("title", "")
            verb = lead_verbs.get(locale, {}).get(lead_type, "")
            if locale == "zh":
                suggestions.append(f"{verb}{title}")
            else:
                suggestions.append(f"{verb} {title}")

        return suggestions

    def generate_suggestions_from_skills(
        self, skills: Dict[str, int], locale: str = "zh"
    ) -> List[str]:
        """Generate suggestions based on character skills.

        Args:
            skills: Dictionary of skill name to value
            locale: Language locale

        Returns:
            List of suggestion strings
        """
        suggestions = []
        skill_map = self.SKILL_SUGGESTIONS.get(locale, self.SKILL_SUGGESTIONS["zh"])

        for skill, value in skills.items():
            if value >= 50 and skill in skill_map:
                suggestions.append(skill_map[skill])

        return suggestions[:3]

    def get_fallback_suggestions(self, locale: str = "zh") -> List[str]:
        """Get fallback suggestions when no leads or skills available.

        Args:
            locale: Language locale

        Returns:
            List of suggestion strings
        """
        return self.FALLBACK_SUGGESTIONS.get(locale, self.FALLBACK_SUGGESTIONS["zh"])

    def generate_clarification(self, user_input: str, context: Dict[str, Any]) -> str:
        """Generate a clarification question for ambiguous input.

        Args:
            user_input: The ambiguous user input
            context: Context information

        Returns:
            Clarification question string
        """
        locale = context.get("locale", "zh")
        templates = self.CLARIFICATION_TEMPLATES.get(locale, self.CLARIFICATION_TEMPLATES["zh"])

        if len(user_input.strip()) < 3:
            return templates[0]

        return templates[len(user_input) % len(templates)]

    def generate_guided_response(
        self, refusal_type: RefusalType, locale: str = "zh"
    ) -> Dict[str, Any]:
        """Generate a guided response with step-by-step instructions.

        Args:
            refusal_type: The type of refusal
            locale: Language locale

        Returns:
            Dictionary with message and step-by-step guide
        """
        template = self.get_refusal(refusal_type, locale)
        steps_data = self.GUIDED_STEPS.get(locale) or self.GUIDED_STEPS["zh"]
        steps = steps_data.get(refusal_type.value, [])

        formatted_steps = [{"number": i + 1, "description": step} for i, step in enumerate(steps)]

        return {
            "message": template.message,
            "steps": formatted_steps,
            "alternatives": template.alternatives,
            "suggestions": template.next_suggestions,
        }

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
        if context is None:
            context = {}

        locale = context.get("locale") or self._detect_locale(user_input)
        context["locale"] = locale

        refusal_type = self.classify_input(user_input)

        if refusal_type == RefusalType.VALID:
            return {
                "type": refusal_type.value,
                "template": {
                    "message": "",
                    "alternatives": [],
                    "next_suggestions": [],
                },
            }

        if context and (
            context.get("current_scene")
            or context.get("combat_active")
            or context.get("leads")
            or context.get("skills")
        ):
            context_aware = self.get_context_aware_refusal(refusal_type, context)
            return {
                "type": refusal_type.value,
                "template": context_aware,
            }

        template = self.get_refusal(refusal_type, locale)

        return {
            "type": refusal_type.value,
            "template": template.to_dict(context),
        }
