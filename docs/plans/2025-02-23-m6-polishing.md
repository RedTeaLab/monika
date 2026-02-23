# M6: 体验打磨 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完成 M6 所有体验打磨任务，包括 Leads 机制、友好拒绝、输出优化、响应式适配、性能优化、用户体验、无障碍支持和 Leads UI

**Architecture:** 分三阶段实施：后端核心 → 前端核心 → 优化与体验

**Tech Stack:** 
- Backend: FastAPI, SQLAlchemy
- Frontend: React 19, TypeScript, TailwindCSS, shadcn/ui

---

## 阶段 1: 后端核心 (6.1-6.3)

### 任务 M6-001 ~ M6-016: Leads 系统

**已完成:**
- ✅ `backend/src/services/leads.py` - LeadsService 实现
- ✅ `backend/src/api/leads.py` - REST API 实现
- ✅ `frontend/src/components/leads/LeadsPanel.tsx` - 前端面板
- ✅ 测试通过 (38 passed)

**待完成:**
- M6-005: 实现 Leads 自动刷新
- M6-007: 实现 Leads 关联线索
- M6-012 ~ M6-016: 完善 Leads API

### 任务 M6-017 ~ M6-024: 友好拒绝

#### M6-017: 完善越界拒绝模板

**Files:**
- Create: `backend/src/services/refusal_templates.py`

**Step 1: Write test**

```python
# backend/src/tests/test_refusal_templates.py
import pytest
from src.services.refusal_templates import RefusalTemplate, RefusalService

def test_out_of_bounds_refusal():
    service = RefusalService()
    result = service.get_refusal("我想要查看股票市场", context={})
    assert result.template_type == "out_of_bounds"
    assert "Alternative" in result.message
    assert "Next" in result.message
```

**Step 2: Run test**

Run: `uv run pytest backend/src/tests/test_refusal_templates.py -v`
Expected: FAIL (module not found)

**Step 3: Implement refusal templates**

```python
# backend/src/services/refusal_templates.py
from enum import Enum
from typing import Optional, Dict, Any
from pydantic import BaseModel

class RefusalType(str, Enum):
    OUT_OF_BOUNDS = "out_of_bounds"
    CANNOT_UNDERSTAND = "cannot_understand"
    CHECK_NOT_AVAILABLE = "check_not_available"
    COMBAT_NOT_ACTIVE = "combat_not_active"
    # ... more types

class RefusalTemplate(BaseModel):
    template_type: str
    message: str
    alternatives: list[str]
    next_suggestions: list[str]

class RefusalService:
    def __init__(self):
        self._templates = {
            RefusalType.OUT_OF_BOUNDS: {
                "message": "我理解你想了解这个话题，但在 CoC 跑团中，我们专注于调查员的故事。",
                "alternatives": [
                    "我想在图书馆查阅关于这个主题的资料",
                    "我想向 NPC 询问相关信息",
                    "我想调查这个地点"
                ],
                "next_suggestions": []
            }
        }
    
    def get_refusal(self, user_input: str, context: Dict[str, Any]) -> RefusalTemplate:
        # Simple keyword-based classification
        # ...
```

**Step 4: Run test**

Run: `uv run pytest backend/src/tests/test_refusal_templates.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/refusal_templates.py backend/src/tests/test_refusal_templates.py
git commit -m "feat(M6-017): add refusal templates service"
```

---

### M6-018 ~ M6-020: 完善拒绝模板 + 多语言支持

**Files:**
- Modify: `backend/src/services/refusal_templates.py`
- Create: `backend/src/services/refusal_templates_i18n.py`

### M6-021 ~ M6-024: 智能建议

**Files:**
- Modify: `backend/src/services/refusal_templates.py`
- Create: `backend/src/services/suggestion_generator.py`

---

### M6-025 ~ M6-032: 输出优化

#### M6-025: 设计 OutputConfig 结构

**Files:**
- Create: `backend/src/schemas/output_config.py`

```python
# backend/src/schemas/output_config.py
from pydantic import BaseModel
from typing import Optional
from enum import Enum

class OutputFormat(str, Enum):
    BRIEF = "brief"
    NORMAL = "normal"
    DETAILED = "detailed"

class OutputConfig(BaseModel):
    format: OutputFormat = OutputFormat.NORMAL
    max_length: Optional[dict] = None
    include_state_changes: bool = True
    include_leads: bool = True
    include_hints: bool = True
```

---

## 阶段 2: 前端核心 (6.4, 6.8)

### M6-033 ~ M6-040: 响应式适配

需要检查现有布局实现:

**Files:**
- Modify: `frontend/src/components/GameConsole.tsx`
- Modify: `frontend/src/pages/GamePage.tsx`

### M6-068 ~ M6-074: Leads UI

已完成:
- ✅ LeadsPanel.tsx 存在
- ✅ 测试存在

待完成:
- M6-073: 实现失败后果展示
- M6-074: 实现拒绝消息组件

---

## 阶段 3: 优化与体验 (6.5-6.7)

### M6-041 ~ M6-050: 性能优化

- M6-045: 实现代码分割 (Vite)
- M6-046: 实现路由懒加载

### M6-051 ~ M6-061: 用户体验

- M6-051: 骨架屏
- M6-054: Toast 反馈
- M6-056: Tooltip

### M6-062 ~ M6-067: 无障碍支持

- M6-062: 键盘导航
- M6-063: ARIA 标签

---

## 执行策略

由于 M6 任务量大，采用以下策略:

1. **先完成后端核心** - Leads 系统已大部分完成，专注完善拒绝模板和输出优化
2. **前端渐进式** - 响应式和 UI 组件已有基础，完善细节
3. **测试驱动** - 每个功能先写测试
4. **小步提交** - 每个任务完成后立即提交

---

## 验收标准

- [ ] Leads 机制始终提供 2-4 个可行动方向
- [ ] 失败不是卡住，而是代价不同
- [ ] 拒绝模板友好，提供替代建议
- [ ] 输出长度可配置
- [ ] 桌面/平板完整功能可用
- [ ] 手机可查看剧情和状态
- [ ] P95 响应时间 < 3s

---

## 交付物

| 交付物 | 状态 |
|--------|------|
| Leads System | 后端完成, 前端面板完成 |
| Refusal Templates | 待开发 |
| Output Config | 待开发 |
| Leads Panel UI | 已完成 |
| Responsive Layout | 待完善 |
| Loading Experience | 待开发 |
| Help System | 待开发 |
| Accessibility | 待开发 |
