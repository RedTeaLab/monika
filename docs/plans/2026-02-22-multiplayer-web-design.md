# M2 多人 Web 版设计文档

**创建日期**: 2026-02-22
**状态**: 已批准
**预计周期**: 3周（15个工作日）
**团队规模**: 2-3个全栈开发者 + 1个Team Lead

---

## 一、概述

### 1.1 目标

在M1单人Web版基础上，实现多人在线协作跑团功能，支持2-4人同团游戏。

### 1.2 核心功能

- Campaign管理（创建团、邀请、加入）
- WebSocket实时通信
- 聚光灯系统（发言队列管理）
- 可见性控制（公开/KP-only/私密）
- 并发输入处理
- 断线恢复

### 1.3 开发策略

- **团队模式**: 小型敏捷团队（2-3全栈 + 1 Team Lead）
- **开发流程**: 严格TDD（测试先行，80%+覆盖率）
- **任务分配**: 垂直切片优先，按最小可用户故事划分

---

## 二、系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React + Vite)                 │
├─────────────┬─────────────┬─────────────┬──────────────────┤
│ Campaign UI │  Game UI    │  Presence   │  Real-time UI    │
│  (团管理)    │  (多人游戏台) │  (在线状态)  │  (聚光灯/队列)   │
└─────────────┴─────────────┴─────────────┴──────────────────┘
                            ↕ WebSocket + REST
┌─────────────────────────────────────────────────────────────┐
│                   Backend (FastAPI)                         │
├─────────────┬─────────────┬─────────────┬──────────────────┤
│ Campaign    │  WebSocket  │  Game       │  Visibility      │
│  Service    │   Manager   │  Logic      │   Filter         │
└─────────────┴─────────────┴─────────────┴──────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                  Database (PostgreSQL)                      │
├─────────────┬─────────────┬─────────────┬──────────────────┤
│ Campaigns   │  Campaign   │  Messages   │  Spotlight       │
│             │  Members    │             │   Queue          │
└─────────────┴─────────────┴─────────────┴──────────────────┘
```

### 2.2 技术栈扩展

**后端新增**:
- `python-socketio`: WebSocket服务器（替换FastAPI WebSocket）
- `redis`: 消息队列和会话缓存（可选，先用内存实现）
- `asyncio`锁: 并发控制

**前端新增**:
- `socket.io-client`: WebSocket客户端
- React Context: 全局状态管理（在线用户、聚光灯状态）

**数据库新增表**:
- `campaigns`: 团信息
- `campaign_members`: 成员关系
- `invitations`: 邀请码
- `messages`扩展: 可见性字段
- `spotlight_queue`: 发言队列

---

## 三、数据库设计

### 3.1 Campaigns 表

```sql
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    keeper_id UUID NOT NULL REFERENCES users(id),
    scenario_id UUID,
    invite_code VARCHAR(20) UNIQUE NOT NULL,
    max_players INTEGER DEFAULT 4,
    status VARCHAR(20) DEFAULT 'active',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_campaigns_keeper ON campaigns(keeper_id);
CREATE INDEX idx_campaigns_invite_code ON campaigns(invite_code);
```

### 3.2 Campaign Members 表

```sql
CREATE TABLE campaign_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    character_id UUID REFERENCES characters(id),
    role VARCHAR(20) NOT NULL DEFAULT 'player',
    status VARCHAR(20) DEFAULT 'active',
    joined_at TIMESTAMP DEFAULT NOW(),
    last_seen_at TIMESTAMP,

    UNIQUE(campaign_id, user_id)
);

CREATE INDEX idx_campaign_members_campaign ON campaign_members(campaign_id);
CREATE INDEX idx_campaign_members_user ON campaign_members(user_id);
```

### 3.3 Messages 表扩展

```sql
ALTER TABLE messages ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'public';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS visible_to UUID[];
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_character_id UUID;
```

**visibility 可选值**:
- `public`: 所有人可见
- `kp`: 仅KP可见
- `party`: 所有玩家 + KP可见
- `private`: 仅特定用户可见

### 3.4 Spotlight Queue 表

```sql
CREATE TABLE spotlight_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES game_sessions(id),
    user_id UUID NOT NULL REFERENCES users(id),
    character_id UUID REFERENCES characters(id),
    position INTEGER NOT NULL,
    type VARCHAR(20) DEFAULT 'normal',
    status VARCHAR(20) DEFAULT 'waiting',
    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(session_id, user_id, position)
);

