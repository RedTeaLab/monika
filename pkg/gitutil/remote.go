package gitutil

import (
	"fmt"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/transport"
)

// RemoteInfo holds metadata about a remote.
type RemoteInfo struct {
	Name string
	URLs []string
}

// ListRemotes returns all configured remotes.
func (r *Repository) ListRemotes() ([]RemoteInfo, error) {
	cfg, err := r.inner.Config()
	if err != nil {
		return nil, fmt.Errorf("config: %w", err)
	}
	var result []RemoteInfo
	for name, rc := range cfg.Remotes {
		result = append(result, RemoteInfo{Name: name, URLs: rc.URLs})
	}
	return result, nil
}

// RemoteURL returns the first URL of the named remote.
func (r *Repository) RemoteURL(name string) (string, error) {
	remote, err := r.inner.Remote(name)
	if err != nil {
		return "", fmt.Errorf("remote %s: %w", name, err)
	}
	cfg := remote.Config()
	if len(cfg.URLs) == 0 {
		return "", fmt.Errorf("remote %s has no URLs", name)
	}
	return cfg.URLs[0], nil
}

// Push pushes local commits to the remote.
// If branch is empty, pushes the current branch.
func (r *Repository) Push(remote string, branch string, auth transport.AuthMethod) error {
	rem, err := r.inner.Remote(remote)
	if err != nil {
		return fmt.Errorf("remote %s: %w", remote, err)
	}
	opts := &git.PushOptions{
		RemoteName: remote,
		Auth:       auth,
	}
	if branch != "" {
		opts.RefSpecs = []config.RefSpec{
			config.RefSpec(branchRef(branch) + ":" + branchRef(branch)),
		}
	}
	return rem.Push(opts)
}

// Pull fetches and merges from the remote into the current branch.
// Note: go-git only supports fast-forward merges.
func (r *Repository) Pull(remote string, auth transport.AuthMethod) error {
	wt, err := r.inner.Worktree()
	if err != nil {
		return fmt.Errorf("worktree: %w", err)
	}
	return wt.Pull(&git.PullOptions{
		RemoteName: remote,
		Auth:       auth,
	})
}

// Fetch downloads objects and refs from the remote without merging.
func (r *Repository) Fetch(remote string, auth transport.AuthMethod) error {
	rem, err := r.inner.Remote(remote)
	if err != nil {
		return fmt.Errorf("remote %s: %w", remote, err)
	}
	return rem.Fetch(&git.FetchOptions{
		RemoteName: remote,
		Auth:       auth,
	})
}

// HEAD returns the current HEAD commit hash.
func (r *Repository) HEAD() (plumbing.Hash, error) {
	ref, err := r.inner.Head()
	if err != nil {
		return plumbing.ZeroHash, fmt.Errorf("head: %w", err)
	}
	return ref.Hash(), nil
}

// Tags returns all tags in the repository.
func (r *Repository) Tags() ([]string, error) {
	iter, err := r.inner.Tags()
	if err != nil {
		return nil, fmt.Errorf("tags: %w", err)
	}
	var result []string
	if err := iter.ForEach(func(ref *plumbing.Reference) error {
		result = append(result, ref.Name().Short())
		return nil
	}); err != nil {
		return nil, err
	}
	return result, nil
}

// CreateTag creates a lightweight tag at the given commit hash.
// If commitHash is zero, tags HEAD.
func (r *Repository) CreateTag(name string, commitHash plumbing.Hash) error {
	if commitHash.IsZero() {
		hash, err := r.HEAD()
		if err != nil {
			return err
		}
		commitHash = hash
	}
	ref := plumbing.NewHashReference(plumbing.ReferenceName("refs/tags/"+name), commitHash)
	return r.inner.Storer.SetReference(ref)
}

// AddRemote adds a new remote to the repository.
func (r *Repository) AddRemote(name, url string) error {
	_, err := r.inner.CreateRemote(&config.RemoteConfig{
		Name: name,
		URLs: []string{url},
	})
	return err
}

// RemoveRemote removes a remote from the repository.
func (r *Repository) RemoveRemote(name string) error {
	return r.inner.DeleteRemote(name)
}
