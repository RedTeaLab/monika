# Provider Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Monika's built-in provider registry with a provider-plugin foundation based on HashiCorp go-plugin, gRPC, unified streaming events, config loading, and install registry primitives.

**Architecture:** Add the provider protocol and plugin host as the new provider boundary while preserving a minimal runnable core. The first implementation builds protocol types, config/registry handling, plugin resolution, provider client abstractions, and agent stream aggregation; external provider binaries can be added after the host and SDK foundations exist.

**Tech Stack:** Go 1.25.5, protobuf/gRPC, HashiCorp go-plugin, YAML config, standard library testing, `go test ./...` verification.

---

## Reference Documents

- Design: `docs/plans/2026-04-25-provider-plugin-architecture-design.md`
- Repo guide: `AGENTS.md`
- Existing provider code to replace: `internal/provider/provider.go`, `internal/provider/deepseek.go`
- Existing agent code to adapt: `internal/agents/agent.go`

## Implementation Notes

- Use @superpowers:test-driven-development for each code task.
- Keep commits small and frequent.
- Do not run `go run ./cmd/monika` as a smoke test because the current main sends a real model request.
- Do not copy the inline API key from `cmd/monika/main.go` into tests, docs, logs, or commits.
- If generated protobuf output is not feasible in the current environment, commit `proto` definitions and handwritten internal interfaces first, then add generated files in the task that installs generation tooling.

### Task 1: Add Provider Protocol Proto Definition

**Files:**
- Create: `proto/monika/provider/v1/provider.proto`
- Modify: `go.mod`
- Test: `go test ./...`

**Step 1: Write the proto file**

Create `proto/monika/provider/v1/provider.proto` with this complete initial schema:

