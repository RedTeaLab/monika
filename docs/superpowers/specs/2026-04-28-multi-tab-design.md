# 多标签页支持 — 设计文档

## 目标

ChatArea 支持同时打开多个会话，FileEditor 支持同时打开多个文件，各自通过独立的 TabBar 管理标签页。

## 用户交互

- **打开标签**：SessionList 点击会话 / FileTree 点击文件 → 打开为新标签页。已打开则激活已有标签。
- **切换标签**：点击 TabBar 上的标签。
- **关闭标签**：点击标签上的 × 按钮。关闭当前激活标签后自动切换到右侧邻居（无右侧则左侧，无剩余则清空）。
- **溢出处理**：标签超出容器宽度时，折叠到 `▼` 下拉菜单（VS Code 风格）。
- **拖拽排序**：标签支持 HTML5 drag and drop 调整顺序。

## Store 变更

### 新增状态

```typescript
// 会话标签页
openSessions: { id: string; title: string }[]    // 有序列表
activeSessionId: string                          // 当前聚焦标签
sessionMessages: Record<string, Message[]>       // 每个会话的消息缓存
generatingSessionId: string                      // 正在生成回复的会话

// 文件标签页
openFiles: { path: string; content: string; isDirty: boolean }[]
activeFilePath: string
```

### 新增操作

| 操作 | 用途 |
|---|---|
| `openSessionTab(id, title)` | 已存在则激活，不重复添加 |
| `closeSessionTab(id)` | 移除标签 + 清除消息缓存 |
| `switchSession(id)` | 切换标签：当前 messages 写回缓存 → 恢复目标 session 消息到 messages |
| `reorderSessionTabs(from, to)` | 拖拽排序 |
| `openFileTab(path, content)` | 已存在则激活 |
| `closeFileTab(path)` | 移除标签 |
| `switchFile(path)` | 切换活跃文件 |
| `setFileDirty(path, dirty)` | 脏标记 |
| `updateFileContent(path, content)` | 更新缓存内容 |
| `reorderFileTabs(from, to)` | 拖拽排序 |

### 移除

- `activeSessionTitle` — 改为从 `openSessions` 查找当前激活标签的 title
- `selectedFilePath` / `selectedFileContent` / `clearSelectedFile` — 改为从 `openFiles` / `activeFilePath` 查找

## TabBar 组件

`components/TabBar/TabBar.tsx` — 泛型标签栏，会话和文件各实例化一个。

### Props

```typescript
interface TabBarProps {
  tabs: { key: string; label: string; dirty?: boolean }[]
  activeKey: string
  onSelect: (key: string) => void
  onClose: (key: string) => void
  onReorder?: (from: number, to: number) => void
}
```

### 行为

- 最小宽度 120px，最大宽度 200px，超出 truncate
- 溢出标签折叠到 `▼` 下拉按钮，菜单中选中项带勾选标记
- 脏标记：文件标签未保存时显示圆点指示器
- 关闭按钮：hover 时显示 ×，当前激活标签始终显示
- 拖拽排序：HTML5 DnD，拖拽时显示插入指示线
- 高度 36px，底部边框 `border-[var(--border)]`

## ChatArea 变更

### 布局

```
┌─────────────────────────────────────┐
│ TabBar (会话标签)                    │
├─────────────────────────────────────┤
│ 消息列表（当前激活会话）              │
├─────────────────────────────────────┤
│ ChatInput (key={activeSessionId})   │
└─────────────────────────────────────┘
```

### 多会话流式事件路由

```
stream 事件到达
  → 读取 generatingSessionId
  → 更新 sessionMessages[generatingSessionId]
  → 如果 generatingSessionId === activeSessionId（用户正在看）
      → 同步更新 messages 用于渲染
  → 'done' 事件时清除 generatingSessionId
```

### 标签切换

- 离开：当前 `messages` 写回 `sessionMessages[id]`
- 进入：从 `sessionMessages[id]` 恢复到 `messages`
- 进入正在生成的标签：继续实时渲染流式内容
- 离开正在生成的标签：生成不受影响，切回可见最新内容

### 发送消息

- 当前会话正在生成中则阻止发送
- 调用 `App.SendMessage(projectPath, activeSessionId, text)`
- 设置 `generatingSessionId = activeSessionId`

## FileEditor 变更

### 布局

```
┌─────────────────────────────────────┐
│ TabBar (文件标签)                    │
├─────────────────────────────────────┤
│ CodeMirror 编辑器（当前激活文件）     │
└─────────────────────────────────────┘
```

### CodeMirror 实例缓存

- `useRef<Map<string, EditorView>>()` 缓存每个文件的编辑器实例
- 切换标签：隐藏旧实例 DOM，显示新实例 DOM（不 destroy，避免重建开销）
- 关闭标签：destroy 对应实例，从 Map 移除

### 空状态

无打开文件时显示 "Select a file to preview" 占位。

## 影响范围

| 文件 | 变更 |
|---|---|
| `frontend/src/store/index.ts` | 新增状态和操作，移除旧字段 |
| `frontend/src/components/TabBar/TabBar.tsx` | 新增 |
| `frontend/src/components/Chat/ChatArea.tsx` | 集成 TabBar，消息缓存读写 |
| `frontend/src/components/FileTree/FileEditor.tsx` | 集成 TabBar，CodeMirror 多实例 |
| `frontend/src/components/Sidebar/SessionList.tsx` | `handleSelect` 改为 `openSessionTab` |
| `frontend/src/App.tsx` | 无结构性变更（TabBar 内嵌在面板中） |
