"""WebSocket endpoint for real-time LLM communication."""
import json
import logging
import uuid
from typing import Dict, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from src.core.database import get_db, get_db_sync
from src.services.llm.openai import OpenAIProvider
from src.services.response_parser import ResponseParser
from src.services.prompt import PromptBuilder
from src.services.state_sync import StateSyncService
from src.services.rule_search import RuleSearchService
from src.services.rule_embedding import RuleEmbeddingService
from src.models.session import GameSession
from src.models.character import Character
from src.models.event import Event


logger = logging.getLogger(__name__)

# Create router for WebSocket endpoints
websocket_router = APIRouter()


class ConnectionManager:
    """Manages active WebSocket connections for game sessions."""

    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        """Accept a WebSocket connection and track it."""
        await websocket.accept()
        self.active_connections[session_id] = websocket
        logger.info(f"WebSocket connected for session {session_id}")

    def disconnect(self, session_id: str):
        """Remove a WebSocket connection from tracking."""
        if session_id in self.active_connections:
            del self.active_connections[session_id]
            logger.info(f"WebSocket disconnected for session {session_id}")

    async def send_message(self, session_id: str, message: dict) -> bool:
        """Send a JSON message to a session.

        Returns:
            True if message was sent, False if session not connected
        """
        if session_id in self.active_connections:
            try:
                await self.active_connections[session_id].send_json(message)
                return True
            except Exception as e:
                logger.error(f"Error sending message to session {session_id}: {e}")
                # Disconnect on error
                self.disconnect(session_id)
                return False
        return False


# Global connection manager instance
manager = ConnectionManager()

# Initialize services (in production, these should be dependency injected)
# Using lazy initialization to avoid import-time errors
_llm_provider: Optional[OpenAIProvider] = None
_response_parser: Optional[ResponseParser] = None
_prompt_builder: Optional[PromptBuilder] = None


def get_llm_provider() -> OpenAIProvider:
    """Get or create LLM provider instance."""
    global _llm_provider
    if _llm_provider is None:
        _llm_provider = OpenAIProvider()
    return _llm_provider


def get_response_parser() -> ResponseParser:
    """Get or create response parser instance."""
    global _response_parser
    if _response_parser is None:
        _response_parser = ResponseParser()
    return _response_parser


def get_prompt_builder() -> PromptBuilder:
    """Get or create prompt builder instance."""
    global _prompt_builder
    if _prompt_builder is None:
        _prompt_builder = PromptBuilder()
    return _prompt_builder