```proto
syntax = "proto3";

package monika.provider.v1;

option go_package = "monika/proto/monika/provider/v1;providerv1";

import "google/protobuf/duration.proto";
import "google/protobuf/struct.proto";

service ProviderPlugin {
  rpc Initialize(InitializeRequest) returns (InitializeResponse);
  rpc GetCapabilities(GetCapabilitiesRequest) returns (GetCapabilitiesResponse);
  rpc ValidateProviderConfig(ValidateProviderConfigRequest) returns (ValidateProviderConfigResponse);
  rpc ListModels(ListModelsRequest) returns (ListModelsResponse);
  rpc StreamChat(StreamChatRequest) returns (stream ChatEvent);
  rpc Shutdown(ShutdownRequest) returns (ShutdownResponse);
}

message InitializeRequest {
  string monika_version = 1;
  string protocol_version = 2;
  string protocol_version_range = 3;
  google.protobuf.Struct plugin_config = 4;
}

message InitializeResponse {
  string plugin_id = 1;
  string plugin_name = 2;
  string plugin_version = 3;
  string protocol_version = 4;
  repeated string capabilities = 5;
}

message GetCapabilitiesRequest {}

message GetCapabilitiesResponse {
  PluginInfo plugin = 1;
  google.protobuf.Struct plugin_config_schema = 2;
  repeated ProviderEntry providers = 3;
}

message PluginInfo {
  string id = 1;
  string name = 2;
  string version = 3;
  string protocol_version = 4;
}

message ProviderEntry {
  string id = 1;
  string name = 2;
  repeated string capabilities = 3;
  repeated Model known_models = 4;
  bool supports_dynamic_models = 5;
  bool allows_custom_model_id = 6;
  google.protobuf.Struct provider_config_schema = 7;
}

message Model {
  string id = 1;
  string display_name = 2;
  repeated string capabilities = 3;
  int64 context_window = 4;
  int64 max_output_tokens = 5;
}

message ValidateProviderConfigRequest {
  string provider_id = 1;
  google.protobuf.Struct provider_config = 2;
}

message ValidateProviderConfigResponse {
  repeated ValidationIssue issues = 1;
}

message ValidationIssue {
  string field = 1;
  string code = 2;
  string message = 3;
  bool fatal = 4;
}

message ListModelsRequest {
  string provider_id = 1;
  google.protobuf.Struct provider_config = 2;
}

message ListModelsResponse {
  repeated Model models = 1;
}

message StreamChatRequest {
  string provider_id = 1;
  string model = 2;
  google.protobuf.Struct provider_config = 3;
  repeated Message messages = 4;
  repeated Tool tools = 5;
  ToolChoice tool_choice = 6;
  GenerationConfig generation_config = 7;
  RuntimePolicy runtime_policy = 8;
}

message Message {
  string id = 1;
  Role role = 2;
  repeated ContentPart content = 3;
  repeated ToolCall tool_calls = 4;
  ToolResult tool_result = 5;
  map<string, string> metadata = 6;
}

enum Role {
  ROLE_UNSPECIFIED = 0;
  ROLE_SYSTEM = 1;
  ROLE_USER = 2;
  ROLE_ASSISTANT = 3;
  ROLE_TOOL = 4;
}

message ContentPart {
  oneof kind {
    TextPart text = 1;
    ImagePart image = 2;
    AudioPart audio = 3;
    FilePart file = 4;
  }
}

message TextPart { string text = 1; }

message ImagePart {
  string mime_type = 1;
  oneof source {
    bytes data = 2;
    string uri = 3;
  }
}

message AudioPart {
  string mime_type = 1;
  oneof source {
    bytes data = 2;
    string uri = 3;
  }
}

message FilePart {
  string mime_type = 1;
  string name = 2;
  oneof source {
    bytes data = 3;
    string uri = 4;
  }
}

message Tool {
  string name = 1;
  string description = 2;
  google.protobuf.Struct input_schema = 3;
}

message ToolChoice {
  string mode = 1;
  string tool_name = 2;
}

message ToolCall {
  string id = 1;
  string name = 2;
  google.protobuf.Struct arguments = 3;
}

message ToolResult {
  string tool_call_id = 1;
  string name = 2;
  repeated ContentPart content = 3;
  bool is_error = 4;
}

message GenerationConfig {
  optional double temperature = 1;
  optional double top_p = 2;
  optional int64 max_output_tokens = 3;
  repeated string stop = 4;
}

message RuntimePolicy {
  google.protobuf.Struct policy = 1;
}

message ChatEvent {
  string event_id = 1;
  oneof kind {
    MessageStart message_start = 2;
    ContentDelta content_delta = 3;
    ReasoningDelta reasoning_delta = 4;
    ToolCallStart tool_call_start = 5;
    ToolCallDelta tool_call_delta = 6;
    ToolCallEnd tool_call_end = 7;
    Usage usage = 8;
    ProviderDiagnostic diagnostic = 9;
    ProviderError error = 10;
    MessageEnd message_end = 11;
  }
}

message MessageStart { string message_id = 1; }
message ContentDelta { string text = 1; }

message ReasoningDelta {
  string text = 1;
  ReasoningVisibility visibility = 2;
  bool redacted = 3;
}

enum ReasoningVisibility {
  REASONING_VISIBILITY_UNSPECIFIED = 0;
  REASONING_VISIBILITY_HIDDEN = 1;
  REASONING_VISIBILITY_SUMMARY = 2;
  REASONING_VISIBILITY_VISIBLE = 3;
}

message ToolCallStart {
  string tool_call_id = 1;
  string name = 2;
}

message ToolCallDelta {
  string tool_call_id = 1;
  string arguments_delta = 2;
}

message ToolCallEnd {
  string tool_call_id = 1;
  google.protobuf.Struct arguments = 2;
}

message Usage {
  optional int64 input_tokens = 1;
  optional int64 output_tokens = 2;
  optional int64 total_tokens = 3;
  optional int64 cache_read_tokens = 4;
  optional int64 cache_write_tokens = 5;
  optional double estimated_cost = 6;
  string currency = 7;
  UsageSource source = 8;
}

enum UsageSource {
  USAGE_SOURCE_UNSPECIFIED = 0;
  USAGE_SOURCE_PROVIDER_REPORTED = 1;
  USAGE_SOURCE_MONIKA_ESTIMATED = 2;
}

message ProviderDiagnostic {
  string code = 1;
  string message = 2;
  google.protobuf.Struct details = 3;
}

message ProviderError {
  string code = 1;
  string message = 2;
  bool retryable = 3;
  google.protobuf.Duration retry_after = 4;
  google.protobuf.Struct details = 5;
}

message MessageEnd {
  string message_id = 1;
  string finish_reason = 2;
}

message ShutdownRequest {}
message ShutdownResponse {}
```

