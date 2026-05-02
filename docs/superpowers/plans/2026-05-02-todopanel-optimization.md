# TodoPanel Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase TodoPanel trigger rate by optimizing agent system prompt and tool descriptions, following opencode's proven pattern.

**Architecture:** Pure text changes to three Go files — no logic, no new code paths, no architectural changes. The agent's task tool usage is entirely prompt-driven; stronger prompts → more frequent TaskCreate calls → TodoPanel visible more often.

**Tech Stack:** Go (string constants in existing files)

---

### Task 1: Rewrite `PromptPlanning` system prompt

**Files:**
- Modify: `internal/agent/system_prompt.go:50-67`

- [ ] **Step 1: Replace the `PromptPlanning` constant**

In `internal/agent/system_prompt.go`, replace lines 50-67 (the entire `PromptPlanning` const block) with:

```go
const PromptPlanning = `## Task Planning

Use TaskCreate/TaskUpdate/TaskList to create and manage a structured task list for
your current coding session. This helps you track progress, organize tasks, and
demonstrate thoroughness to the user. It also helps the user understand your progress.

IMPORTANT: Use TaskCreate to plan and track tasks for nearly every user request.

### When to Use TaskCreate

Use proactively in these scenarios:
1. Any non-trivial user request — when the user asks you to do something
2. Complex multi-step tasks — 3 or more distinct steps
3. User provides multiple tasks — numbered or comma-separated lists
4. After receiving new instructions — immediately capture requirements as tasks
5. When you start working on a task — mark it in_progress via TaskUpdate
6. After completing a task — mark it completed and add any follow-up tasks

### When NOT to Use TaskCreate

Skip only when:
1. The task is purely informational (e.g., "what does git status do?")
2. The task is a single, trivial command execution (e.g., "run npm install")
3. The user is just chatting, not requesting code changes

When in doubt, use it. Proactive task management demonstrates attentiveness
and ensures all requirements are completed.

### Task Management Rules
- Create task list BEFORE implementation via TaskCreate
- Each task must be discrete and verifiable — one clear outcome
- Only ONE task in_progress at a time; complete it before starting the next
- Mark tasks completed IMMEDIATELY after finishing — do NOT batch completions
- When a task becomes irrelevant, mark it cancelled rather than silently abandoning it
- Call TaskUpdate immediately when you start, finish, or cancel a task
- A new TaskCreate call replaces the entire previous list`
```

- [ ] **Step 2: Verify Go compilation**

```bash
cd d:/git/monika && go build ./internal/agent/...
```

Expected: exit code 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add internal/agent/system_prompt.go
git commit -m "feat: strengthen PromptPlanning to encourage more frequent TaskCreate usage"
```

---

### Task 2: Expand `TaskCreate` tool description

**Files:**
- Modify: `internal/tool/builtin/task_create.go:21-25`

- [ ] **Step 1: Replace the `Description()` method return value**

In `internal/tool/builtin/task_create.go`, replace lines 21-25 with:

```go
func (t *taskCreateTool) Description() string {
	return "Create or replace the task list for the current session. " +
		"Use this to create a structured plan before starting work. " +
		"Calling this again replaces the entire previous list.\n\n" +
		"## When to Use\n" +
		"Use proactively in these scenarios:\n" +
		"1. Complex multi-step tasks — 3 or more distinct steps or actions\n" +
		"2. Non-trivial tasks — tasks that require careful planning or multiple operations\n" +
		"3. User explicitly requests todo list — \"plan this\", \"create tasks\", etc.\n" +
		"4. User provides multiple tasks — numbered or comma-separated lists\n" +
		"5. After receiving new instructions — immediately capture user requirements as tasks\n" +
		"6. After completing a task — mark it complete and add any new follow-up tasks\n" +
		"7. When you start working on a task — mark it in_progress via TaskUpdate\n\n" +
		"## When NOT to Use\n" +
		"Skip only when:\n" +
		"1. The task is purely informational (e.g., \"what does git status do?\")\n" +
		"2. The task is a single, trivial step (e.g., \"run npm install\")\n" +
		"3. The task can be completed in less than 3 trivial steps\n\n" +
		"## Task States\n" +
		"- pending: Not yet started\n" +
		"- in_progress: Currently working on (only ONE at a time)\n" +
		"- completed: Finished successfully\n" +
		"- cancelled: No longer needed\n\n" +
		"## Task Management\n" +
		"- Update task status in real-time as you work\n" +
		"- Mark tasks complete IMMEDIATELY after finishing — don't batch completions\n" +
		"- Only have ONE task in_progress at any time\n" +
		"- Complete current tasks before starting new ones\n" +
		"- Cancel tasks that become irrelevant\n" +
		"- Create specific, actionable items with clear, descriptive names\n" +
		"- Break complex tasks into smaller, manageable steps\n\n" +
		"When in doubt, use this tool. Proactive planning ensures complete requirements."
}
```

- [ ] **Step 2: Verify Go compilation**

```bash
cd d:/git/monika && go build ./internal/tool/builtin/...
```

Expected: exit code 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add internal/tool/builtin/task_create.go
git commit -m "feat: expand TaskCreate tool description with usage guidance and examples"
```

---

### Task 3: Strengthen `TaskUpdate` tool description

**Files:**
- Modify: `internal/tool/builtin/task_update.go:21-24`

- [ ] **Step 1: Replace the `Description()` method return value**

In `internal/tool/builtin/task_update.go`, replace lines 21-24 with:

```go
func (t *taskUpdateTool) Description() string {
	return "Update a single task's fields. Only provided fields are updated; " +
		"others remain unchanged.\n\n" +
		"CRITICAL: Call TaskUpdate IMMEDIATELY when you:\n" +
		"- Start working on a task → set status to \"in_progress\"\n" +
		"- Finish a task → set status to \"completed\"\n" +
		"- Abandon a task → set status to \"cancelled\"\n\n" +
		"Do NOT batch updates — mark each task done right after finishing it, " +
		"before moving to the next one. Only ONE task in_progress at a time."
}
```

- [ ] **Step 2: Verify Go compilation**

```bash
cd d:/git/monika && go build ./internal/tool/builtin/...
```

Expected: exit code 0, no errors.

- [ ] **Step 3: Final verification build**

```bash
cd d:/git/monika && go build ./...
```

Expected: exit code 0, no errors across the entire project.

- [ ] **Step 4: Commit**

```bash
git add internal/tool/builtin/task_update.go
git commit -m "feat: strengthen TaskUpdate tool description with immediate update emphasis"
```

---

### Verification

After all changes are committed, the only meaningful verification is runtime: start monika and observe whether the agent calls `TaskCreate` more frequently for everyday tasks. There is no automated test for prompt effectiveness — this is validated through usage.
