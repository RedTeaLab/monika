package gitutil

import (
	"errors"
	"fmt"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
	"github.com/go-git/go-git/v5/plumbing/transport"
	"github.com/go-git/go-git/v5/plumbing/transport/http"
)

// Repository wraps a go-git Repository with higher-level operations.
type Repository struct {
	inner *git.Repository
	path  string
}

// Open opens an existing repository at the given path.
func Open(path string) (*Repository, error) {
	r, err := git.PlainOpen(path)
	if err != nil {
		return nil, err
	}
	return &Repository{inner: r, path: path}, nil
}

// Clone clones a remote repository into the given local path.
func Clone(url, path string, opts ...CloneOption) (*Repository, error) {
	cfg := &cloneConfig{}
	for _, o := range opts {
		o(cfg)
	}
	cloneOpts := &git.CloneOptions{URL: url}
	if cfg.auth != nil {
		cloneOpts.Auth = cfg.auth
	}
	if cfg.branch != "" {
		cloneOpts.ReferenceName = plumbing.ReferenceName("refs/heads/" + cfg.branch)
	}
	if cfg.depth > 0 {
		cloneOpts.Depth = cfg.depth
	}
	r, err := git.PlainClone(path, false, cloneOpts)
	if err != nil {
		return nil, err
	}
	return &Repository{inner: r, path: path}, nil
}

// Path returns the local filesystem path of the repository.
func (r *Repository) Path() string { return r.path }

// IsGitRepo returns true if the path contains a valid git repository.
func IsGitRepo(path string) bool {
	_, err := git.PlainOpen(path)
	return err == nil
}

// cloneConfig holds optional clone parameters.
type cloneConfig struct {
	auth   transport.AuthMethod
	branch string
	depth  int
}

// CloneOption is a functional option for Clone.
type CloneOption func(*cloneConfig)

// WithAuth sets authentication for remote operations.
func WithAuth(auth transport.AuthMethod) CloneOption {
	return func(c *cloneConfig) { c.auth = auth }
}

// WithBranch sets the branch to clone.
func WithBranch(branch string) CloneOption {
	return func(c *cloneConfig) { c.branch = branch }
}

// WithDepth sets the clone depth (shallow clone).
func WithDepth(depth int) CloneOption {
	return func(c *cloneConfig) { c.depth = depth }
}

// BasicAuth creates HTTP basic auth from a username and password/token.
func BasicAuth(username, password string) transport.AuthMethod {
	return &http.BasicAuth{Username: username, Password: password}
}

// TokenAuth creates HTTP token auth (password is the token).
func TokenAuth(token string) transport.AuthMethod {
	return &http.TokenAuth{Token: token}
}

// ErrNotGitRepo is returned when a path is not a valid git repository.
var ErrNotGitRepo = errors.New("not a git repository")

// Init creates a new git repository at the given path with an initial commit.
func Init(path string, authorName, authorEmail string) (*Repository, error) {
	r, err := git.PlainInit(path, false)
	if err != nil {
		return nil, fmt.Errorf("init: %w", err)
	}
	// Set initial branch to main
	if err := r.Storer.SetReference(plumbing.NewSymbolicReference(plumbing.HEAD, plumbing.ReferenceName("refs/heads/main"))); err != nil {
		return nil, fmt.Errorf("set HEAD: %w", err)
	}
	wt, err := r.Worktree()
	if err != nil {
		return nil, fmt.Errorf("worktree: %w", err)
	}
	_, err = wt.Commit("initial commit", &git.CommitOptions{
		Author: &object.Signature{
			Name:  authorName,
			Email: authorEmail,
		},
		AllowEmptyCommits: true,
	})
	if err != nil {
		return nil, fmt.Errorf("initial commit: %w", err)
	}
	return &Repository{inner: r, path: path}, nil
}
