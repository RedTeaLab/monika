#!/bin/bash
# Monika 一键开发环境启动脚本
# 用途：缓存清理 + 数据库迁移 + 前后端服务启动

set -e

# 切换到脚本目录
cd "$(dirname "$0")"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 解析参数
USE_SQLITE=false
RESET_DB=false
for arg in "$@"; do
    case $arg in
        --sqlite)
            USE_SQLITE=true
            shift
            ;;
        --reset-db)
            RESET_DB=true
            shift
            ;;
        --help)
            echo "Usage: ./start-dev.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --sqlite      使用 SQLite 数据库 (无需 Docker)"
            echo "  --reset-db    重置数据库 (删除所有数据)"
            echo ""
            echo "Examples:"
            echo "  ./start-dev.sh            # PostgreSQL (需要 Docker)"
            echo "  ./start-dev.sh --sqlite    # SQLite (保留数据)"
            echo "  ./start-dev.sh --sqlite --reset-db  # SQLite (重置数据)"
            exit 0
            ;;
    esac
done

echo "========================================="
echo "  Monika 本地开发服务器"
echo "========================================="
echo ""

if [ "$USE_SQLITE" = true ]; then
    echo -e "${YELLOW}模式: SQLite (无需 Docker)${NC}"
else
    echo -e "${YELLOW}模式: PostgreSQL (需要 Docker)${NC}"
fi
echo ""

# 1. 检查必需工具
check_required_tools() {
    echo -e "${YELLOW}检查必需工具...${NC}"
    local missing=()

    # 基础工具 (始终需要)
    for cmd in uv node npm; do
        if ! command -v $cmd &> /dev/null; then
            missing+=($cmd)
        fi
    done

    # 仅在非 SQLite 模式下检查 docker
    if [ "$USE_SQLITE" = false ]; then
        if ! command -v docker &> /dev/null; then
            missing+=(docker)
        fi
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        echo -e "${RED}缺少必需工具: ${missing[*]}${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓ 所有工具已就绪${NC}"
}

# 2. 配置 SQLite 模式
setup_sqlite_env() {
    echo -e "${YELLOW}配置 SQLite 环境...${NC}"

    cd backend

    # 确保 .env 存在
    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            cp .env.example .env
            echo -e "${YELLOW}创建 .env 从 .env.example${NC}"
        else
            echo -e "${RED}错误: .env.example 不存在${NC}"
            exit 1
        fi
    fi

    # 设置 SQLite 配置
    sed -i.bak 's/^DB_TYPE=.*/DB_TYPE=sqlite/' .env
    sed -i.bak 's/^# SQLITE_PATH=.*/SQLITE_PATH=monika.db/' .env
    sed -i.bak 's/^SQLITE_PATH=.*/SQLITE_PATH=monika.db/' .env

    # 注释掉 PostgreSQL 配置
    sed -i.bak 's/^DB_HOST=/# DB_HOST=/' .env
    sed -i.bak 's/^DB_PORT=/# DB_PORT=/' .env
    sed -i.bak 's/^DB_NAME=/# DB_NAME=/' .env
    sed -i.bak 's/^DB_USER=/# DB_USER=/' .env
    sed -i.bak 's/^DB_PASSWORD=/# DB_PASSWORD=/' .env

    rm -f .env.bak
    cd ..

    echo -e "${GREEN}✓ SQLite 配置完成${NC}"
}

# 3. 清理缓存
clear_cache() {
    echo -e "${YELLOW}清理缓存...${NC}"

    # Frontend caches
    rm -rf frontend/node_modules/.vite
    rm -rf frontend/dist
    rm -f frontend/.cache-bust

    # Backend caches
    rm -rf backend/.pytest_cache
    rm -rf backend/__pycache__
    rm -rf backend/src/__pycache__

    # SQLite database file (only if --reset-db specified)
    if [ "$USE_SQLITE" = true ] && [ "$RESET_DB" = true ]; then
        rm -f backend/monika.db
        rm -f backend/monika.db-journal
        echo -e "${YELLOW}  - 已重置 SQLite 数据库${NC}"
    fi

    # Write new cache-bust timestamp
    echo $RANDOM > frontend/.cache-bust

    echo -e "${GREEN}✓ 缓存已清理${NC}"
}

# 4. 释放端口
free_ports() {
    echo -e "${YELLOW}释放端口 8000 和 5173...${NC}"

    # Detect OS and use appropriate command
    if command -v lsof &> /dev/null; then
        # Linux/macOS: use lsof
        lsof -ti:8000 | xargs kill -9 2>/dev/null || true
        lsof -ti:5173 | xargs kill -9 2>/dev/null || true
    elif command -v netstat &> /dev/null; then
        # Windows/Cygwin: use netstat + taskkill
        # Get PID listening on port 8000
        local pid8000=$(netstat -aon | grep ":8000 " | grep "LISTENING" | awk '{print $5}' | sort -u)
        if [ -n "$pid8000" ]; then
            taskkill //F //PID $pid8000 2>/dev/null || true
        fi

        # Get PID listening on port 5173
        local pid5173=$(netstat -aon | grep ":5173 " | grep "LISTENING" | awk '{print $5}' | sort -u)
        if [ -n "$pid5173" ]; then
            taskkill //F //PID $pid5173 2>/dev/null || true
        fi
    else
        # Fallback: try using /proc (Linux) or warn user
        echo -e "${YELLOW}无法自动释放端口，请确保端口 8000 和 5173 未被占用${NC}"
    fi

    echo -e "${GREEN}✓ 端口已释放${NC}"
}

