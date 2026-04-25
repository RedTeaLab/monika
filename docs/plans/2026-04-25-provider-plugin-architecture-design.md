# Provider Plugin Architecture Design

## Goal

Monika should become a general-purpose coding agent whose model providers are external, installable adapters instead of built-in packages. The core agent should own orchestration, tools, skills, MCP, subagents, conversation state, and safety boundaries. Provider plugins should own vendor-specific model integration.

This design intentionally targets the final provider architecture from the start. It does not introduce temporary provider protocols or abstractions meant to be replaced later.

## Architecture Boundary

Provider integration uses HashiCorp go-plugin with gRPC. A provider plugin is a long-lived executable process installed by the user, commonly through `go install` or a Monika wrapper command. Monika starts and manages the plugin process, then communicates with it through the provider gRPC protocol.

Monika core owns:

- Agent loop and conversation state.
- Tool registry, permission checks, and tool execution.
- Skills, MCP integration, and subagent orchestration.
- Provider plugin process management and health tracking.
- Protocol compatibility checks and capability negotiation.
- Provider-agnostic schemas for messages, tools, content parts, usage, and reasoning.

Provider plugins own:

- Provider authentication and secret loading.
- Vendor endpoints, SDKs, request formats, and response parsing.
- Model metadata, rate limits, retries, and vendor quirks.
- Conversion between vendor streaming responses and Monika chat events.
- Tool-call format adaptation, but not tool execution.
- Provider and model capability declarations.
- Provider-specific configuration validation.

Provider plugins are local executables and are not sandboxed by Monika. Installation must warn users to install only trusted plugins. Monika does not pass tool execution authority to provider plugins.

## Provider Protocol

The provider protocol is gRPC from the first version. It must support streaming, cancellation, tool calling, usage accounting, reasoning content, multi-modal content, configuration validation, capability discovery, and version negotiation.

The service shape is:

```proto
service ProviderPlugin {
  rpc Initialize(InitializeRequest) returns (InitializeResponse);
  rpc GetCapabilities(GetCapabilitiesRequest) returns (GetCapabilitiesResponse);
  rpc ValidateProviderConfig(ValidateProviderConfigRequest) returns (ValidateProviderConfigResponse);
  rpc ListModels(ListModelsRequest) returns (ListModelsResponse);
  rpc StreamChat(StreamChatRequest) returns (stream ChatEvent);
  rpc Shutdown(ShutdownRequest) returns (ShutdownResponse);
}
```

There is no separate non-streaming `Chat` RPC. Monika always consumes `StreamChat` and aggregates events when it needs a complete response. Plugins for non-streaming vendors still implement `StreamChat` by calling the vendor API, then emitting a complete event sequence.

Chat events include:

- `message_start`
- `content_delta`
- `reasoning_delta`
- `tool_call_start`
- `tool_call_delta`
- `tool_call_end`
- `usage`
- `diagnostic`
- `error`
- `message_end`

Tool calls may stream arguments incrementally. Monika only executes a tool after `tool_call_end`, after arguments are parsed, schema-validated, and approved by policy.

gRPC errors represent transport, process, plugin, protocol, or cancellation failures. Provider/API/model errors are returned as `error` events in the stream.

## Data Model

Monika maintains provider-agnostic canonical conversation state. Provider-specific payloads and diagnostics do not enter canonical state.

Messages use content parts instead of a single string:

```proto
message Message {
  string id = 1;
  Role role = 2;
  repeated ContentPart content = 3;
  repeated ToolCall tool_calls = 4;
  ToolResult tool_result = 5;
  map<string, string> metadata = 6;
}

message ContentPart {
  oneof kind {
    TextPart text = 1;
    ImagePart image = 2;
    AudioPart audio = 3;
    FilePart file = 4;
  }
}
```

Tool schemas are passed to providers so models can request tool calls, but tools are executed only by Monika:

```proto
message Tool {
  string name = 1;
  string description = 2;
  google.protobuf.Struct input_schema = 3;
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
```

`StreamChatRequest` includes provider id, model id, provider config, messages, tools, tool choice, generation config, and runtime policy. `ChatEvent` uses a `oneof` to represent stream event kinds.

Usage accounting is part of the protocol. Plugins should emit usage when available. Unknown fields remain empty. Usage may be provider-reported or Monika-estimated.

Reasoning content is a separate event/content category. Monika policy decides whether to display or store reasoning. Hidden provider reasoning should not be treated as normal assistant content.

## Configuration and Installation

Monika uses user-level installation state plus global and project configuration:

```text
~/.monika/providers.json
  Installed provider plugin registry.

~/.monika/config.yaml
  Global defaults.

<project>/.monika/config.yaml
  Project-level overrides.
```

