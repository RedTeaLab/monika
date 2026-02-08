#!/bin/bash

# Monika Deployment Script
# This script helps you deploy Monika using Docker Compose

set -e

echo "🚀 Monika Docker Deployment"
echo "=============================="

# Check if .env exists
if [ ! -f .env ]; then
    echo ""
    echo "⚙️  Setting up environment..."
    cp .env.production .env

    # Generate secure keys
    SECRET_KEY=$(openssl rand -hex 32)
    DB_PASSWORD=$(openssl rand -base64 16 | tr -d "=+/" | cut -c1-16)

    # Update .env with generated keys
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/change-this-secret-key-run-openssl-rand-hex-32/$SECRET_KEY/" .env
        sed -i '' "s/^DB_PASSWORD=.*/DB_PASSWORD=$DB_PASSWORD/" .env
    else
        # Linux
        sed -i "s/change-this-secret-key-run-openssl-rand-hex-32/$SECRET_KEY/" .env
        sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=$DB_PASSWORD/" .env
    fi

    echo "✓ Created .env with secure keys"
    echo ""
    echo "⚠️  IMPORTANT: Please update .env with your API key:"
    echo "   - OPENAI_API_KEY (required)"
    echo ""
    read -p "Press Enter after adding your OPENAI_API_KEY to .env..."
fi

# Parse command
COMMAND=${1:-"help"}

case $COMMAND in
    init)
        echo "📦 Building Docker images..."
        docker-compose build
        echo "🚀 Starting services..."
        docker-compose up -d
        echo "⏳ Waiting for services to be healthy..."
        sleep 15
        echo ""
        echo "✅ Deployment complete!"
        echo ""
        echo "📍 Access the application:"
        echo "   Frontend:     http://localhost"
        echo "   Backend API:  http://localhost:8000"
        echo "   API Docs:     http://localhost:8000/docs"
        echo ""
        echo "📊 Check status: make ps"
        echo "📋 View logs:   make logs"
        ;;

    start)
        echo "🚀 Starting services..."
        docker-compose up -d
        echo "✅ Services started"
        make ps
        ;;

    stop)
        echo "🛑 Stopping services..."
        docker-compose down
        echo "✅ Services stopped"
        ;;

    restart)
        echo "🔄 Restarting services..."
        docker-compose restart
        echo "✅ Services restarted"
        make ps
        ;;

    logs)
        docker-compose logs -f
        ;;

    status)
        make ps
        ;;

    migrate)
        echo "🗄️  Database migrations run automatically"
        echo "To manually rerun: docker-compose up -d --force-recreate migration"
        ;;

    backup)
        echo "💾 Creating backup..."
        mkdir -p backups
        FILENAME="backups/monika_$(date +%Y%m%d_%H%M%S).sql"
        docker-compose exec -T postgres pg_dump -U postgres monika > $FILENAME
        echo "✅ Backup saved: $FILENAME"
        ;;

    restore)
        if [ -z "$2" ]; then
            echo "❌ Usage: $0 restore <backup-file>"
            exit 1
        fi
        echo "🔄 Restoring from $2..."
        docker-compose exec -T postgres psql -U postgres monika < $2
        echo "✅ Restore complete"
        ;;

    clean)
        echo "🧹 Stopping and removing all containers, networks, and volumes..."
        read -p "This will delete all data. Are you sure? (yes/no): " CONFIRM
        if [ "$CONFIRM" = "yes" ]; then
            docker-compose down -v
            docker system prune -f
            echo "✅ Cleanup complete"
        else
            echo "❌ Cancelled"
        fi
        ;;

    help|*)
        echo "Usage: $0 <command>"
        echo ""
        echo "Commands:"
        echo "  init        Initialize and start all services (first time setup)"
        echo "  start       Start services"
        echo "  stop        Stop services"
        echo "  restart     Restart services"
        echo "  logs        View logs from all services"
        echo "  status      Show service status"
        echo "  backup      Backup database"
        echo "  restore     Restore database from backup"
        echo "  clean       Stop and remove all containers and volumes"
        echo "  help        Show this help message"
        echo ""
        echo "Quick start:"
        echo "  1. Edit .env and add OPENAI_API_KEY"
        echo "  2. $0 init  # First time setup"
        echo "  3. make logs # View logs"
        ;;
esac
