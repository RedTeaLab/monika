# P2P Remote Development — Design Spec

**Date**: 2026-06-24
**Status**: Approved
**Branch**: `feat/remote-development`

## Summary

用户 A 通过连接码点对点连接到用户 B 的 Monika 实例，连接后 A 获得对 B 的完整远程操作能力（文件、Agent、终端、数据库等全部功能）。零服务器中转，所有数据端到端加密，基于 Noise Protocol Framework + TCP 传输。

## Motivation

- 当前 Monika 是纯本地桌面应用，无法跨设备协作
- 用户需要在远程机器上操作 Monika（如家里的电脑连公司的电脑）
- 安全优先：不要服务器中转，数据必须端到端加密
- 类似 VS Code Remote SSH 的体验，但不依赖 SSH，使用连接码交换

## 技术选型

**方案：TCP + Noise Protocol + UPnP**

| 组件 | 选型 | 理由 |
|---|---|---|
| 传输层 | TCP (`net.Listen`/`net.Dial`) | 防火墙最友好，几乎所有网络允许出站 TCP |
| 加密层 | Noise Protocol Framework (`flynn/noise` + `go-i2p/go-noise`) | WireGuard/Signal 同级加密，提供 `net.Conn` 包装器 |
| NAT 穿越 | UPnP (`nebulouslabs/go-upnp`) | 覆盖约 70% 消费级路由器 |
| RPC 协议 | JSON-RPC 2.0 over Noise | 与 Wails 的 JSON 序列化天然兼容 |
| 发现机制 | 连接码编码端点 + 公钥 | 零服务器，类似磁力链接 |

### 被排除的方案

- **libp2p** — 100+ 依赖包，为大规模 P2P 网络设计，1:1 远程连接严重过度设计
- **QUIC** — UDP 常被企业网络封锁，quic-go 依赖较重，实际仍需 UPnP
- **WebRTC** — 需要 STUN/TURN 服务器，违反零服务器约束

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  A 端 (客户端 / 前端角色)                             │
│  ┌──────────────┐    ┌───────────────────────────┐  │
│  │  React UI    │───→│  Wails App (本地)         │  │
│  │              │    │                           │  │
│  │  正常操作     │    │  RemoteTransport          │  │
│  │              │    │  ┌─────────────────────┐  │  │
│  └──────────────┘    │  │ JSON-RPC over Noise │  │  │
│                      │  │ Dial(B的连接码)      │  │  │
│                      │  └─────────┬───────────┘  │  │
│                      └────────────┼──────────────┘  │
└───────────────────────────────────┼─────────────────┘
                                    │ TCP + Noise XX
                                    │ (端到端加密)
┌───────────────────────────────────┼─────────────────┐
│                      ┌────────────┼──────────────┐  │
│  B 端 (服务端 / 执行角色)          │              │  │
│  ┌──────────────┐    │  ┌─────────▼───────────┐  │  │
│  │  React UI    │    │  │ NoiseListener       │  │  │
│  │  (本地控制)   │    │  │ (TCP + Noise XX)    │  │  │
│  │              │    │  │ UPnP 端口转发       │  │  │
│  └──────────────┘    │  └─────────┬───────────┘  │  │
│                      │            │              │  │
│                      │  ┌─────────▼───────────┐  │  │
│                      │  │ RemoteRPCHandler    │  │  │
│                      │  │ → 调用本地 App 方法  │  │  │
│                      │  └─────────────────────┘  │  │
│                      └───────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## 新增 Go 包结构

| 包/文件 | 职责 |
|---|---|
| `internal/remote/` | P2P 远程连接核心 |
| `internal/remote/transport.go` | Noise 加密传输：包装 `net.Conn` 为 `NoiseConn` |
| `internal/remote/codec.go` | JSON-RPC 编解码：length-prefixed 帧格式 |
| `internal/remote/server.go` | B 端服务：接受连接，分发 RPC 到本地 App |
| `internal/remote/client.go` | A 端客户端：拨号，发送 RPC 请求 |
| `internal/remote/endpoint.go` | 端点发现：收集本地/公网 IP，UPnP 端口转发 |
| `internal/remote/registry.go` | Method Registry：远程可调用方法白名单 |
| `internal/remote/code.go` | 连接码生成与解析 |
| `internal/api/remote_api.go` | Wails API 层：前端可调用的远程方法 |

## 新增依赖

