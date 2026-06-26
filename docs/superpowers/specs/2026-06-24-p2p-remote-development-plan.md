# P2P Remote Development — Implementation Plan

**Spec**: `docs/superpowers/specs/2026-06-24-p2p-remote-development-design.md`
**Branch**: `feat/remote-development`

## 实施阶段总览

| 阶段 | 内容 | 预估文件数 |
|---|---|---|
| P1 | 依赖引入 + 配置层 | 3 |
| P2 | 连接码生成与解析 | 2 |
| P3 | Noise 加密传输层 | 2 |
| P4 | JSON-RPC 编解码 + Method Registry | 2 |
| P5 | B 端服务 (Server + Endpoint Discovery) | 3 |
| P6 | A 端客户端 (Client + Dialer) | 2 |
| P7 | App 层集成 + Wails API | 2 |
| P8 | 前端 Store + StatusBar + Modal | 4 |
| P9 | Wails bindings 生成 + 联调 | 2 |

---

## P1: 依赖引入 + 配置层

### P1-1: go.mod 添加依赖
- `go get github.com/flynn/noise`
- `go get github.com/go-i2p/go-noise`
- `go get github.com/nebulouslabs/go-upnp`
- 验证 `go mod tidy` 通过

### P1-2: Config 新增 Remote 段
- `internal/config/config.go` — 新增 `RemoteConfig` 结构体 + 加入 `Config` 结构体
- `internal/config/config.go` — `Merge()` 函数新增 remote 字段合并逻辑
- 结构体字段：
  ```go
  type RemoteConfig struct {
      MaxClients          int      `yaml:"max_clients" json:"max_clients"`
      DefaultPort         int      `yaml:"default_port" json:"default_port"`
      CodeTTL             int      `yaml:"code_ttl" json:"code_ttl"`
      HeartbeatInterval   int      `yaml:"heartbeat_interval" json:"heartbeat_interval"`
      HeartbeatTimeout    int      `yaml:"heartbeat_timeout" json:"heartbeat_timeout"`
      EnableUPnP          bool     `yaml:"enable_upnp" json:"enable_upnP"`
      TrustedFingerprints []string `yaml:"trusted_fingerprints" json:"trusted_fingerprints"`
  }
  ```

---

## P2: 连接码生成与解析

### P2-1: 连接码核心 (`internal/remote/code.go`)
- `ConnectionCode` 结构体 (version, public_key, listen_port, endpoints, created_at, expires_in)
- `GenerateConnectionCode(key [32]byte, port int, endpoints []string, ttl int) (string, error)` — 编码为 Base32 + `MONIKA-` 前缀 + 分组格式化
- `ParseConnectionCode(code string) (*ConnectionCode, error)` — 解码 + 过期校验
- `Fingerprint(pubKey [32]byte) string` — 公钥指纹 (SHA256 前 16 字节, Base32, 分组显示)
- 编码使用 CBOR (紧凑二进制), 解码后 Base32 编码
- 连接码格式: `MONIKA-XXXX-XXXX-XXXX-...`

---

## P3: Noise 加密传输层

### P3-1: Noise 传输 (`internal/remote/transport.go`)
- 基于 `go-i2p/go-noise` 包装 `net.Conn` 为加密连接
- `NoiseDialer` — A 端拨号: 接受端点地址 + B 的公钥, 返回加密 `net.Conn`
  - 生成临时 Ed25519 密钥对
  - 执行 Noise XX 握手 (3 次消息交换)
  - 返回 `noise.Conn` (实现 `net.Conn`)
- `NoiseListener` — B 端监听: 包装 `net.Listener`, Accept 返回加密连接
  - 持有 B 的静态 Ed25519 密钥对
  - Accept 时执行 Noise XX 握手的服务端部分

### P3-2: 帧协议 (`internal/remote/codec.go`)
- `ReadFrame(r io.Reader) ([]byte, error)` — 读取 4 字节大端长度 + payload
- `WriteFrame(w io.Writer, data []byte) error` — 写入 4 字节大端长度 + payload
- `MaxFrameSize = 16 * 1024 * 1024` (16MB, 防恶意大帧)

---

## P4: JSON-RPC 编解码 + Method Registry

### P4-1: JSON-RPC 类型 (`internal/remote/rpc.go`)
- `RPCRequest` 结构体 (jsonrpc, id, method, params)
- `RPCResponse` 结构体 (jsonrpc, id, result, error)
- `RPCNotification` 结构体 (jsonrpc, method, params) — 无 id
- `RPCError` 结构体 (code, message, data)
- 错误码常量 (沿用 JSON-RPC 2.0 标准: -32700 ~ -32603)

