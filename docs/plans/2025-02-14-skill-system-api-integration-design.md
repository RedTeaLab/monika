# 技能系统API集成设计

## 概述

将前端技能数据从静态文件迁移到后端API获取，支持：
- 现代/1920年代技能区分
- 技能专攻（格斗、射击等子技能）
- 详细描述供AI参考

## 数据结构

### 技能JSON格式

```json
{
  "skill_key": {
    "name": "技能中文名",
    "name_en": "English Name",
    "base_value": 5,
    "category": "technical",
    "available_modern": true,
    "available_1920s": true,
    "has_specializations": false,
    "description": "技能描述，供AI理解技能用途...",
    "difficulty_levels": "常规难度：...\n困难难度：...",
    "push_examples": "孤注一掷的例子1；\n孤注一掷的例子2...",
    "push_failure_examples": "失败结果1；\n失败结果2...",
    "opposing_skills": "对抗技能名称"
  }
}
```

### 带专攻的技能

```json
{
  "fighting": {
    "name": "格斗",
    "base_value": 25,
    "has_specializations": true,
    "specializations": ["斗殴", "刀剑", "斧锤", ...],
    ...
  }
}
```

### 技能分类

| 键值 | 中文 | 说明 |
|------|------|------|
| combat | 战斗 | 格斗、射击、闪避等 |
| social | 社交 | 魅力、说服、恐吓等 |
| knowledge | 知识 | 图书馆、神秘学、历史等 |
| technical | 技术 | 会计、驾驶、机械维修等 |
| perception | 感知 | 侦查、聆听等 |
| action | 动作 | 攀爬、潜行、游泳等 |

## 前端集成

### API服务层 `src/services/skills.ts`

```typescript
interface Skill {
  id: number
  name: string
  name_en: string
  base_value: number
  category: string
  available_modern: boolean
  available_1920s: boolean
  has_specializations: boolean
  specializations: SkillSpecialization[]
  description: string | null
  difficulty_levels: string | null
  push_examples: string | null
  push_failure_examples: string | null
  opposing_skills: string | null
}

async function fetchSkills(era?: 'modern' | '1920s', category?: string): Promise<Skill[]>
async function fetchSkillByName(name: string): Promise<Skill>
async function fetchSkillCategories(): Promise<SkillCategory[]>
```

### 使用方式

```typescript
// CharacterCreatePage.tsx
const [skills, setSkills] = useState<Skill[]>([])

useEffect(() => {
  fetchSkills(era).then(setSkills)
}, [era])
```

## 变更文件清单

### 后端（已有，无需修改）

- `backend/src/models/skill.py` - 数据模型
- `backend/src/schemas/skill.py` - API Schema
- `backend/src/api/skills.py` - API端点
- `backend/data/skills.json` - 数据文件（后续录入）
- `backend/scripts/manage_skills.py` - 管理脚本

### 前端（需要修改）

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/services/skills.ts` | 新增 | API调用封装 |
| `src/types/skill.ts` | 新增 | 技能类型定义 |
| `src/data/skills.ts` | 精简 | 删除 `ALL_SKILLS`，保留常量 |
| `src/pages/CharacterCreatePage.tsx` | 修改 | 改用API获取技能 |
| `src/hooks/useCharacterCreationReducer.ts` | 修改 | 适配异步技能加载 |

## 数据管理

使用JSON文件 + 管理脚本方式录入技能：

```bash
# 添加技能
python scripts/manage_skills.py add data/new_skills.json

# 列出技能
python scripts/manage_skills.py list --era modern

# 导出技能
python scripts/manage_skills.py export data/backup.json
```

## 实现步骤

1. 创建 `src/types/skill.ts` - 技能类型定义
2. 创建 `src/services/skills.ts` - API调用封装
3. 精简 `src/data/skills.ts` - 删除静态技能数组
4. 修改 `src/pages/CharacterCreatePage.tsx` - 使用API加载
5. 修改 `src/hooks/useCharacterCreationReducer.ts` - 适配异步

---

**创建日期**: 2025-02-14
**状态**: ✅ 已完成
