# 消息通知与系统托盘 — 设计文档

日期：2026-06-01

## 概述

为 Monika 添加消息通知能力，包括：

1. **关闭到托盘**：窗口关闭按钮不退出应用，改为隐藏到系统托盘
2. **系统托盘功能**：托盘图标、右键退出、左键打开主窗口、未读消息悬浮列表
3. **应用内 Toast 通知**：右上角弹出式通知，自动消失

---

## 动机

Monika 作为 AI 编程编辑器，在运行 agent 任务时用户可能切换到其他窗口。当前应用关闭即退出，用户无法后台等待 AI 完成任务。增加托盘和通知后，用户可以最小化/关闭窗口让 AI 在后台工作，完成后收到通知提醒。

---

## 架构

```
Go 后端 (Wails)                          前端 (React)
──────────────────────                ─────────────────────────
TrayManager                             
  - 托盘图标 / 闪烁控制                  Zustand Stores
  - 右键菜单（退出）                      - notificationStore（消息队列 + 未读计数）
  - 左键显隐主窗口                        - sessionStore 已有 session title
  - OnClose 拦截 → Hide()              
  - OnMouseEnter → 创建悬浮窗口          ToastSystem（右上角弹出）
  - OnMouseLeave → 关闭悬浮窗口           - 自动消失（5秒）
  - 悬浮窗口定位（bounds + offset）       - session 标题 + 简要描述
  - SetIcon 运行时切换图标（闪烁）
                                        悬浮消息窗口：
  App API 扩展                             - 消息列表（session 标题 + 时间）
  - SendTrayNotification(title, body)     - "忽略全部"按钮 → 清除未读
    → 前端调用，触发托盘闪烁
  - ClearTrayNotifications() → 停止闪烁/关悬浮窗
```

### 通信流

```
AI 回复完成 / 权限请求
    │
    ▼
前端 push 通知到 notificationStore
    │
    ├─► 渲染 Toast（右上角，5秒消失）
    │
    ├─► 通知未读计数 +1
    │
    ├─► 调用 Go: App.SendTrayNotification(title, body)
    │       └─► Go: tray.SetIcon 开始闪烁
    │
    └─► 主窗口不可见时，悬浮窗口按需显示消息列表

用户点击 Toast / 悬浮窗口 "忽略全部"
    │
    ▼
notificationStore.clearAll()
    ├─► 停止闪烁
    └─► 关闭悬浮窗口
```

---

## 详细设计

### 1. 关闭到托盘

**Go 端（`main.go` 或新文件 `internal/api/tray.go`）**

- 创建 `SystemTray`，通过 `AttachWindow(mainWindow)` 关联主窗口
- 注册 `OnClose` 钩子：拦截窗口关闭事件，调用 `mainWindow.Hide()` 替代默认的关闭行为
- "退出"仅由托盘右键菜单触发，调用 `application.Get().Quit()`

**前端（`TitleBar.tsx`）**

- 关闭按钮：仅调用 `Window.Close()`，不再调用 `App.QuitApp()`
- Wails 的 `Window.Close()` 会触发 Go 层的 OnClose 钩子，然后被拦截为 Hide

### 2. 托盘功能

#### 2.1 托盘图标与闪烁

- 使用现有应用图标 `winres/icon.ico` 作为默认托盘图标
- 需要额外准备一个"高亮"版本图标（或在代码中动态生成）
- 有未读消息时，Go 层启动 ticker，每 500ms 交替调用 `SetIcon(normal)` / `SetIcon(highlight)`
- 消息全部清除后停止 ticker，恢复静态图标

#### 2.2 交互

| 操作 | 行为 |
|------|------|
| 左键单击 | 切换主窗口显隐（Wails 内置 `ToggleWindow`） |
| 右键单击 | 弹出上下文菜单，包含"退出"一项 |
| 退出 | 停止闪烁 ticker、销毁托盘、调用 `application.Get().Quit()` |

#### 2.3 悬浮消息列表

- 使用 Wails `OnMouseEnter` / `OnMouseLeave` 事件
- 鼠标进入托盘图标时：
  - 通过 `bounds()` 获取托盘图标屏幕坐标
  - 创建/定位一个 frameless 小窗口在托盘图标上方
  - 窗口尺寸约 280×200px，显示消息列表
- 消息列表内容：
  - 每项：session 标题 + 时间（如 "feat:xx功能实现 14:32"）
  - 底部"忽略全部"按钮
- 鼠标离开托盘图标且离开悬浮窗口后，关闭悬浮窗口（使用 debounce 防抖，约 300ms）
- 如果主窗口当前可见，不弹出悬浮窗口