CREATE INDEX idx_spotlight_queue_session ON spotlight_queue(session_id);
```

---

## 四、API设计

### 4.1 Campaign 管理 API

#### 创建团
```http
POST /api/campaigns
Content-Type: application/json

{
  "name": "迷雾之城",
  "description": "1920年代波士顿调查",
  "scenario_id": "uuid-or-null",
  "max_players": 4
}

Response 201:
{
  "id": "uuid",
  "name": "迷雾之城",
  "invite_code": "ABC123",
  "keeper_id": "uuid",
  ...
}
```

#### 加入团
```http
POST /api/campaigns/join
Content-Type: application/json

{
  "invite_code": "ABC123",
  "character_id": "uuid"
}

Response 200:
{
  "campaign_id": "uuid",
  "member_id": "uuid",
  "role": "player"
}
```

#### 获取我的团列表
```http
GET /api/campaigns/my

Response 200:
[
  {"id": "uuid", "name": "迷雾之城", "role": "keeper"},
  {"id": "uuid", "name": "暗影追踪", "role": "player"}
]
```

### 4.2 聚光灯 API

#### 请求聚光灯
```http
POST /api/game/spotlight/request
Content-Type: application/json

{
  "session_id": "uuid"
}

Response 200:
{
  "queue_position": 2,
  "estimated_wait": "5分钟"
}
```

#### 释放聚光灯
```http
POST /api/game/spotlight/release
Content-Type: application/json

{
  "session_id": "uuid"
}

Response 200:
{
  "next_user_id": "uuid",
  "message": "聚光灯已转移给 Player2"
}
```

---

## 五、WebSocket事件设计

### 5.1 客户端 → 服务器

```typescript
interface ClientEvents {
  // 连接管理
  'campaign:join': { campaign_id: string, character_id?: string };
  'campaign:leave': { campaign_id: string };

  // 游戏交互
  'game:message': {
    content: string,
    visibility: 'public' | 'kp' | 'party' | 'private',
    visible_to?: string[]
  };

  // 聚光灯
  'spotlight:request': {};
  'spotlight:release': {};
  'spotlight:cut-in': { reason: string };

  // 状态同步
  'typing:start': {};
  'typing:stop': {};
}
```

### 5.2 服务器 → 客户端

```typescript
interface ServerEvents {
  // 连接事件
  'campaign:joined': {
    campaign_id: string,
    members: Member[]
  };
  'member:joined': {
    user_id: string,
    character_name: string
  };
  'member:left': {
    user_id: string
  };

  // 消息事件
  'game:message': {
    id: string,
    sender_id: string,
    content: string,
    visibility: string,
    timestamp: string
  };

  // 聚光灯事件
  'spotlight:granted': {
    user_id: string,
    character_name: string
  };
  'spotlight:released': {
    next_user_id: string
  };
  'spotlight:queue_updated': {
    queue: QueueItem[]
  };

  // 在线状态
  'presence:update': {
    online_users: string[]
  };

  // 打字指示
  'user:typing': {
    user_id: string,
    character_name: string
  };
}
```

---

## 六、核心业务逻辑

### 6.1 可见性控制系统

**核心类**: `VisibilityFilter`

**功能**:
- 根据消息可见性和查看者角色过滤消息
- KP可以看到所有消息
- 玩家只能看到public、party、以及发给自己的private消息

**关键方法**:
```python
async def filter_message(
    self,
    message: Message,
    viewer_id: str,
    viewer_role: str
) -> Optional[Message]:
    """返回None表示不可见"""
```

### 6.2 聚光灯系统

**状态机**:
```
IDLE (无人发言)
  ↓ request
ACTIVE (有人在发言)
  ↓ request (其他人)
QUEUED (队列中有人等待)
  ↓ release
ACTIVE (转移给下一个)
  ↓ release (队列空)
