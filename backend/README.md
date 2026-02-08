# Backend Development

## Local Development Setup

### 1. Install Dependencies

```bash
cd backend
uv sync
```

### 2. Configure Environment Variables

The backend uses `pydantic-settings` to load configuration from environment variables.

**Option A: Using .env file (local development only)**

Create a `.env` file in the **project root** (not in backend/):

```bash
# Copy the template
cp .env.production .env

# Edit with your configuration
nano .env
```

**Option B: Set environment variables directly**

```bash
export SECRET_KEY="your-secret-key"
export OPENAI_API_KEY="sk-your-key"
export OPENAI_BASE_URL="https://api.openai.com/v1"
export OPENAI_MODEL="gpt-4o-mini"
export DB_HOST="localhost"
# ... etc
```

**Option C: Using IDE**

Configure environment variables in your IDE's run configuration.

### 3. Run Development Server

```bash
uv run python -m uvicorn src.main:app --reload
```

API will be available at http://localhost:8000

### 4. Run Tests

```bash
# Run all tests
uv run pytest

# Run with coverage
uv run pytest --cov

# Run specific test
uv run pytest src/tests/test_dice.py
```

## Docker Deployment

For Docker deployment, environment variables are passed via `docker-compose.yml`:

```bash
# Configure environment in root .env
cp .env.production .env
nano .env

# Build and start
docker-compose up -d
```

## Environment Variables Reference

See [docs/configuration.md](../docs/configuration.md) for complete reference.

### Required Variables

- `SECRET_KEY` - JWT signing key
- `OPENAI_BASE_URL` - LLM API endpoint
- `OPENAI_API_KEY` - LLM API key
- `OPENAI_MODEL` - Model name

### Database Variables (with defaults)

- `DB_HOST` - Default: `postgres`
- `DB_PORT` - Default: `5432`
- `DB_NAME` - Default: `monika`
- `DB_USER` - Default: `postgres`
- `DB_PASSWORD` - Default: `postgres`

## Project Structure

```
backend/
├── src/
│   ├── api/           # FastAPI routes
│   ├── core/          # Configuration, database, auth
│   ├── models/        # SQLAlchemy models
│   ├── schemas/       # Pydantic schemas
│   ├── services/      # Business logic
│   └── tests/         # Test suite
├── alembic/           # Database migrations
├── pyproject.toml     # UV package configuration
└── Dockerfile         # Docker image definition
```
