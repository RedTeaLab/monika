# 消息通知与系统托盘 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Monika 添加系统托盘（关闭到托盘、图标闪烁、悬浮消息列表）和应用内右上角 Toast 通知（AI 回复完成、权限请求）。

**Architecture:** Go 层负责平台交互（Wails v3 Tray API、窗口关闭拦截、悬浮窗口创建/定位/销毁），前端负责通知逻辑（Zustand notificationStore、Toast 组件、触发时机）。前后端通过 Wails 绑定通信：前端调用 Go 方法触发托盘闪烁/清除，Go 通过 Wails 事件通知前端主窗口显隐状态。

**Tech Stack:** Wails v3 (Go), React 18 + TypeScript, Zustand v5, Tailwind CSS v4

**Spec:** `docs/superpowers/specs/2026-06-01-message-notification-tray-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `internal/api/tray.go` | **New** — TrayManager: 托盘创建、图标闪烁 ticker、右键菜单、悬浮窗口创建/定位/销毁、OnMouseEnter/Leave 处理 |
| `main.go` | **Modify** — 创建 Tray，注册 OnClose 钩子拦截关闭 |
| `internal/api/app.go` | **Modify** — 新增 `SendTrayNotification`、`ClearTrayNotifications` 方法，存储 trayManager 引用 |
| `frontend/src/store/notificationStore.ts` | **New** — Zustand store: 通知队列、未读历史、push/dismiss/clearAll |
| `frontend/src/components/Toast/ToastContainer.tsx` | **New** — Toast 容器：右上角固定定位，渲染队列 |
| `frontend/src/components/Toast/ToastItem.tsx` | **New** — 单条 Toast：滑入动画、5 秒自动消失 |
| `frontend/src/components/TrayPopup/TrayPopup.tsx` | **New** — 悬浮消息列表窗口内容：消息列表 + "忽略全部"按钮 |
| `frontend/src/main.tsx` | **Modify** — 为悬浮窗口注册独立路由/入口 |
| `frontend/src/components/TitleBar/TitleBar.tsx` | **Modify** — 关闭按钮移除 `App.QuitApp()` 调用 |
| `frontend/src/App.tsx` | **Modify** — 挂载 ToastContainer |
| `frontend/src/store/index.ts` | **Modify** — `done` 和 `permission_required` 处理处触发通知 |
| `frontend/index.html` | **Modify** — 添加悬浮窗口入口的 query 参数路由 |

---

### Task 1: Go — 创建 TrayManager（托盘 + 闪烁 + 菜单 + 悬浮窗口）

**Files:**
- Create: `internal/api/tray.go`

- [ ] **Step 1: 创建 TrayManager 结构体和基础方法**

```go
// internal/api/tray.go
package api

import (
	"bytes"
	"image"
	"image/color"
	"image/draw"
	"os"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

type TrayManager struct {
	app          *application.App
	systemTray   *application.SystemTray
	mainWindow   application.Window
	popupWindow  application.Window

	normalIcon    []byte
	highlightIcon []byte

	mu            sync.Mutex
	blinkTicker   *time.Ticker
	blinkStop     chan struct{}
	blinking      bool

	popupDebounce *time.Timer
}

func NewTrayManager(app *application.App, mainWindow application.Window) *TrayManager {
	tm := &TrayManager{
		app:        app,
		mainWindow: mainWindow,
	}
	return tm
}
```

- [ ] **Step 2: 添加图标加载方法（从 winres/icon.ico 加载并生成高亮版本）**

```go
func (tm *TrayManager) loadIcons() error {
	data, err := os.ReadFile("winres/icon.ico")
	if err != nil {
		return err
	}
	// Decode ICO and convert to PNG for Wails tray
	normalPNG, err := icoToPNG(data)
	if err != nil {
		return err
	}
	tm.normalIcon = normalPNG

	// Generate highlight: brighten by 20%
	tm.highlightIcon = brightenPNG(normalPNG, 1.2)
	return nil
}

func icoToPNG(data []byte) ([]byte, error) {
	// Decode ICO (pick largest), encode as PNG
	// ICO format: first 6 bytes = reserved(2) + type(2) + count(2)
	// Use image.Decode + png.Encode
	reader := bytes.NewReader(data)
	img, _, err := image.Decode(reader)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	if err := pngEncode(&buf, img); err != nil { // use "image/png".Encode
		return nil, err
	}
	return buf.Bytes(), nil
}

func brightenPNG(data []byte, factor float64) []byte {
	reader := bytes.NewReader(data)
	img, _, err := image.Decode(reader)
	if err != nil {
		return data // fallback to normal icon
	}
	bounds := img.Bounds()
	bright := image.NewRGBA(bounds)
	draw.Draw(bright, bounds, img, bounds.Min, draw.Src)
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			c := bright.RGBAAt(x, y)
			c.R = clampUint8(float64(c.R) * factor)
			c.G = clampUint8(float64(c.G) * factor)
			c.B = clampUint8(float64(c.B) * factor)
			bright.SetRGBA(x, y, c)
		}
	}
	var buf bytes.Buffer
	pngEncode(&buf, bright)
	return buf.Bytes()
}

