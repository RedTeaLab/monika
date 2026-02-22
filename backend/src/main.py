from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer

from src.api.auth import router as auth_router
from src.api.characters import router as characters_router
from src.api.occupations import router as occupations_router  # 新增公开职业路由
from src.api.game import router as game_router
from src.api.combat import router as combat_router
from src.api.chase import router as chase_router
from src.api.sessions import router as sessions_router
from src.api.websocket import websocket_router
from src.api.rules import router as rules_router
from src.api.events import router as events_router
from src.api.skills import router as skills_router
from src.models.occupation import Occupation  # 新增

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
app.include_router(characters_router, prefix="/api")
app.include_router(occupations_router, prefix="/api", tags=["occupations"])  # 添加 tags
app.include_router(game_router, prefix="/api")
app.include_router(combat_router, prefix="/api")
app.include_router(chase_router, prefix="/api")
app.include_router(sessions_router, prefix="/api")
app.include_router(rules_router, prefix="/api")
app.include_router(events_router, prefix="/api")
app.include_router(skills_router, prefix="/api", tags=["skills"])
app.include_router(websocket_router, prefix="/ws", tags=["WebSocket"])


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/")
async def root():
    return {"message": "Monika API"}