#### 2.4 Wails v3 API 使用

- `application.NewTray()` — 创建托盘
- `tray.SetIcon()` / `tray.SetDarkModeIcon()` — 设置图标
- `tray.SetMenu()` — 右键菜单
- `tray.AttachWindow()` — 关联主窗口（左键切换显隐）
- `tray.OnMouseEnter()` / `tray.OnMouseLeave()` — 悬浮事件
- `tray.bounds()` — 获取托盘图标坐标（用于定位悬浮窗口）
- `tray.SetTooltip()` — 设置提示文字
- 窗口 `OnClose` 事件钩子 — 拦截关闭

### 3. 应用内 Toast 通知

#### 3.1 Toast 组件

- 位置：右上角，距顶部 40px，距右侧 16px
- 外观：浅色背景卡片，带边框，圆角 6px，阴影
- 内容：session 标题 + 简要描述
  - AI 回复完成："{session标题} — 回复完成"
  - 权限请求："{session标题} — 请求权限"
- 行为：弹出动画（从右侧滑入），5 秒后自动消失（淡出）
- 支持叠加：多条通知垂直排列，每条有独立的消失计时器

#### 3.2 Zustand Store

```typescript
// notificationStore
interface NotificationItem {
  id: string
  sessionTitle: string
  type: 'reply-complete' | 'permission-request'
  message: string
  timestamp: number
}

interface NotificationStore {
  items: NotificationItem[]      // Toast 列队
  unreadHistory: NotificationItem[] // 所有未读消息（供悬浮窗口使用）
  unreadCount: number
  
  push(item: NotificationItem): void
  dismiss(id: string): void          // 单条消失（自动或手动）
  clearAll(): void                   // "忽略全部"
}
```

#### 3.3 触发点

| 触发场景 | 位置 |
|---------|------|
| AI 回复完成 | Agent loop 结束 / stream 完成回调处 |
| 权限请求 | `permission.Pipeline` 检查触发时 |

前端已有 `EventBus` 事件流，可以在相应事件处理中调用 `notificationStore.push()`。

#### 3.4 Toast vs 托盘已读逻辑

- **Toast 消失 ≠ 已读**：Toast 自动消失后消息仍保留在 `unreadHistory`
- **主窗口可见时自动已读**：当主窗口处于显示状态（未被 Hide 到托盘），且获得焦点时，所有未读消息自动标记为已读
- **手动已读**：用户在悬浮窗口中点"忽略全部"
- **已读后**：停止图标闪烁、清空 `unreadHistory`、关闭悬浮窗口

---

## 接口变更

### Go 服务新增方法（`internal/api/app.go` 或 `tray.go`）

```
// SendTrayNotification 前端调用，触发托盘通知（标题 + 正文）
func (a *App) SendTrayNotification(title string, body string)

// ClearTrayNotifications 前端调用，清除所有未读
func (a *App) ClearTrayNotifications()
```

### 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `main.go` | 修改 | 创建 Tray，注册 OnClose 钩子 |
| `internal/api/tray.go` | **新增** | TrayManager 核心逻辑 |
| `internal/api/app.go` | 修改 | 新增 SendTrayNotification / ClearTrayNotifications |
| `frontend/src/components/Toast/ToastContainer.tsx` | **新增** | Toast 通知容器 |
| `frontend/src/components/Toast/ToastItem.tsx` | **新增** | 单条 Toast |
| `frontend/src/components/TrayPopup/TrayPopup.tsx` | **新增** | 悬浮消息列表窗口 |
| `frontend/src/store/notificationStore.ts` | **新增** | Zustand 通知状态 |
| `frontend/src/store/index.ts` | 修改 | 导出 notificationStore |
| `frontend/src/components/TitleBar/TitleBar.tsx` | 修改 | 关闭按钮不再调用 QuitApp |
| `frontend/src/App.tsx` | 修改 | 挂载 ToastContainer |
| `frontend/bindings/monika/` | 自动生成 | Wails 绑定更新 |

---

## 待定 / 风险

1. **高亮图标**：需要设计或从现有图标导出高亮变体。可先用现有图标 + Go image 库调亮 20%
2. **Wails v3 alpha 稳定性**：`OnMouseEnter`/`OnMouseLeave` 在 Windows 上的实际行为需要验证
3. **悬浮窗口的焦点管理**：frameless 弹出窗口不应抢夺焦点，需要测试
4. **多显示器**：`bounds()` 和窗口定位需要考虑多屏场景

---

## 开源替代方案

Wails v3 内置 API 已覆盖所需功能，无外部依赖。唯一额外资源是高亮版图标。
