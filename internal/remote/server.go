package remote

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
)

// LogEntry records a single remote operation.
type LogEntry struct {
	Time     time.Time `json:"time"`
	ClientID string    `json:"client_id"`
	Event    string    `json:"event"` // CONNECTED, DISCONNECTED, RPC
	Method   string    `json:"method,omitempty"`
	Detail   string    `json:"detail,omitempty"`
}

// ClientInfo describes a connected remote client.
type ClientInfo struct {
	ID            string    `json:"id"`
	RemoteAddr    string    `json:"remote_addr"`
	ConnectedAt   time.Time `json:"connected_at"`
	LastHeartbeat time.Time `json:"last_heartbeat"`
}

// RemoteServer accepts encrypted P2P connections and dispatches RPC calls.
type RemoteServer struct {
	mu                sync.Mutex
	listener          net.Listener
	noiseLn           *NoiseListener
	upnpMapping       *UPnPMapping
	staticPub         [32]byte
	staticPriv        [32]byte
	registry          *MethodRegistry
	clients           map[string]*serverClient
	maxClients        int
	logBuffer         *logRingBuffer
	onEvent           func(clientID string, method string, params json.RawMessage)
	ctx               context.Context
	cancel            context.CancelFunc
	running           atomic.Bool
	codeTTL           int64
	heartbeatInterval time.Duration
	heartbeatTimeout  int
}

type serverClient struct {
	conn      net.Conn
	info      ClientInfo
	heartbeat atomic.Int64 // unix timestamp of last heartbeat
}

const (
	defaultMaxClients        = 1
	defaultHeartbeatInterval = 30 * time.Second
	defaultHeartbeatTimeout  = 3
)

// NewRemoteServer creates a new server instance.
func NewRemoteServer(registry *MethodRegistry, onEvent func(clientID string, method string, params json.RawMessage)) *RemoteServer {
	return &RemoteServer{
		registry:          registry,
		onEvent:           onEvent,
		maxClients:        defaultMaxClients,
		logBuffer:         newLogRingBuffer(1000),
		codeTTL:           3600,
		heartbeatInterval: defaultHeartbeatInterval,
		heartbeatTimeout:  defaultHeartbeatTimeout,
	}
}

// SetCodeTTL sets the connection code time-to-live in seconds.
func (s *RemoteServer) SetCodeTTL(ttl int64) {
	if ttl > 0 {
		s.codeTTL = ttl
	}
}

// SetHeartbeatInterval sets the heartbeat check interval.
func (s *RemoteServer) SetHeartbeatInterval(d time.Duration) {
	if d > 0 {
		s.heartbeatInterval = d
	}
}

// SetHeartbeatTimeout sets the number of missed heartbeats before disconnect.
func (s *RemoteServer) SetHeartbeatTimeout(n int) {
	if n > 0 {
		s.heartbeatTimeout = n
	}
}

// SetMaxClients sets the maximum concurrent remote clients.
func (s *RemoteServer) SetMaxClients(n int) {
	if n > 0 {
		s.maxClients = n
	}
}

// Serve starts listening and returns a connection code.
func (s *RemoteServer) Serve(port int, enableUPnP bool) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running.Load() {
		return "", fmt.Errorf("server already running")
	}

	pub, priv, err := GenerateKeyPair()
	if err != nil {
		return "", fmt.Errorf("generate key: %w", err)
	}
	s.staticPub = pub
	s.staticPub = pub
	s.staticPriv = priv

	ln, err := net.Listen("tcp", net.JoinHostPort("0.0.0.0", itoa(port)))
	if err != nil {
		return "", fmt.Errorf("listen: %w", err)
	}
	s.listener = ln

	noiseLn, err := NewNoiseListener(ln, s.staticPriv, s.staticPub)
	if err != nil {
		ln.Close()
		return "", fmt.Errorf("create noise listener: %w", err)
	}
	s.noiseLn = noiseLn

	actualPort := ln.Addr().(*net.TCPAddr).Port
	endpoints, upnpMapping := DiscoverEndpoints(actualPort, enableUPnP)
	s.upnpMapping = upnpMapping

	code, err := GenerateConnectionCode(s.staticPub, actualPort, endpoints, s.codeTTL)
	if err != nil {
		s.cleanup()
		return "", fmt.Errorf("generate connection code: %w", err)
	}

	s.ctx, s.cancel = context.WithCancel(context.Background())
	s.clients = make(map[string]*serverClient)
	s.running.Store(true)

	go s.acceptLoop()

	return code, nil
}

