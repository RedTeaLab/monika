# 多标签页支持 — 设计文档

## 动机

当前 Monika 的 ChatArea 和 FileEditor 各自仅支持一个活跃视图——切换会话或文件会替换当前内容。用户在以下场景中受阻：

- 等待 agent 生成回复时无法浏览其他会话或查看文件
- 需要在多个文件中交叉参考时反复点击 FileTree 切换
- agent 修改文件后想对照原始内容与修改结果

多标签页支持让用户可以同时打开多个会话和文件，在它们之间自由切换，后台生成不受影响。

> 本设计文档取代此前 split-screen layout design 中的单文件/单会话模型。`selectedFilePath`、`selectedFileContent`、`activeSessionTitle` 字段被本设计的 `openFiles`/`openSessions` 多标签模型替代。

## 用户交互

- **打开标签**：SessionList 点击会话 / FileTree 点击文件 → 打开为新标签页。已打开则激活已有标签。
- **切换标签**：点击 TabBar 上的标签。
- **关闭标签**：点击标签上的 × 按钮。关闭当前激活标签后自动切换到右侧邻居（无右侧则左侧，无剩余则清空）。
- **溢出处理**：标签超出容器宽度时，折叠到 `▼` 下拉菜单（VS Code 风格）。

> **第一阶段不包含**：拖拽排序（HTML5 DnD）推迟到后续迭代。TabBar props 保留可选 `onReorder` 回调以保持接口向前兼容。

### 状态覆盖

| 场景 | 行为 |
|---|---|
| 标签打开中 | 标签显示 spinner（`--accent` 色），内容区显示骨架 |
| 打开失败 | 标签显示错误标记（`--red` 圆点），内容区显示错误信息 + 重试按钮 |
| 标签栏空 | ChatArea 显示 "No sessions open. Create one from the sidebar."；FileEditor 显示 "Select a file to preview" |
| 后台生成中 | 标签显示 pulsing dot（`--yellow` 色），生成完成后显示 ✓ 标记（1.5s 后消失） |
| 后台生成出错 | 标签显示错误标记（`--red` 圆点），切回时展示错误消息 |

### 标签持久化

不持久化。应用启动时标签栏为空。此决定与 split-screen layout design 的 "No localStorage persistence" 一致。会话和文件按需打开，离开即消失。

## Store 变更

### 新增状态

```typescript
// 会话标签页
openSessions: { id: string; title: string }[]    // 有序列表
activeSessionId: string                          // 当前聚焦标签
sessionMessages: Record<string, Message[]>       // 每个会话的消息缓存
generatingSessionId: string                      // 正在生成回复的会话，空字符串表示无

// 文件标签页
openFiles: { path: string; content: string; isDirty: boolean }[]
activeFilePath: string

// 原 generating: boolean 移除（用 generatingSessionId !== '' 替代）
```

### 新增操作

| 操作 | 签名 | 职责 | 类型 |
|---|---|---|---|
| `openSessionTab(id, title)` | `(id: string, title: string) => Promise<void>` | 若 id 已在 openSessions 中则仅激活；否则加入列表 → 调 `App.LoadSession` → 存入 `sessionMessages[id]` | I/O |
| `closeSessionTab(id)` | `(id: string) => void` | 从 openSessions 移除 → 删除 `sessionMessages[id]` → 若 id 为 active，切换到相邻标签或清空 | 纯状态 |
| `switchSessionTab(id)` | `(id: string) => void` | 当前 messages 写回 `sessionMessages[activeSessionId]` → 从 `sessionMessages[id]` 恢复到 messages → 更新 activeSessionId | 纯状态 |
| `setGeneratingSessionId(id)` | `(id: string) => void` | 设置 generatingSessionId | 纯状态 |
| `clearGeneratingSessionId()` | `() => void` | 清除 generatingSessionId 为空字符串 | 纯状态 |
| `openFileTab(path, content)` | `(path: string, content: string) => void` | 若 path 已在 openFiles 中则仅激活；否则加入列表 → 若列表超限，LRU 淘汰最久未访问的文件 | 纯状态 |
| `closeFileTab(path)` | `(path: string) => void` | 从 openFiles 移除 → 若 path 为 active，切换到相邻标签或清空 | 纯状态 |
| `switchFileTab(path)` | `(path: string) => void` | 更新 activeFilePath → 更新 LRU 访问记录 | 纯状态 |
| `setFileDirty(path, dirty)` | `(path: string, dirty: boolean) => void` | 标记文件是否有未保存修改 | 纯状态 |
| `updateFileContent(path, content)` | `(path: string, content: string) => void` | 更新缓存内容 → 若为 activeFilePath，同步到 EditorView | 纯状态 |

