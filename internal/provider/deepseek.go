package provider

import (
	"fmt"

	"github.com/go-resty/resty/v2"
)

const (
	DeepSeekDefaultModel   = "deepseek-chat"
	DeepSeekDefaultBaseURL = "https://api.deepseek.com/v1"
)

type DeepSeekProvider struct {
	*ProviderOption
}

func (p *DeepSeekProvider) GetModel() string {
	if p.Model == "" {
		// 如果没有提供模型名称，则使用默认的 DeepSeekDefaultModel
		return DeepSeekDefaultModel
	}
	return p.Model
}

func (p *DeepSeekProvider) GetBaseURL() string {
	var baseURL string
	if p.BaseURL == "" {
		// 如果没有提供 BaseURL，则使用默认的 DeepSeekDefaultBaseURL
		baseURL = DeepSeekDefaultBaseURL
	} else {
		// 如果提供了 BaseURL，则使用提供的 BaseURL
		baseURL = p.BaseURL
	}
	// DeepSeek 的聊天接口通常是基于基础 URL 加上 "/chat/completions" 路径
	return baseURL + "/chat/completions"
}

func (p *DeepSeekProvider) GetAPIKey() string {
	return p.APIKey
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type RequestBody struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
	Stream   bool      `json:"stream"`
}

// {"id":"e766cb5f-e92b-4107-ada8-cf474641582b","object":"chat.completion","created":1776621325,"model":"deepseek-chat","choices":[{"index":0,"message":{"role":"assistant","content":"Hello! I'm doing great, thank you for asking! 😊 How are you today? Is there anything I can help you with?"},"logprobs":null,"finish_reason":"stop"}],"usage":{"prompt_tokens":16,"completion_tokens":28,"total_tokens":44,"prompt_tokens_details":{"cached_tokens":0},"prompt_cache_hit_tokens":0,"prompt_cache_miss_tokens":16},"system_fingerprint":"fp_eaab8d114b_prod0820_fp8_kvcache_new_kvcache_20260410"}
type ResponseBody struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	Model   string `json:"model"`
	Choices []struct {
		Index   int `json:"index"`
		Message struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"message"`
		Logprobs     interface{} `json:"logprobs"`
		FinishReason string      `json:"finish_reason"`
	} `json:"choices"`
	Usage struct {
		PromptTokens        int `json:"prompt_tokens"`
		CompletionTokens    int `json:"completion_tokens"`
		TotalTokens         int `json:"total_tokens"`
		PromptTokensDetails struct {
			CachedTokens int `json:"cached_tokens"`
		} `json:"prompt_tokens_details"`
		PromptCacheHitTokens  int `json:"prompt_cache_hit_tokens"`
		PromptCacheMissTokens int `json:"prompt_cache_miss_tokens"`
	} `json:"usage"`
	SystemFingerprint string `json:"system_fingerprint"`
}

func (p *DeepSeekProvider) SendMessage(R *resty.Client, message string) (response string, err error) {
	// 这里可以根据通用的发送消息逻辑实现
	reqBody := &RequestBody{
		Model: p.GetModel(),
		Messages: []Message{
			{Role: "system", Content: "You are a helpful assistant."},
			{Role: "user", Content: message},
		},
		Stream: false,
	}
	fmt.Printf("Sending request to %s with model %s\n", p.GetBaseURL(), p.GetModel())
	resp, err := R.R().
		SetHeader("Content-Type", "application/json").
		SetHeader("Authorization", "Bearer "+p.GetAPIKey()).
		SetBody(reqBody).
		Post(p.GetBaseURL())
	if err != nil {
		return "", err
	}
	return resp.String(), nil
}

func init() {
	RegisterProvider(ProviderDeepSeek, func(option *ProviderOption) Provider {
		return &DeepSeekProvider{ProviderOption: option}
	})
}
