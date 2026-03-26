package main

import (
	"flag"
	"monika/internal/core"
	_ "monika/internal/tools"
)

var (
	Version = "0.1.0"
	message string
)

func init() {
	flag.StringVar(&message, "message", "", "Message to send to the agent")
}

func main() {
	flag.Parse()
	agent := core.NewAgent()
	agent.Invoke(message)
}