IDLE
```

**并发控制**:
- 使用`asyncio.Lock`确保状态变更的原子性
- 队列操作加锁防止竞态条件

### 6.3 并发输入处理

**消息队列设计**:
- 每个session一个队列
- 串行处理消息（先进先出）
- 乐观锁防止状态冲突

**流程**:
1. 消息入队
2. 返回队列位置
3. 后台异步处理
4. 发送成功/失败回执

### 6.4 断线恢复

**流程**:
1. 检测断线
2. 更新成员状态为disconnected
3. 用户重连时：
   - 获取错过的消息
   - 过滤可见性
   - 同步当前游戏状态
   - 恢复聚光灯状态

---

## 七、前端架构

### 7.1 状态管理

使用React Context管理全局状态：

```typescript
interface CampaignState {
  currentCampaign: Campaign | null;
  members: CampaignMember[];
  onlineUsers: string[];
  spotlight: SpotlightState;
  messageQueue: Message[];
}
```

### 7.2 组件结构

```
frontend/src/components/
├── campaign/
│   ├── CampaignList.tsx
│   ├── CampaignCard.tsx
│   ├── CreateCampaignDialog.tsx
│   ├── JoinCampaignDialog.tsx
│   ├── CampaignDetail.tsx
│   ├── MemberList.tsx
│   ├── InviteCodeDisplay.tsx
│   └── MemberManagement.tsx
│
├── game/
│   ├── MultiplayerGameConsole.tsx
│   ├── OnlineUsersPanel.tsx
│   ├── SpotlightIndicator.tsx
│   ├── QueueDisplay.tsx
│   ├── VisibilitySelector.tsx
│   ├── MessageVisibilityTag.tsx
│   └── TypingIndicator.tsx
│
├── spotlight/
│   ├── RequestSpotlightButton.tsx
│   ├── SpotlightStatus.tsx
│   ├── CutInRequestDialog.tsx
│   └── QueuePosition.tsx
│
└── shared/
    ├── ConnectionStatus.tsx
    ├── ReconnectionDialog.tsx
    └── ErrorBoundary.tsx
```

### 7.3 关键组件

**MultiplayerGameConsole**: 多人游戏台主组件
- 左侧：在线用户 + 角色状态
- 中间：聚光灯状态 + 消息列表 + 输入区域
- 右侧：队列 + 事件日志

**SpotlightIndicator**: 聚光灯指示器
- 显示当前发言者
- 轮到自己时高亮提示
- 显示队列位置

**VisibilitySelector**: 可见性选择器
- 下拉选择消息可见性
- private时显示用户选择器

---

## 八、TDD测试策略

### 8.1 测试金字塔

```
        /\
       /  \  E2E测试（少量）
      /────\  - 完整多人游戏流程
     /      \  - 2-4人完整跑团10轮
    /────────\
   /  集成测试  \  （适量）
  /────────────\  - API端点集成
 /              \  - WebSocket连接流程
/   单元测试      \  - 数据库操作
──────────────────  （大量）
                    - 业务逻辑
                    - 可见性过滤
                    - 聚光灯状态机
