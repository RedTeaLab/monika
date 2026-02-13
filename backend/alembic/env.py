"""
Alembic environment configuration.

This file is executed before alembic commands to set environment variables.
For SQLite, we directly set the DATABASE_URL here.
"""

import os
import sys
from pathlib import Path

from sqlalchemy import engine_from_config, pool

from alembic import context

# Skip logging config since alembic.ini doesn't have it
# from logging.config import fileConfig
# if config.config_file_name is not None:
#     fileConfig(config.config_file_name)

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import models for autogenerate support
# from src.models import user  # noqa
# from src.models import character  # noqa
# Import all models here for 'alembic revision --autogenerate'

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# 项目根目录
project_root = Path(__file__).parent.parent

# SQLite 数据库配置
# 直接使用 SQLite 数据库文件
sqlite_db_path = project_root / "monika.db"

# 设置 Alembic 使用的数据库 URL
database_url = f"sqlite:///{sqlite_db_path}"

# Override sqlalchemy.url from alembic.ini
config.set_main_option("sqlalchemy.url", database_url)

# 设置数据库类型（可选，用于代码中判断）
os.environ["DB_TYPE"] = "sqlite"

print(f"Using SQLite database: {sqlite_db_path}")
print(f"Database URL: {database_url}")

# add your model's MetaData object here
# for 'autogenerate' support
# from myapp import mymodel
# target_metadata = mymodel.Base.metadata
target_metadata = None


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
