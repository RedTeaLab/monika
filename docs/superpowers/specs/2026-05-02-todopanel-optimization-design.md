# TodoPanel Optimization Design

**Date:** 2026-05-02
**Goal:** Increase TodoPanel trigger rate by optimizing system prompt and tool descriptions

## Problem

TodoPanel only renders when the AI agent calls `TaskCreate`/`TaskUpdate` tools. Current trigger rate is very low because the system prompt threshold is too conservative ("Complex: new feature, refactor, multi-system change" → MUST create plan; "Medium" → optional).

## Root Cause

The agent's decision to use task tools is purely prompt-driven. Monika's `PromptPlanning` uses a three-tier complexity classification that discourages task creation for medium tasks. OpenCode has no tiers — it says "IMPORTANT: Always use the TodoWrite tool" and provides detailed examples in the tool description.

The architecture is identical between the two (LLM calls tool → backend emits event → frontend renders). The difference is entirely in prompt design.

## Solution: Prompt Optimization (Following OpenCode Pattern)

Three files changed. No architectural changes, no new code paths.

### 1. `internal/agent/system_prompt.go` — Rewrite `PromptPlanning`

- Replace Simple/Medium/Complex tiers with aggressive "IMPORTANT: Always use" guidance
- Lower threshold: trigger on any non-trivial user request (not just "complex")
- Add explicit when-to-use / when-not-to-use sections
- Emphasize "When in doubt, use it"

### 2. `internal/tool/builtin/task_create.go` — Expand Description()

- Add detailed usage guidance (6 proactive scenarios, 3 skip scenarios)
- Add task states documentation (pending/in_progress/completed/cancelled)
- Add 3 concrete examples showing when and how to create tasks
- Close with "When in doubt, use this tool"

### 3. `internal/tool/builtin/task_update.go` — Strengthen Description()

- Add "CRITICAL" prefix for immediate update rules
- Explicitly say "Do NOT batch updates"
- Reinforce "only ONE task in_progress"

### Not Changed

- `task_list.go` — Description is already adequate
- `task_store.go` — No logic changes needed
- Frontend (`TodoPanel.tsx`, `store/index.ts`) — No changes, render condition unchanged
- Event flow (`main.go`, `app.go`) — No changes

## Expected Outcome

Agent calls `TaskCreate` for the majority of user requests (target: ~80%+ of non-trivial requests), populating the task store and making TodoPanel visible in the sidebar.

## Rollback

All changes are text-only (prompts and descriptions). Reverting the three files to their previous state fully restores the old behavior.
