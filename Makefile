.PHONY: help build up down restart logs ps clean backup restore

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build Docker images
	docker-compose build

up: ## Start all services
	docker-compose up -d

down: ## Stop all services
	docker-compose down

restart: ## Restart all services
	docker-compose restart

logs: ## View logs from all services
	docker-compose logs -f

logs-backend: ## View backend logs
	docker-compose logs -f backend

logs-nginx: ## View nginx logs
	docker-compose logs -f nginx

logs-frontend: ## View frontend builder logs (build only)
	docker-compose logs -f frontend-builder

logs-postgres: ## View postgres logs
	docker-compose logs -f postgres

ps: ## Show running containers
	docker-compose ps

clean: ## Stop and remove all containers, networks, and volumes
	docker-compose down -v
	docker system prune -f

db-migrate: ## Run database migrations
	docker-compose exec backend alembic upgrade head

db-rollback: ## Rollback last migration
	docker-compose exec backend alembic downgrade -1

db-reset: ## Reset database (WARNING: deletes all data)
	docker-compose exec postgres psql -U postgres -c "DROP DATABASE IF EXISTS monika;"
	docker-compose exec postgres psql -U postgres -c "CREATE DATABASE monika;"
	docker-compose exec backend alembic upgrade head

db-shell: ## Open PostgreSQL shell
	docker-compose exec postgres psql -U postgres -d monika

backend-shell: ## Open backend shell
	docker-compose exec backend sh

nginx-reload: ## Reload nginx configuration
	docker-compose exec nginx nginx -s reload

nginx-config: ## Test nginx configuration
	docker-compose exec nginx nginx -t

backup: ## Backup PostgreSQL database
	@mkdir -p backups
	docker-compose exec -T postgres pg_dump -U postgres monika > backups/monika_$(shell date +%Y%m%d_%H%M%S).sql
	@echo "Backup saved to backups/"

restore: ## Restore PostgreSQL database (usage: make restore FILE=backups/monika_20250101_120000.sql)
	@if [ -z "$(FILE)" ]; then echo "Usage: make restore FILE=backups/monika_YYYYMMDD_HHMMSS.sql"; exit 1; fi
	docker-compose exec -T postgres psql -U postgres monika < $(FILE)

test: ## Run backend tests
	docker-compose exec backend pytest

rebuild: ## Rebuild and restart all services
	docker-compose down
	docker-compose build --no-cache
	docker-compose up -d
	@echo "Waiting for services to be healthy..."
	@sleep 10
	docker-compose ps

init: ## Initialize the application (first time setup)
	@echo "Checking environment..."
	@if [ ! -f .env ]; then \
		echo "Creating .env from template..."; \
		cp .env.production .env; \
		echo "Please edit .env with your configuration"; \
		exit 1; \
	fi
	@echo "Building Docker images..."
	docker-compose build
	@echo "Starting services (migrations run automatically)..."
	docker-compose up -d
	@echo "Waiting for services to be ready..."
	@sleep 15
	@echo ""
	@echo "✓ Initialization complete!"
	@echo "Frontend: http://localhost"
	@echo "Backend API: http://localhost:8000"
	@echo "API Docs: http://localhost:8000/docs"

# Database migration commands (migration runs automatically on startup)
migration-status: ## Show current migration status
	docker-compose exec backend alembic current

migration-create: ## Create new migration (usage: make migration-create MSG="add users table")
	docker-compose exec backend alembic revision --autogenerate -m "$(MSG)"

migration-upgrade: ## Manually run database upgrades
	docker-compose exec backend alembic upgrade head

migration-downgrade: ## Rollback one migration
	docker-compose exec backend alembic downgrade -1

migration-logs: ## View migration service logs
	docker-compose logs migration
