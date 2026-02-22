"""extend checkpoints table for M3 Memory Web features

Revision ID: 011_extend_checkpoints_for_m3
Revises: 010_add_event_types_table
Create Date: 2026-02-22

This migration adds M3 Memory Web extensions to the checkpoints table:
- last_event_sequence: Event sequence number for incremental sync
- scene_id: Current scene ID for resume context
- scene_name: Current scene name for resume context
- round_number: Round/tracking number for combat/chase
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = '011_extend_checkpoints_for_m3'
down_revision: Union[str, Sequence[str], None] = '010_add_event_types_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    db_type = conn.dialect.name

    if db_type == 'postgresql':
        # PostgreSQL version - add M3 columns
        op.execute("""
            ALTER TABLE checkpoints
            ADD COLUMN IF NOT EXISTS last_event_sequence INTEGER,
            ADD COLUMN IF NOT EXISTS scene_id VARCHAR(100),
            ADD COLUMN IF NOT EXISTS scene_name VARCHAR(200),
            ADD COLUMN IF NOT EXISTS round_number INTEGER
        """)

        # Create indexes for PostgreSQL
        op.execute("CREATE INDEX IF NOT EXISTS idx_checkpoints_last_event_sequence ON checkpoints(last_event_sequence)")
        op.execute("CREATE INDEX IF NOT EXISTS idx_checkpoints_scene_id ON checkpoints(scene_id)")

        # Create composite index for session + sequence queries
        op.execute("CREATE INDEX IF NOT EXISTS idx_checkpoints_session_sequence ON checkpoints(session_id, last_event_sequence)")

    else:
        # SQLite version - need to recreate table
        # First, check if columns already exist (for idempotency)
        columns_result = conn.execute(text("PRAGMA table_info(checkpoints)"))
        existing_columns = {row[1] for row in columns_result.fetchall()}

        if 'last_event_sequence' not in existing_columns:
            # Get existing table structure
            op.execute("""
                CREATE TABLE checkpoints_new (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    checkpoint_type TEXT NOT NULL DEFAULT 'manual',
                    session_state TEXT NOT NULL DEFAULT '{}',
                    character_states TEXT NOT NULL DEFAULT '{}',
                    world_state TEXT DEFAULT '{}',
                    narrative_state TEXT DEFAULT '{}',
                    last_event_id TEXT,
                    last_event_sequence INTEGER,
                    scene_id TEXT,
                    scene_name TEXT,
                    round_number INTEGER,
                    notes TEXT,
                    auto_created TEXT NOT NULL DEFAULT 'false',
                    trigger_event_type TEXT,
                    trigger_reason TEXT,
                    created_by_player_id INTEGER,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    is_deleted TEXT NOT NULL DEFAULT 'false',
                    deleted_at TIMESTAMP,
                    deleted_by_player_id INTEGER,
                    FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
                    FOREIGN KEY (created_by_player_id) REFERENCES users(id),
                    FOREIGN KEY (deleted_by_player_id) REFERENCES users(id)
                )
            """)

            # Copy existing data
            op.execute("""
                INSERT INTO checkpoints_new (
                    id, session_id, checkpoint_type, session_state, character_states,
                    world_state, narrative_state, last_event_id, notes, auto_created,
                    trigger_event_type, trigger_reason, created_by_player_id,
                    created_at, updated_at, is_deleted, deleted_at, deleted_by_player_id
                )
                SELECT
                    id, session_id, checkpoint_type, session_state, character_states,
                    world_state, narrative_state, last_event_id, notes, auto_created,
                    trigger_event_type, trigger_reason, created_by_player_id,
                    created_at, updated_at, is_deleted, deleted_at, deleted_by_player_id
                FROM checkpoints
            """)

            # Drop old table and rename new one
            op.execute("DROP TABLE checkpoints")
            op.execute("ALTER TABLE checkpoints_new RENAME TO checkpoints")

            # Recreate indexes
            op.execute("CREATE INDEX idx_checkpoints_id ON checkpoints(id)")
            op.execute("CREATE INDEX idx_checkpoints_session_id ON checkpoints(session_id)")
            op.execute("CREATE INDEX idx_checkpoints_checkpoint_type ON checkpoints(checkpoint_type)")
            op.execute("CREATE INDEX idx_checkpoints_last_event_id ON checkpoints(last_event_id)")
            op.execute("CREATE INDEX idx_checkpoints_last_event_sequence ON checkpoints(last_event_sequence)")
            op.execute("CREATE INDEX idx_checkpoints_scene_id ON checkpoints(scene_id)")
            op.execute("CREATE INDEX idx_checkpoints_created_at ON checkpoints(created_at)")
            op.execute("CREATE INDEX idx_checkpoints_session_sequence ON checkpoints(session_id, last_event_sequence)")


def downgrade() -> None:
    conn = op.get_bind()
    db_type = conn.dialect.name

    if db_type == 'postgresql':
        # Remove M3 columns for PostgreSQL
        op.execute("""
            ALTER TABLE checkpoints
            DROP COLUMN IF EXISTS last_event_sequence,
            DROP COLUMN IF EXISTS scene_id,
            DROP COLUMN IF EXISTS scene_name,
            DROP COLUMN IF EXISTS round_number
        """)

        # Drop indexes
        op.execute("DROP INDEX IF EXISTS idx_checkpoints_last_event_sequence")
        op.execute("DROP INDEX IF EXISTS idx_checkpoints_scene_id")
        op.execute("DROP INDEX IF EXISTS idx_checkpoints_session_sequence")

    else:
        # For SQLite, recreate the table without M3 columns
        op.execute("""
            CREATE TABLE checkpoints_old (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                checkpoint_type TEXT NOT NULL DEFAULT 'manual',
                session_state TEXT NOT NULL DEFAULT '{}',
                character_states TEXT NOT NULL DEFAULT '{}',
                world_state TEXT DEFAULT '{}',
                narrative_state TEXT DEFAULT '{}',
                last_event_id TEXT,
                notes TEXT,
                auto_created TEXT NOT NULL DEFAULT 'false',
                trigger_event_type TEXT,
                trigger_reason TEXT,
                created_by_player_id INTEGER,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                is_deleted TEXT NOT NULL DEFAULT 'false',
                deleted_at TIMESTAMP,
                deleted_by_player_id INTEGER,
                FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
                FOREIGN KEY (created_by_player_id) REFERENCES users(id),
                FOREIGN KEY (deleted_by_player_id) REFERENCES users(id)
            )
        """)

        # Copy existing data (excluding M3 columns)
        op.execute("""
            INSERT INTO checkpoints_old (
                id, session_id, checkpoint_type, session_state, character_states,
                world_state, narrative_state, last_event_id, notes, auto_created,
                trigger_event_type, trigger_reason, created_by_player_id,
                created_at, updated_at, is_deleted, deleted_at, deleted_by_player_id
            )
            SELECT
                id, session_id, checkpoint_type, session_state, character_states,
                world_state, narrative_state, last_event_id, notes, auto_created,
                trigger_event_type, trigger_reason, created_by_player_id,
                created_at, updated_at, is_deleted, deleted_at, deleted_by_player_id
            FROM checkpoints
        """)

        # Drop current table and rename old one
        op.execute("DROP TABLE checkpoints")
        op.execute("ALTER TABLE checkpoints_old RENAME TO checkpoints")

        # Recreate original indexes
        op.execute("CREATE INDEX idx_checkpoints_id ON checkpoints(id)")
        op.execute("CREATE INDEX idx_checkpoints_session_id ON checkpoints(session_id)")
        op.execute("CREATE INDEX idx_checkpoints_checkpoint_type ON checkpoints(checkpoint_type)")
        op.execute("CREATE INDEX idx_checkpoints_last_event_id ON checkpoints(last_event_id)")
        op.execute("CREATE INDEX idx_checkpoints_created_at ON checkpoints(created_at)")
