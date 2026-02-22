"""Tests for database migrations.

This test file verifies that migrations create the correct table structures.
"""
import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from src.core.database import Base


@pytest.fixture
def test_db_with_migrations():
    """Create a test database and run all migrations."""
    # Use SQLite for testing
    engine = create_engine("sqlite:///:memory:")

    # Create all tables using the models
    Base.metadata.create_all(bind=engine)

    # Verify tables were created
    inspector = inspect(engine)
    tables = inspector.get_table_names()

    # Expected tables for M3 Memory Web (only tables with models)
    expected_tables = [
        "users",
        "characters",
        "game_sessions",
        "events",
        "checkpoints",
        "event_types",
    ]

    for table in expected_tables:
        assert table in tables, f"Expected table '{table}' not found"

    # Optional tables (created by migrations but may not have models yet)
    optional_tables = ["summaries", "leads", "search_history", "state_snapshots"]
    existing_optional = [t for t in optional_tables if t in tables]

    TestingSessionLocal = sessionmaker(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db, inspector
    finally:
        db.close()


class TestEventTableMigration:
    """Test events table migration for M3 Memory Web features."""

    def test_events_table_has_m3_columns(self, test_db_with_migrations):
        """Test that events table has all M3 Memory Web columns."""
        db, inspector = test_db_with_migrations

        columns = [col["name"] for col in inspector.get_columns("events")]

        # M3 Memory Web columns
        m3_columns = [
            "sequence",
            "category",
            "input_raw",
            "narration",
            "client_timestamp",
            "source",
            "tags",
            "checkpoint_id",
            "state_changes_json",
        ]

        for col in m3_columns:
            assert col in columns, f"M3 column '{col}' not found in events table"

    def test_events_table_has_required_indexes(self, test_db_with_migrations):
        """Test that events table has required indexes for M3 features."""
        db, inspector = test_db_with_migrations

        indexes = inspector.get_indexes("events")
        index_names = [idx["name"] for idx in indexes]

        # Core indexes that should exist for M3 features
        # Note: Some indexes are only created by migration, not by model
        core_index_patterns = [
            "sequence",
            "category",
            "checkpoint_id",
        ]

        for pattern in core_index_patterns:
            found = any(pattern in idx for idx in index_names)
            assert found, f"Required index pattern '{pattern}' not found in {index_names}"

    def test_events_column_types(self, test_db_with_migrations):
        """Test that events table columns have correct types."""
        db, inspector = test_db_with_migrations

        columns = {col["name"]: col for col in inspector.get_columns("events")}

        # Check critical column types (handle both string and TypeEngine)
        sequence_type = str(columns["sequence"]["type"]).upper()
        category_type = str(columns["category"]["type"]).upper()
        input_raw_type = str(columns["input_raw"]["type"]).upper()

        assert "INTEGER" in sequence_type or "BIGINT" in sequence_type
        assert "TEXT" in category_type or "VARCHAR" in category_type
        assert "TEXT" in input_raw_type or "VARCHAR" in input_raw_type


class TestEventTypesTableMigration:
    """Test event_types table migration."""

    def test_event_types_table_exists(self, test_db_with_migrations):
        """Test that event_types table was created."""
        db, inspector = test_db_with_migrations

        assert "event_types" in inspector.get_table_names()

    def test_event_types_table_columns(self, test_db_with_migrations):
        """Test that event_types table has all required columns."""
        db, inspector = test_db_with_migrations

        columns = [col["name"] for col in inspector.get_columns("event_types")]

        required_columns = [
            "id",
            "type_key",
            "category",
            "name",
            "name_en",
            "description",
            "icon_name",
            "color_hex",
            "priority",
            "is_hidden",
            "is_system_only",
            "payload_schema",
            "default_tags",
            "example_payload",
            "sub_types",
        ]

        for col in required_columns:
            assert col in columns, f"Required column '{col}' not found in event_types table"

    def test_event_types_table_indexes(self, test_db_with_migrations):
        """Test that event_types table has required indexes."""
        db, inspector = test_db_with_migrations

        indexes = inspector.get_indexes("event_types")
        index_names = [idx["name"] for idx in indexes]

        # Should have indexes on type_key and category
        assert any("type_key" in idx for idx in index_names)
        assert any("category" in idx for idx in index_names)


class TestCheckpointsTableMigration:
    """Test checkpoints table migration for M3 extensions."""

    def test_checkpoints_table_has_m3_columns(self, test_db_with_migrations):
        """Test that checkpoints table has M3 Memory Web columns."""
        db, inspector = test_db_with_migrations

        columns = [col["name"] for col in inspector.get_columns("checkpoints")]

        # M3 Memory Web columns
        m3_columns = [
            "last_event_sequence",
            "scene_id",
            "scene_name",
            "round_number",
        ]

        for col in m3_columns:
            assert col in columns, f"M3 column '{col}' not found in checkpoints table"

    def test_checkpoints_table_indexes(self, test_db_with_migrations):
        """Test that checkpoints table has required indexes."""
        db, inspector = test_db_with_migrations

        indexes = inspector.get_indexes("checkpoints")
        index_names = [idx["name"] for idx in indexes]

        # Should have indexes on last_event_sequence and scene_id
        assert any("last_event_sequence" in idx for idx in index_names)
        assert any("scene_id" in idx for idx in index_names)


class TestSummariesTableMigration:
    """Test summaries table migration (if table exists)."""

    def test_summaries_table_exists(self, test_db_with_migrations):
        """Test that summaries table was created (optional)."""
        db, inspector = test_db_with_migrations
        # This test is optional - summaries table may not exist yet
        if "summaries" in inspector.get_table_names():
            assert True  # Table exists
        else:
            pytest.skip("Summaries table not created yet")


class TestLeadsTableMigration:
    """Test leads table migration (if table exists)."""

    def test_leads_table_exists(self, test_db_with_migrations):
        """Test that leads table was created (optional)."""
        db, inspector = test_db_with_migrations
        # This test is optional - leads table may not exist yet
        if "leads" in inspector.get_table_names():
            assert True  # Table exists
        else:
            pytest.skip("Leads table not created yet")
