"""Tests for EventType metadata model."""
import uuid
from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.database import Base
from src.models.event_type_metadata import EventTypeMetadata, EventCategory, DEFAULT_EVENT_TYPES
from src.models.user import User


@pytest.fixture
def test_db():
    """Create a test database."""
    engine = create_engine("sqlite:///:memory:")
    TestingSessionLocal = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


class TestEventTypeMetadata:
    """Test EventTypeMetadata model."""

    def test_create_event_type_metadata(self, test_db):
        """Test creating an event type metadata record."""
        event_type = EventTypeMetadata(
            type_key="test_event",
            category=EventCategory.CHECK,
            name="测试事件",
            name_en="Test Event",
            description="这是一个测试事件类型",
            icon_name="test",
            color_hex="#FF5733",
            priority=75,
        )
        test_db.add(event_type)
        test_db.commit()
        test_db.refresh(event_type)

        assert event_type.id is not None
        assert event_type.type_key == "test_event"
        assert event_type.category == EventCategory.CHECK
        assert event_type.name == "测试事件"
        assert event_type.name_en == "Test Event"
        assert event_type.icon_name == "test"
        assert event_type.color_hex == "#FF5733"
        assert event_type.priority == 75
        assert event_type.is_hidden is False
        assert event_type.is_system_only is False

    def test_event_type_to_dict(self, test_db):
        """Test converting event type to dictionary."""
        event_type = EventTypeMetadata(
            type_key="roll",
            category=EventCategory.CHECK,
            name="检定",
            name_en="Roll",
            description="技能或属性检定",
            icon_name="dice",
            color_hex="#F59E0B",
            default_tags=["check", "dice"],
            sub_types=["skill", "attribute"],
        )
        test_db.add(event_type)
        test_db.commit()
        test_db.refresh(event_type)

        event_dict = event_type.to_dict()

        assert event_dict["type_key"] == "roll"
        assert event_dict["category"] == EventCategory.CHECK
        assert event_dict["name"] == "检定"
        assert event_dict["name_en"] == "Roll"
        assert event_dict["icon_name"] == "dice"
        assert event_dict["color_hex"] == "#F59E0B"
        assert event_dict["default_tags"] == ["check", "dice"]
        assert event_dict["sub_types"] == ["skill", "attribute"]
        assert "created_at" in event_dict
        assert "updated_at" in event_dict

    def test_event_type_with_json_fields(self, test_db):
        """Test event type with JSON fields."""
        payload_schema = {
            "type": "object",
            "properties": {
                "skill": {"type": "string"},
                "target": {"type": "integer"},
                "roll": {"type": "integer"},
            },
        }
        example_payload = {"skill": "spot_hidden", "target": 50, "roll": 25}

        event_type = EventTypeMetadata(
            type_key="roll",
            category=EventCategory.CHECK,
            name="检定",
            name_en="Roll",
            payload_schema=payload_schema,
            example_payload=example_payload,
        )
        test_db.add(event_type)
        test_db.commit()
        test_db.refresh(event_type)

        assert event_type.payload_schema == payload_schema
        assert event_type.example_payload == example_payload

    def test_event_type_display_name_properties(self, test_db):
        """Test display name properties."""
        event_type = EventTypeMetadata(
            type_key="test",
            category=EventCategory.INTERACTION,
            name="测试",
            name_en="Test",
        )
        test_db.add(event_type)
        test_db.commit()

        assert event_type.display_name == "测试"
        assert event_type.display_name_en == "Test"

    def test_event_type_unique_constraint(self, test_db):
        """Test that type_key must be unique."""
        event_type1 = EventTypeMetadata(
            type_key="duplicate",
            category=EventCategory.CHECK,
            name="第一个",
            name_en="First",
        )
        test_db.add(event_type1)
        test_db.commit()

        # Try to create another with same type_key
        event_type2 = EventTypeMetadata(
            type_key="duplicate",
            category=EventCategory.COMBAT,
            name="第二个",
            name_en="Second",
        )
        test_db.add(event_type2)

        with pytest.raises(Exception):  # IntegrityError
            test_db.commit()

    def test_get_event_type_by_type_key(self, test_db):
        """Test querying event type by type_key."""
        event_type = EventTypeMetadata(
            type_key="message",
            category=EventCategory.INTERACTION,
            name="消息",
            name_en="Message",
        )
        test_db.add(event_type)
        test_db.commit()

        retrieved = (
            test_db.query(EventTypeMetadata)
            .filter(EventTypeMetadata.type_key == "message")
            .first()
        )

        assert retrieved is not None
        assert retrieved.id == event_type.id
        assert retrieved.name == "消息"

    def test_get_event_types_by_category(self, test_db):
        """Test querying event types by category."""
        # Add multiple event types
        test_db.add(
            EventTypeMetadata(
                type_key="roll", category=EventCategory.CHECK, name="检定", name_en="Roll"
            )
        )
        test_db.add(
            EventTypeMetadata(
                type_key="push_roll",
                category=EventCategory.CHECK,
                name="推骰",
                name_en="Push Roll",
            )
        )
        test_db.add(
            EventTypeMetadata(
                type_key="damage",
                category=EventCategory.COMBAT,
                name="伤害",
                name_en="Damage",
            )
        )
        test_db.commit()

        check_types = (
            test_db.query(EventTypeMetadata)
            .filter(EventTypeMetadata.category == EventCategory.CHECK)
            .all()
        )

        assert len(check_types) == 2
        assert all(et.category == EventCategory.CHECK for et in check_types)

    def test_event_type_priority_ordering(self, test_db):
        """Test ordering event types by priority."""
        test_db.add(
            EventTypeMetadata(
                type_key="low_priority",
                category=EventCategory.CHECK,
                name="低优先级",
                name_en="Low Priority",
                priority=20,
            )
        )
        test_db.add(
            EventTypeMetadata(
                type_key="high_priority",
                category=EventCategory.CHECK,
                name="高优先级",
                name_en="High Priority",
                priority=90,
            )
        )
        test_db.add(
            EventTypeMetadata(
                type_key="medium_priority",
                category=EventCategory.CHECK,
                name="中优先级",
                name_en="Medium Priority",
                priority=50,
            )
        )
        test_db.commit()

        # Query ordered by priority descending
        event_types = (
            test_db.query(EventTypeMetadata)
            .order_by(EventTypeMetadata.priority.desc())
            .all()
        )

        assert event_types[0].type_key == "high_priority"
        assert event_types[1].type_key == "medium_priority"
        assert event_types[2].type_key == "low_priority"

    def test_hidden_event_types(self, test_db):
        """Test filtering hidden event types."""
        test_db.add(
            EventTypeMetadata(
                type_key="visible",
                category=EventCategory.CHECK,
                name="可见",
                name_en="Visible",
                is_hidden=False,
            )
        )
        test_db.add(
            EventTypeMetadata(
                type_key="hidden",
                category=EventCategory.CHECK,
                name="隐藏",
                name_en="Hidden",
                is_hidden=True,
            )
        )
        test_db.commit()

        visible_types = (
            test_db.query(EventTypeMetadata).filter(EventTypeMetadata.is_hidden == False).all()
        )

        assert len(visible_types) == 1
        assert visible_types[0].type_key == "visible"

    def test_default_event_types_structure(self):
        """Test that DEFAULT_EVENT_TYPES is properly structured."""
        assert isinstance(DEFAULT_EVENT_TYPES, list)
        assert len(DEFAULT_EVENT_TYPES) > 0

        for event_type_def in DEFAULT_EVENT_TYPES:
            assert "type_key" in event_type_def
            assert "category" in event_type_def
            assert "name" in event_type_def
            assert "name_en" in event_type_def
            assert isinstance(event_type_def["type_key"], str)
            assert isinstance(event_type_def["name"], str)
            assert isinstance(event_type_def["name_en"], str)

    def test_default_event_types_categories(self):
        """Test that default event types cover all categories."""
        categories_found = set()
        for event_type_def in DEFAULT_EVENT_TYPES:
            categories_found.add(event_type_def["category"])

        expected_categories = {
            EventCategory.INTERACTION,
            EventCategory.CHECK,
            EventCategory.COMBAT,
            EventCategory.CHASE,
            EventCategory.SANITY,
            EventCategory.STATE,
            EventCategory.SYSTEM,
        }

        assert categories_found == expected_categories

    def test_default_event_types_unique_keys(self):
        """Test that default event types have unique type_keys."""
        type_keys = [et["type_key"] for et in DEFAULT_EVENT_TYPES]
        assert len(type_keys) == len(set(type_keys)), "Duplicate type_keys found in DEFAULT_EVENT_TYPES"