// Stop shuts down the server and all client connections.
func (s *RemoteServer) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running.Load() {
		return nil
	}

	s.running.Store(false)
	if s.cancel != nil {
		s.cancel()
	}

	// Send disconnect notification to all clients before closing.
	disconnectNotif := NewRPCNotification("remote-disconnect", nil)
	disconnectData, _ := json.Marshal(disconnectNotif)
	for _, c := range s.clients {
		WriteFrame(c.conn, disconnectData)
		c.conn.Close()
	}
	s.clients = nil

	s.cleanup()
	return nil
}

func (s *RemoteServer) cleanup() {
	if s.noiseLn != nil {
		s.noiseLn.Close()
		s.noiseLn = nil
	}
	if s.listener != nil {
		s.listener.Close()
		s.listener = nil
	}
	if s.upnpMapping != nil {
		s.upnpMapping.Close()
		s.upnpMapping = nil
	}
	// Zero the static keys.
	for i := range s.staticPriv {
		s.staticPriv[i] = 0
	}
	for i := range s.staticPub {
		s.staticPub[i] = 0
	}
}

// RefreshCode generates a new key pair and connection code without interrupting existing connections.
// Existing clients stay connected on the old session; only new connections use the new code.
func (s *RemoteServer) RefreshCode() (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running.Load() {
		return "", fmt.Errorf("server not running")
	}

	pub, priv, err := GenerateKeyPair()
	if err != nil {
		return "", fmt.Errorf("generate key: %w", err)
	}

	// Zero old private key.
	for i := range s.staticPriv {
		s.staticPriv[i] = 0
	}

	s.staticPub = pub
	s.staticPriv = priv

	// Recreate noise listener with new key.
	newNoiseLn, err := NewNoiseListener(s.listener, s.staticPriv, s.staticPub)
	if err != nil {
		return "", fmt.Errorf("refresh noise listener: %w", err)
	}
	if s.noiseLn != nil {
		s.noiseLn.Close()
	}
	s.noiseLn = newNoiseLn

	port := s.listener.Addr().(*net.TCPAddr).Port
	endpoints, _ := DiscoverEndpoints(port, s.upnpMapping != nil)

	return GenerateConnectionCode(s.staticPub, port, endpoints, s.codeTTL)
}

// GetClients returns the currently connected clients.
func (s *RemoteServer) GetClients() []ClientInfo {
	s.mu.Lock()
	defer s.mu.Unlock()

	result := make([]ClientInfo, 0, len(s.clients))
	for _, c := range s.clients {
		result = append(result, c.info)
	}
	return result
}

// KickClient disconnects a specific client.
func (s *RemoteServer) KickClient(clientID string) error {
	s.mu.Lock()
	c, ok := s.clients[clientID]
	if ok {
		delete(s.clients, clientID)
	}
	s.mu.Unlock()

	if !ok {
		return fmt.Errorf("client not found: %s", clientID)
	}
	c.conn.Close()
	s.addLog(clientID, "KICKED", "", "")
	return nil
}

// GetLog returns recent operation log entries.
func (s *RemoteServer) GetLog() []LogEntry {
	return s.logBuffer.all()
}

func (s *RemoteServer) acceptLoop() {
	for s.running.Load() {
		conn, err := s.noiseLn.Accept()
		if err != nil {
			if s.running.Load() {
				// Log but don't spam — expected errors during shutdown.
				if !isClosedError(err) {
					log.Printf("[monika] remote accept error: %v", err)
				}
			}
			continue
		}
		go s.handleClient(conn)
	}
}

func (s *RemoteServer) handleClient(conn net.Conn) {
	clientID := uuid.New().String()
	info := ClientInfo{
		ID:            clientID,
		RemoteAddr:    conn.RemoteAddr().String(),
		ConnectedAt:   time.Now(),
		LastHeartbeat: time.Now(),
	}
	sc := &serverClient{
		conn: conn,
		info: info,
	}
	sc.heartbeat.Store(time.Now().Unix())

	s.mu.Lock()
	if len(s.clients) >= s.maxClients {
		s.mu.Unlock()
		conn.Close()
		return
	}
	s.clients[clientID] = sc
	s.mu.Unlock()

	s.addLog(clientID, "CONNECTED", "", conn.RemoteAddr().String())

	// Start heartbeat goroutine.
	hbCtx, hbCancel := context.WithCancel(s.ctx)
	defer hbCancel()
	go s.heartbeatLoop(hbCtx, sc, clientID)

	// Read loop.
	for s.running.Load() {
		_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		data, err := ReadFrame(conn)
		if err != nil {
			break
		}

		if IsRequest(data) {
			var req RPCRequest
			if err := json.Unmarshal(data, &req); err != nil {
				resp := NewRPCErrorResponse(0, ErrCodeParseError, "parse error")
				respData, _ := json.Marshal(resp)
				WriteFrame(conn, respData)
				continue
			}
			s.addLog(clientID, "RPC", req.Method, "")
			go s.handleRPC(conn, req)
		} else {
			// Notification from client — currently only heartbeats.
			var notif RPCNotification
			if err := json.Unmarshal(data, &notif); err != nil {
				continue
			}
			if notif.Method == "ping" {
				sc.heartbeat.Store(time.Now().Unix())
				// Send pong.
				pong := NewRPCNotification("pong", nil)
				pongData, _ := json.Marshal(pong)
				WriteFrame(conn, pongData)
			}
		}
	}

	s.mu.Lock()
	delete(s.clients, clientID)
	s.mu.Unlock()

	s.addLog(clientID, "DISCONNECTED", "", "connection closed")
	conn.Close()
}

