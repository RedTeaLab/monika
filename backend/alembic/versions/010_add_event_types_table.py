"""add event_types table for M3 Memory Web event type categorization

Revision ID: 010_add_event_types_table
Revises: 009_add_pgvector_support
Create Date: 2026-02-22

This migration creates the event_types table which stores metadata about
event types including:
- Event type definitions and display names
- UI hints (icons, colors)
- Category mappings
- Default tags and example payloads
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = '010_add_event_types_table'
down_revision: Union[str, Sequence[str], None] = '009_add_pgvector_support'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    db_type = conn.dialect.name

    if db_type == 'postgresql':
        # PostgreSQL version
        op.execute("""
            CREATE TABLE event_types (
                id SERIAL PRIMARY KEY,
                type_key VARCHAR(50) UNIQUE NOT NULL,
                category VARCHAR(20) NOT NULL,
                name VARCHAR(100) NOT NULL,
                name_en VARCHAR(100) NOT NULL,
                description TEXT,
                documentation TEXT,
                icon_name VARCHAR(50),
                color_hex VARCHAR(7),
                priority INTEGER NOT NULL DEFAULT 50,
                is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
                is_system_only BOOLEAN NOT NULL DEFAULT FALSE,
                payload_schema JSONB,
                default_tags JSONB DEFAULT '[]',
                example_payload JSONB,
                sub_types JSONB DEFAULT '[]',
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        """)

        # Create indexes
        op.execute("CREATE INDEX idx_event_types_type_key ON event_types(type_key)")
        op.execute("CREATE INDEX idx_event_types_category ON event_types(category)")

        # Create a unique index on (type_key, category) for efficient lookups
        op.execute("CREATE INDEX idx_event_types_key_category ON event_types(type_key, category)")

    else:
        # SQLite version
        op.execute("""
            CREATE TABLE event_types (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type_key TEXT UNIQUE NOT NULL,
                category TEXT NOT NULL,
                name TEXT NOT NULL,
                name_en TEXT NOT NULL,
                description TEXT,
                documentation TEXT,
                icon_name TEXT,
                color_hex TEXT,
                priority INTEGER NOT NULL DEFAULT 50,
                is_hidden BOOLEAN NOT NULL DEFAULT 0,
                is_system_only BOOLEAN NOT NULL DEFAULT 0,
                payload_schema TEXT,
                default_tags TEXT DEFAULT '[]',
                example_payload TEXT,
                sub_types TEXT DEFAULT '[]',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Create indexes
        op.execute("CREATE INDEX idx_event_types_type_key ON event_types(type_key)")
        op.execute("CREATE INDEX idx_event_types_category ON event_types(category)")
        op.execute("CREATE INDEX idx_event_types_key_category ON event_types(type_key, category)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS event_types")
