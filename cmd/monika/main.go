package main

import (
	_ "monika/internal/core"
	_ "monika/internal/tools"
	"monika/internal/tui"

	tea "github.com/charmbracelet/bubbletea"
)

func main() {
	// Create TUI model
	model := tui.NewModel()

	// Create and start the Bubble Tea program
	p := tea.NewProgram(model, tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		panic(err)
	}
}