**Step 2: Add generation dependencies**

Run:

```bash
go get google.golang.org/protobuf google.golang.org/grpc
```

Expected: `go.mod` includes protobuf and grpc modules.

**Step 3: Run compile verification**

Run:

```bash
go test ./...
```

Expected: PASS, because the proto file is not yet compiled into Go code.

**Step 4: Commit**

```bash
git add proto/monika/provider/v1/provider.proto go.mod go.sum
git commit -m "feat: define provider plugin protocol"
```

### Task 2: Generate Provider Protocol Go Code

**Files:**
- Create: `proto/monika/provider/v1/provider.pb.go`
- Create: `proto/monika/provider/v1/provider_grpc.pb.go`
- Modify: `go.mod`
- Modify: `go.sum`

**Step 1: Install generators if missing**

Run:

```bash
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
```

Expected: commands complete successfully.

**Step 2: Generate Go files**

Run:

```bash
protoc --go_out=. --go-grpc_out=. proto/monika/provider/v1/provider.proto
```

Expected: generated Go files exist under `proto/monika/provider/v1/` or the generator-created module path. If generated under `monika/proto/...`, move the `go_package` or command options so the final files live at `proto/monika/provider/v1/`.

**Step 3: Run compile verification**

Run:

```bash
go test ./...
```

Expected: PASS.

**Step 4: Commit**

```bash
git add proto/monika/provider/v1/provider.pb.go proto/monika/provider/v1/provider_grpc.pb.go go.mod go.sum
git commit -m "feat: generate provider protocol bindings"
```

### Task 3: Add Provider Config Loader

**Files:**
- Create: `internal/config/config.go`
- Create: `internal/config/config_test.go`
- Modify: `go.mod`
- Modify: `go.sum`

**Step 1: Add YAML dependency**

Run:

```bash
go get gopkg.in/yaml.v3
```

Expected: `go.mod` includes `gopkg.in/yaml.v3`.

**Step 2: Write failing tests**

Create `internal/config/config_test.go`:

```go
package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadMergesGlobalAndProjectProviderConfig(t *testing.T) {
	tmp := t.TempDir()
	home := filepath.Join(tmp, "home")
	project := filepath.Join(tmp, "project")
	mustWrite(t, filepath.Join(home, ".monika", "config.yaml"), []byte(`provider:
  plugin: openai-family
  id: openai-compatible
  model: global-model
  config:
    base_url: http://global.example
plugins:
  openai-family:
    config:
      proxy: http://proxy.example
`))
	mustWrite(t, filepath.Join(project, ".monika", "config.yaml"), []byte(`provider:
  model: project-model
  config:
    base_url: http://project.example
`))

	cfg, err := Load(Options{HomeDir: home, ProjectDir: project})
	if err != nil {
		t.Fatal(err)
	}

	if cfg.Provider.Plugin != "openai-family" {
		t.Fatalf("plugin = %q", cfg.Provider.Plugin)
	}
	if cfg.Provider.ID != "openai-compatible" {
		t.Fatalf("id = %q", cfg.Provider.ID)
	}
	if cfg.Provider.Model != "project-model" {
		t.Fatalf("model = %q", cfg.Provider.Model)
	}
	if cfg.Provider.Config["base_url"] != "http://project.example" {
		t.Fatalf("base_url = %#v", cfg.Provider.Config["base_url"])
	}
	if cfg.Plugins["openai-family"].Config["proxy"] != "http://proxy.example" {
		t.Fatalf("proxy = %#v", cfg.Plugins["openai-family"].Config["proxy"])
	}
}

func TestLoadAllowsMissingConfigFiles(t *testing.T) {
	tmp := t.TempDir()
	cfg, err := Load(Options{HomeDir: filepath.Join(tmp, "home"), ProjectDir: filepath.Join(tmp, "project")})
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Provider.ID != "" {
		t.Fatalf("provider id = %q", cfg.Provider.ID)
	}
}

func mustWrite(t *testing.T, path string, data []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
}
```

**Step 3: Run tests to verify failure**

