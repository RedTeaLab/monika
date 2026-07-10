package dbdiscovery

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeSpringFile(t *testing.T, dir, name, content string) {
	t.Helper()
	resDir := filepath.Join(dir, "src", "main", "resources")
	os.MkdirAll(resDir, 0755)
	os.WriteFile(filepath.Join(resDir, name), []byte(content), 0644)
}

func TestScanYAML_Postgres(t *testing.T) {
	dir := t.TempDir()
	writeSpringFile(t, dir, "application.yml", `
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb
    username: myuser
    password: mypass
`)
	d := &springDiscoverer{}
	results, err := d.Scan(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].Driver != "postgres" {
		t.Errorf("driver: got %q, want postgres", results[0].Driver)
	}
	if results[0].DSN != "postgres://myuser:mypass@localhost:5432/mydb" {
		t.Errorf("DSN: got %q", results[0].DSN)
	}
}

func TestScanYAML_MySQL(t *testing.T) {
	dir := t.TempDir()
	writeSpringFile(t, dir, "application.yml", `
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/mydb
    username: root
    password: secret
`)
	d := &springDiscoverer{}
	results, _ := d.Scan(dir)
	if len(results) != 1 || results[0].Driver != "mysql" {
		t.Fatalf("expected mysql, got %+v", results)
	}
	if results[0].DSN != "mysql://root:secret@localhost:3306/mydb" {
		t.Errorf("DSN: got %q", results[0].DSN)
	}
}

func TestScanYAML_Redis_Spring2(t *testing.T) {
	dir := t.TempDir()
	writeSpringFile(t, dir, "application.yml", `
spring:
  redis:
    host: redishost
    port: 6380
    password: redispass
`)
	d := &springDiscoverer{}
	results, _ := d.Scan(dir)
	if len(results) != 1 || results[0].Driver != "redis" {
		t.Fatalf("expected redis, got %+v", results)
	}
	if results[0].DSN != "redis://:redispass@redishost:6380" {
		t.Errorf("DSN: got %q", results[0].DSN)
	}
}

func TestScanYAML_Redis_Spring3(t *testing.T) {
	dir := t.TempDir()
	writeSpringFile(t, dir, "application.yml", `
spring:
  data:
    redis:
      host: cache
      port: 6379
      password: pw
      database: 2
`)
	d := &springDiscoverer{}
	results, _ := d.Scan(dir)
	if len(results) != 1 || results[0].Driver != "redis" {
		t.Fatalf("expected redis, got %+v", results)
	}
	if results[0].DSN != "redis://:pw@cache:6379/2" {
		t.Errorf("DSN: got %q", results[0].DSN)
	}
}

func TestScanYAML_MongoDB_URI(t *testing.T) {
	dir := t.TempDir()
	writeSpringFile(t, dir, "application.yml", `
spring:
  data:
    mongodb:
      uri: mongodb://user:pass@mongo:27017/mydb
`)
	d := &springDiscoverer{}
	results, _ := d.Scan(dir)
	if len(results) != 1 || results[0].Driver != "mongo" {
		t.Fatalf("expected mongo, got %+v", results)
	}
	if results[0].DSN != "mongodb://user:pass@mongo:27017/mydb" {
		t.Errorf("DSN: got %q", results[0].DSN)
	}
}

func TestScanProperties_Postgres(t *testing.T) {
	dir := t.TempDir()
	writeSpringFile(t, dir, "application.properties", `
spring.datasource.url=jdbc:postgresql://localhost:5432/proddb
spring.datasource.username=dbuser
spring.datasource.password=dbpass
`)
	d := &springDiscoverer{}
	results, _ := d.Scan(dir)
	if len(results) != 1 || results[0].Driver != "postgres" {
		t.Fatalf("expected postgres, got %+v", results)
	}
	if results[0].DSN != "postgres://dbuser:dbpass@localhost:5432/proddb" {
		t.Errorf("DSN: got %q", results[0].DSN)
	}
}

