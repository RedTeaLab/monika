package tui

import (
	agents "monika/internal/core"
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
)

// MessageType represents different types of messages in the chat
type MessageType int

const (
	UserMessage MessageType = iota
	ThinkingMessage
	ToolMessage
	AssistantMessage
)

// ChatMessage represents a single message in the conversation
type ChatMessage struct {
	Type     MessageType
	Content  string
	ToolName string // for ToolMessage
}

// StreamingMessage represents a message from the agent during streaming
type StreamingMessage struct {
	Type    MessageType
	Content string
	ToolName string
}

// Model is the TUI state model
type Model struct {
	messages        []ChatMessage
	input           string
	width           int
	height          int
	quitting        bool
	loading         bool
	cursorBlink     bool
	loadingProgress int  // For animated loading indicator
	agent           agents.Agents
	streamChan      chan StreamingMessage
}

// NewModel creates a new TUI model
func NewModel() Model {
	return Model{
		messages:   []ChatMessage{},
		input:      "",
		quitting:   false,
		loading:    false,
		cursorBlink: true,
		agent:      agents.NewAgent(),
		streamChan: make(chan StreamingMessage, 100),
	}
}

// Init implements tea.Model
func (m Model) Init() tea.Cmd {
	return tea.Batch(m.tick(), m.waitForStreamMessage())
}

// waitForStreamMessage waits for streaming messages from the agent
func (m Model) waitForStreamMessage() tea.Cmd {
	return func() tea.Msg {
		msg := <-m.streamChan
		return streamingOutputMsg{
			Type:    msg.Type,
			Content: msg.Content,
			ToolName: msg.ToolName,
		}
	}
}

// Update implements tea.Model
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		return m.handleKeyMsg(msg)
	case tea.MouseMsg:
		// Mouse events not needed
		return m, nil
	case tea.WindowSizeMsg:
		return m.handleWindowSizeMsg(msg)
	case ProcessMessageMsg:
		return m.handleProcessMessageMsg(msg)
	case streamingOutputMsg:
		return m.handleStreamingOutputMsg(msg)
	case tickMsg:
		// Handle cursor blink tick
		m.cursorBlink = !m.cursorBlink
		// Update loading progress for animation
		if m.loading {
			m.loadingProgress = (m.loadingProgress + 1) % 30
		} else {
			m.loadingProgress = 0
		}
		return m, m.tick()
	default:
		return m, nil
	}
}

// View implements tea.Model
func (m Model) View() string {
	return renderView(m)
}

// handleKeyMsg handles keyboard input
func (m Model) handleKeyMsg(msg tea.Msg) (tea.Model, tea.Cmd) {
	keyMsg, ok := msg.(tea.KeyMsg)
	if !ok {
		return m, nil
	}

	switch keyMsg.Type {
	case tea.KeyEnter:
		if m.input != "" && !m.loading {
			// User submitted a message
			m.messages = append(m.messages, ChatMessage{
				Type:    UserMessage,
				Content: m.input,
			})
			input := m.input
			m.input = ""
			m.loading = true

			// Return command to process the message
			return m, func() tea.Msg {
				return ProcessMessageMsg{Content: input}
			}
		}
	case tea.KeyCtrlC, tea.KeyEsc:
		m.quitting = true
		return m, tea.Quit
	case tea.KeyBackspace:
		if len(m.input) > 0 {
			m.input = m.input[:len(m.input)-1]
		}
	case tea.KeyRunes:
		// Append character to input
		m.input += string(keyMsg.Runes)
	}

	return m, nil
}

// handleWindowSizeMsg handles window resize
func (m Model) handleWindowSizeMsg(msg tea.Msg) (tea.Model, tea.Cmd) {
	sizeMsg, ok := msg.(tea.WindowSizeMsg)
	if !ok {
		return m, nil
	}

	m.width = sizeMsg.Width
	m.height = sizeMsg.Height
	return m, nil
}

// AddMessage adds a message to the conversation history
func (m *Model) AddMessage(msgType MessageType, content string, toolName string) {
	m.messages = append(m.messages, ChatMessage{
		Type:    msgType,
		Content: content,
		ToolName: toolName,
	})
}

// SetLoading sets the loading state
func (m *Model) SetLoading(loading bool) {
	m.loading = loading
}

// SetInput sets the current input text
func (m *Model) SetInput(input string) {
	m.input = input
}