Run:

```bash
go test ./internal/config
```

Expected: FAIL with undefined `Load` or `Options`.

**Step 4: Implement config loader**

Create `internal/config/config.go`:

```go
package config

import (
	"errors"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

type Options struct {
	HomeDir    string
	ProjectDir string
}

type Config struct {
	Plugins  map[string]PluginConfig `yaml:"plugins"`
	Provider ProviderConfig          `yaml:"provider"`
}

type PluginConfig struct {
	Config map[string]any `yaml:"config"`
}

type ProviderConfig struct {
	Plugin string         `yaml:"plugin"`
	ID     string         `yaml:"id"`
	Model  string         `yaml:"model"`
	Config map[string]any `yaml:"config"`
}

func Load(opts Options) (Config, error) {
	var cfg Config
	cfg.Plugins = map[string]PluginConfig{}
	cfg.Provider.Config = map[string]any{}

	if opts.HomeDir != "" {
		if err := mergeFile(&cfg, filepath.Join(opts.HomeDir, ".monika", "config.yaml")); err != nil {
			return Config{}, err
		}
	}
	if opts.ProjectDir != "" {
		if err := mergeFile(&cfg, filepath.Join(opts.ProjectDir, ".monika", "config.yaml")); err != nil {
			return Config{}, err
		}
	}
	return cfg, nil
}

func mergeFile(dst *Config, path string) error {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}

	var src Config
	if err := yaml.Unmarshal(data, &src); err != nil {
		return err
	}
	merge(dst, src)
	return nil
}

func merge(dst *Config, src Config) {
	if dst.Plugins == nil {
		dst.Plugins = map[string]PluginConfig{}
	}
	for id, plugin := range src.Plugins {
		current := dst.Plugins[id]
		current.Config = mergeMap(current.Config, plugin.Config)
		dst.Plugins[id] = current
	}

	if src.Provider.Plugin != "" {
		dst.Provider.Plugin = src.Provider.Plugin
	}
	if src.Provider.ID != "" {
		dst.Provider.ID = src.Provider.ID
	}
	if src.Provider.Model != "" {
		dst.Provider.Model = src.Provider.Model
	}
	dst.Provider.Config = mergeMap(dst.Provider.Config, src.Provider.Config)
}

func mergeMap(dst, src map[string]any) map[string]any {
	if dst == nil {
		dst = map[string]any{}
	}
	for key, value := range src {
		dst[key] = value
	}
	return dst
}
```

**Step 5: Run tests**

Run:

```bash
go test ./internal/config
go test ./...
```

Expected: PASS.

**Step 6: Commit**

```bash
git add internal/config/config.go internal/config/config_test.go go.mod go.sum
git commit -m "feat: load layered monika config"
```

### Task 4: Add Provider Plugin Registry

**Files:**
- Create: `internal/pluginregistry/registry.go`
- Create: `internal/pluginregistry/registry_test.go`

**Step 1: Write failing tests**

Create `internal/pluginregistry/registry_test.go`:

```go
package pluginregistry

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveProviderWithPlugin(t *testing.T) {
	registry := Registry{Plugins: []Plugin{{
		ID:     "openai-family",
		Binary: "monika-provider-openai",
		Providers: []ProviderEntry{{ID: "openai-compatible", Name: "OpenAI Compatible"}},
	}}}

	plugin, provider, err := registry.ResolveProvider("openai-family", "openai-compatible")
	if err != nil {
		t.Fatal(err)
	}
	if plugin.ID != "openai-family" || provider.ID != "openai-compatible" {
		t.Fatalf("resolved %#v %#v", plugin, provider)
	}
}

func TestResolveProviderRequiresPluginWhenIDIsAmbiguous(t *testing.T) {
	registry := Registry{Plugins: []Plugin{
		{ID: "a", Providers: []ProviderEntry{{ID: "openai-compatible"}}},
		{ID: "b", Providers: []ProviderEntry{{ID: "openai-compatible"}}},
	}}

	_, _, err := registry.ResolveProvider("", "openai-compatible")
	if err == nil {
		t.Fatal("expected ambiguity error")
	}
}

func TestLoadAndSaveRegistry(t *testing.T) {
	path := filepath.Join(t.TempDir(), "providers.json")
	want := Registry{Plugins: []Plugin{{ID: "deepseek", BinaryPath: "bin"}}}
	if err := Save(path, want); err != nil {
		t.Fatal(err)
	}
	got, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Plugins) != 1 || got.Plugins[0].ID != "deepseek" {
		t.Fatalf("registry = %#v", got)
	}
}

func TestLoadMissingRegistryReturnsEmpty(t *testing.T) {
	got, err := Load(filepath.Join(t.TempDir(), "missing.json"))
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Plugins) != 0 {
		t.Fatalf("registry = %#v", got)
	}
}

func TestSaveCreatesParentDirectory(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "providers.json")
	if err := Save(path, Registry{}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatal(err)
	}
}
```

