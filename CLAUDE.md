# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Monika** is an AI-driven Call of Cthulhu 7th Edition (CoC 7e) Tabletop Role-Playing Game (TRPG) platform. It uses AI as the Keeper (KP/Game Master) to facilitate TRPG sessions with automated game mechanics including skill checks, combat, SAN checks, and chase systems.

### Architecture

**Frontend-Backend Separation:**
- **Backend**: Python 3.11+ with FastAPI, PostgreSQL, SQLAlchemy ORM
- **Frontend**: React 19 with TypeScript, Vite, shadcn/ui components, TailwindCSS
- **API Design**: RESTful endpoints + WebSocket for real-time AI interaction
- **AI Integration**: LLM abstraction layer supporting multiple providers (OpenAI, others)

### Natural Language Interaction (NLI) System

The NLI system enables natural language communication with the AI Keeper through WebSocket connections:

**Key Components:**
- **LLM Abstraction Layer** (`backend/src/services/llm/`): Provider-agnostic interface for LLM integration
- **Response Parser** (`backend/src/services/response_parser.py`): Parses streaming LLM responses into structured format
- **Prompt Builder** (`backend/src/services/prompt.py`): Builds context-aware prompts for the AI
- **State Sync Service** (`backend/src/services/state_sync.py`): Safely applies AI-generated state changes with whitelist validation
- **WebSocket Endpoint** (`backend/src/api/websocket.py`): Real-time bidirectional communication

**LLM Response Schema:**
```python
class LLMResponse(BaseModel):
    narrative: str                    # Story text shown to players
    tone: str                         # "mystery" | "horror" | "action" | "calm"
    urgency: str                      # "low" | "medium" | "high"
    state_changes: Optional[StateChanges]  # Whitelisted state updates
    suggestions: Optional[List[str]]  # Suggested player actions
    audio_cue: Optional[str]          # Sound effect suggestions
    requires_roll: bool               # Whether a skill check is suggested
```

**State Change Whitelist:**
For security and data integrity, the AI can only modify specific fields:
- `current_scene`: Scene name (string)
- `world_state`: Arbitrary key-value pairs (object)

Protected fields (AI cannot modify): `id`, `character_id`, `scenario_id`, `created_at`, `updated_at`

### Directory Structure

```
monika/
├── backend/
│   ├── src/
│   │   ├── api/               # FastAPI route handlers
│   │   │   ├── auth.py        # Authentication endpoints
│   │   │   ├── characters.py  # Character CRUD
│   │   │   ├── game.py        # Game session management
│   │   │   ├── websocket.py   # WebSocket endpoint for NLI
│   │   │   └── ...
│   │   ├── core/              # Core utilities
│   │   │   ├── auth.py        # JWT authentication
│   │   │   ├── database.py    # Database connection
│   │   │   ├── config.py      # Configuration management
│   │   │   └── security.py    # Security utilities
│   │   ├── models/            # SQLAlchemy database models
│   │   │   ├── user.py        # User model
│   │   │   ├── character.py   # Character model
│   │   │   ├── session.py     # GameSession model
│   │   │   ├── event.py       # Event model
│   │   │   └── ...
│   │   ├── schemas/           # Pydantic validation schemas
│   │   │   ├── llm_response.py # LLM response format
│   │   │   └── ...
│   │   ├── services/          # Business logic
│   │   │   ├── llm/           # LLM abstraction layer
│   │   │   │   ├── base.py    # LLMProvider interface
│   │   │   │   └── openai.py  # OpenAI implementation
│   │   │   ├── dice.py        # CoC 7e dice system
│   │   │   ├── combat.py      # Combat mechanics
│   │   │   ├── chase.py       # Chase system
│   │   │   ├── events.py      # Event system
│   │   │   ├── response_parser.py  # Parse streaming LLM responses
│   │   │   ├── prompt.py      # Prompt template engine
│   │   │   └── state_sync.py  # State synchronization service
│   │   └── tests/             # pytest test suite
│   ├── pyproject.toml         # uv package configuration
│   └── main.py               # FastAPI app entry point
├── frontend/
│   ├── src/
│   │   ├── components/        # React components
│   │   │   ├── ui/           # shadcn/ui base components
│   │   │   ├── GameConsole.tsx      # Main game interface
│   │   │   ├── MessageBubble.tsx    # Message display with streaming
│   │   │   └── ...
│   │   ├── services/          # API clients
│   │   │   ├── websocket.ts  # WebSocket client
│   │   │   └── api.ts        # REST API client
│   │   ├── hooks/             # React hooks
│   │   │   └── useGameWebSocket.ts  # WebSocket connection hook
│   │   ├── types/             # TypeScript types
│   │   │   └── websocket.ts  # WebSocket message types
│   │   ├── pages/             # Page components
│   │   └── main.tsx           # React entry point
│   ├── package.json
│   └── vite.config.ts
└── docs/                     # Comprehensive documentation
    ├── prd/                   # Product Requirements Document
    ├── guides/developer/      # Architecture, API reference, data dictionary
    ├── specs/                 # Commands, components, API, event structure
    ├── plans/                 # Implementation plans (NLI, etc.)
    └── tasks/                 # Milestone breakdown (M0-M6)
```

