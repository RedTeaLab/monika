# Monika - Windows Development Setup

Quick setup guide for Windows local development.

## Prerequisites

- Python 3.11+
- Node.js 18+
- [uv](https://github.com/astral-sh/uv) Python package manager
- Git

## Quick Start (SQLite - No Docker)

1. **Clone repository**
   ```cmd
   cd d:\git\monika
   ```

2. **Install dependencies**
   ```cmd
   # Backend
   cd backend
   uv sync
   cd ..

   # Frontend
   cd frontend
   npm install
   cd ..
   ```

3. **Configure environment**
   ```cmd
   # Copy example env file
   copy backend\.env.example backend\.env

   # Edit backend\.env and add your OPENAI_API_KEY
   notepad backend\.env
   ```

4. **Run development server**
   ```cmd
   start-dev.bat
   ```

5. **Select option 1** - Start all services

6. **Open browser**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

## Script Options

| Option | Action |
|--------|--------|
| [1] | Start all services (Frontend + Backend) |
| [2] | Start backend only |
| [3] | Start frontend only |
| [4] | Run database migration |
| [5] | Reset SQLite database (delete & recreate) |
| [6] | Check service status |
| [7] | View logs |
| [8] | Stop all services |
| [M] | Switch database mode (SQLite/PostgreSQL) |
| [0] | Exit |

## Troubleshooting

### Backend won't start

```cmd
# Check the log
type backend.log

# Common issues:
# 1. Missing dependencies
cd backend
uv sync

# 2. Missing .env file
copy .env.example .env

# 3. Port already in use
netstat -ano | findstr ":8000"
taskkill /pid <PID> /f
```

### Frontend won't start

```cmd
# Check the log
type frontend.log

# Common issues:
# 1. Missing node_modules
cd frontend
npm install

# 2. Port already in use
netstat -ano | findstr ":5173"
taskkill /pid <PID> /f
```

### Database issues

```cmd
# Reset SQLite database
start-dev.bat
# Select option [5] - Reset database
# Type YES to confirm

# Run migration manually
cd backend
set DB_TYPE=sqlite
uv run alembic upgrade head
```

## Switching to PostgreSQL

If you want to use PostgreSQL with Docker:

1. Start Docker Desktop
2. Run `start-dev.bat`
3. Select option [M] - Switch database mode
4. Choose PostgreSQL
5. Restart script and select option [1]

## File Structure After Setup

```
monika/
├── start-dev.bat          # Windows startup script
├── backend/
│   ├── .env              # Backend configuration
│   ├── monika.db         # SQLite database (created automatically)
│   └── backend.log       # Backend log file
├── frontend/
│   └── frontend.log      # Frontend log file
└── README.dev.md         # This file
```

## Development Tips

- Logs are written to `backend.log` and `frontend.log`
- Use option [7] to view logs from the script
- SQLite database file: `monika.db` in project root
- Backend runs on port 8000
- Frontend runs on port 5173

## Stopping Services

Run `start-dev.bat` and select option [8] to stop all background services.

Or manually:
```cmd
taskkill /f /im python.exe
taskkill /f /im node.exe
```
