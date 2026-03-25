package ui

import (
	"bufio"
	"fmt"
	agents "monika/internal/core"
	"os"
	"strings"
)

// RunSimple runs the CLI in simple output mode (no flickering, supports copy)
func RunSimple() {
	fmt.Println("MONIKA CLI")
	fmt.Println("")

	agent := agents.NewAgent()

	reader := bufio.NewReader(os.Stdin)

	for {
		// Read user input
		fmt.Print("> ")
		input, err := reader.ReadString('\n')
		if err != nil {
			break
		}
		input = strings.TrimSpace(input)

		if input == "" {
			continue
		}

		// Display user message
		fmt.Printf("\n\033[32m[User]\033[0m %s\n", input)

		// Display thinking and process
		fmt.Printf("\033[33m[Assistant]\033[0m Thinking...\n")

		err = agent.InvokeTUI(input, func(msgType agents.MessageType, content, toolName string) {
			switch msgType {
			case agents.ThinkingMsg:
				// Replace "Thinking..." with actual thinking content
				// Clear the line and show thinking
				fmt.Printf("\r\033[33m[Thinking]\033[0m %s\n", content)
			case agents.ToolMsg:
				if toolName == "" {
					// Tool call
					fmt.Printf("\033[38;5;208m%s\033[0m\n", content)
				} else {
					// Tool result
					lines := strings.Split(content, "\n")
					for _, line := range lines {
						trimmed := strings.TrimSpace(line)
						if trimmed != "" {
							fmt.Printf("│  %s\n", trimmed)
						}
					}
				}
			case agents.AssistantMsg:
				// Assistant response
				fmt.Printf("%s\n", content)
			}
		})

		if err != nil {
			fmt.Printf("\n\033[31mError: %v\033[0m\n", err)
		}

		fmt.Println("\n────────────────────────────────────────────")
		fmt.Println("")
	}
}
