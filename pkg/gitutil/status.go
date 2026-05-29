package gitutil

import (
	"bytes"
	"fmt"
	"io"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

// FileStatus describes the staging and worktree status of a single file.
type FileStatus struct {
	Path     string
	Staging  git.StatusCode
	Worktree git.StatusCode
}

// Status returns the working tree status of all changed files.
func (r *Repository) Status() ([]FileStatus, error) {
	wt, err := r.inner.Worktree()
	if err != nil {
		return nil, fmt.Errorf("worktree: %w", err)
	}
	s, err := wt.Status()
	if err != nil {
		return nil, fmt.Errorf("status: %w", err)
	}
	var result []FileStatus
	for path, fs := range s {
		result = append(result, FileStatus{
			Path:     path,
			Staging:  fs.Staging,
			Worktree: fs.Worktree,
		})
	}
	return result, nil
}

// IsClean returns true if there are no uncommitted changes.
func (r *Repository) IsClean() (bool, error) {
	wt, err := r.inner.Worktree()
	if err != nil {
		return false, fmt.Errorf("worktree: %w", err)
	}
	s, err := wt.Status()
	if err != nil {
		return false, fmt.Errorf("status: %w", err)
	}
	return s.IsClean(), nil
}

// CommitInfo holds summary data for a single commit.
type CommitInfo struct {
	Hash      plumbing.Hash
	Author    string
	Email     string
	Message   string
	Timestamp time.Time
}

// Log returns commit history starting from HEAD.
// If limit <= 0, all commits are returned.
func (r *Repository) Log(limit int) ([]CommitInfo, error) {
	ref, err := r.inner.Head()
	if err != nil {
		return nil, fmt.Errorf("head: %w", err)
	}
	return r.LogFrom(ref.Hash(), limit)
}

// LogFrom returns commit history starting from a given hash.
func (r *Repository) LogFrom(from plumbing.Hash, limit int) ([]CommitInfo, error) {
	ci, err := r.inner.Log(&git.LogOptions{From: from})
	if err != nil {
		return nil, fmt.Errorf("log: %w", err)
	}
	var result []CommitInfo
	for {
		c, err := ci.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		result = append(result, CommitInfo{
			Hash:      c.Hash,
			Author:    c.Author.Name,
			Email:     c.Author.Email,
			Message:   c.Message,
			Timestamp: c.Author.When,
		})
		if limit > 0 && len(result) >= limit {
			break
		}
	}
	ci.Close()
	return result, nil
}

// Diff returns the unified diff between two commits as a string.
// If to is the zero hash, it uses HEAD.
// If from is the zero hash, it uses the parent of to (single commit diff).
func (r *Repository) Diff(from, to plumbing.Hash) (string, error) {
	if to.IsZero() {
		ref, err := r.inner.Head()
		if err != nil {
			return "", fmt.Errorf("head: %w", err)
		}
		to = ref.Hash()
	}
	toCommit, err := r.inner.CommitObject(to)
	if err != nil {
		return "", fmt.Errorf("commit %s: %w", to, err)
	}
	toTree, err := toCommit.Tree()
	if err != nil {
		return "", fmt.Errorf("tree %s: %w", to, err)
	}

	var fromTree *object.Tree
	if from.IsZero() {
		// Use parent of toCommit
		if len(toCommit.ParentHashes) > 0 {
			parentCommit, err := r.inner.CommitObject(toCommit.ParentHashes[0])
			if err != nil {
				return "", fmt.Errorf("parent commit: %w", err)
			}
			fromTree, err = parentCommit.Tree()
			if err != nil {
				return "", fmt.Errorf("parent tree: %w", err)
			}
		}
		// If no parent (initial commit), fromTree stays nil -> diff against empty tree
	} else {
		fromCommit, err := r.inner.CommitObject(from)
		if err != nil {
			return "", fmt.Errorf("commit %s: %w", from, err)
		}
		fromTree, err = fromCommit.Tree()
		if err != nil {
			return "", fmt.Errorf("tree %s: %w", from, err)
		}
	}

	patch, err := object.DiffTree(fromTree, toTree)
	if err != nil {
		return "", fmt.Errorf("diff tree: %w", err)
	}

	patchObj, err := patch.Patch()
	if err != nil {
		return "", fmt.Errorf("patch: %w", err)
	}

	var buf bytes.Buffer
	if err := patchObj.Encode(&buf); err != nil {
		return "", fmt.Errorf("encode patch: %w", err)
	}
	return buf.String(), nil
}

// ShowFile returns the content of a file at a specific commit.
func (r *Repository) ShowFile(commitHash plumbing.Hash, path string) (string, error) {
	commit, err := r.inner.CommitObject(commitHash)
	if err != nil {
		return "", fmt.Errorf("commit: %w", err)
	}
	tree, err := commit.Tree()
	if err != nil {
		return "", fmt.Errorf("tree: %w", err)
	}
	entry, err := tree.FindEntry(path)
	if err != nil {
		return "", fmt.Errorf("find entry %s: %w", path, err)
	}
	blob, err := r.inner.BlobObject(entry.Hash)
	if err != nil {
		return "", fmt.Errorf("blob: %w", err)
	}
	reader, err := blob.Reader()
	if err != nil {
		return "", fmt.Errorf("reader: %w", err)
	}
	defer reader.Close()
	data, err := io.ReadAll(reader)
	if err != nil {
		return "", fmt.Errorf("read: %w", err)
	}
	return string(data), nil
}
