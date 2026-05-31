package gitutil

import (
	"fmt"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing/object"
)

// Add stages one or more file paths. Use "." to stage all changes.
func (r *Repository) Add(paths ...string) error {
	wt, err := r.inner.Worktree()
	if err != nil {
		return fmt.Errorf("worktree: %w", err)
	}
	for _, p := range paths {
		if _, err := wt.Add(p); err != nil {
			return fmt.Errorf("add %s: %w", p, err)
		}
	}
	return nil
}

// AddAll stages all changes (equivalent to Add(".")).
func (r *Repository) AddAll() error {
	return r.Add(".")
}

// CommitAuthor holds author info for a commit.
type CommitAuthor struct {
	Name  string
	Email string
}

// DefaultAuthor returns the configured user from git config.
// Returns an empty CommitAuthor if the config has no user set.
func (r *Repository) DefaultAuthor() CommitAuthor {
	var a CommitAuthor
	if cfg, err := r.inner.Config(); err == nil {
		if cfg.User.Name != "" {
			a.Name = cfg.User.Name
		}
		if cfg.User.Email != "" {
			a.Email = cfg.User.Email
		}
	}
	return a
}

// Commit creates a commit with the given message from currently staged changes.
// Returns the commit hash on success.
func (r *Repository) Commit(message string, author CommitAuthor) (string, error) {
	wt, err := r.inner.Worktree()
	if err != nil {
		return "", fmt.Errorf("worktree: %w", err)
	}
	hash, err := wt.Commit(message, &git.CommitOptions{
		Author: &object.Signature{
			Name:  author.Name,
			Email: author.Email,
			When:  time.Now(),
		},
	})
	if err != nil {
		return "", fmt.Errorf("commit: %w", err)
	}
	return hash.String(), nil
}

// AddAndCommit is a convenience that stages all changes and commits.
func (r *Repository) AddAndCommit(message string, author CommitAuthor) (string, error) {
	if err := r.AddAll(); err != nil {
		return "", err
	}
	return r.Commit(message, author)
}

// ResetHEAD resets the worktree to match HEAD, discarding all uncommitted changes.
func (r *Repository) ResetHEAD() error {
	wt, err := r.inner.Worktree()
	if err != nil {
		return fmt.Errorf("worktree: %w", err)
	}
	return wt.Reset(&git.ResetOptions{Mode: git.HardReset})
}

// Remove removes files from the working tree and stages the removal.
func (r *Repository) Remove(paths ...string) error {
	wt, err := r.inner.Worktree()
	if err != nil {
		return fmt.Errorf("worktree: %w", err)
	}
	for _, p := range paths {
		if _, err := wt.Remove(p); err != nil {
			return fmt.Errorf("remove %s: %w", p, err)
		}
	}
	return nil
}
