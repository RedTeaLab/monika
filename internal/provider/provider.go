package provider

import (
	"github.com/go-resty/resty/v2"
)

type ProviderId string

const (
	ProviderDeepSeek ProviderId = "deepseek"
)

func (id ProviderId) String() string {
	return string(id)
}

type ProviderFactory func(*ProviderOption) Provider

var Providers = make(map[ProviderId]ProviderFactory)

func RegisterProvider(id ProviderId, factory ProviderFactory) {
	Providers[id] = factory
}

type Provider interface {
	// GetModel 返回提供者使用的模型名称
	GetModel() string
	// GetBaseURL 返回提供者的 API 基础 URL
	GetBaseURL() string
	// GetAPIKey 返回提供者的 API 密钥
	GetAPIKey() string
	// 发送消息
	SendMessage(R *resty.Client, message string) (response string, err error)
}

type ProviderOption struct {
	Id      ProviderId // 提供者 ID
	Model   string     // 模型名称
	BaseURL string     // API 基础 URL
	APIKey  string     // API 密钥
}

func WithProviderOption(id ProviderId, model, baseURL, apiKey string) *ProviderOption {
	return &ProviderOption{
		Id:      id,
		Model:   model,
		BaseURL: baseURL,
		APIKey:  apiKey,
	}
}

func NewProvider(option *ProviderOption) Provider {
	factory, ok := Providers[option.Id]
	if !ok {
		panic("Provider not found: " + option.Id)
	}
	return factory(option)
}
