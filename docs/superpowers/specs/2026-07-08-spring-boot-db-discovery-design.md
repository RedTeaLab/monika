# Spring Boot Database Auto-Discovery — Design Spec

**Date**: 2026-07-08
**Status**: Approved

## Summary

Extend `internal/dbdiscovery/` with a dedicated Spring Boot discoverer that scans `application.yml` / `application.properties` for database connection configs (PostgreSQL, MySQL, Redis, MongoDB, SQLite), converts them to `DiscoveredDB` entries, and feeds them into the existing `DBManager` pipeline. The agent can then use `db_schema` / `db_query` to inspect project databases — credentials never enter LLM context.

## Motivation

Java/Spring Boot is one of the most common enterprise frameworks. Database credentials live in `application.yml` or `application.properties` under standard Spring property keys. Currently, Monika only discovers databases from `.env` and `docker-compose.yml`, missing the primary config location for Spring Boot projects.

## Architecture

```
src/main/resources/
├── application.yml           ─┐
├── application.properties     │  springDiscoverer.Scan()
├── application-dev.yml        │
└── application-dev.properties ─┘
          │
          ▼
   ┌──────────────────┐
   │ springDiscoverer │  implements Discoverer interface
   │                  │
   │ 1. Parse YAML /  │
   │    properties    │
   │ 2. Extract       │
   │    datasources   │
   │ 3. JDBC → DSN    │
   │    conversion    │
   └────────┬─────────┘
            │ []DiscoveredDB
            ▼
   ┌──────────────────┐
   │ deduplicate()    │  (existing, by Driver:DSN)
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ databases.json   │  (cache, 0600)
   └────────┬─────────┘
            │
            ▼
   ┌──────────────────┐
   │ DBManager        │  db_schema / db_query tools
   └──────────────────┘
```

## Scan Targets

| File | Format | Priority |
|------|--------|----------|
| `src/main/resources/application.yml` | YAML | Default |
| `src/main/resources/application.yaml` | YAML | Default |
| `src/main/resources/application.properties` | Properties | Default |
| `src/main/resources/application-dev.yml` | YAML | Dev profile |
| `src/main/resources/application-dev.yaml` | YAML | Dev profile |
| `src/main/resources/application-dev.properties` | Properties | Dev profile |

Excluded: `application-prod.*`, `application-test.*`, `application-staging.*` — avoid accidentally connecting to non-dev databases.

## Property Extraction

### SQL Databases (PostgreSQL, MySQL, SQLite)

**YAML path**:
```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb
    username: myuser
    password: mypass
```

**Properties keys**:
```
spring.datasource.url=jdbc:postgresql://localhost:5432/mydb
spring.datasource.username=myuser
spring.datasource.password=mypass
```

**JDBC → DSN conversion**:

| JDBC Prefix | Driver | DSN Format |
|-------------|--------|------------|
| `jdbc:postgresql://host:port/db` | `postgres` | `postgres://user:pass@host:port/db` |
| `jdbc:mysql://host:port/db` | `mysql` | `mysql://user:pass@host:port/db` |
| `jdbc:sqlite:/path/to/db` | `sqlite` | `/path/to/db` |

If username/password are provided as separate properties, they are embedded into the DSN URL.

### Redis

Supports both Spring Boot 2.x and 3.x property paths:

| Version | Property Prefix |
|---------|----------------|
| 2.x | `spring.redis.*` |
| 3.x | `spring.data.redis.*` |

Properties read: `host` (default `localhost`), `port` (default `6379`), `password`, `database` (default `0`).

**DSN**: `redis://[:password@]host:port/db`

### MongoDB

**YAML path**: `spring.data.mongodb.uri`

**Properties key**: `spring.data.mongodb.uri`

Value is already a standard MongoDB URI (`mongodb://user:pass@host:port/db`). No conversion needed.

If `uri` is absent, assemble from individual properties: `spring.data.mongodb.host`, `.port`, `.database`, `.username`, `.password`.

## Placeholder Resolution

Spring Boot uses `${VAR:default}` placeholders. Resolution rules:

