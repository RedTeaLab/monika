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

# Detect OS and use appropriate command
if command -v lsof &> /dev/null; then
    # Linux/macOS: use lsof
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
    lsof -ti:5173 | xargs kill -9 2>/dev/null || true
elif command -v netstat &> /dev/null; then
    # Windows/Cygwin: use netstat + taskkill
    # Match any interface listening on the port (IPv4 and IPv6)
    for port in 8000 5173; do
        # Match patterns like: 0.0.0.0:8000, 127.0.0.1:8000, [::]:8000, [::1]:8000
        pids=$(netstat -aon 2>/dev/null | grep "LISTENING" | grep -E "[:\[]*$port\b" | awk '{print $NF}' | sort -u)
        for pid in $pids; do
            if [ -n "$pid" ] && [ "$pid" != "0" ]; then
                taskkill //F //PID "$pid" 2>/dev/null && echo "  Killed PID $pid (port $port)" || true
            fi
        done
    done
fi

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
