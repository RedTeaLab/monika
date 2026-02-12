#!/bin/bash
# Monika 开发服务停止脚本

# 切换到脚本目录
cd "$(dirname "$0")"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "停止 Monika 开发服务..."
echo ""

# Kill processes from .pids file
if [ -f .pids ]; then
    echo -e "${YELLOW}停止已记录的进程...${NC}"
    kill $(cat .pids) 2>/dev/null && echo -e "${GREEN}✓ 进程已停止${NC}" || true
    rm .pids
else
    echo -e "${YELLOW}未找到 .pids 文件${NC}"
fi

# Fallback: kill by port
echo -e "${YELLOW}释放端口...${NC}"
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

echo -e "${GREEN}✓ 端口已释放${NC}"

# Optional: stop database
echo ""
read -p "是否停止数据库? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker-compose down
    echo -e "${GREEN}✓ 数据库已停止${NC}"
fi

echo ""
echo -e "${GREEN}✓ 所有服务已停止${NC}"
