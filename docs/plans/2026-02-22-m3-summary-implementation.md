# M3 Summary System Implementation Plan

**Date**: 2026-02-22
**Milestone**: M3 - Memory Web
**Component**: Summary System (M3-014 to M3-021)
**Owner**: summary-dev

---

## Overview

This document outlines the implementation plan for the summary system, which provides structured summaries of game sessions including narrative summaries, key events, state changes, and statistics.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Summary System Architecture              │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │   Events    │───▶│   Summary    │───▶│   Storage    │   │
│  │   Service   │    │   Generator  │    │   Service    │   │
│  └─────────────┘    └──────────────┘    └──────────────┘   │
│         │                   │                    │          │
│         v                   v                    v          │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │  Database   │    │   LLM /      │    │   Database   │   │
│  │  (Events)   │    │   Template   │    │ (Summaries)  │   │
│  └─────────────┘    └──────────────┘    └──────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Task Breakdown

### M3-014: Design Summary Data Structure ✅ (Completed)

**Status**: Design completed
**Files Created**:
- `backend/src/schemas/summary.py` - Complete Pydantic schemas
- `backend/src/tests/test_summary.py` - Test structure

**Key Components**:
- `SessionSummary` - Main summary structure
- `KeyEvent` - Important events to highlight
- `CharacterStateChange` - Track character changes
- `Discovery` - Track discoveries (clues, info, etc.)
- `Consequence` - Track consequences of actions
- `CheckpointSummary` - Checkpoint summaries
- `SceneSummary` - Scene-specific summaries

---

### M3-015: Implement Checkpoint Summary Generator

**Dependencies**: M3-014 ✅

**Objective**: Generate summaries at checkpoint points (manual, auto, scene changes, etc.)

**Implementation Approach**:

1. **Create `backend/src/services/summary.py`**
   ```python
   class SummaryGenerator:
       def __init__(self, db: Session, llm_service: Optional[LLMService] = None):
           self.db = db
           self.llm = llm_service
           self.event_logger = EventLogger(db)

       async def generate_checkpoint_summary(
           self,
           session_id: uuid.UUID,
           checkpoint_type: CheckpointType,
           events_since_checkpoint: List[Event]
       ) -> CheckpointSummary:
           """Generate summary at checkpoint."""
           pass
   ```

2. **Key Features**:
   - Extract events since last checkpoint
   - Generate brief narrative
   - Capture current character states
   - Store world state snapshot

3. **Test Coverage**:
   - Generate after various event types
   - Test with different checkpoint types
   - Verify state capture accuracy

---

### M3-016: Implement Scene Summary Generator

**Dependencies**: M3-015

**Objective**: Generate summaries for individual scenes

**Implementation Approach**:

1. **Extend `SummaryGenerator`**
   ```python
   async def generate_scene_summary(
       self,
       session_id: uuid.UUID,
       scene_id: str,
       scene_start: datetime,
       scene_end: Optional[datetime] = None
   ) -> SceneSummary:
       """Generate summary for a specific scene."""
       pass
   ```

2. **Key Features**:
   - Filter events by scene
   - Identify scene participants
   - Extract scene-specific key events
   - Generate scene narrative

3. **Test Coverage**:
   - Single scene summary
   - Multiple scenes in session
   - Scene transitions

---

### M3-017: Implement Session Summary Generator

**Dependencies**: M3-016

**Objective**: Generate comprehensive session summaries

**Implementation Approach**:

1. **Extend `SummaryGenerator`**
   ```python
   async def generate_session_summary(
       self,
       session_id: uuid.UUID,
       start_time: Optional[datetime] = None,
       end_time: Optional[datetime] = None,
       use_llm: bool = True
   ) -> SessionSummary:
       """Generate comprehensive session summary."""
       pass
   ```

2. **Key Features**:
   - Aggregate all session events
   - Generate narrative summary (LLM or template)
   - Extract all key events
   - Calculate state changes
   - Compile statistics
   - Handle visibility

3. **Test Coverage**:
   - Full session summary
   - Partial time range summary
   - LLM vs template generation
   - Visibility filtering

---

### M3-018: Implement Key Event Extraction

**Dependencies**: M3-017

**Objective**: Identify and extract key events from session

**Implementation Approach**:

1. **Create key event extractor**
   ```python
   class KeyEventExtractor:
       def extract_key_events(
           self,
           events: List[Event]
       ) -> List[KeyEvent]:
           """Extract key events from event log."""
           pass

       def _is_key_event(self, event: Event) -> bool:
           """Determine if event is significant."""
           pass
   ```

2. **Key Event Detection Rules**:
   - Clue discoveries
   - Combat (start/end/deaths)
   - SAN failures
   - Madness triggers
   - Character deaths
   - Scene transitions

3. **Test Coverage**:
   - Detection accuracy
   - Priority ranking
   - Participant extraction

