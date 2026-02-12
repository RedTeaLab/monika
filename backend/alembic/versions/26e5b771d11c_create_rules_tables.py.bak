"""create rules tables

Revision ID: 26e5b771d11c
Revises:
Create Date: 2026-02-08 00:54:19.780389

"""
from typing import Sequence, Union
import os

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.dialects import postgresql

# Import Vector type for pgvector support
try:
    from pgvector.sqlalchemy import Vector
    HAS_PGVECTOR = True
except ImportError:
    HAS_PGVECTOR = False


# revision identifiers, used by Alembic.
revision: str = '26e5b771d11c'
down_revision: Union[str, Sequence[str], None] = '001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_postgresql() -> bool:
    """Detect if we're using PostgreSQL."""
    # Get database URL from config or environment
    url = os.environ.get("DATABASE_URL", "")
    # Also check from alembic config
    if not url:
        from alembic import context
        url = context.config.get_main_option("sqlalchemy.url", "")
    return url.startswith("postgresql")


def upgrade() -> None:
    """Upgrade schema - create rules and rule_faqs tables."""
    is_pg = _is_postgresql()
    has_pgvector = HAS_PGVECTOR and is_pg

    # Create pgvector extension if available (PostgreSQL only)
    if is_pg:
        op.execute(text('CREATE EXTENSION IF NOT EXISTS vector'))

    # Create rules table
    if is_pg:
        # PostgreSQL schema with native types
        op.create_table(
            'rules',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('title', sa.String(255), nullable=False),
            sa.Column('category', sa.String(100), nullable=False),
            sa.Column('subcategory', sa.String(100)),
            sa.Column('content', sa.Text(), nullable=False),
            sa.Column('example', sa.Text()),
            sa.Column('mechanics', postgresql.JSON()),
            sa.Column('aliases', postgresql.ARRAY(sa.String())),
            sa.Column('tags', postgresql.ARRAY(sa.String())),
            sa.Column('related_rule_ids', postgresql.ARRAY(postgresql.UUID())),
            sa.Column('embedding', Vector(1536), nullable=True) if has_pgvector else sa.Column('embedding', sa.LargeBinary, nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
            sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), onupdate=sa.text('NOW()')),
        )
    else:
        # SQLite schema with JSON fallbacks
        op.create_table(
            'rules',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('title', sa.String(255), nullable=False),
            sa.Column('category', sa.String(100), nullable=False),
            sa.Column('subcategory', sa.String(100)),
            sa.Column('content', sa.Text(), nullable=False),
            sa.Column('example', sa.Text()),
            sa.Column('mechanics', sa.JSON()),
            sa.Column('aliases', sa.JSON()),  # List[str]
            sa.Column('tags', sa.JSON()),  # List[str]
            sa.Column('related_rule_ids', sa.JSON()),  # List[str]
            sa.Column('embedding', sa.LargeBinary, nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), onupdate=sa.text('CURRENT_TIMESTAMP')),
        )

    # Create rule_faqs table
    if is_pg:
        op.create_table(
            'rule_faqs',
            sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column('question', sa.Text(), nullable=False),
            sa.Column('answer', sa.Text(), nullable=False),
            sa.Column('category', sa.String(100)),
            sa.Column('related_rule_ids', postgresql.ARRAY(postgresql.UUID())),
            sa.Column('embedding', Vector(1536), nullable=True) if has_pgvector else sa.Column('embedding', sa.LargeBinary, nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        )
    else:
        op.create_table(
            'rule_faqs',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('question', sa.Text(), nullable=False),
            sa.Column('answer', sa.Text(), nullable=False),
            sa.Column('category', sa.String(100)),
            sa.Column('related_rule_ids', sa.JSON()),  # List[str]
            sa.Column('embedding', sa.LargeBinary, nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
        )

    # Create indexes for rules
    op.create_index('rules_title_idx', 'rules', ['title'])
    op.create_index('rules_category_idx', 'rules', ['category'])

    # Create full-text search index using GIN (PostgreSQL only)
    if is_pg:
        op.execute(
            text("CREATE INDEX rules_fts ON rules USING gin(to_tsvector('english', title || ' ' || content))")
        )

        # Create vector similarity indexes using ivfflat (PostgreSQL with pgvector)
        # Lists parameter depends on data size; 100 is reasonable for initial dataset
        if has_pgvector:
            op.execute(
                text('CREATE INDEX rules_embedding_idx ON rules USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100)')
            )
            op.execute(
                text('CREATE INDEX rule_faqs_embedding_idx ON rule_faqs USING ivfflat(embedding vector_cosine_ops) WITH (lists = 50)')
            )


def downgrade() -> None:
    """Downgrade schema - drop rules and rule_faqs tables."""
    is_pg = _is_postgresql()

    # Drop PostgreSQL-specific indexes
    if is_pg:
        op.execute(text('DROP INDEX IF EXISTS rules_fts'))
        op.execute(text('DROP INDEX IF EXISTS rules_embedding_idx'))
        op.execute(text('DROP INDEX IF EXISTS rule_faqs_embedding_idx'))

    # Drop standard indexes
    op.drop_index('rules_category_idx', table_name='rules')
    op.drop_index('rules_title_idx', table_name='rules')

    # Drop tables
    op.drop_table('rule_faqs')
    op.drop_table('rules')

    # Drop pgvector extension (optional - comment out if you want to keep it)
    # if is_pg:
    #     op.execute(text('DROP EXTENSION IF EXISTS vector'))