| 依赖 | 用途 |
|---|---|
| `github.com/flynn/noise` | Noise Protocol Framework 实现 |
| `github.com/go-i2p/go-noise` | Noise 的 `net.Conn`/`net.Listener` 包装器 |
| `github.com/nebulouslabs/go-upnp` | UPnP 自动端口转发 |

## 连接码设计

### 结构

```
B 端生成连接码:

1. 生成临时 Ed25519 密钥对 (每次 serve 新建)
2. 收集端点候选地址:
   ├─ 所有本地网卡 IP (192.168.x.x, 10.x.x.x, 等)
   ├─ UPnP 获取的公网 IP (如有)
   └─ TCP 监听端口
3. 打包为 CBOR 二进制:
   ┌──────────────────────────────────────┐
   │ version: 1                           │
   │ public_key: [32]byte (Ed25519)       │
   │ listen_port: uint16                  │
   │ endpoints: []string                  │
   │   "192.168.1.100:44321"              │
   │   "203.0.113.5:44321"                │
   │ created_at: int64 (unix timestamp)   │
   │ expires_in: 3600 (秒, 默认1小时)      │
   └──────────────────────────────────────┘
4. Base32 编码 + 分组格式化:
   MONIKA-AE2K-PQXB-7KMR-FN3T-WXYZ-2345-6789-...
```

### 安全属性

- **短有效期（默认 1 小时）** — 超时自动失效
- **一次性会话密钥** — 每次 `RemoteServe` 生成新的临时密钥对
- **Base32 编码** — 只用大写字母 + 数字，方便口头传达、微信发送
- **公钥指纹校验** — A 端连接后展示 B 端公钥指纹，用户人工确认

## Noise XX 握手协议

选择 **Noise XX 模式**：

- 双向认证 — A 和 B 互相验证对方公钥
- 前向保密 — 临时 DH 密钥，会话密钥无法从长期密钥推导
- 身份隐藏 — 公钥在加密通道建立后才交换
- 静态密钥重用 — B 可以用长期密钥，A 用临时密钥

```
A (客户端)                              B (服务端)
    │                                      │
    │  1. 解析连接码                         │
    │  2. 提取 B 的公钥 + 端点               │
    │  3. 生成自己的临时 Ed25519 密钥对       │
    │                                      │
    │  4. 依次尝试端点列表中的地址:           │
    │     192.168.1.100:44321 (先试局域网)   │
    │     203.0.113.5:44321  (再试公网)     │
    │                                      │
    │ ─── e, e_e ──────────────────────→   │  XX msg 1: A→B (A的临时公钥)
    │ ←────── e, e_ee, s, es ──────────    │  XX msg 2: B→A (B的临时+静态公钥)
    │ ─── s, ss ───────────────────────→   │  XX msg 3: A→B (A的静态公钥)
    │                                      │
    │ ←═══ 加密通道建立 ═══════════════→    │
    │     ChaChaPoly1305 AEAD 加解密        │
```

## 数据流与 RPC 协议

### JSON-RPC 2.0

所有远程通信使用 JSON-RPC 2.0，帧格式为 length-prefixed（4 字节大端长度 + JSON payload）：

```jsonc
// 请求 (A→B)
{
  "jsonrpc": "2.0",
  "id": 42,
  "method": "App.SendMessage",
  "params": { "sessionID": "abc", "content": "hello" }
}

// 响应 (B→A)
{
  "jsonrpc": "2.0",
  "id": 42,
  "result": { "messageID": "xyz", "status": "ok" }
}

// 通知 (B→A, 无需回复, 用于事件推送)
{
  "jsonrpc": "2.0",
  "method": "stream",
  "params": { "sessionID": "abc", "delta": "这是回复内容...", "done": false }
}
```

### A 端数据流

A 端在 `App` 结构体中增加 `remoteTransport` 字段。前端在远程模式下调用统一入口方法：

```go
func (a *App) RemoteCall(method string, params json.RawMessage) (json.RawMessage, error) {
    if a.remoteTransport == nil {
        return nil, errors.New("not in remote mode")
    }
    return a.remoteTransport.Call(method, params)
}
```

前端进入远程模式后，TS bindings 的调用从 `monika.App.XXX(...)` 切换为 `monika.App.RemoteCall("XXX", params)`。

### 流式事件转发

B 端 Agent streaming 通过 `safeEmit("stream", ...)` 推送。远程模式下：
1. B 的 `RemoteRPCHandler` 拦截 emit，将事件作为 JSON-RPC notification 发送给 A
2. A 的 `RemoteTransport` 接收 notification，调用本地 `safeEmit` 推送给 A 的前端
3. A 的前端无感知 — 收到的 stream 事件格式与本地完全一致

