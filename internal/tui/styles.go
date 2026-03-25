package tui

import "github.com/charmbracelet/lipgloss"

// Styles for TUI components
var (
	// Header style
	headerStyle = lipgloss.NewStyle().
			Bold(true).
			Padding(0, 1)

	// Message type styles
	userLabelStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("86"))

	thinkingLabelStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("228"))

	toolLabelStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("172"))

	assistantLabelStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("39"))

	// Content styles (no padding, we handle indentation manually)
	contentStyle = lipgloss.NewStyle()

	// Input box style
	inputStyle = lipgloss.NewStyle().
			Padding(0, 1).
			Foreground(lipgloss.Color("252"))

	// Status indicators
	loadingStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("241"))

	// Cursor style
	cursorStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("252"))

	// Separator
	separatorStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("240"))
)

// GetLabelStyle returns the appropriate label style for a message type
func GetLabelStyle(msgType MessageType) lipgloss.Style {
	switch msgType {
	case UserMessage:
		return userLabelStyle
	case ThinkingMessage:
		return thinkingLabelStyle
	case ToolMessage:
		return toolLabelStyle
	case AssistantMessage:
		return assistantLabelStyle
	default:
		return lipgloss.NewStyle()
	}
}

// GetLabel returns the label text for a message type
func GetLabel(msgType MessageType) string {
	switch msgType {
	case UserMessage:
		return "[User]"
	case ThinkingMessage:
		return "[Thinking]"
	case ToolMessage:
		return "[Tool]"
	case AssistantMessage:
		return "[Assistant]"
	default:
		return "[Unknown]"
	}
}
