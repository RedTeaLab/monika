package gitutil

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/go-git/go-git/v5/plumbing"
)

func setupTestRepo(t *testing.T) (*Repository, string) {
	t.Helper()
	dir := t.TempDir()
	repo, err := Init(dir, "Test Author", "test@test.com")
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	return repo, dir
}

func TestInit(t *testing.T) {
	dir := t.TempDir()
	repo, err := Init(dir, "Test", "test@test.com")
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	if repo == nil {
		t.Fatal("expected non-nil repo")
	}
	if !IsGitRepo(dir) {
		t.Fatal("IsGitRepo should return true")
	}
	if IsGitRepo(t.TempDir()) {
		t.Fatal("IsGitRepo should return false for non-repo dir")
	}
}

func TestOpen(t *testing.T) {
	_, dir := setupTestRepo(t)
	repo2, err := Open(dir)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if repo2.Path() != dir {
		t.Fatalf("expected path %s, got %s", dir, repo2.Path())
	}
}

func TestCurrentBranch(t *testing.T) {
	repo, _ := setupTestRepo(t)
	branch, err := repo.CurrentBranch()
	if err != nil {
		t.Fatalf("CurrentBranch: %v", err)
	}
	// Default branch after Init should be "main"
	if branch != "main" {
		t.Fatalf("expected branch 'main', got '%s'", branch)
	}
}

func TestCreateBranchAndCheckout(t *testing.T) {
	repo, _ := setupTestRepo(t)
	// Create and checkout a new branch
	if err := repo.CreateBranchAndCheckout("feature"); err != nil {
		t.Fatalf("CreateBranchAndCheckout: %v", err)
	}
	branch, err := repo.CurrentBranch()
	if err != nil {
		t.Fatalf("CurrentBranch: %v", err)
	}
	if branch != "feature" {
		t.Fatalf("expected branch 'feature', got '%s'", branch)
	}
}

func TestListBranches(t *testing.T) {
	repo, _ := setupTestRepo(t)
	if err := repo.CreateBranch("feature"); err != nil {
		t.Fatalf("CreateBranch: %v", err)
	}
	branches, err := repo.ListBranches()
	if err != nil {
		t.Fatalf("ListBranches: %v", err)
	}
	if len(branches) != 2 {
		t.Fatalf("expected 2 branches, got %d", len(branches))
	}
	names := map[string]bool{}
	for _, b := range branches {
		names[b.Name] = true
	}
	if !names["main"] || !names["feature"] {
		t.Fatalf("expected main and feature branches, got %v", names)
	}
}

func TestCommitAndLog(t *testing.T) {
	repo, dir := setupTestRepo(t)
	// Write a file and commit
	if err := os.WriteFile(filepath.Join(dir, "hello.txt"), []byte("hello"), 0644); err != nil {
		t.Fatal(err)
	}
	hash, err := repo.AddAndCommit("first commit", CommitAuthor{Name: "Test", Email: "test@test.com"})
	if err != nil {
		t.Fatalf("AddAndCommit: %v", err)
	}
	if hash == "" {
		t.Fatal("expected non-empty commit hash")
	}
	log, err := repo.Log(10)
	if err != nil {
		t.Fatalf("Log: %v", err)
	}
	// Init creates an initial commit + our commit = 2
	if len(log) < 2 {
		t.Fatalf("expected at least 2 commits, got %d", len(log))
	}
	if log[0].Message != "first commit" {
		t.Fatalf("expected 'first commit', got '%s'", log[0].Message)
	}
}

func TestStatusAndClean(t *testing.T) {
	repo, dir := setupTestRepo(t)
	// Initially clean
	clean, err := repo.IsClean()
	if err != nil {
		t.Fatalf("IsClean: %v", err)
	}
	if !clean {
		t.Fatal("expected repo to be clean")
	}
	// Create an untracked file
	if err := os.WriteFile(filepath.Join(dir, "new.txt"), []byte("new"), 0644); err != nil {
		t.Fatal(err)
	}
	clean, err = repo.IsClean()
	if err != nil {
		t.Fatalf("IsClean: %v", err)
	}
	if clean {
		t.Fatal("expected repo to be dirty after creating file")
	}
	status, err := repo.Status()
	if err != nil {
		t.Fatalf("Status: %v", err)
	}
	if len(status) == 0 {
		t.Fatal("expected status entries")
	}
}

func TestDiff(t *testing.T) {
	repo, dir := setupTestRepo(t)
	// Write file and commit
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("hello"), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.AddAndCommit("add a.txt", CommitAuthor{Name: "Test", Email: "test@test.com"}); err != nil {
		t.Fatal(err)
	}
	// Modify and commit
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("world"), 0644); err != nil {
		t.Fatal(err)
	}
	hash2, err := repo.AddAndCommit("modify a.txt", CommitAuthor{Name: "Test", Email: "test@test.com"})
	if err != nil {
		t.Fatal(err)
	}
	// Diff the latest commit
	diff, err := repo.Diff(plumbing.ZeroHash, plumbing.NewHash(hash2))
	if err != nil {
		t.Fatalf("Diff: %v", err)
	}
	if diff == "" {
		t.Fatal("expected non-empty diff")
	}
}

func TestDeleteBranch(t *testing.T) {
	repo, _ := setupTestRepo(t)
	if err := repo.CreateBranch("to-delete"); err != nil {
		t.Fatal(err)
	}
	branches, _ := repo.ListBranches()
	if len(branches) != 2 {
		t.Fatalf("expected 2 branches, got %d", len(branches))
	}
	if err := repo.DeleteBranch("to-delete"); err != nil {
		t.Fatalf("DeleteBranch: %v", err)
	}
	branches, _ = repo.ListBranches()
	if len(branches) != 1 {
		t.Fatalf("expected 1 branch after delete, got %d", len(branches))
	}
}

func TestHEAD(t *testing.T) {
	repo, _ := setupTestRepo(t)
	hash, err := repo.HEAD()
	if err != nil {
		t.Fatalf("HEAD: %v", err)
	}
	if hash.IsZero() {
		t.Fatal("expected non-zero HEAD hash")
	}
}

func TestRemoteURL(t *testing.T) {
	repo, _ := setupTestRepo(t)
	// Add a remote
	if err := repo.AddRemote("origin", "https://github.com/test/repo.git"); err != nil {
		t.Fatal(err)
	}
	url, err := repo.RemoteURL("origin")
	if err != nil {
		t.Fatalf("RemoteURL: %v", err)
	}
	if url != "https://github.com/test/repo.git" {
		t.Fatalf("unexpected remote URL: %s", url)
	}
}
