package builtin

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"monika/internal/tool"
)

func TestAskUserNameDescriptionParams(t *testing.T) {
	a := NewAskUser()
	if a.Name() != "ask_user" {
		t.Fatalf("name = %q", a.Name())
	}
	if a.Description() == "" {
		t.Fatal("description empty")
	}
	params := a.Parameters()
	if _, ok := params["properties"]; !ok {
		t.Fatal("missing properties")
	}
}

func TestAskUserNoCallbackInContext(t *testing.T) {
	a := NewAskUser()
	args, _ := json.Marshal(map[string]any{"question": "hello?"})
	result, err := a.Execute(context.Background(), args)
	if err != nil {
		t.Fatal(err)
	}
	if !result.IsError {
		t.Fatal("expected error when no AskUserFunc in context")
	}
}

func TestAskUserEmptyQuestion(t *testing.T) {
	ctx := tool.WithAskUserFunc(context.Background(), func(ctx context.Context, a tool.AskUserArgs) (string, error) {
		return "", nil
	})
	a := NewAskUser()
	args, _ := json.Marshal(map[string]any{"question": ""})
	result, err := a.Execute(ctx, args)
	if err != nil {
		t.Fatal(err)
	}
	if !result.IsError {
		t.Fatal("expected error for empty question")
	}
}

func TestAskUserGetsAnswer(t *testing.T) {
	ctx := tool.WithAskUserFunc(context.Background(), func(ctx context.Context, a tool.AskUserArgs) (string, error) {
		if a.Question != "what is 1+1?" {
			return "", fmt.Errorf("unexpected question: %q", a.Question)
		}
		return "2", nil
	})
	a := NewAskUser()
	args, _ := json.Marshal(map[string]any{"question": "what is 1+1?"})
	result, err := a.Execute(ctx, args)
	if err != nil {
		t.Fatal(err)
	}
	if result.IsError {
		t.Fatalf("unexpected error: %s", result.Content)
	}
	if result.Content != "2" {
		t.Fatalf("content = %q, want %q", result.Content, "2")
	}
}

func TestAskUserCallbackError(t *testing.T) {
	ctx := tool.WithAskUserFunc(context.Background(), func(ctx context.Context, a tool.AskUserArgs) (string, error) {
		return "", fmt.Errorf("user walked away")
	})
	a := NewAskUser()
	args, _ := json.Marshal(map[string]any{"question": "are you there?"})
	result, err := a.Execute(ctx, args)
	if err != nil {
		t.Fatal(err)
	}
	if !result.IsError {
		t.Fatal("expected error when callback returns error")
	}
}

func TestAskUserArgUnmarshalError(t *testing.T) {
	a := NewAskUser()
	result, err := a.Execute(context.Background(), json.RawMessage(`not json`))
	if err != nil {
		t.Fatal(err)
	}
	if !result.IsError {
		t.Fatal("expected error for invalid json args")
	}
}

func TestAskUserTitleAndOptions(t *testing.T) {
	ctx := tool.WithAskUserFunc(context.Background(), func(ctx context.Context, a tool.AskUserArgs) (string, error) {
		if a.Title != "Pick one" {
			t.Fatalf("title = %q", a.Title)
		}
		if len(a.Options) != 3 || a.Options[0] != "A" || a.Options[2] != "C" {
			t.Fatalf("options = %v", a.Options)
		}
		return "B", nil
	})
	a := NewAskUser()
	args, _ := json.Marshal(map[string]any{
		"question": "choose one",
		"title": "Pick one",
		"options": []string{"A", "B", "C"},
	})
	result, err := a.Execute(ctx, args)
	if err != nil {
		t.Fatal(err)
	}
	if result.IsError {
		t.Fatalf("unexpected error: %s", result.Content)
	}
	if result.Content != "B" {
		t.Fatalf("content = %q, want %q", result.Content, "B")
	}
}