---

### M3-019: Implement Summary Write

**Dependencies**: M3-018

**Objective**: Persist summaries to database

**Implementation Approach**:

1. **Create database model** (pending database tasks)
   ```python
   # backend/src/models/summary.py
   class Summary(Base):
       __tablename__ = "summaries"

       id = Column(UUID(as_uuid=True), primary_key=True)
       session_id = Column(UUID(as_uuid=True), ForeignKey("game_sessions.id"))
       summary_type = Column(String(50))  # checkpoint, scene, session
       content = Column(JSON)
       created_at = Column(DateTime(timezone=True))
   ```

2. **Create storage service**
   ```python
   class SummaryStorage:
       def save_summary(self, summary: SessionSummary) -> Summary:
           """Save summary to database."""
           pass
   ```

3. **Test Coverage**:
   - Save all summary types
   - Update existing summaries
   - Transaction handling

---

### M3-020: Implement Summary Update

**Dependencies**: M3-019

**Objective**: Update existing summaries with new events

**Implementation Approach**:

1. **Extend `SummaryStorage`**
   ```python
   def update_summary(
       self,
       summary_id: uuid.UUID,
       new_events: List[Event]
   ) -> SessionSummary:
       """Update summary with new events."""
       pass
   ```

2. **Update Strategy**:
   - Append new events
   - Regenerate affected sections
   - Update statistics
   - Merge state changes

3. **Test Coverage**:
   - Incremental updates
   - Full regeneration option
   - Conflict resolution

---

### M3-021: Implement Summary Query API

**Dependencies**: M3-019

**Objective**: Create API endpoints for summary queries

**Implementation Approach**:

1. **Create API endpoints**
   ```python
   # backend/src/api/summaries.py
   router = APIRouter(prefix="/summaries", tags=["summaries"])

   @router.get("/{summary_id}")
   async def get_summary(summary_id: uuid.UUID):
       """Get summary by ID."""
       pass

   @router.get("/session/{session_id}")
   async def get_session_summaries(session_id: uuid.UUID):
       """Get all summaries for a session."""
       pass

   @router.post("/generate")
   async def generate_summary(request: SummaryGenerationRequest):
       """Generate a new summary."""
       pass
   ```

2. **Key Features**:
   - Get by ID
   - Query by session
   - Query by campaign
   - Generate on-demand
   - Pagination

3. **Test Coverage**:
   - All endpoints
   - Pagination
   - Filtering
   - Error handling

---

## Database Schema (Pending M3-001 to M3-005)

The following tables need to be created by database tasks:

1. **summaries** - Store all summary types
2. **checkpoints** - Store checkpoint data
3. **state_snapshots** - Store state snapshots (M3-022)

---

## LLM Integration (Optional)

The summary system can use LLM for narrative generation:

```python
class LLMSummaryGenerator:
    async def generate_narrative(
        self,
        events: List[Event],
        context: Dict
    ) -> NarrativeSummary:
        """Use LLM to generate narrative summary."""
        pass
```

**Fallback**: Template-based generation if LLM unavailable

---

## Testing Strategy

### Unit Tests
- Individual component testing
- Schema validation
- Event extraction logic
- State calculation

### Integration Tests
- End-to-end summary generation
- Database persistence
- API endpoints
- Visibility filtering

### Performance Tests
- Large event sets (1000+ events)
- Concurrent generation
- Query performance

---

## Implementation Order

1. ✅ M3-014: Design Summary data structure
2. ⏳ M3-015: Implement checkpoint summary generator
3. ⏳ M3-016: Implement scene summary generator
4. ⏳ M3-017: Implement session summary generator
5. ⏳ M3-018: Implement key event extraction
6. ⏳ M3-019: Implement summary write (wait for DB)
7. ⏳ M3-020: Implement summary update
8. ⏳ M3-021: Implement summary query API

---

## Dependencies & Blocking

**Blocked By**:
- M3-001 to M3-005: Database tasks must complete first
- Existing Event system must be stable

**Unblocks**:
- M3-022 to M3-026: Snapshot system tasks
- Frontend recap UI tasks

---

## Acceptance Criteria

Each task must meet these criteria:

- [ ] All tests passing
- [ ] Code follows project style guidelines
- [ ] Type hints complete
- [ ] Documentation updated
- [ ] API documented in OpenAPI spec
- [ ] Performance acceptable (<2s for 1000 events)
- [ ] Visibility correctly enforced

---

## Next Steps

1. **Wait** for database tasks (M3-001 to M3-005) to complete
2. **Begin** M3-015 implementation once dependencies are met
3. **Follow** TDD approach - write tests first
4. **Update** task checkboxes in `docs/tasks/04-m3-memory-web.md`

---

**Last Updated**: 2026-02-22
**Status**: Design Complete, Awaiting Database Dependencies
