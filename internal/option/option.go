package option

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/ini.v1"
)

const (
	DefaultBaseUrl = ""
	DefaultModel   = ""
)

type Config struct {
	BaseUrl string
	ApiKey  string
	Model   string
}

// Load creates a new Config by loading from INI file and environment variables.
// Priority: Environment variables > INI file > Default values
func Load() *Config {
	c := &Config{}
	c.Apply()
	return c
}

// Apply loads configuration from INI file and environment variables.
func (c *Config) Apply() {
	// 1. Load from INI config file (lowest priority)
	c.loadFromINI()

	// 2. Override with environment variables (medium priority)
	if env := os.Getenv("MONIKA_BASE_URL"); env != "" {
		c.BaseUrl = env
	}
	if c.BaseUrl == "" {
		c.BaseUrl = DefaultBaseUrl
	}

	if env := os.Getenv("MONIKA_API_KEY"); env != "" {
		c.ApiKey = env
	}

	if env := os.Getenv("MONIKA_MODEL"); env != "" {
		c.Model = env
	}
	if c.Model == "" {
		c.Model = DefaultModel
	}
}

// loadFromINI loads configuration from an INI file.
// It looks for config file at: $HOME/.monika/config.ini
// If no config file exists, creates a template at $HOME/.monika/config.ini
func (c *Config) loadFromINI() {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return
	}

	configPath := filepath.Join(homeDir, ".monika", "config.ini")

	cfg, err := ini.Load(configPath)
	if err != nil {
		// Config file doesn't exist, create template
		c.createConfigTemplate(configPath)
		return
	}

	// Read from [monika] section
	section := cfg.Section("monika")

	if c.BaseUrl == "" {
		if baseUrl := section.Key("base_url").String(); baseUrl != "" {
			c.BaseUrl = baseUrl
		}
	}

	if c.ApiKey == "" {
		if apiKey := section.Key("api_key").String(); apiKey != "" {
			c.ApiKey = apiKey
		}
	}

	if c.Model == "" {
		if model := section.Key("model").String(); model != "" {
			c.Model = model
		}
	}

}

// createConfigTemplate creates a template INI config file and prompts user to configure it
func (c *Config) createConfigTemplate(path string) {
	template := `# monika Configuration File
# Environment variables take priority over this file
# Available env vars: MONIKA_BASE_URL, MONIKA_API_KEY, MONIKA_MODEL, MONIKA_THINKING

[monika]
base_url = https://api.openai.com/v1
api_key = sk-your-api-key-here
model = gpt-3.5-turbo
`

	// Ensure directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return
	}

	if err := os.WriteFile(path, []byte(template), 0644); err != nil {
		return
	}

	fmt.Println("Config file created:", path)
	fmt.Println("Please edit the file and configure your API key, then run again.")
	os.Exit(1)
}