## Development Commands

### Backend

```bash
cd backend

# Install dependencies (uses uv package manager)
uv sync

# Run development server (auto-reload on port 8000)
uv run python -m uvicorn src.main:app --reload

# Run all tests
uv run pytest

# Run specific test file
uv run pytest src/tests/test_dice.py

# Run tests with coverage
uv run pytest --cov=src

# Run NLI system tests
uv run pytest src/tests/test_nli_e2e.py

# Code formatting
uv run black src/

# Linting
uv run ruff check src/
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run development server (Vite dev server on port 5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking
npx tsc --noEmit
```

## Core Game Mechanics

### CoC 7e Dice System (`backend/src/services/dice.py`)

- **Success Levels**: Regular, Hard, Extreme success thresholds based on skill/5 and skill/2
- **Bonus/Penalty Dice**: Roll multiple d100, take lowest (bonus) or highest (penalty)
- **Criticals**: Natural 1 is critical success, natural 100 is critical failure (or >96 for low skills)
- **Pushing**: Failed rolls can be re-rolled with narrative consequences
- **Luck Points**: Can be spent to improve rolls

### Combat System (`backend/src/services/combat.py`)

Turn-based combat with:
- Initiative order (DEX-based)
- Attack rolls vs opponent's dodge
- Damage rolls with weapon damage dice
- Critical hits and fumbles
- Dying and death mechanics at 0 HP

### Chase System (`backend/src/services/chase.py`)

Distance-based chase mechanics:
- Action points per round (based on movement rate)
- Obstacles that require skill checks
- Automatic failure at high pressure levels
- Distance tracking between pursuer and quarry

### Event System (`backend/src/services/events.py`)

Event-driven state changes with:
- Visibility levels (public, kp_only, private)
- State change tracking (character, session, world)
- SAN loss events with breakdown thresholds

## NLI System Architecture

### LLM Provider Interface

The LLM abstraction layer allows easy swapping of LLM providers:

```python
class LLMProvider(ABC):
    @abstractmethod
    async def stream_chat(
        self,
        messages: list[dict],
        system_prompt: str
    ) -> AsyncIterator[str]:
        """Stream chat responses as JSON chunks"""
        pass

    @abstractmethod
    async def get_context_limit(self) -> int:
        """Return maximum context length"""
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """Check provider health"""
        pass
```

**Current Implementation:**
- `OpenAIProvider`: Supports GPT-4o and GPT-4o-mini models

**Adding New Providers:**
1. Create new file in `backend/src/services/llm/`
2. Implement `LLMProvider` interface
3. Add provider selection logic in factory

### Response Parsing

The `ResponseParser` handles streaming LLM responses:

1. Buffers incoming chunks
2. Extracts complete JSON objects
3. Validates against `LLMResponse` schema
4. Falls back to plain text if JSON parsing fails
5. Yields structured responses for WebSocket broadcast

### Prompt Building

The `PromptBuilder` constructs context-aware prompts:

- **System Prompt**: Defines AI role as CoC Keeper
- **Context Messages**: Include character state, recent events, current scene
- **User Message**: Player's current input
- **Response Format**: Instructs AI to return structured JSON

### State Synchronization

The `StateSyncService` ensures safe state updates:

1. Validates state changes against whitelist
2. Creates Event records for tracking
3. Updates database models
4. Returns updated session for WebSocket broadcast

**Whitelisted Fields:**
```python
ALLOWED_FIELDS = {
    "current_scene": str,
    "world_state": dict
}
```

## WebSocket Communication

### Connection Flow

```
Client                    Server
  |                         |
  |---> CONNECT ws://... ---|
  |                         |
  |<---- connected ---------|
  |                         |
  |---> user_message ------>|
  |                         |
  |<---- keeper_message ----| (streaming, multiple)
  |<---- keeper_message ----|
  |<---- keeper_message ----|
  |                         |
  |<---- state_update ------| (if state changed)
  |                         |
  |---> user_message ------>|
  ...                       ...
```