// GetInput returns the current input text
func (m Model) GetInput() string {
	return m.input
}

// ShouldQuit returns whether the app should quit
func (m Model) ShouldQuit() bool {
	return m.quitting
}

// IsLoading returns whether the app is loading
func (m Model) IsLoading() bool {
	return m.loading
}

// ProcessMessageMsg is a message type for processing user input
type ProcessMessageMsg struct {
	Content string
}

// tickMsg is a message for cursor blinking
type tickMsg struct{}

// truncate truncates a string to max length
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

// tick returns a command that sends tick messages at a fixed interval
func (m Model) tick() tea.Cmd {
	return tea.Tick(time.Second*500, func(t time.Time) tea.Msg {
		return tickMsg{}
	})
}

// handleProcessMessageMsg handles user message processing
func (m Model) handleProcessMessageMsg(msg tea.Msg) (tea.Model, tea.Cmd) {
	pm, ok := msg.(ProcessMessageMsg)
	if !ok {
		return m, nil
	}

	m.loading = true

	// Run agent in background goroutine and send streaming messages to channel
	go func() {
		if err := m.agent.InvokeTUI(pm.Content, func(msgType agents.MessageType, content, toolName string) {
			// Convert agents.MessageType to tui.MessageType
			var tuiMsgType MessageType
			switch msgType {
			case agents.UserMsg:
				tuiMsgType = UserMessage
			case agents.ThinkingMsg:
				tuiMsgType = ThinkingMessage
			case agents.ToolMsg:
				tuiMsgType = ToolMessage
			case agents.AssistantMsg:
				tuiMsgType = AssistantMessage
			}
			// Send to channel for Bubble Tea to handle
			m.streamChan <- StreamingMessage{
				Type:     tuiMsgType,
				Content:  content,
				ToolName: toolName,
			}
		}); err != nil {
			// Send error message
			m.streamChan <- StreamingMessage{
				Type:     ToolMessage,
				Content:  fmt.Sprintf("Error: %v", err),
				ToolName: "",
			}
		}
	}()

	return m, nil
}

// handleStreamingOutputMsg handles streaming output from the agent
func (m Model) handleStreamingOutputMsg(msg tea.Msg) (tea.Model, tea.Cmd) {
	sm, ok := msg.(streamingOutputMsg)
	if !ok {
		return m, nil
	}

	var newMessage ChatMessage

	// For thinking and assistant messages, accumulate content in the last message of the same type
	if sm.Type == ThinkingMessage || sm.Type == AssistantMessage {
		if len(m.messages) > 0 && m.messages[len(m.messages)-1].Type == sm.Type {
			// Append to the last message of the same type
			m.messages[len(m.messages)-1].Content = sm.Content
		} else {
			// Create a new message
			newMessage = ChatMessage{
				Type:     sm.Type,
				Content:  sm.Content,
				ToolName: sm.ToolName,
			}
			m.messages = append(m.messages, newMessage)
		}
	} else if sm.Type == ToolMessage {
		// For tool messages:
		// - ToolName == "" means this is a tool call (format: "bash(command)")
		// - ToolName != "" means this is a tool result
		if sm.ToolName == "" {
			// This is a tool call, add as new message
			newMessage = ChatMessage{
				Type:     sm.Type,
				Content:  sm.Content,
				ToolName: sm.ToolName,
			}
			m.messages = append(m.messages, newMessage)
		} else {
			// This is a tool result, append to the previous tool call message
			if len(m.messages) > 0 {
				lastMsg := &m.messages[len(m.messages)-1]
				// Add │ prefix to each line of the result
				lines := strings.Split(sm.Content, "\n")
				for _, line := range lines {
					lastMsg.Content += "\n│  " + line
				}
			} else {
				// Should not happen, but handle gracefully
				newMessage = ChatMessage{
					Type:     sm.Type,
					Content:  sm.Content,
					ToolName: sm.ToolName,
				}
				m.messages = append(m.messages, newMessage)
			}
		}
	} else {
		// For other message types (User), just append
		newMessage = ChatMessage{
			Type:     sm.Type,
			Content:  sm.Content,
			ToolName: sm.ToolName,
		}
		m.messages = append(m.messages, newMessage)
	}

	// If this is an assistant message, we're done loading
	if sm.Type == AssistantMessage {
		m.loading = false
	}

	// Keep waiting for more streaming messages
	return m, m.waitForStreamMessage()
}
