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
)

// RemoteClient connects to a remote Monika instance via a connection code.
type RemoteClient struct {
	mu             sync.Mutex
	conn           net.Conn
	pending        map[int64]chan *json.RawMessage // id → response channel
	nextID         atomic.Int64
	onNotification func(method string, params json.RawMessage)
	cancel         context.CancelFunc
	connected      atomic.Bool
	fingerprint    string
	endpoint       string
}

// DialResult contains the result of a successful connection.
type DialResult struct {
	Client      *RemoteClient
	Fingerprint string
	Endpoint    string
}

// Dial connects to a remote server using a connection code.
func Dial(code string, onNotification func(method string, params json.RawMessage), handshakeTimeout time.Duration) (*DialResult, error) {
	cc, err := ParseConnectionCode(code)
	if err != nil {
		return nil, fmt.Errorf("parse code: %w", err)
	}

	fingerprint := Fingerprint(cc.PublicKey)

	conn, endpoint, err := happyEyeballsDial(cc.Endpoints, cc.PublicKey, handshakeTimeout)
	if err != nil {
		return nil, fmt.Errorf("dial: %w", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	rc := &RemoteClient{
		conn:           conn,
		pending:        make(map[int64]chan *json.RawMessage),
		onNotification: onNotification,
		cancel:         cancel,
		fingerprint:    fingerprint,
		endpoint:       endpoint,
	}
	rc.connected.Store(true)

	go rc.readLoop(ctx)
	go rc.heartbeatLoop(ctx)

	return &DialResult{
		Client:      rc,
		Fingerprint: fingerprint,
		Endpoint:    endpoint,
	}, nil
}

// Call sends a JSON-RPC request and waits for the response.
func (rc *RemoteClient) Call(method string, params json.RawMessage, timeout time.Duration) (json.RawMessage, error) {
	if !rc.connected.Load() {
		return nil, fmt.Errorf("not connected")
	}

	id := rc.nextID.Add(1)
	req := RPCRequest{
		JSONRPC: "2.0",
		ID:      id,
		Method:  method,
		Params:  params,
	}

	ch := make(chan *json.RawMessage, 1)
	rc.mu.Lock()
	rc.pending[id] = ch
	rc.mu.Unlock()

	defer func() {
		rc.mu.Lock()
		delete(rc.pending, id)
		rc.mu.Unlock()
	}()

	data, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	rc.mu.Lock()
	writeErr := WriteFrame(rc.conn, data)
	rc.mu.Unlock()
	if writeErr != nil {
		return nil, fmt.Errorf("write frame: %w", writeErr)
	}

	select {
	case resp := <-ch:
		if resp == nil {
			return nil, fmt.Errorf("connection closed")
		}
		// Check if it's an error response.
		var errCheck struct {
			Error *RPCError `json:"error"`
		}
		if err := json.Unmarshal(*resp, &errCheck); err == nil && errCheck.Error != nil {
			return nil, errCheck.Error
		}
		var resultCheck struct {
			Result json.RawMessage `json:"result"`
		}
		if err := json.Unmarshal(*resp, &resultCheck); err != nil {
			return nil, fmt.Errorf("parse response: %w", err)
		}
		return resultCheck.Result, nil
	case <-time.After(timeout):
		return nil, fmt.Errorf("rpc call timed out after %v", timeout)
	case <-context.Background().Done():
		return nil, fmt.Errorf("client closed")
	}
}

// Close disconnects the client.
func (rc *RemoteClient) Close() error {
	rc.mu.Lock()
	defer rc.mu.Unlock()

	if !rc.connected.Load() {
		return nil
	}
	rc.connected.Store(false)

	if rc.cancel != nil {
		rc.cancel()
	}

	// Fail all pending requests.
	for id, ch := range rc.pending {
		close(ch)
		delete(rc.pending, id)
	}

	if rc.conn != nil {
		return rc.conn.Close()
	}
	return nil
}

// IsConnected returns whether the client is connected.
func (rc *RemoteClient) IsConnected() bool {
	return rc.connected.Load()
}

// Fingerprint returns the server's public key fingerprint.
func (rc *RemoteClient) Fingerprint() string {
	return rc.fingerprint
}

// Endpoint returns the connected endpoint address.
func (rc *RemoteClient) Endpoint() string {
	return rc.endpoint
}

func (rc *RemoteClient) readLoop(ctx context.Context) {
	for rc.connected.Load() {
		data, err := ReadFrame(rc.conn)
		if err != nil {
			if rc.connected.Load() && !isClosedError(err) {
				log.Printf("[monika] remote read error: %v", err)
			}
			rc.Close()
			return
		}

		if IsRequest(data) {
			// Server requests are not expected on the client side; ignore.
			continue
		}

		var msg struct {
			ID     *int64          `json:"id"`
			Method string          `json:"method"`
			Params json.RawMessage `json:"params"`
		}
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}

		if msg.ID != nil {
			// It's a response.
			rc.mu.Lock()
			ch, ok := rc.pending[*msg.ID]
			if ok {
				raw := json.RawMessage(data)
				ch <- &raw
			}
			rc.mu.Unlock()
		} else if msg.Method != "" {
			// Handle server notifications.
			if msg.Method == "remote-disconnect" {
				rc.connected.Store(false)
				if rc.onNotification != nil {
					rc.onNotification("remote-disconnect", nil)
				}
				rc.Close()
				return
			}
			if msg.Method == "pong" {
				continue // heartbeat response, no action needed
			}
			// Forward other notifications (stream events, etc.) to the frontend.
			if rc.onNotification != nil {
				rc.onNotification(msg.Method, msg.Params)
			}
		}
	}
}

// happyEyeballsDial tries all endpoints in parallel, returning the first successful connection.
func happyEyeballsDial(endpoints []string, remotePubKey [32]byte, handshakeTimeout time.Duration) (net.Conn, string, error) {
	type result struct {
		conn net.Conn
		addr string
		err  error
	}

	results := make(chan result, len(endpoints))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	for _, addr := range endpoints {
		addr := addr
		go func() {
			conn, err := NoiseDialer(addr, remotePubKey, handshakeTimeout)
			select {
			case results <- result{conn, addr, err}:
			case <-ctx.Done():
				if conn != nil {
					conn.Close()
				}
			}
		}()
	}

	var lastErr error
	for i := 0; i < len(endpoints); i++ {
		select {
		case r := <-results:
			if r.err == nil {
				cancel() // cancel other dial attempts
				return r.conn, r.addr, nil
			}
			lastErr = r.err
		case <-time.After(handshakeTimeout * 2):
			cancel()
			return nil, "", fmt.Errorf("all endpoints timed out")
		}
	}

	return nil, "", fmt.Errorf("all endpoints failed: %w", lastErr)
}

const clientHeartbeatInterval = 30 * time.Second

func (rc *RemoteClient) heartbeatLoop(ctx context.Context) {
	ticker := time.NewTicker(clientHeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if !rc.connected.Load() {
				return
			}
			ping := NewRPCNotification("ping", nil)
			data, _ := json.Marshal(ping)
			rc.mu.Lock()
			if rc.conn != nil {
				_ = WriteFrame(rc.conn, data)
			}
			rc.mu.Unlock()
		}
	}
}
