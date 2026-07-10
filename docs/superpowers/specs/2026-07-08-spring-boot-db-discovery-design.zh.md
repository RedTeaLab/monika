# Spring Boot 数据库自动发现 — 设计文档

**日期**: 2026-07-08
**状态**: 已批准

## 概述

扩展 `internal/dbdiscovery/`，新增专用的 Spring Boot 发现器，扫描 `application.yml` / `application.properties` 中的数据库连接配置（PostgreSQL、MySQL、Redis、MongoDB、SQLite），转换为 `DiscoveredDB` 条目，注入现有的 `DBManager` 流程。Agent 随后可通过 `db_schema` / `db_query` 检查项目数据库 —— 凭据不会进入 LLM 上下文。

## 背景

Java/Spring Boot 是最常见的企业级框架之一。数据库凭据存放在 `application.yml` 或 `application.properties` 中的标准 Spring 属性键下。目前 Monika 仅从 `.env` 和 `docker-compose.yml` 发现数据库，遗漏了 Spring Boot 项目的主要配置位置。

## 架构

```
src/main/resources/
├── application.yml           ─┐
├── application.properties     │  springDiscoverer.Scan()
├── application-dev.yml        │
└── application-dev.properties ─┘
          │
          ▼
   ┌──────────────────┐
   │ springDiscoverer │  实现 Discoverer 接口
   │                  │
   │ 1. 解析 YAML /   │
   │    properties    │
   │ 2. 提取          │
   │    数据源配置     │
   │ 3. JDBC → DSN    │
   │    转换          │
   └────────┬─────────┘
            │ []DiscoveredDB
            ▼
   ┌──────────────────┐
   │ deduplicate()    │  (现有逻辑，按 Driver:DSN 去重)
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ databases.json   │  (缓存文件，0600 权限)
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ DBManager        │  db_schema / db_query 工具
   └──────────────────┘
```

## 扫描目标

| 文件 | 格式 | 优先级 |
|------|------|--------|
| `src/main/resources/application.yml` | YAML | 默认 |
| `src/main/resources/application.yaml` | YAML | 默认 |
| `src/main/resources/application.properties` | Properties | 默认 |
| `src/main/resources/application-dev.yml` | YAML | Dev profile |
| `src/main/resources/application-dev.yaml` | YAML | Dev profile |
| `src/main/resources/application-dev.properties` | Properties | Dev profile |

排除：`application-prod.*`、`application-test.*`、`application-staging.*` —— 避免意外连接到非开发环境数据库。

## 属性提取

### SQL 数据库（PostgreSQL、MySQL、SQLite）

**YAML 路径**:
```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb
    username: myuser
    password: mypass
```

**Properties 键**:
```
spring.datasource.url=jdbc:postgresql://localhost:5432/mydb
spring.datasource.username=myuser
spring.datasource.password=mypass
```

**JDBC → DSN 转换**:

| JDBC 前缀 | 驱动 | DSN 格式 |
|-----------|------|----------|
| `jdbc:postgresql://host:port/db` | `postgres` | `postgres://user:pass@host:port/db` |
| `jdbc:mysql://host:port/db` | `mysql` | `mysql://user:pass@host:port/db` |
| `jdbc:sqlite:/path/to/db` | `sqlite` | `/path/to/db` |

如果 username/password 作为独立属性提供，将嵌入到 DSN URL 中。

### Redis

同时支持 Spring Boot 2.x 和 3.x 属性路径:

| 版本 | 属性前缀 |
|------|---------|
| 2.x | `spring.redis.*` |
| 3.x | `spring.data.redis.*` |

读取属性：`host`（默认 `localhost`）、`port`（默认 `6379`）、`password`、`database`（默认 `0`）。

**DSN**: `redis://[:password@]host:port/db`

### MongoDB

**YAML 路径**: `spring.data.mongodb.uri`

**Properties 键**: `spring.data.mongodb.uri`

值已经是标准 MongoDB URI（`mongodb://user:pass@host:port/db`），无需转换。

如果 `uri` 缺失，从独立属性组装：`spring.data.mongodb.host`、`.port`、`.database`、`.username`、`.password`。

## 占位符解析

Spring Boot 使用 `${VAR:default}` 占位符。解析规则:

| 模式 | 行为 |
|------|------|
| `literal_value` | 直接使用 |
| `${VAR:default}` | 环境变量 `VAR` 未设置时使用 `default` |
| `${VAR}` | 尝试 `os.Getenv("VAR")`；为空则跳过该连接 |

