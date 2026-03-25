package tui

import (
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// renderView renders the TUI view
func renderView(m Model) string {
	if m.width == 0 {
		return "Initializing..."
	}

	var sections []string

	// Header
	sections = append(sections, renderHeader(m.width))

	// Messages (conversation history)
	sections = append(sections, renderMessages(m.messages, m.width-2))

	// Empty space before input
	sections = append(sections, "")

	// Input area
	sections = append(sections, renderInputArea(m))

	// Join all sections
	return lipgloss.JoinVertical(lipgloss.Left, sections...) + "\n"
}

// renderHeader renders the header
func renderHeader(width int) string {
	return lipgloss.NewStyle().
		Width(width).
		Padding(0, 1).
		Render("Monika CLI")
}

// renderMessages renders the conversation history
func renderMessages(messages []ChatMessage, width int) string {
	if len(messages) == 0 {
		return lipgloss.NewStyle().
			Foreground(lipgloss.Color("241")).
			Render("Start a conversation...")
	}

	var msgStrings []string
	availableHeight := 20 // Show last 20 messages

	// Get last N messages
	start := 0
	if len(messages) > availableHeight {
		start = len(messages) - availableHeight
	}

	for i := start; i < len(messages); i++ {
		msgStrings = append(msgStrings, renderMessage(messages[i], width-4))
	}

	return lipgloss.JoinVertical(lipgloss.Left, msgStrings...)
}

// renderMessage renders a single message
func renderMessage(msg ChatMessage, width int) string {
	labelStyle := GetLabelStyle(msg.Type)
	label := GetLabel(msg.Type)

	content := msg.Content

	// Clean up content: trim leading/trailing whitespace from each line
	// and remove excessive blank lines
	content = cleanContent(content)

	switch msg.Type {
	case ToolMessage:
		// Tool calls: Content is in "bash(command)" format from agents.go
		// Tool results: Multiple lines, each prefixed with "│"
		if strings.Contains(content, "\n│  ") || strings.HasPrefix(content, "│  ") {
			// This is a tool result with multiple lines
			// Split by newlines and render each line with │ prefix
			lines := strings.Split(content, "\n")
			var renderedLines []string
			for i, line := range lines {
				if strings.HasPrefix(line, "│  ") {
					// Line already has prefix, render as-is
					renderedLines = append(renderedLines, contentStyle.Render(line))
				} else if i > 0 || len(renderedLines) > 0 {
					// Continuation line without prefix, add it
					renderedLines = append(renderedLines, contentStyle.Render("│  "+line))
				} else {
					// First line without prefix, shouldn't happen for tool results
					renderedLines = append(renderedLines, contentStyle.Render(line))
				}
			}
			return lipgloss.JoinVertical(lipgloss.Left, renderedLines...)
		}
		// This is a tool call, render as-is with label style
		return labelStyle.Render(content)

	case ThinkingMessage:
		// Thinking: show the actual content
		if len(content) > width {
			lines := wrapContent(content, width)
			var renderedLines []string
			for i, line := range lines {
				if i == 0 {
					renderedLines = append(renderedLines, labelStyle.Render(label)+" "+contentStyle.Render(line))
				} else {
					// No indentation for continuation lines
					renderedLines = append(renderedLines, contentStyle.Render(line))
				}
			}
			return lipgloss.JoinVertical(lipgloss.Left, renderedLines...)
		}
		return labelStyle.Render(label) + " " + contentStyle.Render(content)

	default:
		// User, Assistant messages
		// If content has newlines, preserve them
		if strings.Contains(content, "\n") {
			lines := strings.Split(content, "\n")
			var renderedLines []string
			for i, line := range lines {
				if line == "" {
					renderedLines = append(renderedLines, "")
					continue
				}
				if i == 0 {
					renderedLines = append(renderedLines, labelStyle.Render(label)+" "+contentStyle.Render(line))
				} else {
					// No indentation for continuation lines
					renderedLines = append(renderedLines, contentStyle.Render(line))
				}
			}
			return lipgloss.JoinVertical(lipgloss.Left, renderedLines...)
		}

		// No newlines, simple rendering
		if len(content) > width {
			lines := wrapContent(content, width)
			var renderedLines []string
			for i, line := range lines {
				if i == 0 {
					renderedLines = append(renderedLines, labelStyle.Render(label)+" "+contentStyle.Render(line))
				} else {
					// No indentation for continuation lines
					renderedLines = append(renderedLines, contentStyle.Render(line))
				}
			}
			return lipgloss.JoinVertical(lipgloss.Left, renderedLines...)
		}
		return labelStyle.Render(label) + " " + contentStyle.Render(content)
	}
}

// cleanContent cleans up content by removing markdown code blocks and excessive whitespace
func cleanContent(content string) string {
	// Remove markdown code block markers
	result := strings.ReplaceAll(content, "```", "")
	result = strings.ReplaceAll(result, "````", "")

	// Split into lines, trim leading/trailing spaces from each line
	lines := strings.Split(result, "\n")
	var cleaned []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" || len(cleaned) == 0 || (len(cleaned) > 0 && cleaned[len(cleaned)-1] != "") {
			cleaned = append(cleaned, trimmed)
		}
	}

	return strings.Join(cleaned, "\n")
}

// renderInputArea renders the input area
func renderInputArea(m Model) string {
	var inputLine string

	if m.loading {
		// Show animated progress bar instead of "Thinking..."
		barWidth := 30
		filled := m.loadingProgress
		bar := strings.Repeat("█", filled) + strings.Repeat("░", barWidth-filled)
		inputLine = loadingStyle.Render("[Thinking] " + bar)
	} else {
		cursor := ""
		if m.cursorBlink {
			cursor = "▋"
		} else {
			cursor = " "
		}
		inputLine = "> " + m.input + cursor
	}

	return lipgloss.NewStyle().
		Padding(0, 1).
		Width(m.width).
		Render(inputLine)
}

// wrapContent wraps text to fit within width
func wrapContent(text string, width int) []string {
	if len(text) <= width {
		return []string{text}
	}

	var lines []string
	words := strings.Fields(text)
	currentLine := ""

	for _, word := range words {
		if len(currentLine) == 0 {
			currentLine = word
		} else if len(currentLine)+1+len(word) <= width {
			currentLine += " " + word
		} else {
			lines = append(lines, currentLine)
			currentLine = word
		}
	}

	if currentLine != "" {
		lines = append(lines, currentLine)
	}

	return lines
}

// streamingOutputMsg is a message for streaming output from the agent
type streamingOutputMsg struct {
	Type    MessageType
	Content string
	ToolName string
}

// AddStreamingMessage adds a streaming message to the model
func (m *Model) AddStreamingMessage(msgType MessageType, content string, toolName string) tea.Cmd {
	return func() tea.Msg {
		return streamingOutputMsg{
			Type:    msgType,
			Content: content,
			ToolName: toolName,
		}
	}
}
