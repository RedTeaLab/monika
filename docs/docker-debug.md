# Docker Build & Deployment Debug Guide

## Common Issues and Solutions

### Issue 1: Cannot connect to Docker Hub

**Error:**
```
failed to authorize: failed to fetch anonymous token: Get "https://auth.docker.io/token..."
```

**Solutions:**

#### Option A: Configure Docker Mirror (China)

1. Open Docker Desktop
2. Go to Settings → Docker Engine
3. Add mirror configuration:

```json
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com",
    "https://mirror.ccs.tencentyun.com"
  ]
}
```

4. Click "Apply & Restart"

#### Option B: Use Proxy

```json
{
  "proxies": {
    "http-proxy": "http://your-proxy:port",
    "https-proxy": "http://your-proxy:port"
  }
}
```

#### Option C: Pre-pull Images

```bash
docker pull python:3.11-slim
docker pull node:20-alpine
docker pull postgres:16-alpine
docker pull nginx:alpine
```

---

### Issue 2: Build Context Issues

**Check if files are in correct locations:**

```bash
# Verify directory structure
ls -la backend/
ls -la frontend/
ls -la nginx.conf
```

**Required files:**
- `backend/Dockerfile` ✓
- `backend/pyproject.toml` ✓
- `frontend/Dockerfile.builder` ✓
- `frontend/package.json` ✓
- `nginx.conf` (in root) ✓

---

### Issue 3: Port Already in Use

**Error:**
```
Bind for 0.0.0.0:5432 failed: port is already allocated
```

**Solution:**
```bash
# Check what's using the port
netstat -ano | findstr :5432

# Or stop conflicting services
docker-compose down
```

---

## Build & Deploy Checklist

### 1. Pre-flight Checks

```bash
# Verify Docker is running
docker --version
docker-compose version

# Check for required files
docker-compose config

# Verify environment variables
cat .env  # should exist with OPENAI_API_KEY set
```

### 2. Build Step by Step

```bash
# Build backend only
docker-compose build backend

# Build frontend only
docker-compose build frontend-builder

# Build all
docker-compose build
```

### 3. Start Services

```bash
# Start all services
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

### 4. Verify Deployment

```bash
# Check health endpoints
curl http://localhost/health              # nginx
curl http://localhost:8000/health         # backend (if exposed)

# Check database connection
docker-compose exec backend python -c "
from src.core.database import engine
print('Database connection:', engine.connect())
"

# Run migrations
docker-compose exec backend alembic current
```

---

## Debugging Commands

```bash
# View service logs
docker-compose logs -f backend
docker-compose logs -f nginx
docker-compose logs -f migration
docker-compose logs -f postgres

# Execute commands in containers
docker-compose exec backend sh
docker-compose exec postgres psql -U postgres -d monika

# Restart specific service
docker-compose restart backend

# Rebuild specific service
docker-compose up -d --build backend

# Clean and rebuild
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

---

## Common Build Errors

### Backend Build Fails

**Error: `uv pip install failed`**

```bash
# Solution: Check pyproject.toml is valid
cd backend
uv pip check

# Or use traditional pip (modify Dockerfile)
RUN pip install --no-cache-dir -r requirements.txt
```

### Frontend Build Fails

**Error: `npm ci failed`**

```bash
# Solution: Check package.json
cd frontend
npm install --dry-run  # Verify dependencies
```

### Migration Fails

**Error: `alembic upgrade head failed`**

```bash
# Check database is ready
docker-compose exec postgres pg_isready -U postgres

# Manual migration
docker-compose exec backend alembic upgrade head

# Check migration status
docker-compose exec backend alembic current
```

---

## Network Issues

### Services Cannot Connect

```bash
# Check network
docker network ls
docker network inspect monika-monika-network

# Verify services are on same network
docker-compose ps
```

### Backend Cannot Reach Database

```bash
# Test from backend container
docker-compose exec backend ping -c 3 postgres

# Check environment variables
docker-compose exec backend env | grep DB_
```

---

## Quick Fix Commands

```bash
# Complete reset
docker-compose down -v
docker system prune -f
docker-compose build --no-cache
docker-compose up -d

# Restart migration
docker-compose up -d --force-recreate migration

# Rebuild frontend only
docker-compose up -d --force-recreate frontend-builder nginx
```

---

## Production Deployment

```bash
# Use production config
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Check resource usage
docker stats

# Monitor logs
docker-compose logs -f --tail=100
```

---

## Getting Help

If issues persist:

1. Check Docker Desktop is running
2. Verify `.env` file has correct values
3. Check ports 80, 5432, 8000 are not in use
4. Review logs: `docker-compose logs`
5. Try `--no-cache` build