### B 端 RPC 分发

B 端 `RemoteRPCHandler` 收到 JSON-RPC 请求后：
1. 查 Method Registry 白名单
2. 反射调用对应的 App 方法
3. 结果编码为 JSON-RPC response 返回

### 并发与多路复用

- 每个请求有唯一 `id`，响应按 `id` 匹配，不依赖顺序
- B 端每个请求在独立 goroutine 中执行
- 流式 notification 不占用请求-响应配对，可以随时穿插
- 连接关闭时，所有未完成的请求返回 error

## 端点发现与 NAT 穿越

### B 端端点发现流程

```
RemoteServe() 调用后:

1. TCP Listen 0.0.0.0:0 (随机端口) 或指定端口
2. 收集本地 IP (net.InterfaceAddrs)
   ├─ 192.168.1.100:44321  (IPv4 LAN)
   ├─ 10.0.0.5:44321       (Docker/VPN)
   └─ IPv6 地址 (如有)
3. UPnP 发现 (异步, 3秒超时)
   ├─ 发现路由器 → 请求端口映射 → 添加公网端点
   └─ 未发现 → 跳过
4. 合并去重，按优先级排序: LAN 优先, WAN 次之
```

UPnP 操作异步执行，不阻塞 `RemoteServe()` 返回。停止服务时清理 UPnP 映射。

### A 端连接策略（Happy Eyeballs 风格）

```
1. 将端点按类型分组: LAN 端点 + WAN 端点
2. 并发拨号，每个端点 3 秒超时
3. 第一个成功的 Noise 握手 → 取消其他拨号 → 使用该连接
4. 全部失败 → 返回错误 + 失败原因
```

### NAT 穿越成功率

| 场景 | 成功率 |
|---|---|
| 同一局域网 | ~100% |
| B 端有 UPnP 路由器 | ~70% |
| B 端有公网 IP | ~100% |
| 对称 NAT (运营商级 NAT) | ~0% — 提示用户 B 端网络不支持 |

### IPv6

B 端如有全球单播 IPv6 地址，直接加入端点列表，IPv6 通常无 NAT 问题。

## 安全设计

### 威胁模型与对策

| 威胁 | 对策 |
|---|---|
| 中间人攻击 (MITM) | Noise XX 握手验证公钥 = 连接码中的公钥 |
| 连接码泄露 | 1小时过期 + 一次性密钥 + B 端 UI 显示连接信息 |
| 暴力扫描端口 | 无密码不响应 — Noise 握手未完成前不返回任何数据 |
| 重放攻击 | Noise 内置 nonce 计数器 |
| 恶意 A 滥用权限 | Method Registry 白名单 + B 端可一键断开 + 操作日志 |
| 伪造 B 端钓鱼 | A 端展示 B 的公钥指纹，用户人工核对 |

### 加密层保证

- ChaChaPoly1305 AEAD — 机密性 + 完整性
- 前向保密 — 临时 DH 密钥
- 双向认证 — Noise XX
- 防重放 — nonce 单调递增
- 身份隐藏 — 公钥在加密通道建立后传输

### Method Registry — 不暴露的方法

以下方法明确排除在远程调用之外：

```
"RemoteServe"      — 防止链式代理
"RemoteStop"       — 防止远程关闭服务
"RemoteConnect"    — 防止 A→B→C 链式
"RemoteDisconnect" — A 只能断开自己
"RemoteStatus"     — 内部状态不暴露
"GetConfig"        — 含 API Key
"SetConfig"        — 防止远程篡改本地配置
```

### 连接上限

B 端默认只允许 1 个 A 端连接（可配置 `maxClients`）。

## 错误处理

| 错误场景 | 处理 |
|---|---|
| 连接码格式无效 | 解码阶段拒绝 |
| 连接码已过期 | `expires_at` 校验 |
| 所有端点不可达 | 拨号全部超时，列出尝试过的端点和失败原因 |
| Noise 握手失败 | 公钥不匹配，提示连接码可能已失效 |
| 连接中途断开 | 心跳超时/TCP RST，通知前端，不自动重连 |
| B 端拒绝连接 | 已有 A 连接着，提示稍后重试 |
| RPC 方法不存在 | Method Registry 拒绝 |
| RPC 执行错误 | 正常返回 error，透传 B 端的错误信息 |

### 心跳机制

每 30 秒一次 ping/pong，连续 3 次未响应判定连接断开，释放资源。

