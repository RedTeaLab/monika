// @ts-check
// Re-export barrel — maintains backward compatibility
// Auto-generated bindings are in subdirectories (internal/api, pkg/engine, etc.)

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
  ChangeStat,
  DiffResult,
  StreamEvent,
  WorktreeInfo,
  ProviderInfo,
} from "./internal/api/models.js";

export { App } from "./internal/api/index.js";

// ModelInfo is the legacy name; new bindings use Model
export { Model, Model as ModelInfo } from "./pkg/engine/index.js";
