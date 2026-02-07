from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer

from src.api.auth import router as auth_router
from src.api.characters import router as characters_router
from src.api.game import router as game_router
from src.api.combat import router as combat_router
from src.api.chase import router as chase_router
from src.api.sessions import router as sessions_router
from src.api.websocket import websocket_router
from src.api.rules import router as rules_router

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

app = FastAPI(
    title="Monika API",
    description="AI-driven CoC 7e TRPG Platform",
    version="0.1.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(characters_router)
app.include_router(game_router)
app.include_router(combat_router)
app.include_router(chase_router)
app.include_router(sessions_router)
app.include_router(rules_router)
app.include_router(websocket_router, prefix="/ws", tags=["WebSocket"])


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/")
async def root():
    return {"message": "Monika API"}