### Message Types

**Client → Server:**
- `user_message`: Player's natural language input

**Server → Client:**
- `connected`: Connection confirmation
- `keeper_message`: AI narrative response (streaming)
- `state_update`: Game state changes
- `error`: Error messages

See `docs/specs/api.md` for detailed message formats.

## Database Models

Key models in `backend/src/models/`:
- **User**: Authentication and profile
- **Character**: PC stats, skills, SAN, HP, MP
- **GameSession**: Session state, scene tracking, world state
- **Event**: Event log with visibility and state changes
- **Combat**: Combat encounters with participants and rounds
- **Chase**: Chase sequences with movement and obstacles

Database uses SQLAlchemy ORM with Alembic migrations.

## API Structure

All API routes are registered in `backend/src/main.py`:

**REST Endpoints:**
- `/auth/*` - Authentication (register, login, token refresh)
- `/characters/*` - Character CRUD operations
- `/game/*` - Game session management
- `/combat/*` - Combat system endpoints
- `/chase/*` - Chase system endpoints
- `/sessions/*` - Session management

**WebSocket Endpoints:**
- `/ws/game/{session_id}` - Real-time AI Keeper communication

CORS is configured for `http://localhost:5173` and `http://localhost:3000`.

## Frontend Components

Key components in `frontend/src/components/`:
- **GameConsole**: Main game interface with message display and controls
- **CharacterForm**: Character creation/editing
- **StatePanel**: Displays character stats, world state, and leads
- **MessageList**: Chat-like message interface with streaming support
- **MessageBubble**: Individual message display with typing indicators
- **DiceRoll**: Interactive dice rolling
- **TabView**: Tab navigation for tablet layout
- **BottomTabBar**: Bottom navigation with 56px touch targets
- **MobileFooter**: Observer mode prompt for mobile

Uses shadcn/ui base components with TailwindCSS styling.

## Frontend Hooks

### useGameWebSocket

React hook for WebSocket connection management:

```typescript
const { isConnected, error, sendMessage, disconnect, reconnect } =
  useGameWebSocket(sessionId, {
    onMessage: (message) => console.log(message),
    onStateUpdate: (update) => console.log(update)
  });
```

**Features:**
- Auto-connect on sessionId change
- Auto-reconnect on disconnect
- Message buffering while disconnected
- Error handling and recovery

### Responsive Layout Hooks

#### useBreakpoint

Custom hook for breakpoint detection:

```typescript
const breakpoint = useBreakpoint();
// Returns: 'mobile' | 'tablet' | 'desktop'
```

**Features:**
- Mobile: < 768px
- Tablet: 768px - 1023px
- Desktop: ≥ 1024px
- Reactive to window resize

#### useTouchOptimizer

Touch optimization and haptic feedback:

```typescript
const { optimizeTouch, triggerHaptic } = useTouchOptimizer();
```

**Features:**
- Prevents zoom on double-tap
- Prevents context menu on long-press
- Triggers haptic feedback (vibration)
- iOS/Android safe area handling

#### useGestures

Gesture handling with @use-gesture/react:

```typescript
const bind = useGestures({
  onSwipeLeft: () => console.log('swiped left'),
  onSwipeRight: () => console.log('swiped right'),
  onPullToRefresh: () => console.log('refresh')
});
```

**Features:**
- Swipe left/right detection
- Pull-to-refresh support
- Configurable gesture thresholds
- Touch-friendly interaction

## Testing Strategy

### Backend Tests

- **Framework**: pytest with SQLite in-memory database
- **Fixtures**: `client` (TestClient), `test_db` (database session) in `conftest.py`
- **Test Mode**: `asyncio_mode = "auto"` for async test support
- **Coverage**: Integration tests for API endpoints, unit tests for services

**NLI System Tests:**
- `test_nli_e2e.py`: End-to-end WebSocket + LLM integration tests
- Tests streaming responses, state updates, error handling

### Frontend Tests

(To be implemented with React Testing Library)

## Configuration

Backend configuration via environment variables or `.env` file:

**Database:**
- `DATABASE_URL`: PostgreSQL connection string

**JWT:**
- `SECRET_KEY`: JWT signing key
- `ALGORITHM`: JWT algorithm (default: HS256)
- `ACCESS_TOKEN_EXPIRE_MINUTES`: Token expiry (default: 30)