func clampUint8(v float64) uint8 {
	if v > 255 { return 255 }
	return uint8(v)
}

// Use a lazy reference to avoid import cycle — define locally
var pngEncode = func(w io.Writer, m image.Image) error {
	return nil // placeholder — will use "image/png".Encode
}
```

_Note: The actual file will import `"image/png"` and use `png.Encode` directly; the placeholder avoids import cycle in this plan document._

- [ ] **Step 3: 添加托盘创建和初始化方法**

```go
func (tm *TrayManager) Init() error {
	if err := tm.loadIcons(); err != nil {
		return err
	}

	tm.systemTray = tm.app.SystemTray.New()
	tm.systemTray.SetIcon(tm.normalIcon)
	tm.systemTray.SetTooltip("Monika")

	// Right-click menu: Exit only
	menu := tm.app.Menu.New()
	menu.Add("退出", func() {
		tm.stopBlink()
		if tm.popupWindow != nil {
			tm.popupWindow.Destroy()
		}
		tm.app.Quit()
	})
	tm.systemTray.SetMenu(menu)

	// Attach main window for left-click toggle
	tm.systemTray.AttachWindow(tm.mainWindow).WindowOffset(5)

	// Mouse enter → show popup if has unread messages
	tm.systemTray.OnMouseEnter(func() {
		if tm.mainWindow.IsVisible() {
			return
		}
		if tm.popupDebounce != nil {
			tm.popupDebounce.Stop()
		}
		tm.showPopup()
	})

	// Mouse leave → hide popup after debounce
	tm.systemTray.OnMouseLeave(func() {
		tm.popupDebounce = time.AfterFunc(300*time.Millisecond, func() {
			tm.hidePopup()
		})
	})

	tm.systemTray.Run()
	return nil
}
```

- [ ] **Step 4: 添加图标闪烁控制方法**

```go
func (tm *TrayManager) StartBlink() {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	if tm.blinking {
		return
	}
	tm.blinking = true
	tm.blinkStop = make(chan struct{})
	normal := true
	go func() {
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if normal {
					tm.systemTray.SetIcon(tm.normalIcon)
				} else {
					tm.systemTray.SetIcon(tm.highlightIcon)
				}
				normal = !normal
			case <-tm.blinkStop:
				tm.systemTray.SetIcon(tm.normalIcon)
				return
			}
		}
	}()
}

func (tm *TrayManager) StopBlink() {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	if !tm.blinking {
		return
	}
	tm.blinking = false
	close(tm.blinkStop)
}
```

- [ ] **Step 5: 添加悬浮窗口创建/显示/隐藏方法**

```go
func (tm *TrayManager) showPopup() {
	if tm.popupWindow == nil {
		tm.createPopupWindow()
	}
	if tm.popupWindow == nil {
		return
	}
	// Position near tray icon
	if err := tm.systemTray.PositionWindow(tm.popupWindow, 5); err != nil {
		return
	}
	tm.popupWindow.Show()
	tm.popupWindow.Focus()
}

