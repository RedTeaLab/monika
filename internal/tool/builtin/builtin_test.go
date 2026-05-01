package builtin

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
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
	args, _ := json.Marshal(map[string]any{"filePath": path, "offset": 1, "limit": 200})
	result, err := f.Execute(context.Background(), args)
	if err != nil {
		t.Fatal(err)
	}
	if result.Content != "line1\nline2\nline3" {
		t.Fatalf("content = %q", result.Content)
	}
}

func TestFileReadExplicitLimit(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "big.txt")
	var lines []string
	for i := 1; i <= 300; i++ {
		lines = append(lines, fmt.Sprintf("line%d", i))
	}
	if err := os.WriteFile(path, []byte(strings.Join(lines, "\n")), 0o644); err != nil {
		t.Fatal(err)
	}

	f := NewFileRead(dir)
	args, _ := json.Marshal(map[string]any{"filePath": path, "offset": 1, "limit": 100})
	result, err := f.Execute(context.Background(), args)
	if err != nil {
		t.Fatal(err)
	}
	resultLines := strings.Count(result.Content, "\n") + 1
	if resultLines != 100 {
		t.Fatalf("expected 100 lines with explicit limit, got %d", resultLines)
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
	expected := []string{"file_read", "file_write", "file_edit", "file_list", "glob", "grep", "bash"}
	for _, name := range expected {
		if _, ok := r.Get(name); !ok {
			t.Fatalf("tool %q not registered", name)
		}
	}
}

func TestFileEdit(t *testing.T) {
	dir := t.TempDir()
	f := NewFileEdit(dir)

	if f.Name() != "file_edit" {
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

func TestFileEditSingleReplace(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(path, []byte("hello world\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	f := NewFileEdit(dir)
	args, _ := json.Marshal(map[string]any{
		"filePath":   path,
		"old_string": "hello",
		"new_string": "goodbye",
	})
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
	if string(data) != "goodbye world\n" {
		t.Fatalf("content = %q", string(data))
	}
}

func TestFileEditReplaceAll(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(path, []byte("foo bar foo\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	f := NewFileEdit(dir)
	args, _ := json.Marshal(map[string]any{
		"filePath":    path,
		"old_string":  "foo",
		"new_string":  "baz",
		"replace_all": true,
	})
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
	if string(data) != "baz bar baz\n" {
		t.Fatalf("content = %q", string(data))
	}
}

func TestFileEditNonUniqueFails(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(path, []byte("foo bar foo\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	f := NewFileEdit(dir)
	args, _ := json.Marshal(map[string]any{
		"filePath":   path,
		"old_string": "foo",
		"new_string": "baz",
	})
	result, err := f.Execute(context.Background(), args)
	if err != nil {
		t.Fatal(err)
	}
	if !result.IsError {
		t.Fatal("expected error for non-unique old_string")
	}
}

func TestFileEditNotFound(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(path, []byte("hello\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	f := NewFileEdit(dir)
	args, _ := json.Marshal(map[string]any{
		"filePath":   path,
		"old_string": "nonexistent",
		"new_string": "replaced",
	})
	result, err := f.Execute(context.Background(), args)
	if err != nil {
		t.Fatal(err)
	}
	if !result.IsError {
		t.Fatal("expected error for old_string not found")
	}
}

func TestFileEditOutsideProject(t *testing.T) {
	dir := t.TempDir()
	f := NewFileEdit(dir)
	args, _ := json.Marshal(map[string]any{
		"filePath":   "/etc/passwd",
		"old_string": "a",
		"new_string": "b",
	})
	result, err := f.Execute(context.Background(), args)
	if err != nil {
		t.Fatal(err)
	}
	if !result.IsError {
		t.Fatal("expected error for path outside project")
	}
}

func TestFileEditMultiLine(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(path, []byte("line1\nline2\nline3\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	f := NewFileEdit(dir)
	args, _ := json.Marshal(map[string]any{
		"filePath":   path,
		"old_string": "line1\nline2",
		"new_string": "alpha\nbeta",
	})
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
	if string(data) != "alpha\nbeta\nline3\n" {
		t.Fatalf("content = %q", string(data))
	}
}