Configuration precedence is:

```text
CLI flags > project config > global config > plugin/provider defaults
```

Project config is always `.monika/config.yaml`.

Example config:

```yaml
plugins:
  openai-family:
    config:
      proxy: http://127.0.0.1:7890
      log_level: warn

provider:
  plugin: openai-family
  id: openai-compatible
  model: qwen2.5-coder
  config:
    base_url: http://localhost:11434/v1
```

Provider secrets remain owned by plugins. Monika may pass non-sensitive plugin and provider config, such as endpoints, base URLs, API versions, deployment names, regions, proxy settings, and timeouts.

Install command:

```bash
monika provider install github.com/acme/monika-provider-openai@v0.3.1
```

Install flow:

```text
Warn about trusted executable plugins.
Run go install.
Infer binary name from package basename, or use --binary.
Resolve binary path.
Calculate checksum.
Start plugin and perform handshake.
Read capabilities.
Write ~/.monika/providers.json atomically.
```

The registry records package, package ref, binary, binary path, checksum, plugin version, protocol version, installed time, and a capabilities snapshot.

One plugin may declare multiple provider entries. Multiple plugins may declare the same provider id. Runtime config should use `provider.plugin` plus `provider.id` to disambiguate. If `provider.plugin` is omitted and the provider id is not unique, Monika must fail with a clear error.

## Runtime Lifecycle

Monika starts the default configured provider plugin and lazy-loads additional plugins when the user switches providers or models. Started plugins remain in a warm pool for fast switching.

Startup flow:

```text
Read global and project config.
Resolve provider.plugin and provider.id.
Find owning plugin in providers.json.
Launch plugin.
Initialize(plugin_config).
GetCapabilities().
ValidateProviderConfig(provider_config).
Start agent session.
```

Switch flow:

```text
Resolve target provider and model.
Launch owning plugin if not running.
Initialize plugin if needed.
Validate provider config.
Compute effective capabilities.
Switch active provider/model.
Keep previous plugin warm.
```

Plugin health states are:

- `starting`
- `healthy`
- `degraded`
- `unhealthy`
- `stopped`

If a plugin or transport failure happens during an active `StreamChat`, Monika fails the current turn and marks the plugin unhealthy. It does not automatically retry the active request, because the vendor request may already have consumed tokens, generated output, or produced tool calls. When idle, Monika may restart an unhealthy plugin before the next use.

User cancellation cancels the gRPC context. Plugins must propagate cancellation to vendor HTTP requests or SDK streams. User cancellation does not mark the plugin unhealthy.

Monika controls the upper request deadline. Plugins may set shorter vendor-specific timeouts, but must not extend beyond Monika's context deadline.

## Capabilities and Projection

Effective runtime capability is the intersection of:

```text
Monika runtime capabilities
provider entry capabilities
model capabilities
user/project policy
```

Provider plugins expose known/default models through `GetCapabilities`. `ListModels` may query live vendor model availability and may require credentials. Provider entries may declare `supports_dynamic_models` and `allows_custom_model_id`.

If a configured model is unknown:

- Accept it if it is in known models.
- Otherwise call `ListModels` when dynamic models are supported.
- Otherwise allow it with a warning if `allows_custom_model_id` is true.
- Otherwise fail config validation.

Switching to a provider/model with fewer capabilities is allowed. Monika disables unsupported capabilities and reports the change explicitly.

Canonical conversation state is never mutated for provider compatibility. Monika builds a provider request projection for the active provider/model.

If the target does not support tool calling:

- Do not send tool schemas.
- Disable new tool calls.
- Convert previous tool calls/results into ordinary text summaries in the request projection.
- Keep structured tool history in canonical state.

If the target does not support a content part, projection policy decides whether to reject, omit with warning, summarize, or convert with a tool.

## Versioning and SDK

Provider protocol compatibility uses SemVer plus capability negotiation. Monika declares a supported protocol range, such as `>=1.0.0 <2.0.0`. Plugins return their protocol version during `Initialize`. Incompatible plugins are rejected before use.

Capability negotiation is separate from protocol compatibility. A compatible plugin may still lack specific capabilities, and Monika must adjust effective runtime behavior accordingly.

Monika should provide:

- The provider `.proto` files.
- Generated Go protocol packages.
- A Go provider SDK.

The Go SDK should wrap HashiCorp go-plugin bootstrap, gRPC server registration, handshake handling, capability builders, config schema helpers, stream event helpers, and error helpers.

Provider authors should be able to write:

```go
func main() {
    provider.Serve(&Plugin{})
}
```

Other languages can implement the protocol from `.proto`, but the first-class plugin authoring path is Go because installation is based on `go install`.
