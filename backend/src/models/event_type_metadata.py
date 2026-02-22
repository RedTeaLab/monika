"""EventType database model for M3 Memory Web event type categorization.

The EventType table stores metadata about event types, providing:
- Event type definitions and documentation
- UI display hints (icons, colors)
- Category mappings
- Validation schemas
"""
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import Column, String, Integer, Text, Boolean, DateTime, JSON
from sqlalchemy.orm import relationship

from src.core.database import Base


class EventCategory(str, Enum):
    """High-level event categories for grouping."""

    INTERACTION = "interaction"
    CHECK = "check"
    COMBAT = "combat"
    CHASE = "chase"
    SANITY = "sanity"
    STATE = "state"
    SYSTEM = "system"


class EventTypeMetadata(Base):
    """Event type metadata for M3 Memory Web.

    This table stores definitions and metadata for all event types,
    enabling dynamic event type registration and UI customization.
    """

    __tablename__ = "event_types"

    # Primary key - using integer ID for efficient lookups
    id = Column(Integer, primary_key=True, autoincrement=True)

    # Unique type identifier (e.g., "roll", "damage", "message")
    # This matches the EventType enum values in the Event model
    type_key = Column(String(50), unique=True, nullable=False, index=True)

    # Category this type belongs to
    category = Column(String(20), nullable=False, index=True)

    # Human-readable display names
    name = Column(String(100), nullable=False)
    name_en = Column(String(100), nullable=False)

    # Description of what this event type represents
    description = Column(Text, nullable=True)

    # Detailed documentation (Markdown format)
    documentation = Column(Text, nullable=True)

    # UI display hints
    icon_name = Column(String(50), nullable=True)  # Icon identifier for UI
    color_hex = Column(String(7), nullable=True)  # Hex color code (e.g., "#FF5733")

    # Event type priority for sorting/highlighting (0-100, higher = more important)
    priority = Column(Integer, default=50, nullable=False)

    # Whether this event type should be hidden from UI
    is_hidden = Column(Boolean, default=False, nullable=False)

    # Whether this event type requires special handling
    is_system_only = Column(Boolean, default=False, nullable=False)

    # JSON schema for validating event payload
    payload_schema = Column(JSON, nullable=True)

    # Default tags to apply to events of this type
    default_tags = Column(JSON, nullable=True, default=list)

    # Example event payload (for documentation)
    example_payload = Column(JSON, nullable=True)

    # Sub-types supported by this event type (array of strings)
    # e.g., ["chat", "description", "system"] for "message" type
    sub_types = Column(JSON, nullable=True, default=list)

    # Metadata fields
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<EventType {self.type_key} ({self.category})>"

    def to_dict(self) -> dict:
        """Convert event type to dictionary for API responses."""
        return {
            "id": self.id,
            "type_key": self.type_key,
            "category": self.category,
            "name": self.name,
            "name_en": self.name_en,
            "description": self.description,
            "documentation": self.documentation,
            "icon_name": self.icon_name,
            "color_hex": self.color_hex,
            "priority": self.priority,
            "is_hidden": self.is_hidden,
            "is_system_only": self.is_system_only,
            "payload_schema": self.payload_schema,
            "default_tags": self.default_tags or [],
            "example_payload": self.example_payload,
            "sub_types": self.sub_types or [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    @property
    def display_name(self) -> str:
        """Return the localized display name (uses Chinese by default)."""
        return self.name

    @property
    def display_name_en(self) -> str:
        """Return the English display name."""
        return self.name_en


# Default event type definitions for data seeding
DEFAULT_EVENT_TYPES = [
    # Interaction events
    {
        "type_key": "message",
        "category": EventCategory.INTERACTION,
        "name": "消息",
        "name_en": "Message",
        "description": "玩家或KP发送的消息",
        "icon_name": "message",
        "color_hex": "#3B82F6",
        "priority": 30,
        "sub_types": ["chat", "description", "system"],
        "example_payload": {"text": "玩家输入的内容", "sender": "player_name"},
    },
    {
        "type_key": "scene_change",
        "category": EventCategory.INTERACTION,
        "name": "场景切换",
        "name_en": "Scene Change",
        "description": "游戏场景发生变化",
        "icon_name": "location",
        "color_hex": "#8B5CF6",
        "priority": 60,
        "example_payload": {"from_scene": "旧场景", "to_scene": "新场景", "reason": "剧情推进"},
    },
    # Check events
    {
        "type_key": "roll",
        "category": EventCategory.CHECK,
        "name": "检定",
        "name_en": "Roll",
        "description": "技能或属性检定",
        "icon_name": "dice",
        "color_hex": "#F59E0B",
        "priority": 70,
        "default_tags": ["check", "dice"],
        "example_payload": {
            "skill": "spot_hidden",
            "target": 50,
            "roll": 25,
            "success_level": "regular_success",
            "difficulty": "regular",
        },
    },
    {
        "type_key": "push_roll",
        "category": EventCategory.CHECK,
        "name": "推骰",
        "name_en": "Push Roll",
        "description": "失败的检定进行推骰",
        "icon_name": "refresh",
        "color_hex": "#F59E0B",
        "priority": 65,
        "default_tags": ["check", "dice", "push"],
        "example_payload": {
            "skill": "spot_hidden",
            "target": 50,
            "roll": 78,
            "original_roll": 65,
            "consequence": "time_lost",
        },
    },
    {
        "type_key": "luck_spend",
        "category": EventCategory.CHECK,
        "name": "花费幸运",
        "name_en": "Spend Luck",
        "description": "花费幸运点改善检定结果",
        "icon_name": "star",
        "color_hex": "#EAB308",
        "priority": 60,
        "default_tags": ["check", "luck"],
        "example_payload": {"amount": 5, "original_roll": 55, "new_roll": 30, "reason": "improve_roll"},
    },
    # Combat events
    {
        "type_key": "combat_start",
        "category": EventCategory.COMBAT,
        "name": "战斗开始",
        "name_en": "Combat Start",
        "description": "进入战斗状态",
        "icon_name": "swords",
        "color_hex": "#EF4444",
        "priority": 80,
        "default_tags": ["combat"],
        "example_payload": {"combat_id": "uuid", "participants": ["char1", "char2"]},
    },
    {
        "type_key": "combat_round",
        "category": EventCategory.COMBAT,
        "name": "战斗回合",
        "name_en": "Combat Round",
        "description": "战斗回合进行",
        "icon_name": "repeat",
        "color_hex": "#EF4444",
        "priority": 40,
        "default_tags": ["combat"],
        "example_payload": {"round": 3, "actions": ["action1", "action2"]},
    },
    {
        "type_key": "damage",
        "category": EventCategory.COMBAT,
        "name": "伤害",
        "name_en": "Damage",
        "description": "角色受到伤害",
        "icon_name": "heart",
        "color_hex": "#DC2626",
        "priority": 75,
        "default_tags": ["combat", "hp"],
        "example_payload": {"amount": 5, "source": "cultist_knife", "current_hp": 7, "max_hp": 12},
    },
    {
        "type_key": "heal",
        "category": EventCategory.COMBAT,
        "name": "治疗",
        "name_en": "Heal",
        "description": "角色恢复生命值",
        "icon_name": "first-aid",
        "color_hex": "#10B981",
        "priority": 50,
        "default_tags": ["combat", "hp"],
        "example_payload": {"amount": 3, "source": "first_aid", "current_hp": 10, "max_hp": 12},
    },
    {
        "type_key": "combat_end",
        "category": EventCategory.COMBAT,
        "name": "战斗结束",
        "name_en": "Combat End",
        "description": "战斗状态结束",
        "icon_name": "flag",
        "color_hex": "#EF4444",
        "priority": 70,
        "default_tags": ["combat"],
        "example_payload": {"combat_id": "uuid", "result": "victory", "duration_rounds": 5},
    },
    # Chase events
    {
        "type_key": "chase_start",
        "category": EventCategory.CHASE,
        "name": "追逐开始",
        "name_en": "Chase Start",
        "description": "进入追逐序列",
        "icon_name": "run",
        "color_hex": "#F97316",
        "priority": 75,
        "default_tags": ["chase"],
        "example_payload": {"chase_id": "uuid", "participants": ["pursuer", "quarry"], "location": "street"},
    },
    {
        "type_key": "chase_round",
        "category": EventCategory.CHASE,
        "name": "追逐回合",
        "name_en": "Chase Round",
        "description": "追逐回合进行",
        "icon_name": "zap",
        "color_hex": "#F97316",
        "priority": 45,
        "default_tags": ["chase"],
        "example_payload": {"round": 2, "obstacles": ["obstacle1"], "positions": {"pursuer": 3, "quarry": 2}},
    },
    {
        "type_key": "chase_obstacle",
        "category": EventCategory.CHASE,
        "name": "追逐障碍",
        "name_en": "Chase Obstacle",
        "description": "追逐中遇到障碍",
        "icon_name": "alert-triangle",
        "color_hex": "#F97316",
        "priority": 55,
        "default_tags": ["chase", "obstacle"],
        "example_payload": {"obstacle_type": "crowd", "difficulty": 30, "skill_required": "dodge"},
    },
    {
        "type_key": "chase_end",
        "category": EventCategory.CHASE,
        "name": "追逐结束",
        "name_en": "Chase End",
        "description": "追逐序列结束",
        "icon_name": "stop-circle",
        "color_hex": "#F97316",
        "priority": 70,
        "default_tags": ["chase"],
        "example_payload": {"chase_id": "uuid", "result": "caught", "duration_rounds": 4},
    },
    # Sanity events
    {
        "type_key": "san_check",
        "category": EventCategory.SANITY,
        "name": "SAN检定",
        "name_en": "SAN Check",
        "description": "理智值检定",
        "icon_name": "brain",
        "color_hex": "#A855F7",
        "priority": 80,
        "default_tags": ["sanity", "check"],
        "example_payload": {"reason": "目睹恐怖景象", "difficulty": 10, "roll": 45, "loss": 0},
    },
    {
        "type_key": "san_loss",
        "category": EventCategory.SANITY,
        "name": "SAN损失",
        "name_en": "SAN Loss",
        "description": "理智值损失",
        "icon_name": "trending-down",
        "color_hex": "#DC2626",
        "priority": 85,
        "default_tags": ["sanity", "loss"],
        "example_payload": {"amount": 10, "current_san": 50, "max_san": 60, "reason": "遭遇神话生物"},
    },
    {
        "type_key": "insanity_gain",
        "category": EventCategory.SANITY,
        "name": "获得疯狂",
        "name_en": "Insanity Gain",
        "description": "角色获得疯狂症状",
        "icon_name": "alert-circle",
        "color_hex": "#7C3AED",
        "priority": 90,
        "default_tags": ["sanity", "insanity"],
        "example_payload": {"insanity_type": "phobia", "description": "对黑暗的恐惧", "duration": "permanent"},
    },
    # State change events
    {
        "type_key": "hp_change",
        "category": EventCategory.STATE,
        "name": "HP变化",
        "name_en": "HP Change",
        "description": "生命值变化",
        "icon_name": "heart",
        "color_hex": "#EF4444",
        "priority": 50,
        "is_hidden": True,  # Usually use damage/heal instead
        "default_tags": ["state", "hp"],
        "example_payload": {"delta": -2, "old_value": 12, "new_value": 10, "reason": "poison"},
    },
    {
        "type_key": "mp_change",
        "category": EventCategory.STATE,
        "name": "MP变化",
        "name_en": "MP Change",
        "description": "魔法值变化",
        "icon_name": "zap",
        "color_hex": "#3B82F6",
        "priority": 40,
        "default_tags": ["state", "mp"],
        "example_payload": {"delta": -3, "old_value": 15, "new_value": 12, "reason": "cast_spell"},
    },
    {
        "type_key": "san_change",
        "category": EventCategory.STATE,
        "name": "SAN变化",
        "name_en": "SAN Change",
        "description": "理智值变化",
        "icon_name": "brain",
        "color_hex": "#A855F7",
        "priority": 50,
        "is_hidden": True,  # Usually use san_loss instead
        "default_tags": ["state", "sanity"],
        "example_payload": {"delta": -5, "old_value": 60, "new_value": 55, "reason": "recovery"},
    },
    {
        "type_key": "luck_change",
        "category": EventCategory.STATE,
        "name": "幸运变化",
        "name_en": "Luck Change",
        "description": "幸运值变化",
        "icon_name": "star",
        "color_hex": "#EAB308",
        "priority": 45,
        "default_tags": ["state", "luck"],
        "example_payload": {"delta": -1, "old_value": 50, "new_value": 49, "reason": "used_luck"},
    },
    # System events
    {
        "type_key": "session_start",
        "category": EventCategory.SYSTEM,
        "name": "会话开始",
        "name_en": "Session Start",
        "description": "游戏会话开始",
        "icon_name": "play",
        "color_hex": "#10B981",
        "priority": 60,
        "is_system_only": True,
        "default_tags": ["system", "session"],
        "example_payload": {"session_id": "uuid", "scenario": "The Haunting"},
    },
    {
        "type_key": "session_end",
        "category": EventCategory.SYSTEM,
        "name": "会话结束",
        "name_en": "Session End",
        "description": "游戏会话结束",
        "icon_name": "stop",
        "color_hex": "#6B7280",
        "priority": 60,
        "is_system_only": True,
        "default_tags": ["system", "session"],
        "example_payload": {"session_id": "uuid", "duration_minutes": 120, "total_events": 45},
    },
    {
        "type_key": "checkpoint",
        "category": EventCategory.SYSTEM,
        "name": "检查点",
        "name_en": "Checkpoint",
        "description": "创建游戏状态检查点",
        "icon_name": "bookmark",
        "color_hex": "#8B5CF6",
        "priority": 70,
        "is_system_only": True,
        "default_tags": ["system", "checkpoint"],
        "example_payload": {"checkpoint_id": "uuid", "scene": "Library", "round": 5},
    },
    {
        "type_key": "retcon",
        "category": EventCategory.SYSTEM,
        "name": "修改",
        "name_en": "Retcon",
        "description": "KP修改游戏内容",
        "icon_name": "edit",
        "color_hex": "#F59E0B",
        "priority": 65,
        "is_system_only": True,
        "default_tags": ["system", "kp"],
        "example_payload": {"action": "modify", "target": "character", "changes": {"hp": 12}},
    },
]
