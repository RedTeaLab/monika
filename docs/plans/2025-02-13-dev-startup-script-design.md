# 开发环境一键启动脚本设计

> **创建时间:** 2025-02-13
> **状态:** Design Complete

**目标:** 创建一键启动开发环境的脚本，包含缓存清理、数据库迁移、前后端服务启动

---

## 概述

`start-dev.sh` 是一个完全自动化的开发环境启动脚本，无需任何交互输入即可完成所有初始化工作。

**设计原则:** "每次都是干净的开始" - 确保开发环境状态可预测

---

## 执行流程

```
1. 预检查          → 检查必需工具 (docker, uv, node, npm)
2. 缓存清理        → 删除 frontend/.vite, dist, __pycache__
3. 端口释放        → 杀死占用 8000, 5173 端口的进程
4. 数据库重置      → 停止旧容器, 删除卷, 启动新 postgres
5. 数据库迁移      → alembic upgrade head
6. 启动后端        → uvicorn (后台运行, 日志到 logs/backend.log)
7. 启动前端        → vite dev server (后台运行, 日志到 logs/frontend.log)
8. 健康检查        → 验证服务响应
9. 显示摘要        → URLs, PIDs, 日志路径
```

---

## 文件结构

```
monika/
├── start-dev.sh      # 主启动脚本
├── stop-dev.sh       # 停止服务脚本
├── .pids            # 保存进程 PID (运行时生成)
└── logs/            # 日志目录 (运行时创建)
    ├── backend.log
    └── frontend.log
```

---

## 核心功能

### 1. 预检查 (check_required_tools)

检查必需的工具是否安装：

```bash
required_tools=(docker uv node npm)
for tool in "${required_tools[@]}"; do
    if ! command -v $tool &> /dev/null; then
        echo "Missing: $tool"
        exit 1
    fi
done
```

### 2. 缓存清理 (clear_cache)

```bash
# Frontend
rm -rf frontend/node_modules/.vite
rm -rf frontend/dist
rm -f frontend/.cache-bust
echo $RANDOM > frontend/.cache-bust

# Backend
rm -rf backend/.pytest_cache
rm -rf backend/**/__pycache__
```

### 3. 端口释放 (free_ports)

```bash
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
```

### 4. 数据库设置 (setup_database)

```bash
# 停止并删除旧数据
docker-compose down -v 2>/dev/null || true

# 启动新数据库
docker-compose up -d postgres

# 等待就绪
for i in {1..30}; do
    docker exec monika-postgres pg_isready -U postgres && break
    sleep 1
done
```

### 5. 数据库迁移 (run_migrations)

```bash
cd backend
uv run alembic upgrade head
cd ..
```

### 6. 后端启动 (start_backend)

```bash
cd backend
nohup uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8000 \
    > ../logs/backend.log 2>&1 &
echo $! > ../.pids

# 健康检查
for i in {1..15}; do
    curl -s http://localhost:8000/health && break
    sleep 1
done
```

### 7. 前端启动 (start_frontend)

```bash
cd frontend
[ ! -d "node_modules" ] && npm install --silent

nohup npm run dev > ../logs/frontend.log 2>&1 &
echo $! >> ../.pids

# 健康检查
for i in {1..20}; do
    curl -s http://localhost:5173 && break
    sleep 1
done
```

---

## 输出格式

```
=========================================
  Monika 本地开发服务器
=========================================

[14:30:00] Checking required tools...
[14:30:00] ✓ All tools present

[14:30:01] Clearing caches...
[14:30:01] ✓ Cache cleared

[14:30:02] Setting up fresh database...
[14:30:05] ✓ Database ready

[14:30:06] Running migrations...
[14:30:07] ✓ Migrations complete

[14:30:08] Starting backend...
[14:30:12] ✓ Backend ready (PID: 12345)

[14:30:13] Starting frontend...
[14:30:18] ✓ Frontend ready (PID: 12346)

═════════════════════════════════════
  ✓ Monika Dev Environment Ready!
═════════════════════════════════════

  Backend:  http://localhost:8000
  Frontend: http://localhost:5173

Logs:
  Backend:  logs/backend.log
  Frontend: logs/frontend.log

PIDs saved to: .pids

Stop services:
  kill $(cat .pids)
  # or run: ./stop-dev.sh
```

---

## 停止脚本 (stop-dev.sh)

```bash
#!/bin/bash
echo "Stopping Monika dev services..."

if [ -f .pids ]; then
    kill $(cat .pids) 2>/dev/null
    rm .pids
    echo "✓ Services stopped"
fi

# Fallback: kill by port
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

echo "✓ Ports freed"
```

---

## 可选参数

| 参数 | 说明 |
|------|------|
| `--keep-db` | 保留数据库数据,不执行 `docker-compose down -v` |

---

## 颜色定义

```bash
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
```

---

## 错误处理

- 任何步骤失败立即退出,显示错误信息
- 服务启动失败时显示最后 20 行日志
- PostgreSQL 启动超时 (30秒)
- 后端启动超时 (15秒)
- 前端启动超时 (20秒)

---

## 依赖

- Docker & docker-compose
- uv (Python 包管理器)
- Node.js & npm
- lsof (端口检查)

---

## 实现检查清单

- [x] 创建 `start-dev.sh` 主脚本
- [x] 创建 `stop-dev.sh` 停止脚本
- [ ] 测试完整启动流程
- [ ] 测试 `--keep-db` 参数
- [ ] 测试错误处理流程
