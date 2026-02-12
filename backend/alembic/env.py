"""
Alembic environment configuration.

This file is executed before alembic commands to set environment variables.
For SQLite, we directly set the DATABASE_URL here.
"""

import os
import sys
from pathlib import Path

# 项目根目录
project_root = Path(__file__).parent.parent

# SQLite 数据库配置
# 直接使用 SQLite 数据库文件
sqlite_db_path = project_root / "monika.db"

# 设置 Alembic 使用的数据库 URL
os.environ["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{sqlite_db_path}"

# 设置数据库类型（可选，用于代码中判断）
os.environ["DB_TYPE"] = "sqlite"

print(f"Using SQLite database: {sqlite_db_path}")
print(f"Database URL: sqlite:///{sqlite_db_path}")
