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
KEEP_DB=false
for arg in "$@"; do
    case $arg in
        --keep-db)
            KEEP_DB=true
            shift
            ;;
        --help)
            echo "Usage: ./start-dev.sh [--keep-db]"
            echo ""
            echo "Options:"
            echo "  --keep-db    保留数据库数据,不删除卷"
            exit 0
            ;;
    esac
done

echo "========================================="
echo "  Monika 本地开发服务器"
echo "========================================="
echo ""

# 1. 检查必需工具
check_required_tools() {
    echo -e "${YELLOW}检查必需工具...${NC}"
    local missing=()

    for cmd in docker uv node npm; do
        if ! command -v $cmd &> /dev/null; then
            missing+=($cmd)
        fi
    done

    if [ ${#missing[@]} -gt 0 ]; then
        echo -e "${RED}缺少必需工具: ${missing[*]}${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓ 所有工具已就绪${NC}"
}

# 2. 清理缓存
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

    # Write new cache-bust timestamp
    echo $RANDOM > frontend/.cache-bust

    echo -e "${GREEN}✓ 缓存已清理${NC}"
}

# 3. 释放端口
free_ports() {
    echo -e "${YELLOW}释放端口 8000 和 5173...${NC}"

    # Kill processes on port 8000
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true

    # Kill processes on port 5173
    lsof -ti:5173 | xargs kill -9 2>/dev/null || true

    echo -e "${GREEN}✓ 端口已释放${NC}"
}

# 4. 数据库设置
setup_database() {
    echo -e "${YELLOW}设置数据库...${NC}"

    if [ "$KEEP_DB" = false ]; then
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

# 5. 数据库迁移
run_migrations() {
    echo -e "${YELLOW}运行数据库迁移...${NC}"

    cd backend
    uv run alembic upgrade head
    cd ..

    echo -e "${GREEN}✓ 迁移完成${NC}"
}

# 6. 启动后端
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

# 7. 启动前端
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

# 8. 显示摘要
show_summary() {
    echo ""
    echo -e "${GREEN}═════════════════════════════════════${NC}"
    echo -e "${GREEN}  ✓ Monika 开发环境就绪!${NC}"
    echo -e "${GREEN}═════════════════════════════════════${NC}"
    echo ""
    echo -e "  后端:  ${GREEN}http://localhost:8000${NC}"
    echo -e "  前端: ${GREEN}http://localhost:5173${NC}"
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
    clear_cache
    free_ports
    setup_database
    run_migrations
    start_backend
    start_frontend
    show_summary
}

main "$@"