| Pattern | Behavior |
|---------|----------|
| `literal_value` | Use as-is |
| `${VAR:default}` | Use `default` if env var `VAR` is not set |
| `${VAR}` | Try `os.Getenv("VAR")`; if empty, skip connection |

Unresolved placeholders without defaults cause the connection to be skipped (not silently use the literal `${...}` string).

## Properties File Parser

Line-based parser:
1. Skip blank lines and comments (`#` and `!` prefixes)
2. Split on first `=`
3. Trim whitespace and surrounding quotes (`"` or `'`)
4. Store in flat `map[string]string` keyed by full dot-path

This intentionally mirrors the existing `envDiscoverer` `parseEnvFile()` pattern.

## YAML Parser

Uses `gopkg.in/yaml.v3`:
1. Parse into `map[string]interface{}`
2. Navigate nested path: `spring` → `datasource` → `url`
3. Handle YAML multi-document files (`---` separator) — only parse the first document (default profile)

## File: `internal/dbdiscovery/spring.go`

```go
package dbdiscovery

type springDiscoverer struct{}

func (d *springDiscoverer) Scan(projectDir string) ([]DiscoveredDB, error)

func init() {
    RegisterDiscoverer(&springDiscoverer{})
}
```

### Functions

| Function | Purpose |
|----------|---------|
| `(d *springDiscoverer) Scan(projectDir)` | Entry point: finds files, parses, returns `[]DiscoveredDB` |
| `scanSpringYAML(path string) []DiscoveredDB` | Parse YAML, extract datasources |
| `scanSpringProperties(path string) []DiscoveredDB` | Parse properties, extract datasources |
| `jdbcToDSN(jdbcURL, user, pass string) (driver, dsn string)` | JDBC → driver+DSN conversion |
| `resolvePlaceholder(value string) string` | Resolve `${VAR:default}` from env |
| `buildRedisDSN(host, port, password, database string) string` | Assemble Redis DSN |

### Output

Each discovered connection becomes:
```go
DiscoveredDB{
    Name:   "spring/<filename>",
    Driver: "postgres",  // or mysql, redis, mongo, sqlite
    DSN:    "postgres://user:pass@host:port/db",
    Source: "/abs/path/to/src/main/resources/application.yml",
}
```

Dedup by existing `deduplicate()` (key = `Driver:DSN`) prevents duplicates when both `.yml` and `.properties` exist or when dev profile duplicates default.

## Testing

`internal/dbdiscovery/spring_test.go`:

| Test | Description |
|------|-------------|
| `TestScanYAML_Postgres` | `application.yml` with `spring.datasource.url` JDBC postgres |
| `TestScanYAML_MySQL` | MySQL JDBC URL |
| `TestScanYAML_Redis_Spring2` | `spring.redis.*` (Boot 2.x path) |
| `TestScanYAML_Redis_Spring3` | `spring.data.redis.*` (Boot 3.x path) |
| `TestScanYAML_MongoDB_URI` | `spring.data.mongodb.uri` direct URI |
| `TestScanYAML_MongoDB_Parts` | MongoDB assembled from individual properties |
| `TestScanProperties_Postgres` | Same as YAML test but properties format |
| `TestScanProperties_Redis` | Redis from properties |
| `TestScan_Dedup` | Both `.yml` and `.properties` → deduplicated |
| `TestScan_DevProfileOnly` | `application-prod.yml` is NOT scanned |
| `TestJdbcToDSN` | JDBC URL conversion for all supported drivers |
| `TestResolvePlaceholder` | `${VAR:default}`, `${VAR}`, literal values |

## Limitations

1. **Scan location**: Only `src/main/resources/`. Does not scan project root or `config/` subdirectory (Spring Boot fallback locations).
2. **Custom datasources**: Only `spring.datasource.*` (primary). Custom multi-datasource configs (`app.datasource.primary.*`) are not supported.
3. **Multi-profile YAML**: Only the first document (`---` separator) is parsed. Profile-specific sections within a single YAML file are ignored.
4. **SSL/TLS params**: JDBC URL query params are preserved in the DSN, but Spring-specific SSL properties (`spring.datasource.hikari.*`) are not mapped.
5. **No write back to credentials.json**: Database credentials stay in `databases.json` cache (existing behavior), not in the MCP `credentials.json` system.
