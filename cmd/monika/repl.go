package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"runtime"

	"github.com/c-bata/go-prompt"
	"monika/internal/agent"
	"monika/internal/session"
	"monika/internal/tool"
	"monika/internal/tool/builtin"
	"monika/pkg/engine"
)

var errExitRepl = errors.New("exit")

var validSlashCommands = map[string]bool{
	"exit":    true,
	"help":    true,
	"clear":   true,
	"compact": true,
}

func parseSlashCommand(input string) (string, bool) {
	if len(input) == 0 || input[0] != '/' {
		return "", false
	}
	cmd := input[1:]
	if validSlashCommands[cmd] {
		return cmd, true
	}
	return "", false
}

type repl struct {
	home     string
	cwd      string
	provider engine.ProviderEngine
	model    string
	registry *tool.ToolRegistry
	sess     *session.Session
	loopOpts []agent.LoopOption
}

func newREPL(home, cwd string, pr *providerResult) *repl {
	r := &repl{
		home:     home,
		cwd:      cwd,
		provider: pr.provider,
		model:    pr.model,
	}

	r.registry = tool.NewRegistry()
	if err := builtin.RegisterDefaults(r.registry, cwd); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: failed to register tools: %s\n", err)
	}

	var loopOpts []agent.LoopOption
	loopOpts = append(loopOpts, agent.WithProjectDir(cwd))
	loopOpts = append(loopOpts, agent.WithModel(pr.model))

	if p := loadSystemPrompt(cwd); p != "" {
		sysPrompt := fmt.Sprintf("OS Version: %s\nWorking directory: %s\n\n%s", runtime.GOOS, cwd, p)
		loopOpts = append(loopOpts, agent.WithSystemPrompt(sysPrompt))
	}
	r.loopOpts = loopOpts

	return r
}

func (r *repl) run(sess *session.Session) {
	r.sess = sess
	fmt.Printf("Session: %s\n", sess.ID)
	if sess.Title != "" {
		fmt.Printf("Title: %s\n", sess.Title)
	}
	fmt.Println()
	defer func() {
		if v := recover(); v != nil {
			if !errors.Is(v.(error), errExitRepl) {
				panic(v)
			}
		}
		r.saveSession()
		if r.sess != nil {
			fmt.Printf("\nSession: %s\n", r.sess.ID)
			if r.sess.Title != "" {
				fmt.Printf("Title: %s\n", r.sess.Title)
			}
		}
		fmt.Println("Goodbye!")
	}()
	p := prompt.New(
		r.execute,
		r.complete,
		prompt.OptionTitle("monika"),
		prompt.OptionPrefix("> "),
	)
	p.Run()
}

func (r *repl) execute(input string) {
	if input == "" {
		return
	}
	cmd, ok := parseSlashCommand(input)
	if ok {
		r.handleCommand(cmd)
		return
	}
	r.handleMessage(input)
}

func (r *repl) handleCommand(cmd string) {
	switch cmd {
	case "exit":
		panic(errExitRepl)
	case "help":
		fmt.Println("Available commands:")
		fmt.Println("  /exit    - Exit interactive mode")
		fmt.Println("  /help    - Show this help")
		fmt.Println("  /clear   - Clear conversation history")
		fmt.Println("  /compact - Compress conversation context (not yet implemented)")
	case "clear":
		r.sess.Messages = nil
		fmt.Println("Conversation cleared.")
	case "compact":
		fmt.Println("/compact is not yet implemented.")
	}
}

func (r *repl) handleMessage(input string) {
	if r.sess == nil {
		return
	}

	ctx := context.Background()
	conv := &agent.Conversation{Messages: r.sess.Messages}

	loop := agent.NewLoop(r.provider, r.registry, r.loopOpts...)
	result, err := loop.Run(ctx, conv, input)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %s\n", err)
		return
	}

	r.sess.Messages = conv.Messages
	if r.sess.Title == "" {
		r.sess.SetTitle()
	}

	fmt.Println()
	fmt.Println(result.Content)
	fmt.Println()

	r.saveSession()
}

func (r *repl) saveSession() {
	if r.sess == nil {
		return
	}
	if err := r.sess.Save(r.home); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: failed to save session: %s\n", err)
	}
}

func (r *repl) complete(d prompt.Document) []prompt.Suggest {
	text := d.TextBeforeCursor()
	if len(text) > 0 && text[0] == '/' {
		return []prompt.Suggest{
			{Text: "/exit", Description: "Exit interactive mode"},
			{Text: "/help", Description: "Show help"},
			{Text: "/clear", Description: "Clear conversation"},
			{Text: "/compact", Description: "Compress context"},
		}
	}
	return nil
}
