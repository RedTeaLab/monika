package api

import (
	"encoding/json"
	"fmt"
	"time"

	"monika/internal/remote"
)

// RemoteStatus describes the current remote connection state.
type RemoteStatus struct {
	Mode        string `json:"mode"` // "idle", "serving", "connecting", "connected"
	Fingerprint string `json:"fingerprint,omitempty"`
	Endpoint    string `json:"endpoint,omitempty"`
}

// --- B端 (服务端) 方法 ---

// RemoteServe starts the remote server and returns a connection code.
func (a *App) RemoteServe() (string, error) {
	a.remoteMu.Lock()
	defer a.remoteMu.Unlock()

	if a.remoteServer != nil {
		return "", fmt.Errorf("remote server already running")
	}

	registry := remote.NewMethodRegistry()
	buildDefaultRegistry(registry, a)

	srv := remote.NewRemoteServer(registry, a.onRemoteEvent)
	cfg := a.cfg.Remote
	if cfg.MaxClients > 0 {
		srv.SetMaxClients(cfg.MaxClients)
	}

	code, err := srv.Serve(cfg.DefaultPort, cfg.EnableUPnP)
	if err != nil {
		return "", err
	}

	a.remoteServer = srv
	a.safeEmit("remote-status", RemoteStatus{Mode: "serving"})
	return code, nil
}

// onRemoteEvent is called by the server when an event should be forwarded to the remote client.
func (a *App) onRemoteEvent(clientID, method string, params json.RawMessage) {
	// Forward server events as remote notifications.
	a.safeEmit(method, params)
}

// RemoteStop stops the remote server.
func (a *App) RemoteStop() error {
	a.remoteMu.Lock()
	defer a.remoteMu.Unlock()

	if a.remoteServer == nil {
		return nil
	}
	err := a.remoteServer.Stop()
	a.remoteServer = nil
	a.safeEmit("remote-status", RemoteStatus{Mode: "idle"})
	return err
}

// RemoteRefreshCode generates a new connection code.
func (a *App) RemoteRefreshCode() (string, error) {
	a.remoteMu.Lock()
	srv := a.remoteServer
	a.remoteMu.Unlock()

	if srv == nil {
		return "", fmt.Errorf("remote server not running")
	}
	return srv.RefreshCode()
}

// RemoteSessions returns connected client info.
func (a *App) RemoteSessions() []remote.ClientInfo {
	a.remoteMu.RLock()
	srv := a.remoteServer
	a.remoteMu.RUnlock()

	if srv == nil {
		return nil
	}
	return srv.GetClients()
}

// RemoteKick disconnects a specific client.
func (a *App) RemoteKick(clientID string) error {
	a.remoteMu.RLock()
	srv := a.remoteServer
	a.remoteMu.RUnlock()

	if srv == nil {
		return fmt.Errorf("remote server not running")
	}
	return srv.KickClient(clientID)
}

// RemoteLog returns recent operation log entries.
func (a *App) RemoteLog() []remote.LogEntry {
	a.remoteMu.RLock()
	srv := a.remoteServer
	a.remoteMu.RUnlock()

	if srv == nil {
		return nil
	}
	return srv.GetLog()
}

// --- A端 (客户端) 方法 ---

// RemoteConnect dials a remote server using a connection code.
func (a *App) RemoteConnect(code string) error {
	a.remoteMu.Lock()
	defer a.remoteMu.Unlock()

	if a.remoteClient != nil && a.remoteClient.IsConnected() {
		return fmt.Errorf("already connected to a remote instance")
	}

	a.safeEmit("remote-status", RemoteStatus{Mode: "connecting"})

	result, err := remote.Dial(code, a.onRemoteNotification, 30*time.Second)
	if err != nil {
		a.safeEmit("remote-status", RemoteStatus{Mode: "idle"})
		return err
	}

	a.remoteClient = result.Client
	a.safeEmit("remote-status", RemoteStatus{
		Mode:        "connected",
		Fingerprint: result.Fingerprint,
		Endpoint:    result.Endpoint,
	})
	return nil
}

// onRemoteNotification forwards notifications from the remote server to the local frontend.
func (a *App) onRemoteNotification(method string, params json.RawMessage) {
	a.safeEmit(method, params)
}

// RemoteDisconnect disconnects from the remote server.
func (a *App) RemoteDisconnect() error {
	a.remoteMu.Lock()
	defer a.remoteMu.Unlock()

	if a.remoteClient == nil {
		return nil
	}
	err := a.remoteClient.Close()
	a.remoteClient = nil
	a.safeEmit("remote-status", RemoteStatus{Mode: "idle"})
	return err
}

// RemoteStatus returns current remote connection state.
func (a *App) RemoteStatus() *RemoteStatus {
	a.remoteMu.RLock()
	defer a.remoteMu.RUnlock()

	if a.remoteServer != nil {
		return &RemoteStatus{Mode: "serving"}
	}
	if a.remoteClient != nil && a.remoteClient.IsConnected() {
		return &RemoteStatus{
			Mode:        "connected",
			Fingerprint: a.remoteClient.Fingerprint(),
			Endpoint:    a.remoteClient.Endpoint(),
		}
	}
	return &RemoteStatus{Mode: "idle"}
}

// RemoteCall forwards an RPC call to the remote server.
func (a *App) RemoteCall(method string, params json.RawMessage) (json.RawMessage, error) {
	a.remoteMu.RLock()
	client := a.remoteClient
	a.remoteMu.RUnlock()

	if client == nil || !client.IsConnected() {
		return nil, fmt.Errorf("not connected to a remote instance")
	}
	return client.Call(method, params, 60*time.Second)
}

// buildDefaultRegistry populates a registry with whitelisted App methods.
func buildDefaultRegistry(r *remote.MethodRegistry, a *App) {
	r.Register("App.SendMessage", a.wrapSendMessage)
	r.Register("App.ReadFile", a.wrapReadFile)
	r.Register("App.WriteFile", a.wrapWriteFile)
	r.Register("App.GetProjectPath", a.wrapGetProjectPath)
	r.Register("App.ListSessions", a.wrapListSessions)
	r.Register("App.GitLog", a.wrapGetGitLog)
	r.Register("App.ListDatabaseConnections", a.wrapListDatabaseConnections)
}