```

### 8.2 后端测试重点

**可见性过滤器** (100%覆盖率):
- public消息对所有人可见
- kp消息只对KP可见
- private消息只对指定用户可见
- party消息对所有玩家+KP可见

**聚光灯管理器** (95%覆盖率):
- 第一个请求立即获得聚光灯
- 后续请求进入队列
- 释放后自动转移给下一个
- 非持有者无法释放
- 并发请求正确序列化

**消息队列** (90%覆盖率):
- 消息正确入队
- 串行处理
- 失败回执
- 冲突检测

### 8.3 前端测试重点

**状态管理** (90%覆盖率):
- Context状态更新
- WebSocket事件处理
- 状态同步逻辑

**可见性组件** (85%覆盖率):
- 正确显示可见性标签
- private时显示用户选择

**聚光灯组件** (85%覆盖率):
- 正确显示发言者
- 轮到自己时高亮
- 队列位置正确

### 8.4 E2E测试场景

1. **基础流程**:
   - 2个玩家加入同一个团
   - 轮流发言
   - 看到对方的消息

2. **可见性控制**:
   - KP发送kp-only消息
   - 验证玩家看不到
   - 验证KP能看到

3. **聚光灯系统**:
   - 请求聚光灯
   - 释放聚光灯
   - 队列管理

4. **断线恢复**:
   - 模拟断线
   - 重连后同步消息

---

## 九、Sprint计划

### Sprint 1（Week 1）：Campaign基础

**目标**: 用户可以创建团、邀请成员、加入团

**后端任务**:
- [ ] M2-001: 设计Campaigns表结构
- [ ] M2-002: 设计CampaignMembers表结构
- [ ] M2-003: 设计Invitations表结构
- [ ] M2-004: 编写Campaign迁移脚本
- [ ] M2-005: 实现创建Campaign API（TDD）
- [ ] M2-006-011: Campaign CRUD API（TDD）
- [ ] M2-012-015: 成员管理API（TDD）

**前端任务**:
- [ ] M2-016: Campaign列表页面
- [ ] M2-017: 创建Campaign表单
- [ ] M2-018: Campaign详情页面
- [ ] M2-019: 邀请码分享组件
- [ ] M2-020: 加入Campaign页面

**TDD流程**:
1. 先写Campaign API测试
2. 实现数据库模型和迁移
3. 实现API端点
4. 测试通过
5. 前端集成

**交付物**:
- 完整的Campaign管理流程
- 可演示：创建团、生成邀请码、加入团

---

### Sprint 2（Week 2）：实时通信

**目标**: 多人可以实时连接、聊天、看到在线状态

**后端任务**:
- [ ] M2-022: 配置Socket.io服务（TDD）
- [ ] M2-023: 实现连接认证中间件（TDD）
- [ ] M2-024: 实现用户连接记录
- [ ] M2-025: 实现房间加入/离开（TDD）
- [ ] M2-026: 实现消息广播（TDD）
- [ ] M2-027-030: 心跳与重连（TDD）

**前端任务**:
- [ ] M2-031: Socket连接Hook
- [ ] M2-032: 消息订阅机制
- [ ] M2-033: 状态同步Hook
- [ ] M2-034: 断线提示组件
- [ ] M2-035: 重连逻辑

**TDD流程**:
1. 先写WebSocket连接测试（认证、房间、广播）
2. 实现Socket.io服务
3. 实现心跳和重连机制
4. 测试通过
5. 前端集成

**交付物**:
- 稳定的多人实时连接
- 在线状态展示
- 实时消息收发

---

### Sprint 3（Week 3）：游戏机制

**目标**: 聚光灯、可见性、并发输入处理

**后端任务**:
- [ ] M2-036-040: 聚光灯系统（TDD）
- [ ] M2-041-045: 行动队列（TDD）
- [ ] M2-052-055: 可见性控制（TDD）
- [ ] M2-056-059: 视角过滤（TDD）
- [ ] M2-065-072: 并发处理（TDD）
- [ ] M2-090-098: 断线恢复（TDD）

**前端任务**:
- [ ] M2-046-051: 聚光灯UI组件
- [ ] M2-060-064: 可见性UI组件
- [ ] M2-073-077: 并发处理UI
- [ ] M2-078-089: 多人游戏台优化

**TDD流程**:
1. 先写聚光灯分配和释放测试
2. 先写消息可见性过滤测试
3. 先写并发消息队列测试
4. 实现后端逻辑
5. 测试通过
6. 实现前端UI组件

**交付物**:
- 完整的多人游戏体验
- 可见性控制生效
- 聚光灯系统可用
- 并发输入不冲突

---

## 十、验收标准

- [ ] 2-4人同团可稳定运行10+轮
- [ ] 并发输入不冲突
- [ ] 掉线后可恢复
- [ ] 可见性控制生效（KP-only不泄露）
- [ ] 私密线索正确隔离
- [ ] 聚光灯/队列系统可用
- [ ] 测试覆盖率：后端80%+，前端70%+

---

## 十一、风险管理

| 风险 | 可能性 | 影响 | 应对措施 |
|------|--------|------|----------|
| WebSocket稳定性 | 中 | 高 | 心跳 + 重连 + 状态恢复 |
| 并发冲突 | 高 | 中 | 消息队列 + 乐观锁 |
| 可见性泄露 | 低 | 高 | 后端强制过滤 + 严格TDD |
| 团队协作问题 | 中 | 中 | 每日站会 + 明确分工 |
| 测试覆盖不足 | 中 | 高 | TDD流程 + Coverage检查 |

---

## 十二、团队分工

### Team Lead（你）
- 架构设计和决策
- TDD测试模板准备
- Code Review
- 集成测试
- 解决技术难点

### 开发者1
- Campaign管理（M2-001到M2-021）
- 数据库设计和迁移
- REST API实现

### 开发者2
- WebSocket实时通信（M2-022到M2-035）
- 心跳和重连机制
- 前端连接管理

### 开发者3
- 聚光灯系统（M2-036到M2-051）
- 可见性控制（M2-052到M2-064）
- 并发处理（M2-065到M2-077）

---

## 十三、后续优化（可选）

- Redis替代内存队列（大规模并发）
- 负载均衡（多实例部署）
- 消息持久化（离线消息）
- 视频通话集成
- 屏幕共享
- 虚拟桌面

---

**文档版本**: 1.0
**最后更新**: 2026-02-22
