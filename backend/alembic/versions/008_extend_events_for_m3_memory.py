"""extend events table for M3 memory web features

Revision ID: 008_extend_events_for_m3_memory
Revises: 007_add_events_table
Create Date: 2026-02-22

This migration adds the following M3 Memory Web extensions to the events table:
- sequence: Event sequence number within a session (for ordering and replay)
- category: Event category for high-level grouping
- input_raw: Raw user input/message
- narration: Narrative text for the event
- client_timestamp: Client-side timestamp for sync
- source: Source of the event (web, api, system)
- tags: Tags for search and filtering
- checkpoint_id: Reference to checkpoint
- state_changes_json: Detailed state changes tracking
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = '008_extend_events_for_m3_memory'
down_revision: Union[str, Sequence[str], None] = '007_add_events_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    db_type = conn.dialect.name

    if db_type == 'postgresql':
        # Add M3 columns for PostgreSQL
        op.execute("""
            ALTER TABLE events
            ADD COLUMN IF NOT EXISTS sequence INTEGER,
            ADD COLUMN IF NOT EXISTS category VARCHAR(20)
                CHECK (category IN ('interaction', 'check', 'combat', 'chase', 'sanity', 'state', 'system')),
            ADD COLUMN IF NOT EXISTS input_raw TEXT,
            ADD COLUMN IF NOT EXISTS narration TEXT,
            ADD COLUMN IF NOT EXISTS client_timestamp TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'system',
            ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]',
            ADD COLUMN IF NOT EXISTS checkpoint_id UUID,
            ADD COLUMN IF NOT EXISTS state_changes_json JSONB DEFAULT '[]'
        """)

        # Create indexes for PostgreSQL
        op.execute("CREATE INDEX IF NOT EXISTS idx_events_sequence ON events(sequence)")
        op.execute("CREATE INDEX IF NOT EXISTS idx_events_category ON events(category)")
        op.execute("CREATE INDEX IF NOT EXISTS idx_events_checkpoint_id ON events(checkpoint_id)")

        # Create composite index for efficient session+sequence queries
        op.execute("CREATE INDEX IF NOT EXISTS idx_events_session_sequence ON events(session_id, sequence)")

        # Create GIN index for tags (array search)
        op.execute("CREATE INDEX IF NOT EXISTS idx_events_tags_gin ON events USING gin(tags)")

        # Update full-text search index to include narration and input_raw
        op.execute("""
            CREATE INDEX IF NOT EXISTS idx_events_fulltext_gin ON events USING gin(
                to_tsvector('english',
                    coalesce(description, '') || ' ' ||
                    coalesce(narration, '') || ' ' ||
                    coalesce(input_raw, '')
                )
            )
        """)

    else:
        # SQLite version
        # SQLite doesn't support ALTER TABLE with multiple columns in one statement
        # And we need to recreate the table to add columns

        # First, check if columns already exist (for idempotency)
        columns_result = conn.execute(text("PRAGMA table_info(events)"))
        existing_columns = {row[1] for row in columns_result.fetchall()}

        if 'sequence' not in existing_columns:
            # For SQLite, we need to recreate the table with new columns
            op.execute("""
                CREATE TABLE events_new (
                    id TEXT PRIMARY KEY,
                    session_id TEXT,
                    sequence INTEGER,
                    actor_player_id INTEGER,
                    actor_role TEXT NOT NULL CHECK (actor_role IN ('kp', 'player', 'system')),
                    character_id INTEGER,
                    event_type TEXT NOT NULL,
                    category TEXT CHECK (category IN ('interaction', 'check', 'combat', 'chase', 'sanity', 'state', 'system')),
                    payload TEXT NOT NULL DEFAULT '{}',
                    input_raw TEXT,
                    narration TEXT,
                    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'kp', 'player')),
                    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    client_timestamp TIMESTAMP,
                    source TEXT DEFAULT 'system',
                    tags TEXT DEFAULT '[]',
                    checkpoint_id TEXT,
                    state_changes_json TEXT DEFAULT '[]',
                    parent_event_id TEXT,
                    description TEXT,
                    FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE SET NULL,
                    FOREIGN KEY (actor_player_id) REFERENCES users(id) ON DELETE SET NULL,
                    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL,
                    FOREIGN KEY (parent_event_id) REFERENCES events(id) ON DELETE SET NULL
                )
            """)

            # Copy existing data
            op.execute("""
                INSERT INTO events_new (
                    id, session_id, actor_player_id, actor_role, character_id,
                    event_type, payload, visibility, timestamp, parent_event_id, description
                )
                SELECT
                    id, session_id, actor_player_id, actor_role, character_id,
                    event_type, payload, visibility, timestamp, parent_event_id, description
                FROM events
            """)

            # Drop old table and rename new one
            op.execute("DROP TABLE events")
            op.execute("ALTER TABLE events_new RENAME TO events")

            # Recreate indexes
            op.execute("CREATE INDEX idx_events_session_id ON events(session_id)")
            op.execute("CREATE INDEX idx_events_actor_player_id ON events(actor_player_id)")
            op.execute("CREATE INDEX idx_events_character_id ON events(character_id)")
            op.execute("CREATE INDEX idx_events_event_type ON events(event_type)")
            op.execute("CREATE INDEX idx_events_parent_event_id ON events(parent_event_id)")
            op.execute("CREATE INDEX idx_events_timestamp ON events(timestamp DESC)")
            op.execute("CREATE INDEX idx_events_sequence ON events(sequence)")
            op.execute("CREATE INDEX idx_events_category ON events(category)")
            op.execute("CREATE INDEX idx_events_checkpoint_id ON events(checkpoint_id)")
            op.execute("CREATE INDEX idx_events_session_sequence ON events(session_id, sequence)")

            # Recreate FTS table with new columns
            op.execute("DROP TABLE IF EXISTS events_fts")
            op.execute("""
                CREATE VIRTUAL TABLE events_fts USING fts5(
                    id, description, narration, input_raw, payload,
                    content='events',
                    content_rowid='rowid'
                )
            """)

            # Recreate triggers
            op.execute("""
                CREATE TRIGGER events_ai AFTER INSERT ON events BEGIN
                    INSERT INTO events_fts(rowid, id, description, narration, input_raw, payload)
                    VALUES (new.rowid, new.id, new.description, new.narration, new.input_raw, new.payload);
                END
            """)

            op.execute("""
                CREATE TRIGGER events_ad AFTER DELETE ON events BEGIN
                    DELETE FROM events_fts WHERE rowid = old.rowid;
                END
            """)

            op.execute("""
                CREATE TRIGGER events_au AFTER UPDATE ON events BEGIN
                    DELETE FROM events_fts WHERE rowid = old.rowid;
                    INSERT INTO events_fts(rowid, id, description, narration, input_raw, payload)
                    VALUES (new.rowid, new.id, new.description, new.narration, new.input_raw, new.payload);
                END
            """)


def downgrade() -> None:
    conn = op.get_bind()
    db_type = conn.dialect.name

    if db_type == 'postgresql':
        # Remove M3 columns for PostgreSQL
        op.execute("""
            ALTER TABLE events
            DROP COLUMN IF EXISTS sequence,
            DROP COLUMN IF EXISTS category,
            DROP COLUMN IF EXISTS input_raw,
            DROP COLUMN IF EXISTS narration,
            DROP COLUMN IF EXISTS client_timestamp,
            DROP COLUMN IF EXISTS source,
            DROP COLUMN IF EXISTS tags,
            DROP COLUMN IF EXISTS checkpoint_id,
            DROP COLUMN IF EXISTS state_changes_json
        """)

        # Drop indexes
        op.execute("DROP INDEX IF EXISTS idx_events_sequence")
        op.execute("DROP INDEX IF EXISTS idx_events_category")
        op.execute("DROP INDEX IF EXISTS idx_events_checkpoint_id")
        op.execute("DROP INDEX IF EXISTS idx_events_session_sequence")
        op.execute("DROP INDEX IF EXISTS idx_events_tags_gin")
        op.execute("DROP INDEX IF EXISTS idx_events_fulltext_gin")

    else:
        # For SQLite, recreate the table without M3 columns
        op.execute("""
            CREATE TABLE events_old (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                actor_player_id INTEGER,
                actor_role TEXT NOT NULL CHECK (actor_role IN ('kp', 'player', 'system')),
                character_id INTEGER,
                event_type TEXT NOT NULL,
                payload TEXT NOT NULL DEFAULT '{}',
                visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'kp', 'player')),
                timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                parent_event_id TEXT,
                description TEXT,
                FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE SET NULL,
                FOREIGN KEY (actor_player_id) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL,
                FOREIGN KEY (parent_event_id) REFERENCES events(id) ON DELETE SET NULL
            )
        """)

        # Copy existing data (excluding M3 columns)
        op.execute("""
            INSERT INTO events_old (
                id, session_id, actor_player_id, actor_role, character_id,
                event_type, payload, visibility, timestamp, parent_event_id, description
            )
            SELECT
                id, session_id, actor_player_id, actor_role, character_id,
                event_type, payload, visibility, timestamp, parent_event_id, description
            FROM events
        """)

        # Drop current table and rename old one
        op.execute("DROP TABLE events")
        op.execute("DROP TABLE IF EXISTS events_fts")
        op.execute("ALTER TABLE events_old RENAME TO events")

        # Recreate original indexes
        op.execute("CREATE INDEX idx_events_session_id ON events(session_id)")
        op.execute("CREATE INDEX idx_events_actor_player_id ON events(actor_player_id)")
        op.execute("CREATE INDEX idx_events_character_id ON events(character_id)")
        op.execute("CREATE INDEX idx_events_event_type ON events(event_type)")
        op.execute("CREATE INDEX idx_events_parent_event_id ON events(parent_event_id)")
        op.execute("CREATE INDEX idx_events_timestamp ON events(timestamp DESC)")

        # Recreate original FTS table
        op.execute("""
            CREATE VIRTUAL TABLE events_fts USING fts5(
                id, description, payload,
                content='events',
                content_rowid='rowid'
            )
        """)

        op.execute("""
            CREATE TRIGGER events_ai AFTER INSERT ON events BEGIN
                INSERT INTO events_fts(rowid, id, description, payload)
                VALUES (new.rowid, new.id, new.description, new.payload);
            END
        """)

        op.execute("""
            CREATE TRIGGER events_ad AFTER DELETE ON events BEGIN
                DELETE FROM events_fts WHERE rowid = old.rowid;
            END
        """)

        op.execute("""
            CREATE TRIGGER events_au AFTER UPDATE ON events BEGIN
                DELETE FROM events_fts WHERE rowid = old.rowid;
                INSERT INTO events_fts(rowid, id, description, payload)
                VALUES (new.rowid, new.id, new.description, new.payload);
            END
        """)
