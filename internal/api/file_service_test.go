package api

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFileServiceReadWrite(t *testing.T) {
	dir := t.TempDir()
	fs := NewFileService(dir)

	if err := fs.WriteFile("test.txt", "hello world"); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	fc, err := fs.ReadFile("test.txt")
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if !fc.Exist {
		t.Fatal("expected Exist=true")
	}
	if fc.Content != "hello world" {
		t.Errorf("expected 'hello world', got %q", fc.Content)
	}
	if fc.Path != "test.txt" {
		t.Errorf("expected path 'test.txt', got %q", fc.Path)
	}

	if err := fs.WriteFile("deep/nested/file.txt", "nested content"); err != nil {
		t.Fatalf("WriteFile nested: %v", err)
	}

	fc, err = fs.ReadFile("deep/nested/file.txt")
	if err != nil {
		t.Fatalf("ReadFile nested: %v", err)
	}
	if !fc.Exist {
		t.Fatal("expected Exist=true for nested file")
	}
	if fc.Content != "nested content" {
		t.Errorf("expected 'nested content', got %q", fc.Content)
	}
}

func TestFileServiceReadNonExistent(t *testing.T) {
	dir := t.TempDir()
	fs := NewFileService(dir)

	fc, err := fs.ReadFile("nonexistent.txt")
	if err != nil {
		t.Fatalf("ReadFile should not error on missing file: %v", err)
	}
	if fc.Exist {
		t.Fatal("expected Exist=false for missing file")
	}
	if fc.Path != "nonexistent.txt" {
		t.Errorf("expected path 'nonexistent.txt', got %q", fc.Path)
	}
}

func TestFileServiceListDir(t *testing.T) {
	dir := t.TempDir()
	fs := NewFileService(dir)

	os.WriteFile(filepath.Join(dir, "a.txt"), []byte("a"), 0644)
	os.MkdirAll(filepath.Join(dir, "b"), 0755)
	os.WriteFile(filepath.Join(dir, "b", "c.txt"), []byte("c"), 0644)
	os.MkdirAll(filepath.Join(dir, "d"), 0755)
	os.WriteFile(filepath.Join(dir, "d", "e.txt"), []byte("e"), 0644)
	os.WriteFile(filepath.Join(dir, "z.txt"), []byte("z"), 0644)
	os.WriteFile(filepath.Join(dir, ".hidden"), []byte("h"), 0644)
	os.MkdirAll(filepath.Join(dir, ".git", "objects"), 0755)
	os.MkdirAll(filepath.Join(dir, "node_modules", "pkg"), 0755)
	os.MkdirAll(filepath.Join(dir, ".monika"), 0755)

	nodes, err := fs.ListDir("")
	if err != nil {
		t.Fatalf("ListDir: %v", err)
	}

	if len(nodes) != 4 {
		t.Fatalf("expected 4 entries, got %d: %v", len(nodes), nodeNames(nodes))
	}

	expected := []struct {
		name  string
		isDir bool
	}{
		{"b", true},
		{"d", true},
		{"a.txt", false},
		{"z.txt", false},
	}
	for i, e := range expected {
		if nodes[i].Name != e.name {
			t.Errorf("entry %d: expected name %q, got %q", i, e.name, nodes[i].Name)
		}
		if nodes[i].IsDir != e.isDir {
			t.Errorf("entry %d: expected IsDir=%v, got %v", i, e.isDir, nodes[i].IsDir)
		}
	}

	if len(nodes[0].Children) != 1 {
		t.Fatalf("expected 1 child in b/, got %d", len(nodes[0].Children))
	}
	if nodes[0].Children[0].Name != "c.txt" {
		t.Errorf("expected c.txt, got %q", nodes[0].Children[0].Name)
	}
	if nodes[0].Children[0].Path != filepath.Join("b", "c.txt") {
		t.Errorf("expected path %q, got %q", filepath.Join("b", "c.txt"), nodes[0].Children[0].Path)
	}

	if len(nodes[1].Children) != 1 {
		t.Fatalf("expected 1 child in d/, got %d", len(nodes[1].Children))
	}
	if nodes[1].Children[0].Name != "e.txt" {
		t.Errorf("expected e.txt, got %q", nodes[1].Children[0].Name)
	}
}

func TestFileServiceListChanges(t *testing.T) {
	dir := t.TempDir()
	fs := NewFileService(dir)

	changes, err := fs.ListChanges()
	if err != nil {
		t.Fatalf("ListChanges should not error on non-git dir: %v", err)
	}
	if len(changes) != 0 {
		t.Errorf("expected empty changes for non-git dir, got %d", len(changes))
	}
}

func TestFileServiceListChangeStats_NonGitDir(t *testing.T) {
	dir := t.TempDir()
	fs := NewFileService(dir)

	stats, err := fs.ListChangeStats()
	if err != nil {
		t.Fatalf("ListChangeStats should not error on non-git dir: %v", err)
	}
	if len(stats) != 0 {
		t.Errorf("expected empty stats for non-git dir, got %d", len(stats))
	}
}

func nodeNames(nodes []FileNode) []string {
	names := make([]string, len(nodes))
	for i, n := range nodes {
		names[i] = n.Name
	}
	return names
}