### P4-2: Method Registry (`internal/remote/registry.go`)
- `MethodRegistry` 结构体: `map[string]reflect.Value` + `sync.RWMutex`
- `Register(name string, fn interface{})` — 注册方法
- `Call(ctx context.Context, name string, params json.RawMessage) (json.RawMessage, error)` — 反射调用
- `BuildDefaultRegistry(app *api.App) *MethodRegistry` — 注册所有允许远程调用的 App 方法, 排除黑名单

---

## P5: B 端服务 (Server + Endpoint Discovery)

### P5-1: 端点发现 (`internal/remote/endpoint.go`)
- `DiscoverEndpoints(port int, enableUPnP bool) (endpoints []string, externalIP string, upnpMapping *UPnPMapping, err error)`
- `collectLocalIPs()` — 遍历 `net.InterfaceAddrs()`, 过滤回环/IPv6 link-local
- `tryUPnP(internalPort int)` — 调用 `go-upnp` Discover + AddPortMapping + GetExternalIP, 3 秒超时
- `UPnPMapping` 结构体 — 持有 UPnP 客户端引用, `Close()` 时 DeletePortMapping
- IP 排序: LAN 优先 (192.168/10/172.16), WAN 次之

### P5-2: 远程 Server (`internal/remote/server.go`)
- `RemoteServer` 结构体:
  ```go
  type RemoteServer struct {
      mu          sync.Mutex
      listener    *NoiseListener
      upnpMapping *UPnPMapping
      staticKey   ed25519.PrivateKey  // B 的静态密钥
      registry    *MethodRegistry
      clients     map[string]*remoteClient  // clientID → client
      maxClients  int
      logBuffer   *ringBuffer               // 环形缓冲, 1000 条
      onEvent     func(clientID string, event StreamEvent) // 事件拦截回调
      cancel      context.CancelFunc
  }
  ```
- `Serve(port int, enableUPnP bool) (code string, err error)` — 启动监听, 端点发现, 生成连接码
- `Stop()` — 停止监听, 关闭所有客户端连接, 清理 UPnP, 清零密钥
- `RefreshCode() (string, error)` — 重新生成密钥对和连接码, 不中断现有连接
- `KickClient(clientID string)` — 断开指定客户端
- `GetClients() []ClientInfo` — 当前连接列表
- `GetLog() []LogEntry` — 操作日志
- 客户端连接处理循环: 接受连接 → 验证连接上限 → 启动读写 goroutine → 心跳
- RPC 处理: 读取帧 → 解析 JSON-RPC → registry.Call → 写回响应
- 事件拦截: 接收 `onEvent` 回调, 将事件作为 JSON-RPC notification 发给对应客户端

---

## P6: A 端客户端 (Client + Dialer)

### P6-1: 远程 Client (`internal/remote/client.go`)
- `RemoteClient` 结构体:
  ```go
  type RemoteClient struct {
      mu          sync.Mutex
      conn        net.Conn           // Noise 加密连接
      pending     map[int64]chan RPCResponse  // id → 响应通道
      nextID      atomic.Int64
      onNotification func(method string, params json.RawMessage) // 事件回调
      cancel      context.CancelFunc
      connected   atomic.Bool
  }
  ```
- `Dial(code string) (*RemoteClient, error)` — 解析连接码, Happy Eyeballs 并发拨号, Noise XX 握手
- `Call(method string, params json.RawMessage) (json.RawMessage, error)` — 发送 RPC 请求, 等待响应 (带超时)
- `Close()` — 关闭连接, 取消所有 pending 请求
- `IsConnected() bool`
- 读循环 goroutine: 读取帧 → 解析 JSON-RPC → 如果有 id 则匹配 pending, 无 id 则走 notification 回调
- 心跳 goroutine: 每 N 秒发送 ping notification, 超时判定断开
- `happyEyeballsDial(endpoints []string, remotePubKey [32]byte) (net.Conn, error)` — 并发拨号, 首个成功者胜出

---

## P7: App 层集成 + Wails API

### P7-1: App 结构体集成 (`internal/api/app.go`)
- App 结构体新增字段:
  ```go
  remoteServer   *remote.RemoteServer   // B 端服务
  remoteClient   *remote.RemoteClient   // A 端客户端
  remoteMu       sync.RWMutex
  ```
- 新增 `SetRemoteServer` / `SetRemoteClient` 方法 (供 main.go 注入)

