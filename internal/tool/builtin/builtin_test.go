package builtin

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"monika/internal/tool"
)

func TestFileRead(t *testing.T) {
	dir := t.TempDir()
	f := NewFileRead(dir)

	if f.Name() != "file_read" {
		t.Fatalf("name = %q", f.Name())
	}
	if f.Description() == "" {
		t.Fatal("description empty")
	}
	params := f.Parameters()
	if _, ok := params["properties"]; !ok {
		t.Fatal("missing properties")
	}
}

func TestFileReadReadsFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(path, []byte("line1\nline2\nline3\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	f := NewFileRead(dir)
	args, _ := json.Marshal(map[string]any{"filePath": path})
	result, err := f.Execute(context.Background(), args)
	if err != nil {
		t.Fatal(err)
	}
	if result.Content != "line1\nline2\nline3\n" {
		t.Fatalf("content = %q", result.Content)
	}
}

func TestFileReadWithOffsetLimit(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(path, []byte("line1\nline2\nline3\nline4\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	f := NewFileRead(dir)
	args, _ := json.Marshal(map[string]any{"filePath": path, "offset": 2, "limit": 2})
	result, err := f.Execute(context.Background(), args)
	if err != nil {
		t.Fatal(err)
	}
	if result.Content != "line2\nline3" {
		t.Fatalf("content = %q", result.Content)
	}
}

func TestFileReadOutsideProject(t *testing.T) {
	dir := t.TempDir()
	f := NewFileRead(dir)
	args, _ := json.Marshal(map[string]any{"filePath": "/etc/passwd"})
	result, err := f.Execute(context.Background(), args)
	if err != nil {
		t.Fatal(err)
	}
	if !result.IsError {
		t.Fatal("expected error for path outside project")
	}
}

func TestFileWriteCreatesFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "output.txt")

	f := NewFileWrite(dir)
	args, _ := json.Marshal(map[string]any{"filePath": path, "content": "hello world"})
	result, err := f.Execute(context.Background(), args)
	if err != nil {
		t.Fatal(err)
	}
	if result.IsError {
		t.Fatalf("unexpected error: %s", result.Content)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "hello world" {
		t.Fatalf("content = %q", string(data))
	}
}

func TestFileWriteOutsideProject(t *testing.T) {
	dir := t.TempDir()
	f := NewFileWrite(dir)
	args, _ := json.Marshal(map[string]any{"filePath": "/etc/hosts", "content": "bad"})
	result, err := f.Execute(context.Background(), args)
	if err != nil {
		t.Fatal(err)
	}
	if !result.IsError {
		t.Fatal("expected error for path outside project")
	}
}

func TestFileList(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(dir, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}

	f := NewFileList(dir)
	args, _ := json.Marshal(map[string]any{"dirPath": dir})
	result, err := f.Execute(context.Background(), args)
	if err != nil {
		t.Fatal(err)
	}
	if result.Content == "" {
		t.Fatal("empty output")
	}
}

func TestGlob(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "a.go"), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "b.go"), nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "c.txt"), nil, 0o644); err != nil {
		t.Fatal(err)
	}

	f := NewGlob(dir)
	args, _ := json.Marshal(map[string]any{"pattern": "*.go"})
	result, err := f.Execute(context.Background(), args)
	if err != nil {
		t.Fatal(err)
	}
	if result.IsError {
		t.Fatalf("unexpected error: %s", result.Content)
	}
}

func TestGrep(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "a.go"), []byte("package main\nfunc main() {}\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	f := NewGrep(dir)
	args, _ := json.Marshal(map[string]any{"pattern": "func.main"})
	result, err := f.Execute(context.Background(), args)
	if err != nil {
		t.Fatal(err)
	}
	if result.Content == "" {
		t.Fatal("empty output, expected matches")
	}
}

func TestGrepInvalidRegex(t *testing.T) {
	dir := t.TempDir()
	f := NewGrep(dir)
	args, _ := json.Marshal(map[string]any{"pattern": "["})
	result, err := f.Execute(context.Background(), args)
	if err != nil {
		t.Fatal(err)
	}
	if !result.IsError {
		t.Fatal("expected error for invalid regex")
	}
}

func TestBashResolveShell(t *testing.T) {
	shell, _ := resolveShell()
	if shell == "" {
		t.Fatal("no shell found on system")
	}
}

func TestBashExecute(t *testing.T) {
	sh, err := NewBash(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if sh.Name() != "bash" {
		t.Fatalf("name = %q", sh.Name())
	}

	args, _ := json.Marshal(map[string]any{"command": "echo hello"})
	result, err := sh.Execute(context.Background(), args)
	if err != nil {
		t.Fatal(err)
	}
	if !result.IsError && result.Content != "hello" {
		t.Fatalf("content = %q", result.Content)
	}
}

func TestRegisterDefaultsAll(t *testing.T) {
	r := tool.NewRegistry()
	if err := RegisterDefaults(r, t.TempDir()); err != nil {
		t.Fatal(err)
	}
	expected := []string{"file_read", "file_write", "file_list", "glob", "grep", "bash"}
	for _, name := range expected {
		if _, ok := r.Get(name); !ok {
			t.Fatalf("tool %q not registered", name)
		}
	}
}
