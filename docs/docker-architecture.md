# Docker Architecture

## Overview

Monika uses a multi-container Docker architecture with separation of concerns:

```
┌────────────────────────────────────────────────────────────┐
│                       Host:80                              │
│                         │                                  │
│              ┌──────────▼──────────┐                       │
│              │       nginx         │                       │
│              │   (alpine:latest)   │                       │
│              │                      │                       │
│              │ ┌────────────────┐  │                       │
│              │ │  Static Files  │  │                       │
│              │ │  (React SPA)   │  │                       │
│              │ └────────────────┘  │                       │
│              │                      │                       │
│              │ ┌────────────────┐  │                       │
│              │ │  API Proxy     │  │                       │
│              │ │  /api → backend│  │                       │
│              │ │  /ws → backend │  │                       │
│              │ └────────────────┘  │                       │
│              └──────────┬──────────┘                       │
│                         │                                  │
└─────────────────────────┼──────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          │                               │
          ▼                               ▼
┌──────────────────────┐      ┌──────────────────────────┐
│   frontend-builder   │      │        backend            │
│  (node:20-alpine)    │      │    (python:3.11-slim)     │
│                      │      │                          │
│  ┌────────────────┐  │      │  ┌────────────────────┐  │
│  │  npm run build │  │      │  │    FastAPI App     │  │
│  └────────┬───────┘  │      │  │                    │  │
│           │          │      │  │  • LLM Integration  │  │
│           ▼          │      │  │  • Dice System      │  │
│      [Volume]        │      │  │  • Combat           │  │
│   frontend_static    │      │  │  • Events           │  │
│                      │      │  │  • WebSocket        │  │
└──────────────────────┘      │  └──────────┬─────────┘  │
                              │             │            │
                              │             ▼            │
                              │  ┌────────────────────┐  │
                              │  │     Migration       │  │
                              │  │   (alembic)        │  │
                              │  │                    │  │
                              │  │  • Auto-upgrade    │  │
                              │  │  • Schema version  │  │
                              │  └──────────┬─────────┘  │
                              │             │            │
                              │             ▼            │
                              │  ┌────────────────────┐  │
                              │  │      PostgreSQL     │  │
                              │  │   (postgres:16)    │  │
                              │  │                    │  │
                              │  │  • Characters      │  │
                              │  │  • Sessions        │  │
                              │  │  • Events          │  │
                              │  │  • Rules           │  │
                              │  └────────────────────┘  │
                              └──────────────────────────┘
```

## Services

### 1. nginx
**Image**: `nginx:alpine`
**Port**: 80 (public)

**Responsibilities**:
- Serve React SPA static files
- Reverse proxy for API requests (`/api/*`)
- WebSocket proxy (`/ws/*`)
- Gzip compression
- Security headers

**Volumes**:
- `frontend_static:/usr/share/nginx/html:ro` - Built React app
- `./nginx.conf:/etc/nginx/conf.d/default.conf:ro` - Configuration

### 2. frontend-builder
**Image**: `node:20-alpine`
**Restart**: "no" (runs once)

**Responsibilities**:
- Build React application
- Output static files to shared volume

**Volumes**:
- `frontend_static:/app/dist` - Build output

**Lifecycle**:
1. Container starts
2. Runs `npm run build`
3. Writes output to volume
4. Exits (never restarts)

### 3. migration
**Image**: Custom (built from `backend/Dockerfile`)
**Base**: `python:3.11-slim`
**Restart**: "no" (runs once)

**Responsibilities**:
- Wait for PostgreSQL to be ready
- Run `alembic upgrade head` to apply migrations
- Exit after completion

**Lifecycle**:
1. Container starts
2. Waits for database to be healthy
3. Runs `alembic upgrade head`
4. Exits (never restarts)

**Dependency Chain**:
```
postgres → migration → backend
```

### 4. backend
**Image**: Custom (built from `backend/Dockerfile`)
**Base**: `python:3.11-slim`
**Port**: 8000 (internal only)

**Responsibilities**:
- REST API endpoints
- WebSocket connections
- LLM integration
- Game mechanics (dice, combat, chase)
- Business logic

**Environment Variables**:
- `DATABASE_URL` - PostgreSQL connection
- `SECRET_KEY` - JWT signing
- `OPENAI_API_KEY` - LLM access
- `DEBUG` - Debug mode

### 5. postgres
**Image**: `postgres:16-alpine`
**Port**: 5432 (internal or exposed for dev)

**Responsibilities**:
- Persistent data storage
- User authentication
- Game sessions
- Event logs
- Rule database

**Volumes**:
- `postgres_data:/var/lib/postgresql/data`

## Communication Flow

### API Request
```
Browser → nginx:80 → backend:8000 → PostgreSQL:5432
```

### WebSocket Connection
```
Browser → nginx:80 (proxy) → backend:8000 (WebSocket)
```

### Static File
```
Browser → nginx:80 → Serve from volume
```

## Data Volumes

| Volume | Purpose | Shared By |
|--------|---------|-----------|
| `postgres_data` | Database persistence | postgres |
| `frontend_static` | Built React app | frontend-builder, nginx |

## Network

All services communicate via `monika-network` bridge network.

**Internal DNS**:
- `backend` → backend container
- `postgres` → postgres container
- `nginx` → nginx container
- `migration` → migration container

## Startup Order

Services start in this order:

1. **postgres** → Database starts
2. **migration** → Waits for postgres, runs migrations, exits
3. **backend** → Waits for migration to complete, starts API
4. **frontend-builder** → Builds React app, exits
5. **nginx** → Waits for backend + frontend-builder, serves traffic

## Production Configuration

Use `docker-compose.prod.yml` for production:

**Additional features**:
- Resource limits (CPU, memory)
- Security hardening (read-only, no-new-privileges)
- Separate volume names
- Dedicated network bridge
- Health checks on all services

**Deployment**:
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Development Configuration

Use `docker-compose.override.yml` for development:

**Features**:
- Volume mounts for hot reload
- Debug logging enabled
- Additional tools (pgAdmin, etc.)

**Deployment**:
```bash
docker-compose up
```

## Building and Updating

### Initial Build
```bash
docker-compose build
docker-compose up -d
```

### Rebuild Frontend Only
```bash
docker-compose up -d --force-recreate frontend-builder
docker-compose up -d nginx
```

### Rebuild Backend Only
```bash
docker-compose build backend
docker-compose up -d backend
```

### Full Rebuild
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Rerun Migrations
```bash
docker-compose up -d --force-recreate migration
```

## Advantages of This Architecture

1. **Separation of Concerns**: Each service has a single responsibility
2. **Scalability**: Can scale backend independently
3. **Security**: Backend not directly exposed to internet
4. **Flexibility**: Easy to swap nginx for another reverse proxy
5. **Efficiency**: nginx serves static files faster than Node.js
6. **Maintainability**: Smaller, focused containers
7. **Automatic Migrations**: Database schema updates on every deployment
8. **Idempotent**: Safe to run migration multiple times

## Future Enhancements

- Add SSL/TLS termination at nginx
- Add Redis for caching and sessions
- Separate read replicas for PostgreSQL
- Multiple backend instances with load balancer
- CDN for static assets
- Separate nginx for API gateway