### P7-2: Wails API (`internal/api/remote_api.go`)
- B 端方法:
  - `RemoteServe() (string, error)` — 返回连接码
  - `RemoteStop() error`
  - `RemoteRefreshCode() (string, error)`
  - `RemoteSessions() []remote.ClientInfo`
  - `RemoteKick(clientID string) error`
  - `RemoteLog() []remote.LogEntry`
- A 端方法:
  - `RemoteConnect(code string) error`
  - `RemoteDisconnect() error`
  - `RemoteStatus() *RemoteStatus` — 返回当前连接状态 + 指纹
  - `RemoteCall(method string, params json.RawMessage) (json.RawMessage, error)`
- 事件推送:
  - 远程状态变化时 `safeEmit("remote-status", ...)`
  - A 端收到 B 端 stream 事件时 `safeEmit("stream", ...)`

### P7-3: main.go 服务组装
- 在 `main.go` 中创建 `RemoteServer` 实例, 调用 `appService.SetRemoteServer(...)` (同 DAP/DAPManager 模式)

---

## P8: 前端 Store + StatusBar + Modal

### P8-1: Store 新增 remote slice (`frontend/src/store/index.ts`)
- `AppState` 接口新增:
  ```ts
  // 远程状态
  remoteMode: 'idle' | 'serving' | 'connecting' | 'connected'
  remoteModalOpen: boolean
  // B 端
  serveCode: string
  serveCodeExpiresAt: number
  serveClients: RemoteClientInfo[]
  serveLog: RemoteLogEntry[]
  // A 端
  remoteFingerprint: string
  remoteEndpoint: string
  remoteConnectedAt: number
  // actions
  toggleRemoteModal: () => void
  setRemoteMode: (mode) => void
  remoteServe: () => Promise<void>
  remoteStop: () => Promise<void>
  remoteRefreshCode: () => Promise<void>
  remoteKick: (clientID: string) => Promise<void>
  remoteConnect: (code: string) => Promise<void>
  remoteDisconnect: () => Promise<void>
  loadRemoteStatus: () => Promise<void>
  ```
- 初始值 + action 实现 (调用 Wails bindings)
- 监听 `remote-status` 事件更新 store

### P8-2: StatusBar 远程图标 (`frontend/src/components/StatusBar/StatusBar.tsx`)
- 在状态栏最左侧 (ready 指示灯之前) 插入远程连接图标
- 根据 `remoteMode` 显示不同颜色圆点:
  - idle: 灰色 (`var(--text-dim)`)
  - connecting: 蓝色脉冲 (`var(--blue)`)
  - connected: 绿色 (`var(--green)`)
  - serving: 红色 (`var(--red)`)
- 点击图标 → `toggleRemoteModal()`

### P8-3: RemoteModal 组件 (`frontend/src/components/Remote/RemoteModal.tsx`)
- 模态窗口, 使用现有 `components/ui/Modal.tsx` 基础组件
- 入口页: 两个大按钮「连接到远程」「提供服务」
- 客户端面板:
  - 连接码输入框 + 粘贴按钮
  - 连接进度显示
  - 连接成功后显示 B 端公钥指纹 + 确认信任
  - 连接信息 (端点、时长) + 断开按钮
- 服务端面板:
  - 服务状态
  - 连接码显示 + 复制 + 二维码 + 刷新 + 倒计时
  - 当前连接列表 + 断开按钮
  - 操作日志列表
  - 停止服务按钮

### P8-4: 类型定义 + 事件监听
- `frontend/src/components/Remote/types.ts` — `RemoteClientInfo`, `RemoteLogEntry`, `RemoteStatus` 类型
- `frontend/src/App.tsx` — 在根组件中注册 `remote-status` 事件监听 (类似 stream 事件监听)
- `frontend/src/components/Remote/QRCode.tsx` — 连接码二维码 (使用轻量 canvas 绘制或 npm 依赖)

---

## P9: Wails bindings 生成 + 联调

### P9-1: 生成 bindings
```bash
wails3 generate bindings -ts
node -e "require('fs').copyFileSync('build/barrel_index.ts','frontend/bindings/monika/index.ts')"
```

### P9-2: 编译验证
- `go build .` 通过
- `cd frontend && npm run build` 通过
- 手动测试局域网连接流程 (B 端 serve → A 端 connect → RPC 调用)

---

## 任务依赖关系

```
P1 (依赖+配置) ──→ P2 (连接码) ──→ P3 (Noise传输) ──→ P4 (RPC+Registry)
                                                    ↓
                                              P5 (B端Server) ──┐
                                              P6 (A端Client) ──┤
                                                                ↓
                                              P7 (App集成) ──── P8 (前端) ──→ P9 (联调)
```

P5 和 P6 可以并行开发。P8 依赖 P7 的 API 定义完成。