### 资源清理

B 端 `RemoteStop()` 或连接断开时：
1. 停止接受新连接
2. 向已连接的 A 发送 disconnect 通知
3. 关闭所有活跃连接
4. 删除 UPnP 端口映射
5. 清理临时密钥对
6. 清空 Method Registry
7. 停止心跳定时器

A 端 `RemoteDisconnect()` 或连接断开时：
1. 取消所有未完成的 RPC 请求
2. 关闭 Noise 连接
3. 通知前端 (`safeEmit("remote-disconnected")`)
4. 清理本地状态

### 操作日志

B 端维护内存环形缓冲（最近 1000 条），记录所有远程调用的 method + 时间戳，B 端用户可在 UI 查看。

## 连接管理 UX

### 集成方式

**状态栏最左侧图标 + 模态窗口**，不集成到 Dockview。类似 VS Code 的 Remote SSH 体验。

图标状态：
- 灰色圆圈 — 未连接 (idle)
- 蓝色半圆 — 连接中 (connecting)
- 绿色实心圆 — 已连接 (connected)
- 红色实心圆 — 服务端运行中 (serving)

### B 端模态窗口

点击图标 → 模态窗口含两个入口：「连接到远程」「提供服务」。

选择「提供服务」后展示：
- 服务状态（运行中/已停止）
- 连接码（可复制、生成二维码、刷新）
- 剩余有效期倒计时
- 当前连接的 A 端列表（指纹、IP、连接时间、断开按钮）
- 操作日志（最近 20 条，可查看全部）
- 停止服务按钮

### A 端模态窗口

选择「连接到远程」后展示：
- 连接码输入框（粘贴或扫码）
- 连接进度（正在尝试哪个端点）
- 连接成功后展示 B 端公钥指纹（首次需确认信任）
- 连接时长、延迟
- 断开连接按钮

连接后主界面顶部状态栏标明远程模式。

### 前端组件

- `RemoteIcon.tsx` — 状态栏左侧图标组件
- `RemoteModal.tsx` — 模态窗口（客户端面板 + 服务端面板）
- Store 新增 `remote` slice

```typescript
interface RemoteState {
  mode: 'idle' | 'serving' | 'connecting' | 'connected'
  modalOpen: boolean
  // B 端
  serveCode: string
  serveCodeExpiresAt: number
  serveClients: RemoteClient[]
  serveLog: LogEntry[]
  // A 端
  remoteFingerprint: string
  remoteEndpoint: string
  connectedAt: number
}
```

## Wails API

### A 端可调用（`internal/api/remote_api.go`）

| 方法 | 说明 |
|---|---|
| `RemoteConnect(code string)` | 用连接码拨入 B |
| `RemoteDisconnect()` | 断开连接 |
| `RemoteStatus()` | 连接状态 |
| `RemoteCall(method, params)` | 远程方法调用入口 |

### B 端可调用

| 方法 | 说明 |
|---|---|
| `RemoteServe()` | 启动监听，生成连接码 |
| `RemoteStop()` | 停止监听 |
| `RemoteRefreshCode()` | 刷新连接码 |
| `RemoteSessions()` | 当前连接列表 |
| `RemoteKick(clientID)` | 断开指定 A 端 |
| `RemoteLog()` | 获取操作日志 |

## 配置项

`~/.monika/config.json` 新增 `remote` 段：

```jsonc
{
  "remote": {
    "maxClients": 1,            // B 端最大 A 连接数
    "defaultPort": 0,           // B 端监听端口, 0 = 随机
    "codeTTL": 3600,            // 连接码有效期 (秒)
    "heartbeatInterval": 30,    // 心跳间隔 (秒)
    "heartbeatTimeout": 3,      // 心跳失败重试次数
    "enableUPnP": true,         // 是否自动 UPnP 端口转发
    "trustedFingerprints": []   // A 端已信任的 B 端指纹列表
  }
}
```

## 连接生命周期

```
状态机:

A 端 (客户端)                        B 端 (服务端)
  Disconnected                        Idle
       │ RemoteConnect(code)             │ RemoteServe()
       ▼                                 ▼
  Connecting ─── Noise XX 握手 ──→     Serving
       │ 握手成功                         │ 接受连接
       ▼                                 ▼
  Connected ←══ JSON-RPC 双向通信 ══→ Connected
       │ RemoteDisconnect()              │ 连接断开/超时
       ▼                                 │ 或 RemoteStop()
  Disconnected                          Idle/Serving
```
