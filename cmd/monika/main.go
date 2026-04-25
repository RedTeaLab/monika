package main

import (
	"monika/internal/agents"
	"monika/internal/provider"
)

func main() {

	provider := provider.NewProvider(
		provider.WithProviderOption(
			provider.ProviderDeepSeek,
			"deepseek-v4-flash",
			"https://api.deepseek.com/v1",
			"your-api-key",
		),
	)

	agent := agents.NewAgent(provider)
	result, err := agent.Invoke("Hello, how are you?")
	if err != nil {
		println("Error:", err.Error())
		return
	}
	println(result)
}
