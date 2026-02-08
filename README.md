# Monika

AI-driven Call of Cthulhu 7th Edition (CoC 7e) Tabletop Role-Playing Game (TRPG) Platform.

## Features

- **AI Keeper**: Natural language interaction with AI Game Master
- **Automated Mechanics**: Dice rolling, combat, SAN checks, chase sequences
- **Rule System**: Complete CoC 7e rules with searchable database
- **Real-time Communication**: WebSocket-based multiplayer support
- **Event Logging**: Comprehensive game event tracking and export

## Quick Start (Docker)

The fastest way to get started is using Docker Compose.

### Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- 2GB RAM minimum
- 10GB free disk space

### Deployment

```bash
# Clone the repository
git clone <repository-url>
cd monika

# Run the deployment script
chmod +x deploy.sh
./deploy.sh init
```

Or manually:

```bash
# Copy environment template
cp .env.production .env

# Edit .env with your configuration
nano .env

# Build and start
docker-compose up -d

# Run migrations
docker-compose exec backend alembic upgrade head
```

### Access

- **Frontend**: http://localhost
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

### Common Commands

```bash
# View logs
make logs

# Check status
make ps

# Stop services
make down

# Backup database
make backup

# Restore database
make restore FILE=backups/monika_20250101_120000.sql
```

For detailed deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Development Setup

### Backend

```bash
cd backend

# Install dependencies (requires uv)
uv sync

# Run development server
uv run python -m uvicorn src.main:app --reload

# Run tests
uv run pytest
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test
```

## Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md) - Docker deployment guide
- [CLAUDE.md](CLAUDE.md) - Project documentation for Claude Code
- [docs/prd/](docs/prd/) - Product Requirements Document
- [docs/guides/developer/](docs/guides/developer/) - Developer guides
- [docs/specs/](docs/specs/) - API and component specifications
- [docs/tasks/](docs/tasks/) - Task tracking and milestones

## Architecture

- **Backend**: Python 3.11+ with FastAPI, PostgreSQL, SQLAlchemy
- **Frontend**: React 19 with TypeScript, Vite, shadcn/ui
- **AI**: OpenAI GPT-4 integration for Keeper responses
- **Communication**: WebSocket for real-time interaction

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- GitHub Issues
- Documentation: [docs/](docs/)