**Step 2: Run tests to verify failure**

Run:

```bash
go test ./internal/pluginregistry
```

Expected: FAIL with undefined registry types.

**Step 3: Implement registry**

Create `internal/pluginregistry/registry.go`:

```go
package pluginregistry

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

type Registry struct {
	Plugins []Plugin `json:"plugins"`
}

type Plugin struct {
	ID                   string          `json:"plugin_id"`
	Package              string          `json:"package"`
	PackageRef           string          `json:"package_ref"`
	Binary               string          `json:"binary"`
	BinaryPath           string          `json:"binary_path"`
	Checksum             string          `json:"checksum"`
	Version              string          `json:"version"`
	ProtocolVersion      string          `json:"protocol_version"`
	InstalledAt          time.Time       `json:"installed_at"`
	CapabilitiesSnapshot json.RawMessage `json:"capabilities_snapshot,omitempty"`
	Providers            []ProviderEntry `json:"providers"`
}

type ProviderEntry struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Capabilities []string `json:"capabilities"`
}

func Load(path string) (Registry, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return Registry{}, nil
	}
	if err != nil {
		return Registry{}, err
	}
	var registry Registry
	if err := json.Unmarshal(data, &registry); err != nil {
		return Registry{}, err
	}
	return registry, nil
}

func Save(path string, registry Registry) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(registry, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o644)
}

func (r Registry) ResolveProvider(pluginID, providerID string) (Plugin, ProviderEntry, error) {
	var matches []struct {
		plugin   Plugin
		provider ProviderEntry
	}

	for _, plugin := range r.Plugins {
		if pluginID != "" && plugin.ID != pluginID {
			continue
		}
		for _, provider := range plugin.Providers {
			if provider.ID == providerID {
				matches = append(matches, struct {
					plugin   Plugin
					provider ProviderEntry
				}{plugin: plugin, provider: provider})
			}
		}
	}

	if len(matches) == 0 {
		return Plugin{}, ProviderEntry{}, fmt.Errorf("provider %q not found", providerID)
	}
	if len(matches) > 1 {
		return Plugin{}, ProviderEntry{}, fmt.Errorf("provider %q is ambiguous; set provider.plugin", providerID)
	}
	return matches[0].plugin, matches[0].provider, nil
}
```

**Step 4: Run tests**

Run:

```bash
go test ./internal/pluginregistry
go test ./...
```

Expected: PASS.

**Step 5: Commit**

```bash
git add internal/pluginregistry/registry.go internal/pluginregistry/registry_test.go
git commit -m "feat: add provider plugin registry"
```

### Task 5: Add Chat Event Aggregator

**Files:**
- Create: `internal/agents/stream.go`
- Create: `internal/agents/stream_test.go`

**Step 1: Write failing tests**

Create `internal/agents/stream_test.go`:

```go
package agents

import "testing"

func TestAggregateEventsCollectsContentAndUsage(t *testing.T) {
	events := []ChatEvent{
		{Kind: ContentDelta, Text: "hello"},
		{Kind: ContentDelta, Text: " world"},
		{Kind: UsageEvent, Usage: Usage{InputTokens: 2, OutputTokens: 3, TotalTokens: 5}},
		{Kind: MessageEnd, FinishReason: "stop"},
	}

	msg, err := AggregateEvents(events)
	if err != nil {
		t.Fatal(err)
	}
	if msg.Content != "hello world" {
		t.Fatalf("content = %q", msg.Content)
	}
	if msg.Usage.TotalTokens != 5 {
		t.Fatalf("usage = %#v", msg.Usage)
	}
	if msg.FinishReason != "stop" {
		t.Fatalf("finish reason = %q", msg.FinishReason)
	}
}

func TestAggregateEventsReturnsProviderError(t *testing.T) {
	_, err := AggregateEvents([]ChatEvent{{Kind: ErrorEvent, ProviderError: ProviderError{Code: "auth_failed", Message: "missing key"}}})
	if err == nil {
		t.Fatal("expected provider error")
	}
}
```

