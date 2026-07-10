package dbdiscovery

import (
	"bufio"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

type springDiscoverer struct{}

func init() {
	RegisterDiscoverer(&springDiscoverer{})
}

func (s *springDiscoverer) Name() string { return "spring" }

func (s *springDiscoverer) Scan(projectDir string) ([]DiscoveredDB, error) {
	resDir := filepath.Join(projectDir, "src", "main", "resources")
	if _, err := os.Stat(resDir); err != nil {
		return nil, nil
	}

	targets := []string{
		"application.yml",
		"application.yaml",
		"application.properties",
		"application-dev.yml",
		"application-dev.yaml",
		"application-dev.properties",
	}

	var results []DiscoveredDB
	for _, name := range targets {
		path := filepath.Join(resDir, name)
		if _, err := os.Stat(path); err != nil {
			continue
		}
		if strings.HasSuffix(name, ".properties") {
			results = append(results, scanSpringProperties(path)...)
		} else {
			results = append(results, scanSpringYAML(path)...)
		}
	}
	return deduplicate(results), nil
}

func scanSpringYAML(path string) []DiscoveredDB {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	var root map[string]interface{}
	decoder := yaml.NewDecoder(strings.NewReader(string(data)))
	if err := decoder.Decode(&root); err != nil {
		return nil
	}

	var results []DiscoveredDB
	sourceName := filepath.Base(path)

	if dsURL := yamlStr(root, "spring", "datasource", "url"); dsURL != "" {
		dsURL = resolvePlaceholder(dsURL)
		user := resolvePlaceholder(yamlStr(root, "spring", "datasource", "username"))
		pass := resolvePlaceholder(yamlStr(root, "spring", "datasource", "password"))
		if driver, dsn := jdbcToDSN(dsURL, user, pass); driver != "" {
			results = append(results, DiscoveredDB{
				Name: "spring/" + sourceName, Driver: driver, DSN: dsn, Source: path,
			})
		}
	}

	redisHost := yamlStr(root, "spring", "redis", "host")
	redisPrefix := []string{"spring", "redis"}
	if redisHost == "" {
		redisHost = yamlStr(root, "spring", "data", "redis", "host")
		redisPrefix = []string{"spring", "data", "redis"}
	}
	if redisHost != "" {
		redisPort := resolvePlaceholder(yamlStr(root, append(redisPrefix, "port")...))
		redisPass := resolvePlaceholder(yamlStr(root, append(redisPrefix, "password")...))
		redisDB := resolvePlaceholder(yamlStr(root, append(redisPrefix, "database")...))
		if redisPort == "" {
			redisPort = "6379"
		}
		if redisDB == "" {
			redisDB = "0"
		}
		results = append(results, DiscoveredDB{
			Name: "spring/" + sourceName, Driver: "redis",
			DSN: buildRedisDSN(resolvePlaceholder(redisHost), redisPort, redisPass, redisDB), Source: path,
		})
	}

	if mongoURI := yamlStr(root, "spring", "data", "mongodb", "uri"); mongoURI != "" {
		results = append(results, DiscoveredDB{
			Name: "spring/" + sourceName, Driver: "mongo",
			DSN: resolvePlaceholder(mongoURI), Source: path,
		})
	} else if mongoHost := yamlStr(root, "spring", "data", "mongodb", "host"); mongoHost != "" {
		mongoPort := resolvePlaceholder(yamlStr(root, "spring", "data", "mongodb", "port"))
		mongoDB := resolvePlaceholder(yamlStr(root, "spring", "data", "mongodb", "database"))
		mongoUser := resolvePlaceholder(yamlStr(root, "spring", "data", "mongodb", "username"))
		mongoPass := resolvePlaceholder(yamlStr(root, "spring", "data", "mongodb", "password"))
		if mongoPort == "" {
			mongoPort = "27017"
		}
		results = append(results, DiscoveredDB{
			Name: "spring/" + sourceName, Driver: "mongo",
			DSN: buildMongoDSN(resolvePlaceholder(mongoHost), mongoPort, mongoDB, mongoUser, mongoPass), Source: path,
		})
	}

	return results
}

func scanSpringProperties(path string) []DiscoveredDB {
	props, err := parsePropertiesFile(path)
	if err != nil || len(props) == 0 {
		return nil
	}

	var results []DiscoveredDB
	sourceName := filepath.Base(path)

	if dsURL := props["spring.datasource.url"]; dsURL != "" {
		dsURL = resolvePlaceholder(dsURL)
		user := resolvePlaceholder(props["spring.datasource.username"])
		pass := resolvePlaceholder(props["spring.datasource.password"])
		if driver, dsn := jdbcToDSN(dsURL, user, pass); driver != "" {
			results = append(results, DiscoveredDB{
				Name: "spring/" + sourceName, Driver: driver, DSN: dsn, Source: path,
			})
		}
	}

	redisHost := props["spring.data.redis.host"]
	redisPortKey := "spring.data.redis.port"
	redisPassKey := "spring.data.redis.password"
	redisDBKey := "spring.data.redis.database"
	if redisHost == "" {
		redisHost = props["spring.redis.host"]
		redisPortKey = "spring.redis.port"
		redisPassKey = "spring.redis.password"
		redisDBKey = "spring.redis.database"
	}
	if redisHost != "" {
		redisPort := resolvePlaceholder(props[redisPortKey])
		redisPass := resolvePlaceholder(props[redisPassKey])
		redisDB := resolvePlaceholder(props[redisDBKey])
		if redisPort == "" {
			redisPort = "6379"
		}
		if redisDB == "" {
			redisDB = "0"
		}
		results = append(results, DiscoveredDB{
			Name: "spring/" + sourceName, Driver: "redis",
			DSN: buildRedisDSN(resolvePlaceholder(redisHost), redisPort, redisPass, redisDB), Source: path,
		})
	}

	if mongoURI := props["spring.data.mongodb.uri"]; mongoURI != "" {
		results = append(results, DiscoveredDB{
			Name: "spring/" + sourceName, Driver: "mongo",
			DSN: resolvePlaceholder(mongoURI), Source: path,
		})
	} else if mongoHost := props["spring.data.mongodb.host"]; mongoHost != "" {
		mongoPort := resolvePlaceholder(props["spring.data.mongodb.port"])
		mongoDB := resolvePlaceholder(props["spring.data.mongodb.database"])
		mongoUser := resolvePlaceholder(props["spring.data.mongodb.username"])
		mongoPass := resolvePlaceholder(props["spring.data.mongodb.password"])
		if mongoPort == "" {
			mongoPort = "27017"
		}
		results = append(results, DiscoveredDB{
			Name: "spring/" + sourceName, Driver: "mongo",
			DSN: buildMongoDSN(resolvePlaceholder(mongoHost), mongoPort, mongoDB, mongoUser, mongoPass), Source: path,
		})
	}

	return results
}

func parsePropertiesFile(path string) (map[string]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	props := make(map[string]string)
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "!") {
			continue
		}
		idx := strings.Index(line, "=")
		if idx < 0 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		val := strings.TrimSpace(line[idx+1:])
		val = strings.Trim(val, `"'`)
		if key != "" {
			props[key] = val
		}
	}
	return props, scanner.Err()
}