func (tm *TrayManager) hidePopup() {
	if tm.popupWindow != nil {
		tm.popupWindow.Hide()
	}
}

func (tm *TrayManager) createPopupWindow() {
	tm.popupWindow = tm.app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:     "tray-popup",
		Title:    "",
		Width:    280,
		Height:   200,
		MinWidth: 280,
		MinHeight: 150,
		MaxWidth: 280,
		MaxHeight: 400,
		Frameless:       true,
		DisableResize:   true,
		Hidden:          true,
		AlwaysOnTop:     true,
		Windows: application.WindowsWindow{
			HiddenOnTaskbar: true,
		},
		// URL points to the same frontend but with a query param to render TrayPopup
		URL: "/#/tray-popup",
	})

	// Hide on focus lost (user clicks elsewhere)
	tm.popupWindow.RegisterHook(events.Common.WindowLostFocus, func(e *application.WindowEvent) {
		tm.hidePopup()
	})
}
```

- [ ] **Step 6: 提交**

```bash
git add internal/api/tray.go
git commit -m "feat: add TrayManager with tray icon, blink, and popup window"
```

_Note: actual pngEncode will use `"image/png".Encode` directly._

---

### Task 2: Go — 修改 main.go 集成 Tray + 关闭拦截

**Files:**
- Modify: `main.go:340-361`

- [ ] **Step 1: 在 main.go 中创建 TrayManager，替换窗口创建逻辑**

读取 `main.go` 中窗口创建部分（约第 340-361 行），并在其后添加：

```go
// 现有窗口创建代码保持不变:
app.Window.NewWithOptions(application.WebviewWindowOptions{
    Title:     "Monika",
    Width:     1400,
    Height:    900,
    MinWidth:  900,
    MinHeight: 600,
    Frameless: true,
    StartState: application.WindowStateMaximised,
})

// 新增：创建 TrayManager
mainWindow := app.CurrentWindow() // or get from NewWithOptions return
trayMgr := api.NewTrayManager(app, mainWindow)
if err := trayMgr.Init(); err != nil {
    fmt.Fprintf(os.Stderr, "[monika] tray init failed: %v\n", err)
    // Continue without tray — non-fatal
}

// 新增：将 trayMgr 注入到 appService
appService.SetTrayManager(trayMgr)

// 新增：拦截主窗口关闭 → 隐藏到托盘
mainWindow.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
    mainWindow.Hide()
    e.Cancel()
})
```

_Note: Wails v3 的 `app.Window.NewWithOptions` 返回 `*WebviewWindow`，需要检查其 API 是否返回窗口引用。如不返回，直接用变量接收。_

- [ ] **Step 2: 添加 events import 到 main.go**

在 main.go 的 import 中添加：
```go
"github.com/wailsapp/wails/v3/pkg/events"
```

- [ ] **Step 3: 提交**

```bash
git add main.go
git commit -m "feat: integrate TrayManager, intercept window close to hide"
```

---

### Task 3: Go — App 服务新增托盘通知方法

**Files:**
- Modify: `internal/api/app.go`

- [ ] **Step 1: 在 App 结构体中添加 trayManager 字段和 setter**

在 `App` struct 中添加字段（放在 `checker *update.Checker` 后）：

```go
trayMgr *TrayManager
```

添加 setter 方法：

```go
func (a *App) SetTrayManager(tm *TrayManager) {
	a.trayMgr = tm
}
```

- [ ] **Step 2: 添加 SendTrayNotification 方法**

```go
// SendTrayNotification 触发托盘图标闪烁（有未读消息时调用）
func (a *App) SendTrayNotification(title string, body string) {
	if a.trayMgr != nil {
		a.trayMgr.StartBlink()
	}
}
```

- [ ] **Step 3: 添加 ClearTrayNotifications 方法**

```go
// ClearTrayNotifications 清除所有未读，停止闪烁，关闭悬浮窗口
func (a *App) ClearTrayNotifications() {
	if a.trayMgr != nil {
		a.trayMgr.StopBlink()
		a.trayMgr.hidePopup()
	}
}
```

- [ ] **Step 4: 提交**

```bash
git add internal/api/app.go
git commit -m "feat: add SendTrayNotification and ClearTrayNotifications to App service"
```

---

### Task 4: 前端 — 创建 notificationStore

**Files:**
- Create: `frontend/src/store/notificationStore.ts`

- [ ] **Step 1: 创建 notificationStore**

```typescript
// frontend/src/store/notificationStore.ts
import { create } from 'zustand'
import { App } from '../../bindings/monika'