**Step 2: Run tests to verify failure**

Run:

```bash
go test ./internal/agents
```

Expected: FAIL with undefined event types.

**Step 3: Implement minimal aggregator**

Create `internal/agents/stream.go`:

```go
package agents

import (
	"fmt"
	"strings"
)

type EventKind int

const (
	UnknownEvent EventKind = iota
	ContentDelta
	UsageEvent
	ErrorEvent
	MessageEnd
)

type ChatEvent struct {
	Kind         EventKind
	Text         string
	Usage        Usage
	ProviderError ProviderError
	FinishReason string
}

type Usage struct {
	InputTokens  int64
	OutputTokens int64
	TotalTokens  int64
}

type ProviderError struct {
	Code    string
	Message string
}

type AssistantMessage struct {
	Content      string
	Usage        Usage
	FinishReason string
}

func AggregateEvents(events []ChatEvent) (AssistantMessage, error) {
	var out AssistantMessage
	var content strings.Builder

	for _, event := range events {
		switch event.Kind {
		case ContentDelta:
			content.WriteString(event.Text)
		case UsageEvent:
			out.Usage = event.Usage
		case ErrorEvent:
			return AssistantMessage{}, fmt.Errorf("provider error %s: %s", event.ProviderError.Code, event.ProviderError.Message)
		case MessageEnd:
			out.FinishReason = event.FinishReason
		}
	}

	out.Content = content.String()
	return out, nil
}
```

**Step 4: Run tests**

Run:

```bash
go test ./internal/agents
go test ./...
```

Expected: PASS.

**Step 5: Commit**

```bash
git add internal/agents/stream.go internal/agents/stream_test.go
git commit -m "feat: aggregate provider stream events"
```

### Task 6: Replace Agent Provider Interface With Streaming Client Interface

**Files:**
- Modify: `internal/agents/agent.go`
- Create: `internal/agents/agent_test.go`

**Step 1: Write failing tests**

Create `internal/agents/agent_test.go`:

```go
package agents

import (
	"context"
	"testing"
)

type fakeProviderClient struct {
	events []ChatEvent
}

func (f fakeProviderClient) StreamChat(ctx context.Context, req ChatRequest) ([]ChatEvent, error) {
	return f.events, nil
}

func TestAgentInvokeAggregatesProviderStream(t *testing.T) {
	agent := NewAgent(fakeProviderClient{events: []ChatEvent{
		{Kind: ContentDelta, Text: "hi"},
		{Kind: MessageEnd, FinishReason: "stop"},
	}})

	got, err := agent.Invoke(context.Background(), "hello")
	if err != nil {
		t.Fatal(err)
	}
	if got != "hi" {
		t.Fatalf("response = %q", got)
	}
}
```

**Step 2: Run tests to verify failure**

Run:

```bash
go test ./internal/agents
```

Expected: FAIL because `NewAgent` and `Invoke` still use the old provider interface.

**Step 3: Implement streaming client interface**

Replace `internal/agents/agent.go` with:

```go
package agents

import "context"

type Agent interface {
	Invoke(ctx context.Context, message string) (string, error)
}

type ProviderClient interface {
	StreamChat(ctx context.Context, req ChatRequest) ([]ChatEvent, error)
}

type ChatRequest struct {
	Messages []Message
}

type Message struct {
	Role    string
	Content string
}

type AgentOption struct {
	Provider ProviderClient
}

func NewAgent(provider ProviderClient) Agent {
	return &AgentOption{Provider: provider}
}

func (a *AgentOption) Invoke(ctx context.Context, message string) (string, error) {
	events, err := a.Provider.StreamChat(ctx, ChatRequest{Messages: []Message{{Role: "user", Content: message}}})
	if err != nil {
		return "", err
	}
	assistant, err := AggregateEvents(events)
	if err != nil {
		return "", err
	}
	return assistant.Content, nil
}
```

