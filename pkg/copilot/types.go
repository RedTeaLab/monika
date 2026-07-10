package copilot

// DeviceCodeResponse is the response from POST /login/device/code.
type DeviceCodeResponse struct {
	DeviceCode      string `json:"device_code"`
	UserCode        string `json:"user_code"`
	VerificationURI string `json:"verification_uri"`
	ExpiresIn       int    `json:"expires_in"`
	Interval        int    `json:"interval"`
}

// TokenResponse is the response from POST /login/oauth/access_token.
type TokenResponse struct {
	AccessToken      string `json:"access_token"`
	RefreshToken     string `json:"refresh_token,omitempty"`
	ExpiresIn        int    `json:"expires_in"`
	RefreshExpiresIn int    `json:"refresh_token_expires_in,omitempty"`
	TokenType        string `json:"token_type"`
	Scope            string `json:"scope"`
	// Error response fields
	Error            string `json:"error,omitempty"`
	ErrorDescription string `json:"error_description,omitempty"`
	ErrorURI         string `json:"error_uri,omitempty"`
	Interval         int    `json:"interval,omitempty"`
}

// CopilotModel represents a model from GET /models.
type CopilotModel struct {
	ID                 string `json:"id"`
	Name               string `json:"name"`
	ModelPickerEnabled bool   `json:"model_picker_enabled"`
	Capabilities       struct {
		Limits struct {
			MaxContextWindowTokens int `json:"max_context_window_tokens"`
			MaxOutputTokens        int `json:"max_output_tokens"`
		} `json:"limits"`
		Supports struct {
			ToolCalls bool `json:"tool_calls"`
			Streaming bool `json:"streaming"`
			Vision    bool `json:"vision"`
		} `json:"supports"`
	} `json:"capabilities"`
}

// TokenRefreshCallback is called after a successful token refresh,
// allowing the caller to persist the new tokens.
type TokenRefreshCallback func(newAccessToken, newRefreshToken string, newExpiresAt int64)
