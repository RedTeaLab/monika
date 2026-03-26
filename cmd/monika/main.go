package main

import (
	"bufio"
	"flag"
	"fmt"
	"monika/internal/core"
	_ "monika/internal/tools"
	"os"
	"strings"
)

var (
	Version = "0.1.0"
	message string
)

func init() {
	flag.StringVar(&message, "message", "", "Message to send to the agent (headless mode)")
}

func main() {
	flag.Parse()
	agent := core.NewAgent()

	if message != "" {
		// Headless mode
		agent.Invoke(message)
	} else {
		// Interactive mode
		runInteractiveMode(agent)
	}
}

func runInteractiveMode(agent core.Agents) {
	fmt.Println("=== Monika Interactive Mode ===")
	fmt.Println("Type your message and press Enter to send.")
	fmt.Println("Type 'exit' or 'quit' to leave the interactive mode.")
	fmt.Println("")

	scanner := bufio.NewScanner(os.Stdin)
	for {
		fmt.Print("You: ")
		if !scanner.Scan() {
			break
		}

		input := strings.TrimSpace(scanner.Text())
		if input == "" {
			continue
		}

		// Check for exit commands
		if strings.ToLower(input) == "exit" || strings.ToLower(input) == "quit" {
			fmt.Println("Goodbye!")
			break
		}

		// Send message to agent
		agent.Invoke(input)
		fmt.Println("")
	}

	if err := scanner.Err(); err != nil {
		fmt.Printf("Error reading input: %v\n", err)
	}
}
