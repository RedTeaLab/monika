package tool

import "context"

type projectDirKeyType struct{}
type sessionIDKeyType struct{}
type taskStoreKeyType struct{}
type toolCallIDKeyType struct{}
type modelKeyType struct{}
type providerKeyType struct{}
type askUserFuncKeyType struct{}

var (
	projectDirKey  projectDirKeyType
	sessionIDKey   sessionIDKeyType
	taskStoreKey   taskStoreKeyType
	toolCallIDKey  toolCallIDKeyType
	modelKey       modelKeyType
	providerKey    providerKeyType
	askUserFuncKey askUserFuncKeyType
)

// AskUserFunc is the signature for a function that asks the user a question
// and blocks until the user responds.
type AskUserArgs struct {
	Question string
	Title    string
	Options  []string
}

// AskUserFunc is the signature for a function that asks the user a question
// and blocks until the user responds.
type AskUserFunc func(ctx context.Context, args AskUserArgs) (string, error)

// WithProjectDir returns a child context carrying the project directory.
func WithProjectDir(ctx context.Context, dir string) context.Context {
	return context.WithValue(ctx, projectDirKey, dir)
}

// ProjectDirFromContext extracts the project directory from context, or empty string.
func ProjectDirFromContext(ctx context.Context) string {
	dir, _ := ctx.Value(projectDirKey).(string)
	return dir
}

// ProjectDirOrDefault returns the project directory from context, or the fallback.
func ProjectDirOrDefault(ctx context.Context, fallback string) string {
	if dir := ProjectDirFromContext(ctx); dir != "" {
		return dir
	}
	return fallback
}

// WithSessionID returns a child context carrying the session ID.
func WithSessionID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, sessionIDKey, id)
}

// SessionIDFromContext extracts the session ID from context, or empty string.
func SessionIDFromContext(ctx context.Context) string {
	id, _ := ctx.Value(sessionIDKey).(string)
	return id
}

// WithToolCallID returns a child context carrying the tool call ID.
func WithToolCallID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, toolCallIDKey, id)
}

// ToolCallIDFromContext extracts the tool call ID from context, or empty string.
func ToolCallIDFromContext(ctx context.Context) string {
	id, _ := ctx.Value(toolCallIDKey).(string)
	return id
}

// WithModel returns a child context carrying the model name.
func WithModel(ctx context.Context, model string) context.Context {
	return context.WithValue(ctx, modelKey, model)
}

// ModelFromContext extracts the model name from context, or empty string.
func ModelFromContext(ctx context.Context) string {
	m, _ := ctx.Value(modelKey).(string)
	return m
}

// WithProvider returns a child context carrying the provider ID.
func WithProvider(ctx context.Context, provider string) context.Context {
	return context.WithValue(ctx, providerKey, provider)
}

// ProviderFromContext extracts the provider ID from context, or empty string.
func ProviderFromContext(ctx context.Context) string {
	p, _ := ctx.Value(providerKey).(string)
	return p
}

// WithAskUserFunc returns a child context carrying the AskUserFunc callback.
func WithAskUserFunc(ctx context.Context, fn AskUserFunc) context.Context {
	return context.WithValue(ctx, askUserFuncKey, fn)
}

// AskUserFuncFromContext extracts the AskUserFunc from context, or nil.
func AskUserFuncFromContext(ctx context.Context) AskUserFunc {
	fn, _ := ctx.Value(askUserFuncKey).(AskUserFunc)
	return fn
}

// TaskStore is the interface task tools depend on.
type TaskStore interface {
	Replace(sessionID string, tasks []Task) error
	Append(sessionID string, tasks []Task) error
	Update(sessionID, taskID string, fields TaskUpdateFields) error
	List(sessionID string) []Task
}

// WithTaskStore returns a child context carrying the TaskStore.
func WithTaskStore(ctx context.Context, ts TaskStore) context.Context {
	return context.WithValue(ctx, taskStoreKey, ts)
}

// TaskStoreFromContext extracts the TaskStore from context, or nil.
func TaskStoreFromContext(ctx context.Context) TaskStore {
	ts, _ := ctx.Value(taskStoreKey).(TaskStore)
	return ts
}

// Task and TaskUpdateFields are defined here so tools can import them
// without depending on the builtin package.

type Task struct {
	ID          string   `json:"id"`
	Subject     string   `json:"subject"`
	Description string   `json:"description,omitempty"`
	Status      string   `json:"status"`
	BlockedBy   []string `json:"blockedBy,omitempty"`
}

type TaskUpdateFields struct {
	Status       *string  `json:"status,omitempty"`
	Subject      *string  `json:"subject,omitempty"`
	Description  *string  `json:"description,omitempty"`
	AddBlockedBy []string `json:"addBlockedBy,omitempty"`
}