export interface NotificationItem {
  id: string
  sessionId: string
  sessionTitle: string
  type: 'reply-complete' | 'permission-request'
  message: string
  timestamp: number
}

interface NotificationState {
  items: NotificationItem[]
  unreadHistory: NotificationItem[]
  unreadCount: number

  push: (item: Omit<NotificationItem, 'id' | 'timestamp'>) => void
  dismiss: (id: string) => void
  clearAll: () => void
  markAllRead: () => void
}

let counter = 0

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  unreadHistory: [],
  unreadCount: 0,

  push: (item) => {
    const id = `notif-${++counter}-${Date.now()}`
    const full: NotificationItem = { ...item, id, timestamp: Date.now() }
    set((s) => ({
      items: [...s.items, full],
      unreadHistory: [...s.unreadHistory, full],
      unreadCount: s.unreadCount + 1,
    }))
    // Trigger tray blink via Go
    App.SendTrayNotification(full.sessionTitle, full.message).catch(() => {})

    // Auto-dismiss toast after 5 seconds
    setTimeout(() => {
      get().dismiss(id)
    }, 5000)
  },

  dismiss: (id) => {
    set((s) => ({
      items: s.items.filter((it) => it.id !== id),
    }))
  },

  clearAll: () => {
    set({ items: [], unreadHistory: [], unreadCount: 0 })
    App.ClearTrayNotifications().catch(() => {})
  },

  markAllRead: () => {
    set({ unreadHistory: [], unreadCount: 0 })
    App.ClearTrayNotifications().catch(() => {})
  },
}))
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/store/notificationStore.ts
git commit -m "feat: add notificationStore with Zustand"
```

---

### Task 5: 前端 — 创建 ToastContainer 和 ToastItem 组件

**Files:**
- Create: `frontend/src/components/Toast/ToastContainer.tsx`
- Create: `frontend/src/components/Toast/ToastItem.tsx`

- [ ] **Step 1: 创建 ToastItem 组件**

```typescript
// frontend/src/components/Toast/ToastItem.tsx
import { useEffect, useState } from 'react'
import type { NotificationItem } from '../../store/notificationStore'

interface ToastItemProps {
  item: NotificationItem
  onDismiss: (id: string) => void
}

