from typing import Optional

from pydantic import ConfigDict, Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = ConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ===== REQUIRED CONFIGURATION =====
    # Security (REQUIRED)
    SECRET_KEY: str = Field(
        ...,
        description="JWT signing key (min 32 chars). Generate with: openssl rand -hex 32"
    )

    # ===== DATABASE CONFIGURATION =====
    # Database connection (defaults for Docker environment)
    DB_HOST: str = Field(default="postgres", description="Database host")
    DB_PORT: int = Field(default=5432, description="Database port")
    DB_NAME: str = Field(default="monika", description="Database name")
    DB_USER: str = Field(default="postgres", description="Database user")
    DB_PASSWORD: str = Field(default="postgres", description="Database password")

    @property
    def DATABASE_URL(self) -> str:
        """Build database URL from components."""
        return f"postgresql+psycopg2://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    # ===== LLM CONFIGURATION (REQUIRED) =====
    # LLM provider to use
    LLM_PROVIDER: str = Field(
        default="openai",
        description="LLM provider: openai, claude, or custom"
    )

    # OpenAI Configuration (REQUIRED if using openai provider)
    OPENAI_BASE_URL: str = Field(
        default="https://api.openai.com/v1",
        description="OpenAI API base URL"
    )
    OPENAI_API_KEY: str = Field(
        ...,
        description="OpenAI API key"
    )
    OPENAI_MODEL: str = Field(
        default="gpt-4o-mini",
        description="OpenAI model name"
    )

    # Claude Configuration (REQUIRED if using claude provider)
    CLAUDE_BASE_URL: str = Field(
        default="https://api.anthropic.com",
        description="Claude API base URL"
    )
    CLAUDE_API_KEY: str = Field(
        default="",
        description="Claude API key (required if LLM_PROVIDER=claude)"
    )
    CLAUDE_MODEL: str = Field(
        default="claude-3-5-sonnet-20241022",
        description="Claude model name"
    )

    # ===== OPTIONAL CONFIGURATION =====
    # Application
    DEBUG: bool = Field(default=False, description="Enable debug mode (production: false)")

    # ===== INTERNAL CONFIGURATION =====
    # These values are fixed and should not need to be changed
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    ws_heartbeat_interval: int = 30
    ws_reconnect_max_attempts: int = 5


settings = Settings()