**会话标签上限**：`openSessions` 最多 8 个。超出时阻止打开新标签，提示 "Close a session before opening a new one."。

**文件标签内存管理**：`openFiles` 无硬上限，但 CodeMirror 实例缓存最多保留 10 个。超限时 LRU 淘汰（destroy 最久未访问的 EditorView），标签保持打开——重新激活时重建 EditorView。

### 移除

- `activeSessionTitle` — 改为从 `openSessions` 查找当前激活标签的 title
- `selectedFilePath` / `selectedFileContent` / `clearSelectedFile` — 改为从 `openFiles` / `activeFilePath` 查找
- `generating: boolean` — 用 `generatingSessionId !== ''` 替代

## TabBar 组件

`components/TabBar/TabBar.tsx` — 标签栏，会话和文件各实例化一个。

### Props

```typescript
interface TabBarProps {
  tabs: { key: string; label: string; dirty?: boolean; status?: 'idle' | 'generating' | 'completed' | 'error' }[]
  activeKey: string
  onSelect: (key: string) => void
  onClose: (key: string) => void
  onReorder?: (from: number, to: number) => void   // 第一阶段不连接，保留接口
}
```

### 行为

- 最小宽度 120px，最大宽度 200px，超出 truncate
- 高度 36px，底部边框 `border-[var(--border)]`
- 关闭按钮：hover 时显示 ×，当前激活标签始终显示
- 状态指示：
  - `generating`：标签前显示 pulsing dot（`--yellow`）
  - `completed`：标签前显示 ✓（`--green`），1.5s 后自动清除
  - `error`：标签前显示 ●（`--red`）
  - `dirty`（仅文件标签）：标签文本后显示 ●（`--white`/半透明）

### 溢出处理

- 触发：点击 `▼` 下拉按钮（非 hover）
- 关闭：点击外部 / Escape / 选择项后自动关闭
- 内容：垂直可滚动列表，每行显示 label + status 指示 + × 关闭按钮
- 选中项：勾选标记 + 高亮
- 定位：`▼` 按钮下方右对齐，`z-50`，`max-height: 400px`，超出内部滚动
- 无溢出时：`▼` 完全隐藏

### 无障碍

- 容器：`role="tablist"`，`aria-orientation="horizontal"`
- 标签：`role="tab"`，`aria-selected`，`aria-controls` 指向内容面板
- 内容区：`role="tabpanel"`，`aria-labelledby` 指向标签
- 键盘：Left/Right 移动焦点（roving tabindex），Home/End 首尾，Enter/Space 激活，Ctrl+W 关闭
- 关闭按钮：`aria-label="Close {label}"`
- 溢出按钮：`aria-haspopup="menu"`，`aria-expanded`

## ChatArea 变更

### 布局

ChatArea 顶部现有 header bar（session title + close button）由 `<TabBar>` 替代。

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

重构 `setupWailsEvents` 中的 `Events.On('stream')` 处理器：

```
stream 事件到达
  → 读取 data.session_id
  → 若 !data.session_id || !sessionMessages[data.session_id]：log + 丢弃事件
  → 更新 sessionMessages[data.session_id]（通过 per-session store actions）
  → 若 data.session_id === activeSessionId：同步更新 messages 用于实时渲染
  → 'done' 事件且 data.session_id === generatingSessionId：调用 clearGeneratingSessionId()
```

**Per-session store actions**（新增，用于流式事件写入）：

| 操作 | 用途 |
|---|---|
| `updateSessionMessage(id, delta)` | 追加 assistant 文本到 sessionMessages[id] |
| `updateSessionThinking(id, delta)` | 追加 thinking 文本到 sessionMessages[id] |
| `addSessionToolStart(id, tool)` | 追加 running tool 到 sessionMessages[id] |
| `updateSessionToolDone(id, name, output, status)` | 更新 tool 状态到 sessionMessages[id] |

### Shadow Paths（流式事件异常路径）

| 场景 | 处理 |
|---|---|
| `data.session_id` 为空 | log warning + 丢弃事件 |
| `sessionMessages[id]` 不存在（标签已关闭） | log warning + 丢弃事件（生成结果丢失，后续需在发送前阻止关闭标签） |
| `data.session_id !== generatingSessionId` 且 type 为 'done' | 仅清除该 session 的生成状态，不调 clearGeneratingSessionId |
| 关闭正在生成的标签 | 阻止关闭，提示 "This session is generating. Cancel generation first." |

### 标签切换