**LLM:**
- `LLM_PROVIDER`: Provider name (default: "openai")
- `OPENAI_API_KEY`: OpenAI API key
- `OPENAI_MODEL`: Model name (default: "gpt-4o-mini")
- `OPENAI_BASE_URL`: Optional base URL for custom endpoints

**Debug:**
- `DEBUG`: Debug mode flag
- `LOG_LEVEL`: Logging level (default: "INFO")

See `backend/src/core/config.py` for defaults.

## Environment Setup

### Development Environment

1. **Clone and setup worktree:**
```bash
cd /path/to/monika
git worktree add d:/git/monika-nli -b feature/nli
cd d:/git/monika-nli
```

2. **Backend setup:**
```bash
cd backend
cp .env.example .env
# Edit .env with your configuration
uv sync
```

3. **Frontend setup:**
```bash
cd frontend
npm install
```

4. **Run development servers:**
```bash
# Terminal 1: Backend
cd backend
uv run python -m uvicorn src.main:app --reload

# Terminal 2: Frontend
cd frontend
npm run dev
```

### Production Environment

For production deployment:
- Use PostgreSQL for database (not SQLite)
- Set strong `SECRET_KEY` for JWT
- Configure proper CORS origins
- Enable HTTPS/WSS for WebSocket connections
- Set `DEBUG=false`
- Use production-grade LLM API keys

## Task-Driven Development Workflow

This project follows a **strict task-driven development process**. All development work must be tracked and completed according to the task system in `docs/tasks/`.

### Task Structure

Tasks are organized hierarchically:
- **Milestone**: M0-M6 (e.g., M1 = Single-Player Web Version)
- **Feature Task**: NLI-01 to NLI-10 (Natural Language Interaction)
- **Main Task**: M{XX}-{NNN} (e.g., M1-006 = User Authentication API)
- **Subtask**: M{XX}-{NNN}-{NN} (e.g., M1-006-01 = Create user.py model)

Task files are located in `docs/tasks/tasks-detailed/` (e.g., `M1-006-user-auth.md`).

Implementation plans are in `docs/plans/` (e.g., `2025-01-15-natural-language-interaction-implementation.md`).

### Task Status Convention

Task status is marked using markdown checkboxes in task files:

| Status | Checkbox | Meaning |
|--------|-----------|---------|
| Not Started | `[ ]` | Task not yet started |
| In Progress | `[~]` | Task currently being worked on |
| Completed | `[x]` | Task completed and verified |

Example:
```markdown
| NLI-01 | [x] Implement LLM abstraction layer | [x] |
| NLI-02 | [ ] Create response parser | [ ] |
| NLI-03 | [~] Build prompt templates | [~] |
```

### Mandatory Development Workflow

**Before starting any development work:**

1. **Read the task file** - Each detailed task file in `docs/tasks/tasks-detailed/` or implementation plan in `docs/plans/` contains:
   - Subtask breakdown with time estimates
   - Code examples and templates
   - Test case requirements
   - File locations and structure
   - Acceptance criteria

2. **Check dependencies** - Each task lists dependencies (e.g., "Depends: NLI-01"). Ensure dependent tasks are completed first.

3. **Mark task as in-progress** - Change the task checkbox from `[ ]` to `[~]` before starting work.

**During development:**

4. **Follow the subtask breakdown** - Complete subtasks in the order specified in the task file. Each subtask has:
   - Specific file to create/modify
   - Code to implement
   - Time estimate

5. **Write tests first (TDD)** - The project uses Test-Driven Development. Write test cases before implementing functionality.

6. **Run tests frequently** - After each subtask, run relevant tests to ensure nothing breaks.

**After completing development:**

7. **Verify acceptance criteria** - Each task file lists acceptance criteria. Ensure all are met before marking complete.

8. **Run full test suite** - Execute `uv run pytest` (backend) or `npm test` (frontend) to ensure no regressions.

9. **Update task status** - Change the task checkbox from `[~]` to `[x]` for:
   - The subtask(s) you completed
   - The parent task (when all subtasks are done)

10. **Commit with task reference** - Include task ID in commit messages:
    ```
    git commit -m "feat(NLI-01): implement LLM abstraction layer"
    ```

### Finding Tasks

- **Implementation plans**: `docs/plans/` - Feature-level breakdown (e.g., NLI system)
- **Milestone overview**: `docs/tasks/02-m1-single-player-web.md` - Shows all tasks for current milestone with status
- **Task index**: `docs/tasks/tasks-detailed/INDEX.md` - Complete index of all detailed tasks
- **Detailed task**: `docs/tasks/tasks-detailed/M{XX}-{NNN}-{name}.md` - Full task breakdown

