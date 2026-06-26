package api

import (
	"context"
	"encoding/json"

	"monika/internal/remote"
)

// RPC wrappers — adapt App methods to remote.Handler signature.

func (a *App) wrapSendMessage(ctx context.Context, params json.RawMessage) (json.RawMessage, error) {
	var args struct {
		SessionID  string `json:"sessionID"`
		Text       string `json:"text"`
		ProviderID string `json:"providerID"`
		Model      string `json:"model"`
	}
	if err := json.Unmarshal(params, &args); err != nil {
		return nil, &remote.RPCError{Code: -32602, Message: "invalid params: " + err.Error()}
	}
	return nil, a.SendMessage(a.GetProjectPath(), args.SessionID, args.Text, args.ProviderID, args.Model)
}

func (a *App) wrapReadFile(ctx context.Context, params json.RawMessage) (json.RawMessage, error) {
	var args struct {
		FilePath string `json:"filePath"`
	}
	if err := json.Unmarshal(params, &args); err != nil {
		return nil, &remote.RPCError{Code: -32602, Message: "invalid params: " + err.Error()}
	}
	result, err := a.ReadFile(a.GetProjectPath(), args.FilePath)
	if err != nil {
		return nil, err
	}
	return json.Marshal(result)
}

func (a *App) wrapWriteFile(ctx context.Context, params json.RawMessage) (json.RawMessage, error) {
	var args struct {
		FilePath string `json:"filePath"`
		Content  string `json:"content"`
	}
	if err := json.Unmarshal(params, &args); err != nil {
		return nil, &remote.RPCError{Code: -32602, Message: "invalid params: " + err.Error()}
	}
	return nil, a.WriteFile(a.GetProjectPath(), args.FilePath, args.Content)
}

func (a *App) wrapGetProjectPath(ctx context.Context, params json.RawMessage) (json.RawMessage, error) {
	return json.Marshal(a.GetProjectPath())
}

func (a *App) wrapListSessions(ctx context.Context, params json.RawMessage) (json.RawMessage, error) {
	result, err := a.ListSessions(a.GetProjectPath())
	if err != nil {
		return nil, err
	}
	return json.Marshal(result)
}

func (a *App) wrapGetGitLog(ctx context.Context, params json.RawMessage) (json.RawMessage, error) {
	result, err := a.GitLog(a.GetProjectPath())
	if err != nil {
		return nil, err
	}
	return json.Marshal(result)
}

func (a *App) wrapListDatabaseConnections(ctx context.Context, params json.RawMessage) (json.RawMessage, error) {
	result := a.ListDatabaseConnections()
	return json.Marshal(result)
}
