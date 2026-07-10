package copilot

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"monika/pkg/engine"
	oaiclient "monika/pkg/openai"
)

// Option configures StreamChat.
type Option func(*streamConfig)

type streamConfig struct {
	hasVision bool
}

// WithVision controls the Copilot-Vision-Request header.
func WithVision(v bool) Option { return func(c *streamConfig) { c.hasVision = v } }

// sessionCache caches the short-lived session token per OAuth token.
var (
	sessionMu sync.Mutex
	sessions  = make(map[string]*SessionToken) // keyed by oauth token
)

// getOrCreateSession returns a valid session token, refreshing if expired.
func getOrCreateSession(ctx context.Context, oauthToken string) (*SessionToken, error) {
	sessionMu.Lock()
	sess, ok := sessions[oauthToken]
	sessionMu.Unlock()

	if ok && time.Now().Unix() < sess.ExpiresAt-60 {
		return sess, nil
	}

	sess, err := ExchangeToken(ctx, oauthToken)
	if err != nil {
		return nil, err
	}

	sessionMu.Lock()
	sessions[oauthToken] = sess
	sessionMu.Unlock()
	return sess, nil
}

// StreamChat sends a streaming chat request to the Copilot API.
// oauthToken is the long-lived GitHub OAuth token (ghu_xxx).
// It automatically exchanges it for a session token (tid=xxx) and uses
// the dynamically returned API endpoint.
func StreamChat(
	ctx context.Context,
	oauthToken, model string,
	messages []engine.ChatMessage,
	tools []engine.ToolDef,
	opts ...Option,
) (<-chan engine.ChatEvent, error) {
	cfg := &streamConfig{}
	for _, o := range opts {
		o(cfg)
	}

	sess, err := getOrCreateSession(ctx, oauthToken)
	if err != nil {
		return nil, fmt.Errorf("copilot: failed to get session token: %w", err)
	}

	baseURL := sess.API
	sessionToken := sess.Token

	bodyJSON, err := oaiclient.BuildChatRequest(model, messages, tools, true)
	if err != nil {
		return nil, err
	}

	setHeaders := func(req *http.Request, authToken string) {
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+authToken)
		req.Header.Set("Editor-Version", EditorVersion)
		req.Header.Set("Editor-Plugin-Version", EditorPluginVersion)
		req.Header.Set("Copilot-Integration-Id", "vscode-chat")
		req.Header.Set("Openai-Intent", "conversation-panel")
		if cfg.hasVision {
			req.Header.Set("Copilot-Vision-Request", "true")
		}
	}

	doRequest := func(authToken string) (*http.Response, error) {
		req, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/chat/completions", bytes.NewReader(bodyJSON))
		if err != nil {
			return nil, err
		}
		setHeaders(req, authToken)
		return oaiclient.HTTPClientFor(baseURL).Do(req)
	}

	// First attempt
	resp, err := doRequest(sessionToken)
	if err != nil {
		if !oaiclient.RetryableHTTPError(err) {
			return nil, err
		}
	} else if resp.StatusCode == http.StatusUnauthorized {
		// Session token expired — refresh and retry
		resp.Body.Close()
		sess, refreshErr := ExchangeToken(ctx, oauthToken)
		if refreshErr == nil {
			sessionMu.Lock()
			sessions[oauthToken] = sess
			sessionMu.Unlock()
			resp, err = doRequest(sess.Token)
		} else {
			return nil, fmt.Errorf("copilot: session token refresh failed: %w", refreshErr)
		}
	}

	if err == nil && resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode < 500 {
			return nil, fmt.Errorf("copilot API returned %d: %s", resp.StatusCode, string(respBody))
		}
	} else if err == nil {
		ch := make(chan engine.ChatEvent, 128)
		go func() {
			defer close(ch)
			if err := oaiclient.ParseSSEStreamInGoroutine(ctx, resp, ch); err != nil {
				if ctx.Err() != nil {
					return
				}
				oaiclient.SendError(ch, err)
			}
		}()
		return ch, nil
	}

	// Retry path
	ch := make(chan engine.ChatEvent, 128)
	go func() {
		defer close(ch)
		const maxAttempts = 10
		for attempt := 1; attempt <= maxAttempts; attempt++ {
			if attempt > 1 {
				delay := time.Duration(500*(1<<(attempt-2))) * time.Millisecond
				if delay > 30*time.Second {
					delay = 30 * time.Second
				}
				select {
				case <-time.After(delay):
				case <-ctx.Done():
					return
				}
			}

			req, _ := http.NewRequestWithContext(ctx, "POST", baseURL+"/chat/completions", bytes.NewReader(bodyJSON))
			setHeaders(req, sessionToken)

			r, e := oaiclient.HTTPClientFor(baseURL).Do(req)
			if e != nil {
				if oaiclient.RetryableHTTPError(e) && attempt < maxAttempts {
					continue
				}
				oaiclient.SendError(ch, e)
				return
			}
			if r.StatusCode != http.StatusOK {
				rBody, _ := io.ReadAll(r.Body)
				r.Body.Close()
				if r.StatusCode >= 500 && attempt < maxAttempts {
					continue
				}
				oaiclient.SendError(ch, fmt.Errorf("copilot API returned %d: %s", r.StatusCode, string(rBody)))
				return
			}
			if err := oaiclient.ParseSSEStreamInGoroutine(ctx, r, ch); err != nil {
				if ctx.Err() != nil {
					return
				}
				oaiclient.SendError(ch, err)
				return
			}
			return
		}
		oaiclient.SendError(ch, fmt.Errorf("copilot: stream failed after %d attempts", maxAttempts))
	}()
	return ch, nil
}

// DetectVision checks if any message has image attachments.
func DetectVision(messages []engine.ChatMessage) bool {
	for _, msg := range messages {
		for _, att := range msg.Attachments {
			if strings.HasPrefix(att.MimeType, "image/") {
				return true
			}
		}
	}
	return false
}