export function ToastItem({ item, onDismiss }: ToastItemProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Trigger slide-in animation on next frame
    requestAnimationFrame(() => setVisible(true))

    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => onDismiss(item.id), 300) // wait for fade-out
    }, 4700) // slightly before the 5s auto-dismiss in store
    return () => clearTimeout(timer)
  }, [])

  const typeLabel = item.type === 'reply-complete' ? '回复完成' : '请求权限'

  return (
    <div
      className={`
        flex flex-col gap-0.5 px-3 py-2
        bg-[var(--bg-elevated)] border border-[var(--border)]
        rounded-md shadow-lg
        transition-all duration-300 ease-out
        min-w-[260px] max-w-[360px]
        ${visible ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0'}
      `}
    >
      <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">
        {item.sessionTitle}
      </div>
      <div className="text-[11px] text-[var(--text-dim)]">
        {typeLabel}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 创建 ToastContainer 组件**

```typescript
// frontend/src/components/Toast/ToastContainer.tsx
import { useNotificationStore } from '../../store/notificationStore'
import { ToastItem } from './ToastItem'

export function ToastContainer() {
  const items = useNotificationStore((s) => s.items)
  const dismiss = useNotificationStore((s) => s.dismiss)

  if (items.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 40,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {items.map((item) => (
        <div key={item.id} style={{ pointerEvents: 'auto' }}>
          <ToastItem item={item} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/Toast/
git commit -m "feat: add ToastContainer and ToastItem components"
```

---

### Task 6: 前端 — 创建 TrayPopup 悬浮消息列表组件

**Files:**
- Create: `frontend/src/components/TrayPopup/TrayPopup.tsx`

- [ ] **Step 1: 创建 TrayPopup 组件**

```typescript
// frontend/src/components/TrayPopup/TrayPopup.tsx
import { useNotificationStore } from '../../store/notificationStore'

export function TrayPopup() {
  const unreadHistory = useNotificationStore((s) => s.unreadHistory)
  const clearAll = useNotificationStore((s) => s.clearAll)

  if (unreadHistory.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[12px] text-[var(--text-dim)] p-4">
        暂无未读消息
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full select-none" style={{ background: 'var(--bg-elevated)' }}>
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ fontSize: 12 }}>
        {unreadHistory.map((item) => (
          <div
            key={item.id}
            className="py-1.5 border-b border-[var(--border)] last:border-b-0"
          >
            <div className="text-[var(--text-primary)] truncate">{item.sessionTitle}</div>
            <div className="flex justify-between mt-0.5">
              <span className="text-[var(--text-dim)] text-[11px]">
                {item.type === 'reply-complete' ? '回复完成' : '请求权限'}
              </span>
              <span className="text-[var(--text-dim)] text-[11px]">
                {new Date(item.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={clearAll}
        className="mx-3 my-2 py-1.5 text-[12px] text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded transition-colors border-t border-[var(--border)]"
      >
        忽略全部
      </button>
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/components/TrayPopup/
git commit -m "feat: add TrayPopup component for tray hover message list"
```

---

### Task 7: 前端 — 为 TrayPopup 窗口添加路由入口

**Files:**
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/index.html`

- [ ] **Step 1: 在 main.tsx 中添加 tray-popup 路由判断**

在 `frontend/src/main.tsx` 中 `createRoot` 之前添加路由判断：

```typescript
// 在文件顶部 import 后添加：
import { TrayPopup } from './components/TrayPopup/TrayPopup'

// 在 createRoot 前检查 hash:
const isTrayPopup = window.location.hash === '#/tray-popup'

if (isTrayPopup) {
  const root = createRoot(document.getElementById('root')!)
  root.render(
    <React.StrictMode>
      <TrayPopup />
    </React.StrictMode>
  )
} else {
  // 现有的 createRoot + App 渲染逻辑保持不变
}
```

_Note: 需要读取 `main.tsx` 的实际内容确认 exact structure。此处理需要添加 `import React from 'react'`。_

- [ ] **Step 2: 确保 index.html 的 root div 存在**

`frontend/index.html` 应有 `<div id="root"></div>`，无需修改。确认即可。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/main.tsx
git commit -m "feat: add tray-popup route entry in main.tsx"
```

---

### Task 8: 前端 — 修改 TitleBar 关闭按钮行为

**Files:**
- Modify: `frontend/src/components/TitleBar/TitleBar.tsx`

- [ ] **Step 1: 移除关闭按钮中的 QuitApp 调用**

找到关闭按钮的 onClick handler（约第 132 行）：

```typescript
// 修改前:
onClick={async () => { await Window.Close(); await App.QuitApp() }}

// 修改后:
onClick={() => Window.Close()}
```

- [ ] **Step 2: 如果需要，移除 App import（如果不再使用）**

检查 `App` 在 TitleBar.tsx 中是否还有其他引用。如果没有，从 import 中移除。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/TitleBar/TitleBar.tsx
git commit -m "fix: close button hides window instead of quitting app"
```

---

### Task 9: 前端 — 挂载 ToastContainer 到 App

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 在 App 组件中挂载 ToastContainer**

在 App 组件返回的 JSX 中，添加到最外层（和 TitleBar、dockview 同级）：

```typescript
// 在 App.tsx 顶部添加 import
import { ToastContainer } from './components/Toast/ToastContainer'

// 在 App 组件的 return 中，在 TopLevel 或最外层 div 内添加：
return (
  <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg-primary)]">
    <TitleBar />
    {/* 现有 dockview 等内容 */}
    <ToastContainer />
  </div>
)
```

_Note: 需要读取 App.tsx 的 return 部分确认精确结构。_

- [ ] **Step 2: 提交**

```bash
git add frontend/src/App.tsx
git commit -m "feat: mount ToastContainer in App"
```

---

### Task 10: 前端 — 在事件处理中触发通知

**Files:**
- Modify: `frontend/src/store/index.ts`

- [ ] **Step 1: 在 `done` 事件处理中触发通知**

在 `case 'done':` 处理块末尾（`syncActiveMessages(sid)` 之前），添加：

```typescript
// 触发通知
import { useNotificationStore } from './notificationStore'