func yamlStr(m map[string]interface{}, keys ...string) string {
	var current interface{} = m
	for _, key := range keys {
		next, ok := current.(map[string]interface{})
		if !ok {
			return ""
		}
		val, exists := next[key]
		if !exists {
			return ""
		}
		current = val
	}
	switch v := current.(type) {
	case string:
		return v
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(v)
	default:
		return ""
	}
}

var placeholderRe = regexp.MustCompile(`\$\{([^}:]+)(?::([^}]*))?\}`)

func resolvePlaceholder(value string) string {
	if !strings.Contains(value, "${") {
		return value
	}
	return placeholderRe.ReplaceAllStringFunc(value, func(match string) string {
		sub := placeholderRe.FindStringSubmatch(match)
		varName := sub[1]
		defaultVal := sub[2]
		if envVal := os.Getenv(varName); envVal != "" {
			return envVal
		}
		if defaultVal != "" {
			return defaultVal
		}
		return match
	})
}

func jdbcToDSN(jdbcURL, user, pass string) (driver, dsn string) {
	switch {
	case strings.HasPrefix(jdbcURL, "jdbc:postgresql://"):
		driver = "postgres"
		dsn = "postgres://" + strings.TrimPrefix(jdbcURL, "jdbc:postgresql://")
	case strings.HasPrefix(jdbcURL, "jdbc:mysql://"):
		driver = "mysql"
		dsn = "mysql://" + strings.TrimPrefix(jdbcURL, "jdbc:mysql://")
	case strings.HasPrefix(jdbcURL, "jdbc:sqlite:"):
		driver = "sqlite"
		dsn = strings.TrimPrefix(jdbcURL, "jdbc:sqlite:")
	default:
		return "", ""
	}
	if user != "" && !strings.Contains(strings.SplitN(dsn, "://", 2)[1], "@") {
		dsn = injectURLAuth(dsn, user, pass)
	}
	return
}

func injectURLAuth(rawURL, user, pass string) string {
	idx := strings.Index(rawURL, "://")
	if idx < 0 {
		return rawURL
	}
	auth := user
	if pass != "" {
		auth = user + ":" + pass
	}
	return rawURL[:idx+3] + auth + "@" + rawURL[idx+3:]
}

func buildRedisDSN(host, port, password, database string) string {
	dsn := "redis://"
	if password != "" {
		dsn += ":" + password + "@"
	}
	dsn += host + ":" + port
	if database != "" && database != "0" {
		dsn += "/" + database
	}
	return dsn
}

func buildMongoDSN(host, port, database, user, pass string) string {
	dsn := "mongodb://"
	if user != "" {
		dsn += user
		if pass != "" {
			dsn += ":" + pass
		}
		dsn += "@"
	}
	dsn += host + ":" + port
	if database != "" {
		dsn += "/" + database
	}
	return dsn
}
