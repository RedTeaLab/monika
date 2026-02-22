# 技能系统使用指南

## 概述

Monika的技能系统支持：
- 区分现代/1920年代技能可用性
- 技能专攻（如格斗、射击的子技能）
- 详细的技能描述、难度等级、孤注一掷例子等
- 供AI参考的完整技能信息

## 数据库表结构

### skills 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer | 主键 |
| name | String(100) | 技能名称（中文） |
| name_en | String(100) | 技能名称（英文） |
| base_value | Integer | 基础值 |
| category | String(50) | 技能分类 |
| available_modern | Boolean | 是否在现代可用 |
| available_1920s | Boolean | 是否在1920年代可用 |
| description | Text | 技能描述（AI参考） |
| difficulty_levels | Text | 难度等级说明 |
| push_examples | Text | 孤注一掷例子 |
| push_failure_examples | Text | 孤注一掷失败例子 |
| opposing_skills | String(200) | 对抗技能 |
| has_specializations | Boolean | 是否有专攻 |
| parent_skill_id | Integer | 父技能ID（专攻技能用） |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |

### skill_categories 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer | 主键 |
| key | String(50) | 分类键值（如 combat） |
| name | String(100) | 分类名称（中文） |
| name_en | String(100) | 分类名称（英文） |
| description | Text | 分类描述 |
| sort_order | Integer | 排序顺序 |

## API端点

### GET /api/skills
获取技能列表

**查询参数：**
- `era`: 过滤年代（modern/1920s）
- `category`: 过滤分类
- `search`: 搜索技能名称
- `include_specializations`: 是否包含专攻技能（默认false）

**示例：**
```bash
curl "http://localhost:8000/api/skills?era=modern&category=combat"
```

### GET /api/skills/categories
获取技能分类列表

### GET /api/skills/{skill_id}
获取单个技能详情

### GET /api/skills/name/{skill_name}
通过名称获取技能

### GET /api/skills/ai-reference/{skill_name}
获取AI参考格式的技能信息（包含详细描述和例子）

### POST /api/skills
创建新技能

### PUT /api/skills/{skill_id}
更新技能

### DELETE /api/skills/{skill_id}
删除技能

## 管理脚本

位于 `backend/scripts/manage_skills.py`

### 添加技能

从JSON文件批量添加技能：

```bash
cd backend
python scripts/manage_skills.py add data/new_skills.json
```

### 列出技能

```bash
# 列出所有技能
python scripts/manage_skills.py list

# 按年代过滤
python scripts/manage_skills.py list --era modern

# 按分类过滤
python scripts/manage_skills.py list --category combat
```

### 导出技能

```bash
python scripts/manage_skills.py export data/skills_backup.json
```

## 技能数据格式

### 基础技能（无专攻）

```json
{
  "accounting": {
    "name": "会计",
    "name_en": "Accounting",
    "base_value": 5,
    "category": "technical",
    "available_modern": true,
    "available_1920s": true,
    "has_specializations": false,
    "description": "使你理解会计工作的流程以及一个企业或者个人的金融职务...",
    "difficulty_levels": "常规难度：详尽以及良好整理的会计账簿。\n困难难度：无序或者残缺的会计账簿。",
    "push_examples": "花费更多的时间来阅览文档；\n拜访银行或者企业来确认自己的发现...",
    "push_failure_examples": "调查员与其他人之间的讨论让敌对势力对调查员的意图起了警觉...",
    "opposing_skills": "会计（对手的会计技能）"
  }
}
```

### 带专攻的技能

```json
{
  "fighting": {
    "name": "格斗",
    "name_en": "Fighting",
    "base_value": 25,
    "category": "combat",
    "available_modern": true,
    "available_1920s": true,
    "has_specializations": true,
    "specializations": ["斗殴", "刀剑", "斧锤", "鞭索", "链枷", "矛枪", "弓箭", "投掷"],
    "description": "格斗技能包含多种徒手或近战武器战斗技巧...",
    "difficulty_levels": "常规难度：正常战斗。\n困难难度：在不利环境或受伤情况下战斗。",
    "push_examples": "冒险采取更激进的战术；\n利用环境优势攻击...",
    "push_failure_examples": "武器脱手或折断；\n失去平衡倒地...",
    "opposing_skills": "格斗（对手的格斗技能）、闪避"
  }
}
```

## 数据库迁移

### 创建表

```bash
cd backend
uv run alembic upgrade head
```

### 回滚迁移

```bash
uv run alembic downgrade -1
```

## 初始化数据

数据库迁移脚本 `006_populate_skills.py` 会自动从 `data/skills.json` 加载初始技能数据。

要重新加载数据：

```bash
# 回滚到表创建
uv run alembic downgrade 005

# 重新升级到最新
uv run alembic upgrade head
```

## 添加新技能的步骤

### 方法1：使用管理脚本（推荐）

1. 创建JSON文件 `data/my_new_skills.json`，按格式填写技能数据
2. 运行管理脚本：
   ```bash
   python scripts/manage_skills.py add data/my_new_skills.json
   ```

### 方法2：直接API调用

```bash
curl -X POST "http://localhost:8000/api/skills" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "新技能",
    "name_en": "New Skill",
    "base_value": 10,
    "category": "knowledge",
    "available_modern": true,
    "available_1920s": false,
    "has_specializations": false,
    "description": "技能描述...",
    "difficulty_levels": "难度说明...",
    "push_examples": "孤注一掷例子...",
    "push_failure_examples": "失败例子...",
    "opposing_skills": "对抗技能"
  }'
```

## 技能分类

预定义的分类键值（在 `skill_categories` 表中）：

| 键值 | 中文 | 英文 |
|------|------|------|
| combat | 战斗 | Combat |
| perception | 感知 | Perception |
| social | 社交 | Social |
| knowledge | 知识 | Knowledge |
| technical | 技术 | Technical |
| medical | 医疗 | Medical |
| survival | 生存 | Survival |
| art | 艺术 | Art |

## 前端集成

前端可以从以下端点获取技能数据：

```typescript
// 获取所有技能
const response = await fetch('/api/skills?era=modern');
const data = await response.json();

// 获取技能分类
const categories = await fetch('/api/skills/categories');

// 获取AI参考格式
const aiRef = await fetch('/api/skills/ai-reference/Accounting');
```

## 注意事项

1. **技能名称唯一性**：技能名称（中文名）在数据库中必须是唯一的
2. **年代过滤**：设置 `available_modern` 和 `available_1920s` 来控制技能在不同年代的可用性
3. **专攻技能**：创建专攻技能时，`parent_skill_id` 指向父技能的ID
4. **描述格式**：换行使用 `\n`，不要使用实际的换行符
5. **中英文键值**：JSON文件的键值建议使用小写英文名称（如 `accounting`）

## 示例数据

当前包含的示例技能：

1. 会计 (Accounting) - 技术类
2. 侦查 (Spot Hidden) - 感知类
3. 格斗 (Fighting) - 战斗类（8个专攻）
4. 射击 (Firearms) - 战斗类（6个专攻）
5. 驾驶 (Driving) - 技术类（6个专攻）
6. 急救 (First Aid) - 医疗类
7. 神秘学 (Occult) - 知识类
8. 图书馆 (Library Use) - 知识类

您可以在 `backend/data/skills.json` 中查看完整示例，并根据需要添加更多技能。
