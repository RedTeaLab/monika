// Re-export barrel — maintains backward compatibility with the old flat index.ts
// Auto-generated bindings are now in subdirectories (internal/api, pkg/engine, etc.)

export {
  ProjectInfo,
  SessionInfo,
  Session,
  FileContent,
  FileNode,
  FileChange,
  FileChangeEvent,
  RecentProject,
  BranchInfo,
  DiffResult,
  StreamEvent,
  WorktreeInfo,
} from "./internal/api/models.js";

export { App } from "./internal/api/index.js";

// Model was renamed from ModelInfo — alias for backward compat
export { Model as ModelInfo } from "./pkg/engine/index.js";