- 离开：当前 `messages` 写回 `sessionMessages[activeSessionId]`
- 进入：从 `sessionMessages[id]` 恢复到 `messages`
- 进入正在生成的标签：继续实时渲染流式内容
- 离开正在生成的标签：生成不受影响，切回可见最新内容

### 发送消息

- 若 `generatingSessionId !== ''`（任意会话正在生成），ChatInput `disabled={true}`，显示提示 "Generating..."
- 调用 `App.SendMessage(projectPath, activeSessionId, text)`
- 调用 `setGeneratingSessionId(activeSessionId)`

## FileEditor 变更

### 布局

FileEditor 顶部现有 header bar（文件名 + close button）由 `<TabBar>` 替代。

```
┌─────────────────────────────────────┐
│ TabBar (文件标签)                    │
├─────────────────────────────────────┤
│ CodeMirror 编辑器（当前激活文件）     │
└─────────────────────────────────────┘
```

### DOM 安排

每个打开的文件渲染一个 `<div>` 容器，通过 CSS `display` 属性控制可见性。inactive 容器设为 `display: none`，active 容器正常显示。

```
<div className="flex-1 relative">
  {openFiles.map((f) => (
    <div
      key={f.path}
      ref={(el) => registerEditorContainer(f.path, el)}
      style={{ display: f.path === activeFilePath ? 'block' : 'none' }}
      className="absolute inset-0"
    />
  ))}
</div>
```

### CodeMirror 实例缓存

- `useRef<Map<string, EditorView>>()` 缓存每个文件的编辑器实例
- 打开文件 → 创建 EditorView，挂载到对应 DOM 容器
- 切换标签：
  1. 显示目标容器（`display: block`）
  2. 调用 `editorView.requestMeasure()` 强制 CodeMirror 重新计算布局
  3. 隐藏旧容器（`display: none`）
- 关闭标签：destroy 对应实例，从 Map 移除，移除 DOM 容器
- **LRU 上限**：最多缓存 10 个 EditorView 实例。超限时 destroy 最久未访问的实例

### 文件内容保鲜

- FileTree 点击已打开的文件 → 激活标签 + 重新 `App.ReadFile` 获取最新内容 + `EditorView.dispatch({changes: ...})` 更新编辑器
- `file_changed` stream 事件 → 若文件路径在 openFiles 中 → 更新 store 缓存 + 若为 active 则 dispatch 到 EditorView

### 脏文件关闭

关闭文件标签时，若 `isDirty` 为 true：

1. 弹出 `ConfirmModal`（复用现有组件），提示 "Save changes to {filename}?"
2. 三个选项：Save / Discard / Cancel
3. Save → 触发保存逻辑 → 关闭标签
4. Discard → 直接关闭（内容丢失）
5. Cancel → 保持标签打开
6. Escape = Cancel，Enter = Save（焦点在 Save 按钮）

### 空状态

无打开文件时显示 "Select a file to preview" 占位。

## 设计决策

### 消息缓存策略

选用**消息缓存**而非**切换时从后端重新加载**，原因：

- `App.LoadSession` 涉及 Go↔JS RPC 调用，大型会话（500+ 消息）延迟可能 >200ms
- 流式生成中的消息必须保留在前端才能实时渲染
- 若后续实测延迟可接受，可降级为 reload-on-switch 策略（此时 `sessionMessages` 仅用于流式接收）

### TabBar 泛型 vs 独立组件

选用单泛型组件，原因：会话和文件标签共享 90%+ 行为和样式（open/switch/close/overflow/状态指示）。通过 `status` 和 `dirty` 属性区别化。若后续分化加剧（如会话标签的右键菜单 vs 文件标签的 git 状态），可拆为 `SessionTabBar` + `FileTabBar`。

## 影响范围

| 文件 | 变更 |
|---|---|
| `frontend/src/store/index.ts` | 新增 11 个状态字段和 14 个操作；移除 4 个旧字段/操作；新增 4 个 per-session stream actions |
| `frontend/src/components/TabBar/TabBar.tsx` | 新增：标签栏、溢出下拉、状态指示、键盘导航、ARIA |
| `frontend/src/components/Chat/ChatArea.tsx` | 移除现有 header bar → 集成 TabBar；消息缓存读写；流式路由重构 |
| `frontend/src/components/FileTree/FileEditor.tsx` | 移除现有 header bar → 集成 TabBar；多 DOM 容器 + CodeMirror 缓存 + 脏关闭拦截 |
| `frontend/src/components/Sidebar/SessionList.tsx` | `handleSelect` 改为调用 `openSessionTab` |
| `frontend/src/App.tsx` | 无结构性变更（TabBar 内嵌在面板中） |
