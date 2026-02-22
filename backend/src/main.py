from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer

from src.api.auth import router as auth_router
from src.api.characters import router as characters_router
from src.api.occupations import router as occupations_router
from src.api.game import router as game_router
from src.api.combat import router as combat_router
from src.api.combat_extended import router as combat_extended_router
from src.api.chase import router as chase_router
from src.api.sessions import router as sessions_router
from src.api.websocket import websocket_router
from src.api.rules import router as rules_router
from src.api.events import router as events_router
from src.api.skills import router as skills_router
from src.api.campaigns import router as campaigns_router
from src.api.spotlight import router as spotlight_router
from src.api.messages import router as messages_router
from src.api.queue import router as queue_router
from src.api.checkpoints import router as checkpoints_router
from src.api.leads import router as leads_router
from src.api.scripts import router as scripts_router
from src.api.summaries import router as summaries_router
from src.api.search import router as search_router
from src.api.san import router as san_router
from src.api.madness import router as madness_router
from src.api.growth import router as growth_router
from src.models.occupation import Occupation
from src.services.socketio_service import sio, socketio_app, get_socketio_stats

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

app = FastAPI(
    title="Monika API",
    description="AI-driven CoC 7e TRPG Platform",
    version="0.1.0",
)

# CORS - Allow multiple Vite ports for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "*",  # Fallback for other ports
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers with /api prefix for frontend proxy compatibility
app.include_router(auth_router, prefix="/api")
app.include_router(auth_router)  # For test compatibility - routes at /auth/*
app.include_router(characters_router, prefix="/api")
app.include_router(occupations_router, prefix="/api", tags=["occupations"])  # 添加 tags
app.include_router(game_router, prefix="/api")
app.include_router(combat_router, prefix="/api")
app.include_router(combat_extended_router, prefix="/api")
app.include_router(chase_router, prefix="/api")
app.include_router(sessions_router, prefix="/api")
app.include_router(rules_router, prefix="/api")
app.include_router(events_router, prefix="/api")
app.include_router(events_router)  # For test compatibility - routes at /events/*
app.include_router(skills_router, prefix="/api", tags=["skills"])
app.include_router(campaigns_router, prefix="/api")
app.include_router(spotlight_router, prefix="/api")
app.include_router(messages_router, prefix="/api")
app.include_router(queue_router, prefix="/api")
app.include_router(checkpoints_router, prefix="/api")
app.include_router(leads_router, prefix="/api")
app.include_router(scripts_router, prefix="/api")
app.include_router(summaries_router, prefix="/api")
app.include_router(search_router, prefix="/api")
app.include_router(san_router, prefix="/api/game")
app.include_router(madness_router, prefix="/api/game")
app.include_router(growth_router, prefix="/api/game")
app.include_router(websocket_router, prefix="/ws", tags=["WebSocket"])

# Mount Socket.io server at /socket.io path
app.mount("/socket.io", socketio_app)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/health/socketio")
async def socketio_health():
    """Get Socket.io server statistics for health monitoring."""
    return await get_socketio_stats()


@app.get("/")
async def root():
    return {"message": "Monika API"}
