package agents

import (
	"monika/internal/provider"

	"github.com/go-resty/resty/v2"
)

type Agent interface {
	Invoke(message string) (string, error)
}

type AgentOption struct {
	Provider provider.Provider // 嵌入 Provider 结构体
	R        *resty.Client     // Resty 客户端
}

func NewAgent(provider provider.Provider) Agent {
	r := resty.New()

	return &AgentOption{
		Provider: provider,
		R:        r,
	}
}

func (a *AgentOption) Invoke(message string) (string, error) {

	return a.Provider.SendMessage(a.R, message)

}