无默认值的未解析占位符将导致连接被跳过（不会使用字面 `${...}` 字符串）。

## Properties 文件解析器

逐行解析:
1. 跳过空行和注释（`#` 和 `!` 前缀）
2. 按第一个 `=` 分割
3. 去除首尾空格和引号（`"` 或 `'`）
4. 以完整点路径为键存入 `map[string]string`

此设计有意沿用现有 `envDiscoverer` 的 `parseEnvFile()` 模式。

## YAML 解析器

使用 `gopkg.in/yaml.v3`:
1. 解析为 `map[string]interface{}`
2. 导航嵌套路径：`spring` → `datasource` → `url`
3. 处理 YAML 多文档文件（`---` 分隔符）—— 仅解析第一个文档（默认 profile）

## 文件: `internal/dbdiscovery/spring.go`

```go
package dbdiscovery

type springDiscoverer struct{}

func (d *springDiscoverer) Scan(projectDir string) ([]DiscoveredDB, error)

func init() {
    RegisterDiscoverer(&springDiscoverer{})
}
```

### 函数

| 函数 | 用途 |
|------|------|
| `(d *springDiscoverer) Scan(projectDir)` | 入口：查找文件、解析、返回 `[]DiscoveredDB` |
| `scanSpringYAML(path string) []DiscoveredDB` | 解析 YAML，提取数据源 |
| `scanSpringProperties(path string) []DiscoveredDB` | 解析 properties，提取数据源 |
| `jdbcToDSN(jdbcURL, user, pass string) (driver, dsn string)` | JDBC → 驱动+DSN 转换 |
| `resolvePlaceholder(value string) string` | 从环境变量解析 `${VAR:default}` |
| `buildRedisDSN(host, port, password, database string) string` | 组装 Redis DSN |

### 输出

每个发现的连接变为:
```go
DiscoveredDB{
    Name:   "spring/<filename>",
    Driver: "postgres",  // 或 mysql, redis, mongo, sqlite
    DSN:    "postgres://user:pass@host:port/db",
    Source: "/abs/path/to/src/main/resources/application.yml",
}
```

通过现有 `deduplicate()` 去重（键 = `Driver:DSN`），防止 `.yml` 和 `.properties` 同时存在或 dev profile 与默认配置重复时产生重复连接。

## 测试

`internal/dbdiscovery/spring_test.go`:

| 测试 | 描述 |
|------|------|
| `TestScanYAML_Postgres` | `application.yml` 中的 `spring.datasource.url` JDBC postgres |
| `TestScanYAML_MySQL` | MySQL JDBC URL |
| `TestScanYAML_Redis_Spring2` | `spring.redis.*`（Boot 2.x 路径）|
| `TestScanYAML_Redis_Spring3` | `spring.data.redis.*`（Boot 3.x 路径）|
| `TestScanYAML_MongoDB_URI` | `spring.data.mongodb.uri` 直接 URI |
| `TestScanYAML_MongoDB_Parts` | 从独立属性组装 MongoDB 连接 |
| `TestScanProperties_Postgres` | properties 格式的 postgres 测试 |
| `TestScanProperties_Redis` | properties 格式的 Redis 测试 |
| `TestScan_Dedup` | `.yml` 和 `.properties` 同时存在 → 去重 |
| `TestScan_DevProfileOnly` | `application-prod.yml` 不被扫描 |
| `TestJdbcToDSN` | 所有支持驱动的 JDBC URL 转换 |
| `TestResolvePlaceholder` | `${VAR:default}`、`${VAR}`、字面值 |

## 已知限制

1. **扫描位置**: 仅 `src/main/resources/`。不扫描项目根目录或 `config/` 子目录（Spring Boot 回退位置）。
2. **自定义数据源**: 仅 `spring.datasource.*`（主数据源）。不支持自定义多数据源配置（`app.datasource.primary.*`）。
3. **多 profile YAML**: 仅解析第一个文档（`---` 分隔符）。单个 YAML 文件中的 profile 特定段被忽略。
4. **SSL/TLS 参数**: JDBC URL 查询参数保留在 DSN 中，但 Spring 特有的 SSL 属性（`spring.datasource.hikari.*`）不映射。
5. **不写入 credentials.json**: 数据库凭据保留在 `databases.json` 缓存中（现有行为），不进入 MCP `credentials.json` 系统。