@websocket_router.websocket("/game/{session_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    session_id: str,
    db: AsyncSession = Depends(get_db)
):
    """WebSocket endpoint for real-time game communication.

    Handles:
    - Connection management
    - User message reception
    - LLM streaming responses
    - State change application and broadcasting

    Message Types:
    - user_message: Player input/action
    - keeper_message: AI narrative response (streaming)
    - state_update: Game state changes
    - error: Error messages

    Args:
        websocket: WebSocket connection
        session_id: Game session UUID (as string)
        db: Database session
    """
    await manager.connect(session_id, websocket)
    state_sync = StateSyncService(db)

    try:
        # Parse session UUID
        try:
            session_uuid = uuid.UUID(session_id)
        except ValueError:
            await websocket.send_json({
                "type": "error",
                "content": "Invalid session ID format"
            })
            await websocket.close()
            return

        # Load session
        session_result = await db.execute(
            select(GameSession).where(GameSession.id == session_uuid)
        )
        session = session_result.scalar_one_or_none()

        if not session:
            await websocket.send_json({
                "type": "error",
                "content": "Session not found"
            })
            await websocket.close()
            return

        # Load character
        character_result = await db.execute(
            select(Character).where(Character.id == session.character_id)
        )
        character = character_result.scalar_one_or_none()

        if not character:
            await websocket.send_json({
                "type": "error",
                "content": "Character not found"
            })
            await websocket.close()
            return

        # Load recent events for context
        events_result = await db.execute(
            select(Event)
            .where(Event.session_id == session_uuid)
            .order_by(Event.timestamp.desc())
            .limit(10)
        )
        recent_events = [
            {"description": e.description}
            for e in events_result.scalars().all()
        ]

        # Send connection confirmation
        await manager.send_message(session_id, {
            "type": "connected",
            "content": {
                "session_id": session_id,
                "character_name": character.name
            }
        })

        # Main message loop
        while True:
            data = await websocket.receive_json()

            # Only process user_message types
            if data.get("type") != "user_message":
                continue

            user_message = data.get("content", "")
            if not user_message:
                continue

            try:
                # Build prompt with context
                prompt_builder = get_prompt_builder()
                system_prompt = await prompt_builder.build_system_prompt()
                messages = await prompt_builder.build_context_messages(
                    character=character,
                    session=session,
                    recent_events=recent_events,
                    user_message=user_message
                )

                # Get services
                llm_provider = get_llm_provider()
                response_parser = get_response_parser()

                # Send streaming start indicator
                await manager.send_message(session_id, {
                    "type": "keeper_message",
                    "content": {"narrative": "", "tone": "calm", "urgency": "low"},
                    "is_streaming": True
                })

                # Process LLM streaming response
                full_response = None
                async for llm_response in response_parser.parse_stream(
                    llm_provider.stream_chat(messages, system_prompt)
                ):
                    full_response = llm_response
                    # Send streaming update
                    await manager.send_message(session_id, {
                        "type": "keeper_message",
                        "content": {
                            "narrative": llm_response.narrative,
                            "tone": llm_response.tone,
                            "urgency": llm_response.urgency
                        },
                        "is_streaming": True
                    })

                # Send final response
                if full_response:
                    response_content = {
                        "narrative": full_response.narrative,
                        "tone": full_response.tone,
                        "urgency": full_response.urgency,
                        "suggestions": full_response.suggestions or []
                    }

                    # Process tool calls if any
                    if full_response.tool_calls:
                        tool_results = []
                        for tool_call in full_response.tool_calls:
                            if tool_call.name == "search_rules":
                                # Execute rule search
                                result = await execute_search_rules(tool_call.arguments)
                                tool_results.append({
                                    "tool": tool_call.name,
                                    "result": result
                                })
                        response_content["tool_results"] = tool_results

                    await manager.send_message(session_id, {
                        "type": "keeper_message",
                        "content": response_content,
                        "is_streaming": False
                    })

                    # Apply state changes if any


async def execute_search_rules(arguments: Dict[str, str]) -> Dict:
    """Execute search_rules tool call.

    Args:
        arguments: Tool arguments containing 'query'

    Returns:
        Search results dictionary
    """
    query = arguments.get("query", "")
    if not query:
        return {"error": "Query is required"}

    try:
        # Get synchronous database session for rule search
        db_gen = get_db_sync()
        db = next(db_gen)

        try:
            # Initialize embedding service (optional)
            embedding_service = None

            # Initialize rule search service
            search_service = RuleSearchService(db, embedding_service)

            # Perform search
            results = await search_service.search(query=query, limit=5)

            return {
                "query": query,
                "results": results,
                "total": len(results)
            }
        finally:
            db.close()

    except Exception as e:
        logger.error(f"Error executing search_rules: {e}")
        return {"error": str(e)}
                    if full_response.state_changes:
                        session = await state_sync.apply_state_changes(
                            session=session,
                            changes=full_response.state_changes,
                            source_description="AI Keeper"
                        )

                        # Send state update
                        await manager.send_message(session_id, {
                            "type": "state_update",
                            "content": {
                                "current_scene": session.current_scene,
                                "world_state": session.world_state or {}
                            }
                        })

                        # Refresh recent events after state change
                        events_result = await db.execute(
                            select(Event)
                            .where(Event.session_id == session_uuid)
                            .order_by(Event.timestamp.desc())
                            .limit(10)
                        )
                        recent_events = [
                            {"description": e.description}
                            for e in events_result.scalars().all()
                        ]

            except Exception as e:
                logger.error(f"Error processing message for session {session_id}: {e}")
                await manager.send_message(session_id, {
                    "type": "error",
                    "content": "Failed to process message"
                })

    except WebSocketDisconnect:
        manager.disconnect(session_id)
        logger.info(f"Session {session_id} disconnected normally")
    except Exception as e:
        logger.error(f"WebSocket error for session {session_id}: {e}")
        try:
            await manager.send_message(session_id, {
                "type": "error",
                "content": "An error occurred"
            })
        except Exception:
            pass  # Connection may already be closed
        manager.disconnect(session_id)