func (s *RemoteServer) handleRPC(conn net.Conn, req RPCRequest) {
	result, err := s.registry.Call(s.ctx, req.Method, req.Params)
	var resp RPCResponse
	if err != nil {
		if rpcErr, ok := err.(*RPCError); ok {
			resp = NewRPCErrorResponse(req.ID, rpcErr.Code, rpcErr.Message)
		} else {
			resp = NewRPCErrorResponse(req.ID, ErrCodeInternalError, err.Error())
		}
	} else {
		resp = NewRPCResponse(req.ID, result)
	}
	respData, _ := json.Marshal(resp)
	WriteFrame(conn, respData)
}

// SendEvent sends a notification event to a specific client.
func (s *RemoteServer) SendEvent(clientID string, method string, params json.RawMessage) error {
	s.mu.Lock()
	c, ok := s.clients[clientID]
	s.mu.Unlock()
	if !ok {
		return fmt.Errorf("client not found: %s", clientID)
	}
	notif := NewRPCNotification(method, params)
	data, _ := json.Marshal(notif)
	return WriteFrame(c.conn, data)
}

// BroadcastEvent sends a notification event to all connected clients.
func (s *RemoteServer) BroadcastEvent(method string, params json.RawMessage) {
	notif := NewRPCNotification(method, params)
	data, _ := json.Marshal(notif)

	s.mu.Lock()
	clients := make([]net.Conn, 0, len(s.clients))
	for _, c := range s.clients {
		clients = append(clients, c.conn)
	}
	s.mu.Unlock()

	for _, conn := range clients {
		WriteFrame(conn, data)
	}
}

func (s *RemoteServer) heartbeatLoop(ctx context.Context, sc *serverClient, clientID string) {
	ticker := time.NewTicker(s.heartbeatInterval)
	defer ticker.Stop()

	missed := 0
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			lastHB := time.Unix(sc.heartbeat.Load(), 0)
			if time.Since(lastHB) > s.heartbeatInterval*time.Duration(s.heartbeatTimeout) {
				missed++
				if missed >= s.heartbeatTimeout {
					s.mu.Lock()
					if _, ok := s.clients[clientID]; ok {
						delete(s.clients, clientID)
					}
					s.mu.Unlock()
					sc.conn.Close()
					s.addLog(clientID, "DISCONNECTED", "", "heartbeat timeout")
					return
				}
			} else {
				missed = 0
			}
		}
	}
}

func (s *RemoteServer) addLog(clientID, event, method, detail string) {
	s.logBuffer.add(LogEntry{
		Time:     time.Now(),
		ClientID: clientID,
		Event:    event,
		Method:   method,
		Detail:   detail,
	})
}

// logRingBuffer is a fixed-size ring buffer for log entries.
type logRingBuffer struct {
	mu   sync.Mutex
	buf  []LogEntry
	pos  int
	full bool
}

func newLogRingBuffer(size int) *logRingBuffer {
	return &logRingBuffer{buf: make([]LogEntry, size)}
}

func (b *logRingBuffer) add(e LogEntry) {
	b.mu.Lock()
	b.buf[b.pos] = e
	b.pos = (b.pos + 1) % len(b.buf)
	if b.pos == 0 {
		b.full = true
	}
	b.mu.Unlock()
}

func (b *logRingBuffer) all() []LogEntry {
	b.mu.Lock()
	defer b.mu.Unlock()
	if !b.full {
		result := make([]LogEntry, b.pos)
		copy(result, b.buf[:b.pos])
		return result
	}
	result := make([]LogEntry, len(b.buf))
	copy(result, b.buf[b.pos:])
	copy(result[len(b.buf)-b.pos:], b.buf[:b.pos])
	return result
}

func isClosedError(err error) bool {
	if err == nil {
		return false
	}
	// Check for common "use of closed network connection" errors.
	if opErr, ok := err.(*net.OpError); ok {
		if opErr.Err != nil {
			msg := opErr.Err.Error()
			return msg == "use of closed network connection"
		}
	}
	return false
}