**Step 4: Run tests**

Run:

```bash
go test ./internal/agents
go test ./...
```

Expected: `internal/agents` passes. `cmd/monika` may fail because main still uses the old provider; fix that in the next task if it fails globally.

**Step 5: Commit**

```bash
git add internal/agents/agent.go internal/agents/agent_test.go
git commit -m "feat: adapt agent to streaming provider client"
```

### Task 7: Remove Built-In DeepSeek Provider From Main Path

**Files:**
- Modify: `cmd/monika/main.go`
- Delete: `internal/provider/deepseek.go`
- Delete: `internal/provider/provider.go`
- Modify: `go.mod`
- Modify: `go.sum`

**Step 1: Replace main with safe placeholder**

Replace `cmd/monika/main.go` with:

```go
package main

import "fmt"

func main() {
	fmt.Println("monika provider plugin host is not configured yet")
}
```

**Step 2: Delete old provider files**

Delete:

```text
internal/provider/deepseek.go
internal/provider/provider.go
```

**Step 3: Tidy dependencies**

Run:

```bash
go mod tidy
```

Expected: `github.com/go-resty/resty/v2` is removed unless still needed elsewhere.

**Step 4: Run tests**

Run:

```bash
go test ./...
```

Expected: PASS, and no real model request is sent.

**Step 5: Commit**

```bash
git add cmd/monika/main.go internal/provider/deepseek.go internal/provider/provider.go go.mod go.sum
git commit -m "refactor: remove built-in provider path"
```

### Task 8: Add Provider Plugin Host Skeleton

**Files:**
- Create: `internal/pluginhost/host.go`
- Create: `internal/pluginhost/host_test.go`
- Modify: `go.mod`
- Modify: `go.sum`

**Step 1: Add dependency**

Run:

```bash
go get github.com/hashicorp/go-plugin
```

Expected: `go.mod` includes `github.com/hashicorp/go-plugin`.

**Step 2: Write failing tests**

Create `internal/pluginhost/host_test.go`:

```go
package pluginhost

import "testing"

func TestHandshakeConfigIsStable(t *testing.T) {
	cfg := HandshakeConfig()
	if cfg.ProtocolVersion == 0 {
		t.Fatal("protocol version must be set")
	}
	if cfg.MagicCookieKey == "" || cfg.MagicCookieValue == "" {
		t.Fatal("magic cookie must be set")
	}
}

func TestNewHostStoresPluginCommand(t *testing.T) {
	host := New(Options{Command: "monika-provider-test"})
	if host.Command() != "monika-provider-test" {
		t.Fatalf("command = %q", host.Command())
	}
}
```

**Step 3: Run tests to verify failure**

Run:

```bash
go test ./internal/pluginhost
```

Expected: FAIL with undefined `HandshakeConfig`, `New`, or `Options`.

**Step 4: Implement host skeleton**

Create `internal/pluginhost/host.go`:

```go
package pluginhost

import hplugin "github.com/hashicorp/go-plugin"

const (
	protocolVersion uint = 1
	magicCookieKey       = "MONIKA_PROVIDER_PLUGIN"
	magicCookieValue     = "monika-provider-v1"
)

type Options struct {
	Command string
}

type Host struct {
	command string
}

func New(opts Options) Host {
	return Host{command: opts.Command}
}

func (h Host) Command() string {
	return h.command
}

func HandshakeConfig() hplugin.HandshakeConfig {
	return hplugin.HandshakeConfig{
		ProtocolVersion:  protocolVersion,
		MagicCookieKey:   magicCookieKey,
		MagicCookieValue: magicCookieValue,
	}
}
```

**Step 5: Run tests**

Run:

```bash
go test ./internal/pluginhost
go test ./...
```

Expected: PASS.

**Step 6: Commit**

```bash
git add internal/pluginhost/host.go internal/pluginhost/host_test.go go.mod go.sum
git commit -m "feat: add provider plugin host skeleton"
```

### Task 9: Add Provider Install Planning Utilities