// 在 done case 中，syncActiveMessages(sid) 之前:
const openSessions = useStore.getState().openSessions
const sessionInfo = openSessions.find((s) => s.id === sid)
const sessionTitle = sessionInfo?.title || sid.slice(0, 8)
useNotificationStore.getState().push({
  sessionId: sid,
  sessionTitle,
  type: 'reply-complete',
  message: '回复完成',
})
```

_Note: 将 `import` 语句放在文件顶部的 import 区域。_

- [ ] **Step 2: 在 `permission_required` 事件处理中触发通知**

在 stream 事件处理的 `permission_required` 分支（约第 1616 行）中，在 `setState({ pendingPermission })` 之后添加：

```typescript
if (data.type === 'permission_required' && permPayload) {
  useStore.setState({ pendingPermission: permPayload })
  // 添加通知
  const openSessions = useStore.getState().openSessions
  const sessionInfo = openSessions.find((s) => s.id === permPayload.sessionId)
  const sessionTitle = sessionInfo?.title || permPayload.sessionId.slice(0, 8)
  useNotificationStore.getState().push({
    sessionId: permPayload.sessionId,
    sessionTitle,
    type: 'permission-request',
    message: `请求: ${permPayload.tool}`,
  })
  // ...
}
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/store/index.ts
git commit -m "feat: trigger notifications on AI done and permission_required events"
```

---

### Task 11: 构建与验证

**Files:** None (build only)

- [ ] **Step 1: 重新生成 Wails bindings**

```bash
cd d:/git/monika
wails3 generate bindings
```

- [ ] **Step 2: 编译前端**

```bash
cd d:/git/monika/frontend
npm run build
```

- [ ] **Step 3: 编译 Go 应用**

```bash
cd d:/git/monika
wails3 build
```

- [ ] **Step 4: 手动验证**

验证清单：
1. 启动应用 → 托盘图标可见
2. 左键点击托盘图标 → 主窗口显隐切换
3. 右键点击托盘图标 → 弹出"退出"菜单
4. 点击主窗口关闭按钮 → 窗口隐藏（不退出）
5. 触发 AI 回复完成 → 右上角 Toast 出现 → 5 秒后消失
6. 主窗口隐藏时触发通知 → 托盘图标开始闪烁
7. 鼠标移到闪烁的托盘图标 → 弹出悬浮消息列表
8. 点击悬浮列表"忽略全部" → 停止闪烁、清空消息
9. 右键托盘菜单点击"退出" → 应用完全退出

- [ ] **Step 5: 提交（如需要修复）**

```bash
git add -A
git commit -m "fix: build and verification adjustments"
```
