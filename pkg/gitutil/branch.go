package gitutil

import (
	"fmt"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/config"
	"github.com/go-git/go-git/v5/plumbing"
)

func branchRef(name string) plumbing.ReferenceName {
	return plumbing.ReferenceName("refs/heads/" + name)
}

// BranchInfo holds metadata about a branch.
type BranchInfo struct {
	Name   string
	Remote string
	Merge  string
}

// CurrentBranch returns the name of the currently checked out branch.
// Returns "HEAD" if in a detached HEAD state.
func (r *Repository) CurrentBranch() (string, error) {
	ref, err := r.inner.Head()
	if err != nil {
		return "", fmt.Errorf("head: %w", err)
	}
	if ref.Name().IsBranch() {
		return ref.Name().Short(), nil
	}
	return "HEAD", nil
}

// ListBranches returns all local branches.
func (r *Repository) ListBranches() ([]BranchInfo, error) {
	iter, err := r.inner.Branches()
	if err != nil {
		return nil, fmt.Errorf("branches: %w", err)
	}
	var result []BranchInfo
	if err := iter.ForEach(func(ref *plumbing.Reference) error {
		name := ref.Name().Short()
		info := BranchInfo{Name: name}
		if cfg, err := r.inner.Config(); err == nil {
			if bc, ok := cfg.Branches[name]; ok {
				info.Remote = bc.Remote
				if bc.Merge != "" {
					info.Merge = bc.Merge.Short()
				}
			}
		}
		result = append(result, info)
		return nil
	}); err != nil {
		return nil, err
	}
	return result, nil
}

// CreateBranch creates a new branch at the current HEAD.
func (r *Repository) CreateBranch(name string) error {
	head, err := r.inner.Head()
	if err != nil {
		return fmt.Errorf("head: %w", err)
	}
	if err := r.inner.Storer.SetReference(plumbing.NewHashReference(branchRef(name), head.Hash())); err != nil {
		return fmt.Errorf("create branch ref: %w", err)
	}
	cfg, err := r.inner.Config()
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}
	if cfg.Branches == nil {
		cfg.Branches = make(map[string]*config.Branch)
	}
	cfg.Branches[name] = &config.Branch{
		Name:   name,
		Remote: "origin",
		Merge:  branchRef(name),
	}
	return r.inner.Storer.SetConfig(cfg)
}

// Checkout switches to the specified branch.
func (r *Repository) Checkout(branch string, opts ...CheckoutOption) error {
	cfg := &checkoutConfig{}
	for _, o := range opts {
		o(cfg)
	}
	wt, err := r.inner.Worktree()
	if err != nil {
		return fmt.Errorf("worktree: %w", err)
	}
	return wt.Checkout(&git.CheckoutOptions{
		Branch: branchRef(branch),
		Force:  cfg.force,
		Create: cfg.create,
	})
}

// DeleteBranch removes a local branch.
func (r *Repository) DeleteBranch(name string) error {
	return r.inner.Storer.RemoveReference(branchRef(name))
}

type checkoutConfig struct {
	force  bool
	create bool
}

// CheckoutOption is a functional option for Checkout.
type CheckoutOption func(*checkoutConfig)

// CheckoutForce forces the checkout, discarding local changes.
func CheckoutForce() CheckoutOption {
	return func(c *checkoutConfig) { c.force = true }
}

// CheckoutCreate creates the branch before checking out.
func CheckoutCreate() CheckoutOption {
	return func(c *checkoutConfig) { c.create = true }
}

// CreateBranchAndCheckout creates a new branch and checks it out in one step.
func (r *Repository) CreateBranchAndCheckout(name string) error {
	return r.Checkout(name, CheckoutCreate())
}

// SetBranchUpstream sets the upstream (remote tracking) for a branch.
func (r *Repository) SetBranchUpstream(branch, remote, upstream string) error {
	cfg, err := r.inner.Config()
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}
	if cfg.Branches == nil {
		cfg.Branches = make(map[string]*config.Branch)
	}
	cfg.Branches[branch] = &config.Branch{
		Name:   branch,
		Remote: remote,
		Merge:  branchRef(upstream),
	}
	return r.inner.Storer.SetConfig(cfg)
}