**Files:**
- Create: `internal/providerinstall/install.go`
- Create: `internal/providerinstall/install_test.go`

**Step 1: Write failing tests**

Create `internal/providerinstall/install_test.go`:

```go
package providerinstall

import "testing"

func TestInferBinaryFromPackageRef(t *testing.T) {
	got := InferBinary("github.com/acme/monika-provider-openai@v0.3.1", "")
	if got != "monika-provider-openai" {
		t.Fatalf("binary = %q", got)
	}
}

func TestInferBinaryUsesOverride(t *testing.T) {
	got := InferBinary("github.com/acme/providers/cmd/deepseek@latest", "monika-provider-deepseek")
	if got != "monika-provider-deepseek" {
		t.Fatalf("binary = %q", got)
	}
}

func TestPackageWithoutVersion(t *testing.T) {
	got := PackagePath("github.com/acme/monika-provider-openai@v0.3.1")
	if got != "github.com/acme/monika-provider-openai" {
		t.Fatalf("package = %q", got)
	}
}
```

**Step 2: Run tests to verify failure**

Run:

```bash
go test ./internal/providerinstall
```

Expected: FAIL with undefined functions.

**Step 3: Implement utilities**

Create `internal/providerinstall/install.go`:

```go
package providerinstall

import "path"

func InferBinary(packageRef, override string) string {
	if override != "" {
		return override
	}
	return path.Base(PackagePath(packageRef))
}

func PackagePath(packageRef string) string {
	for i, r := range packageRef {
		if r == '@' {
			return packageRef[:i]
		}
	}
	return packageRef
}
```

**Step 4: Run tests**

Run:

```bash
go test ./internal/providerinstall
go test ./...
```

Expected: PASS.

**Step 5: Commit**

```bash
git add internal/providerinstall/install.go internal/providerinstall/install_test.go
git commit -m "feat: add provider install utilities"
```

### Task 10: Add CLI Command Shape Documentation in Main

**Files:**
- Modify: `cmd/monika/main.go`
- Create: `cmd/monika/main_test.go`

**Step 1: Write failing test**

Create `cmd/monika/main_test.go`:

```go
package main

import "testing"

func TestUsageMentionsProviderInstall(t *testing.T) {
	usage := Usage()
	if !contains(usage, "monika provider install") {
		t.Fatalf("usage missing provider install: %s", usage)
	}
}

func contains(s, substr string) bool {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
```

**Step 2: Run test to verify failure**

Run:

```bash
go test ./cmd/monika
```

Expected: FAIL with undefined `Usage`.

**Step 3: Add usage function**

Replace `cmd/monika/main.go` with:

```go
package main

import "fmt"

func main() {
	fmt.Print(Usage())
}

func Usage() string {
	return `Monika

Commands:
  monika provider install <package[@version]>  Install a provider plugin
  monika provider list                         List installed provider plugins

Provider-backed agent execution is not wired yet.
`
}
```

**Step 4: Run tests**

Run:

```bash
go test ./cmd/monika
go test ./...
```

Expected: PASS.

**Step 5: Commit**

```bash
git add cmd/monika/main.go cmd/monika/main_test.go
git commit -m "feat: document provider plugin commands"
```

### Task 11: Final Verification

**Files:**
- Review: `AGENTS.md`
- Review: `docs/plans/2026-04-25-provider-plugin-architecture-design.md`
- Review: all files changed in this plan

**Step 1: Format Go files**

Run:

```bash
gofmt -w cmd/monika/main.go internal/agents/*.go internal/config/*.go internal/pluginhost/*.go internal/pluginregistry/*.go internal/providerinstall/*.go
```

Expected: command succeeds.

**Step 2: Tidy modules**

Run:

```bash
go mod tidy
```

Expected: command succeeds.

**Step 3: Run full verification**

Run:

```bash
go test ./...
```

Expected: PASS.

**Step 4: Inspect worktree**

Run:

```bash
git status --short
```

Expected: only intentional files are modified or untracked.

**Step 5: Commit final cleanup if needed**

```bash
git add .
git commit -m "chore: verify provider plugin foundation"
```

Only commit if there are remaining intentional formatting, module, or generated-file changes.