### Example Workflow

```bash
# 1. Find the next task to work on
cat docs/plans/2025-01-15-natural-language-interaction-implementation.md

# 2. Mark task as in-progress
# Edit the plan file: change [ ] to [~] for the task

# 3. Implement according to subtasks
# Follow NLI-01, NLI-02, etc. in order

# 4. Run tests
cd backend && uv run pytest

# 5. Mark task as complete
# Edit the plan file: change [~] to [x] for all completed tasks

# 6. Commit changes
git add .
git commit -m "feat(NLI-01): implement LLM abstraction layer"
```

### Current Feature Progress

For NLI system progress, check `docs/plans/2025-01-15-natural-language-interaction-implementation.md`.

For milestone progress, check `docs/tasks/02-m1-single-player-web.md`.

### Important Rules

- **NEVER skip tasks** - Complete tasks in dependency order
- **ALWAYS mark status** - Keep task checkboxes up-to-date
- **READ task files first** - Each file contains crucial implementation details
- **Follow TDD** - Write tests before implementation
- **Reference task IDs in commits** - Enables traceability

## Documentation

Comprehensive documentation in `docs/`:
- `docs/prd/` - Product Requirements Document
- `docs/guides/developer/` - Architecture, API reference, data dictionary
- `docs/specs/` - Commands, components, API, event structure, state structure
- `docs/plans/` - Implementation plans for features (NLI, etc.)
- `docs/tasks/` - Milestone breakdown (M0-M6) and task tracking

**Key Documentation Files:**
- `docs/specs/api.md` - Complete REST and WebSocket API reference
- `docs/specs/commands.md` - Game command reference
- `docs/specs/components.md` - Frontend component catalog
- `docs/specs/state-structure.md` - Game state schema
- `docs/specs/event-structure.md` - Event system schema

Current milestone: **M1 - Single-Player Web Version** (in progress)
Current feature: **NLI - Natural Language Interaction** (in progress)

## Game Commands Reference

The platform uses a slash-command system (see `docs/specs/commands.md`):
- `/help [command]` - Display help
- `/status` - Show current state
- `/roll <skill>` - Skill/attribute check
- `/push` - Re-roll failed check
- `/luck [n]` - Spend luck points
- `/combat start/action/end` - Combat commands
- `/san check <value>` - SAN check
- `/leads` - Show available actions
- `/rule <query>` - Rules Q&A

**Note:** With the NLI system, players can also use natural language instead of commands. The AI Keeper will interpret intent and execute appropriate game mechanics.

## Troubleshooting

### Common Issues

**WebSocket Connection Fails:**
1. Check if session ID is valid UUID format
2. Verify session exists in database
3. Ensure character exists for session
4. Check backend logs for errors

**LLM Provider Errors:**
1. Verify `OPENAI_API_KEY` is set in `.env`
2. Check API key has sufficient credits
3. Test API key with `curl` or OpenAI CLI
4. Check `OPENAI_BASE_URL` if using custom endpoint

**State Changes Not Persisting:**
1. Check if field is in whitelist (only `current_scene` and `world_state` allowed)
2. Verify database transaction committed
3. Check backend logs for state sync errors

**Streaming Response Issues:**
1. Check browser console for WebSocket errors
2. Verify message format matches schema
3. Test with simpler prompts to isolate issue
4. Check LLM provider response format

### Debug Mode

Enable debug logging in `.env`:
```
DEBUG=true
LOG_LEVEL=DEBUG
```

This will log:
- WebSocket connection lifecycle
- LLM request/response payloads
- State sync operations
- Database queries

## Contributing

When contributing to Monika:

1. **Follow the task-driven workflow** - Always work from documented tasks
2. **Write tests first** - Maintain high test coverage
3. **Document changes** - Update relevant documentation
4. **Follow code style** - Use black (Python) and ESLint (TypeScript)
5. **Commit messages** - Use conventional commits with task references

Example commit messages:
```
feat(NLI-02): add response parser for streaming LLM responses
fix(M1-006): resolve JWT token expiration issue
docs(NLI-10): update API documentation with WebSocket endpoints
```

## License

This project is licensed under the MIT License. See LICENSE file for details.

## Support

For questions or issues:
1. Check documentation in `docs/`
2. Review test files for usage examples
3. Check GitHub issues
4. Contact development team

---

**Last Updated:** 2025-01-15
**Current Version:** 0.1.0 (NLI implementation in progress)