func TestScanProperties_Redis(t *testing.T) {
	dir := t.TempDir()
	writeSpringFile(t, dir, "application.properties", `
spring.data.redis.host=redishost
spring.data.redis.port=6380
spring.data.redis.password=rp
`)
	d := &springDiscoverer{}
	results, _ := d.Scan(dir)
	if len(results) != 1 || results[0].Driver != "redis" {
		t.Fatalf("expected redis, got %+v", results)
	}
	if results[0].DSN != "redis://:rp@redishost:6380" {
		t.Errorf("DSN: got %q", results[0].DSN)
	}
}

func TestScan_Dedup(t *testing.T) {
	dir := t.TempDir()
	yaml := `
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb
    username: u
    password: p
`
	props := `
spring.datasource.url=jdbc:postgresql://localhost:5432/mydb
spring.datasource.username=u
spring.datasource.password=p
`
	writeSpringFile(t, dir, "application.yml", yaml)
	writeSpringFile(t, dir, "application.properties", props)

	d := &springDiscoverer{}
	results, _ := d.Scan(dir)
	if len(results) != 1 {
		t.Errorf("expected dedup to 1, got %d: %+v", len(results), results)
	}
}

func TestScan_DevProfileOnly(t *testing.T) {
	dir := t.TempDir()
	writeSpringFile(t, dir, "application.yml", `
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/devdb
    username: devuser
`)
	writeSpringFile(t, dir, "application-prod.yml", `
spring:
  datasource:
    url: jdbc:postgresql://prod-host:5432/proddb
    username: produser
    password: prodpass
`)

	d := &springDiscoverer{}
	results, _ := d.Scan(dir)
	for _, r := range results {
		if r.DSN != "" && strings.Contains(r.DSN, "prodpass") {
			t.Errorf("prod config should not be scanned, got DSN with prod credentials: %q", r.DSN)
		}
	}
	if len(results) != 1 {
		t.Errorf("expected 1 result (dev only), got %d", len(results))
	}
}

func TestJdbcToDSN(t *testing.T) {
	tests := []struct {
		jdbc   string
		user   string
		pass   string
		driver string
		dsn    string
	}{
		{"jdbc:postgresql://h:5432/db", "u", "p", "postgres", "postgres://u:p@h:5432/db"},
		{"jdbc:mysql://h:3306/db", "r", "s", "mysql", "mysql://r:s@h:3306/db"},
		{"jdbc:sqlite:/data/test.db", "", "", "sqlite", "/data/test.db"},
		{"jdbc:postgresql://u:p@h:5432/db", "", "", "postgres", "postgres://u:p@h:5432/db"},
		{"unknown://h", "", "", "", ""},
	}
	for _, tt := range tests {
		driver, dsn := jdbcToDSN(tt.jdbc, tt.user, tt.pass)
		if driver != tt.driver {
			t.Errorf("jdbcToDSN(%q) driver: got %q, want %q", tt.jdbc, driver, tt.driver)
		}
		if dsn != tt.dsn {
			t.Errorf("jdbcToDSN(%q) dsn: got %q, want %q", tt.jdbc, dsn, tt.dsn)
		}
	}
}

func TestResolvePlaceholder(t *testing.T) {
	os.Setenv("TEST_DB_HOST", "envhost")
	defer os.Unsetenv("TEST_DB_HOST")

	tests := []struct {
		input string
		want  string
	}{
		{"literal", "literal"},
		{"${TEST_DB_HOST}", "envhost"},
		{"${MISSING_VAR:defaultval}", "defaultval"},
		{"jdbc:postgresql://${TEST_DB_HOST}:5432/db", "jdbc:postgresql://envhost:5432/db"},
		{"${UNSET_VAR_NO_DEFAULT}", "${UNSET_VAR_NO_DEFAULT}"},
	}
	for _, tt := range tests {
		got := resolvePlaceholder(tt.input)
		if got != tt.want {
			t.Errorf("resolvePlaceholder(%q): got %q, want %q", tt.input, got, tt.want)
		}
	}
}