# 5. 数据库设置 (仅 PostgreSQL)
setup_database() {
    if [ "$USE_SQLITE" = true ]; then
        if [ "$RESET_DB" = true ]; then
            echo -e "${YELLOW}重置 SQLite 数据库...${NC}"
        else
            echo -e "${YELLOW}使用现有 SQLite 数据库 (如需重置请用 --reset-db)${NC}"
        fi
        return 0
    fi

    echo -e "${YELLOW}设置数据库...${NC}"

    if [ "$RESET_DB" = true ]; then
        # Stop and remove existing containers and volumes
        docker-compose down -v 2>/dev/null || true
    else
        # Just stop containers, keep volumes
        docker-compose down 2>/dev/null || true
    fi

    # Start postgres
    docker-compose up -d postgres

    # Wait for postgres to be ready
    wait_for_postgres
}

wait_for_postgres() {
    echo -e "${YELLOW}等待 PostgreSQL 启动...${NC}"

    for i in {1..30}; do
        if docker exec monika-postgres pg_isready -U postgres &> /dev/null; then
            echo -e "${GREEN}✓ PostgreSQL 就绪${NC}"
            return 0
        fi
        sleep 1
    done

    echo -e "${RED}✗ PostgreSQL 启动失败${NC}"
    exit 1
}

# 6. 数据库迁移
run_migrations() {
    echo -e "${YELLOW}运行数据库迁移...${NC}"

    cd backend
    uv run alembic upgrade head
    cd ..

    echo -e "${GREEN}✓ 迁移完成${NC}"
}

# 7. 启动后端
start_backend() {
    echo -e "${YELLOW}启动后端...${NC}"

    cd backend

    # Start in background
    nohup uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8000 \
        > ../logs/backend.log 2>&1 &

    BACKEND_PID=$!
    echo $BACKEND_PID > ../.pids

    # Wait and health check
    for i in {1..15}; do
        if curl -s http://localhost:8000/health -o /dev/null 2>&1; then
            echo -e "${GREEN}✓ 后端就绪 (PID: $BACKEND_PID)${NC}"
            cd ..
            return 0
        fi
        sleep 1
    done

    echo -e "${RED}✗ 后端启动失败${NC}"
    echo -e "${YELLOW}最近日志:${NC}"
    tail -n 20 ../logs/backend.log
    cd ..
    exit 1
}

# 8. 启动前端
start_frontend() {
    echo -e "${YELLOW}启动前端...${NC}"

    cd frontend

    # Ensure dependencies installed
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}安装依赖...${NC}"
        npm install --silent
    fi

    # Start in background
    nohup npm run dev > ../logs/frontend.log 2>&1 &

    FRONTEND_PID=$!
    echo $FRONTEND_PID >> ../.pids

    # Wait and health check
    for i in {1..20}; do
        if curl -s http://localhost:5173 -o /dev/null 2>&1; then
            echo -e "${GREEN}✓ 前端就绪 (PID: $FRONTEND_PID)${NC}"
            cd ..
            return 0
        fi
        sleep 1
    done

    echo -e "${RED}✗ 前端启动失败${NC}"
    echo -e "${YELLOW}最近日志:${NC}"
    tail -n 20 ../logs/frontend.log
    cd ..
    exit 1
}

# 9. 显示摘要
show_summary() {
    echo ""
    echo -e "${GREEN}═════════════════════════════════════${NC}"
    echo -e "${GREEN}  ✓ Monika 开发环境就绪!${NC}"
    echo -e "${GREEN}═════════════════════════════════════${NC}"
    echo ""
    echo -e "  后端:  ${GREEN}http://localhost:8000${NC}"
    echo -e "  前端: ${GREEN}http://localhost:5173${NC}"
    echo ""
    if [ "$USE_SQLITE" = true ]; then
        echo -e "${YELLOW}数据库: SQLite (backend/monika.db)${NC}"
    else
        echo -e "${YELLOW}数据库: PostgreSQL (Docker)${NC}"
    fi
    echo ""
    echo -e "${YELLOW}日志:${NC}"
    echo -e "  后端:  logs/backend.log"
    echo -e "  前端: logs/frontend.log"
    echo ""
    echo -e "${YELLOW}PID 已保存到:${NC} .pids"
    echo ""
    echo -e "${YELLOW}停止服务:${NC}"
    echo -e "  kill \$(cat .pids)"
    echo -e "  # 或运行: ./stop-dev.sh"
    echo ""
}

# 主函数
main() {
    # Create logs directory
    mkdir -p logs

    # Remove old pids file
    rm -f .pids

    # Run all steps
    check_required_tools

    if [ "$USE_SQLITE" = true ]; then
        setup_sqlite_env
    fi

    clear_cache
    free_ports
    setup_database
    run_migrations
    start_backend
    start_frontend
    show_summary
}

main "$@"
