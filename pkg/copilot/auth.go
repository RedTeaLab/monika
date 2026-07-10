package copilot

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"monika/pkg/proxy"
)

const (
	DefaultClientID     = "Iv1.b507a08c87ecfe98"
	GitHubBaseURL       = "https://github.com"
	CopilotAPIURL       = "https://api.githubcopilot.com"
	CopilotTokenURL     = "https://api.github.com/copilot_internal/v2/token"
	TokenScope          = "copilot"
	EditorVersion       = "vscode/1.100.0"
	EditorPluginVersion = "copilot-chat/0.43.0"
)

// SessionToken holds the short-lived Copilot session token and dynamic API endpoint.
type SessionToken struct {
	Token     string
	API       string
	ExpiresAt int64
}

var (
	ErrAuthorizationPending = errors.New("authorization_pending")
	ErrSlowDown             = errors.New("slow_down")
	ErrExpiredToken         = errors.New("expired_token")
	ErrAccessDenied         = errors.New("access_denied")
)

func ClientID() string {
	if id := os.Getenv("MONIKA_COPILOT_CLIENT_ID"); id != "" {
		return id
	}
	return DefaultClientID
}

var authHTTPClient = &http.Client{
	Timeout: 30 * time.Second,
	Transport: &http.Transport{
		MaxIdleConnsPerHost: 2,
		Proxy:               proxy.Func(),
	},
}

// RequestDeviceCode initiates the GitHub OAuth Device Flow.
func RequestDeviceCode(ctx context.Context) (*DeviceCodeResponse, error) {
	form := url.Values{
		"client_id": {ClientID()},
		"scope":     {TokenScope},
	}
	req, err := http.NewRequestWithContext(ctx, "POST",
		GitHubBaseURL+"/login/device/code",
		strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := authHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("device code request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("device code request: HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result DeviceCodeResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("device code parse: %w", err)
	}
	return &result, nil
}

// PollForToken polls the token endpoint once (caller controls interval).
func PollForToken(ctx context.Context, deviceCode string) (*TokenResponse, error) {
	form := url.Values{
		"client_id":   {ClientID()},
		"grant_type":  {"urn:ietf:params:oauth:grant-type:device_code"},
		"device_code": {deviceCode},
	}
	req, err := http.NewRequestWithContext(ctx, "POST",
		GitHubBaseURL+"/login/oauth/access_token",
		strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := authHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token poll: %w", err)
	}
	defer resp.Body.Close()

	var result TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("token parse: %w", err)
	}

	if result.Error != "" {
		switch result.Error {
		case "authorization_pending":
			return nil, ErrAuthorizationPending
		case "slow_down":
			return nil, ErrSlowDown
		case "expired_token":
			return nil, ErrExpiredToken
		case "access_denied":
			return nil, ErrAccessDenied
		default:
			return nil, fmt.Errorf("%s: %s", result.Error, result.ErrorDescription)
		}
	}
	if result.AccessToken == "" {
		return nil, fmt.Errorf("token response missing access_token")
	}
	return &result, nil
}

// RefreshToken exchanges a refresh_token for a new access_token.
func RefreshToken(ctx context.Context, refreshToken string) (*TokenResponse, error) {
	form := url.Values{
		"client_id":     {ClientID()},
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
	}
	req, err := http.NewRequestWithContext(ctx, "POST",
		GitHubBaseURL+"/login/oauth/access_token",
		strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := authHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token refresh: %w", err)
	}
	defer resp.Body.Close()

	var result TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("refresh parse: %w", err)
	}
	if result.Error != "" {
		return nil, fmt.Errorf("refresh failed: %s: %s", result.Error, result.ErrorDescription)
	}
	if result.AccessToken == "" {
		return nil, fmt.Errorf("refresh response missing access_token")
	}
	return &result, nil
}

// FetchModelsWithSession fetches models using a session token and dynamic API endpoint.
func FetchModelsWithSession(ctx context.Context, sessionToken, apiURL string) ([]CopilotModel, error) {
	return fetchModelsInternal(ctx, sessionToken, apiURL)
}

// FetchModels retrieves the model list from the Copilot API using an OAuth token.
// It automatically exchanges for a session token first.
func FetchModels(ctx context.Context, oauthToken string) ([]CopilotModel, error) {
	sess, err := ExchangeToken(ctx, oauthToken)
	if err != nil {
		return nil, err
	}
	return fetchModelsInternal(ctx, sess.Token, sess.API)
}

func fetchModelsInternal(ctx context.Context, token, apiURL string) ([]CopilotModel, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", apiURL+"/models", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	resp, err := authHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch models: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("fetch models: HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Data []CopilotModel `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("models parse: %w", err)
	}
	return result.Data, nil
}

// ExchangeToken exchanges an OAuth token for a short-lived Copilot session token.
func ExchangeToken(ctx context.Context, oauthToken string) (*SessionToken, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", CopilotTokenURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "token "+oauthToken)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Editor-Version", EditorVersion)
	req.Header.Set("Editor-Plugin-Version", EditorPluginVersion)

	resp, err := authHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("session token exchange: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("session token exchange: HTTP %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Token     string `json:"token"`
		ExpiresAt int64  `json:"expires_at"`
		Endpoints struct {
			API string `json:"api"`
		} `json:"endpoints"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("session token parse: %w", err)
	}
	if result.Token == "" || result.Endpoints.API == "" {
		return nil, fmt.Errorf("session token response missing fields")
	}
	return &SessionToken{
		Token:     result.Token,
		API:       result.Endpoints.API,
		ExpiresAt: result.ExpiresAt,
	}, nil
}
