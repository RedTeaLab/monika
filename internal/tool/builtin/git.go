package builtin

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"

	"monika/internal/tool"
	"monika/pkg/gitutil"

	"github.com/go-git/go-git/v5/plumbing"
)

type gitTool struct {
	projectDir string
}

func NewGit(projectDir string) tool.Tool {
	return &gitTool{projectDir: projectDir}
}

func (g *gitTool) Name() string { return "git" }

func (g *gitTool) Description() string {
	return "Perform git operations on the project repository. Supports status, log, diff, branch, add, commit, push, pull, fetch, and remote queries. Use this tool for version control operations."
}

func (g *gitTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"action": map[string]any{
				"type":        "string",
				"description": "The git action to perform",
				"enum":        []string{"status", "log", "diff", "current_branch", "list_branches", "create_branch", "checkout", "add", "commit", "add_and_commit", "push", "pull", "fetch", "remote_url", "list_remotes", "tags", "head"},
			},
			"args": map[string]any{
				"type":        "object",
				"description": "Arguments for the action. Varies by action.",
				"properties": map[string]any{
					"branch": map[string]any{
						"type":        "string",
						"description": "Branch name (for create_branch, checkout, push)",
					},
					"paths": map[string]any{
						"type":        "array",
						"items":       map[string]any{"type": "string"},
						"description": "File paths (for add)",
					},
					"message": map[string]any{
						"type":        "string",
						"description": "Commit message (for commit, add_and_commit)",
					},
					"author_name": map[string]any{
						"type":        "string",
						"description": "Author name for commit",
					},
					"author_email": map[string]any{
						"type":        "string",
						"description": "Author email for commit",
					},
					"remote": map[string]any{
						"type":        "string",
						"description": "Remote name (default: origin)",
					},
					"limit": map[string]any{
						"type":        "integer",
						"description": "Max number of log entries (default: 20)",
					},
					"from_hash": map[string]any{
						"type":        "string",
						"description": "Starting commit hash for log/diff",
					},
					"to_hash": map[string]any{
						"type":        "string",
						"description": "Ending commit hash for diff",
					},
				},
			},
		},
		"required": []string{"action"},
	}
}

func (g *gitTool) Execute(ctx context.Context, args json.RawMessage) (tool.ExecutionResult, error) {
	var params struct {
		Action string `json:"action"`
		Args   struct {
			Branch      string   `json:"branch"`
			Paths       []string `json:"paths"`
			Message     string   `json:"message"`
			AuthorName  string   `json:"author_name"`
			AuthorEmail string   `json:"author_email"`
			Remote      string   `json:"remote"`
			Limit       int      `json:"limit"`
			FromHash    string   `json:"from_hash"`
			ToHash      string   `json:"to_hash"`
		} `json:"args"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	projectDir := tool.ProjectDirOrDefault(ctx, g.projectDir)
	repo, err := gitutil.Open(projectDir)
	if err != nil {
		return tool.ExecutionResult{Content: fmt.Sprintf("not a git repository: %v", err), IsError: true}, nil
	}

	if params.Args.Remote == "" {
		params.Args.Remote = "origin"
	}
	if params.Args.Limit <= 0 {
		params.Args.Limit = 20
	}

	switch params.Action {
	case "status":
		return g.execStatus(repo)
	case "log":
		return g.execLog(repo, params.Args)
	case "diff":
		return g.execDiff(repo, params.Args)
	case "current_branch":
		return g.execCurrentBranch(repo)
	case "list_branches":
		return g.execListBranches(repo)
	case "create_branch":
		return g.execCreateBranch(repo, params.Args)
	case "checkout":
		return g.execCheckout(repo, params.Args)
	case "add":
		return g.execAdd(repo, params.Args)
	case "commit":
		return g.execCommit(repo, params.Args)
	case "add_and_commit":
		return g.execAddAndCommit(repo, params.Args)
	case "push":
		return tool.ExecutionResult{Content: "push requires authentication which is not available through this tool. Use bash tool with git push instead.", IsError: true}, nil
	case "pull":
		return tool.ExecutionResult{Content: "pull requires authentication which is not available through this tool. Use bash tool with git pull instead.", IsError: true}, nil
	case "fetch":
		return tool.ExecutionResult{Content: "fetch requires authentication which is not available through this tool. Use bash tool with git fetch instead.", IsError: true}, nil
	case "remote_url":
		return g.execRemoteURL(repo, params.Args)
	case "list_remotes":
		return g.execListRemotes(repo)
	case "tags":
		return g.execTags(repo)
	case "head":
		return g.execHead(repo)
	default:
		return tool.ExecutionResult{Content: fmt.Sprintf("unknown action: %s", params.Action), IsError: true}, nil
	}
}

func (g *gitTool) execStatus(repo *gitutil.Repository) (tool.ExecutionResult, error) {
	clean, err := repo.IsClean()
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	if clean {
		return tool.ExecutionResult{Content: "working tree clean"}, nil
	}
	status, err := repo.Status()
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	var lines []string
	for _, s := range status {
		lines = append(lines, fmt.Sprintf("%s%s  %s", stagingCode(byte(s.Staging)), worktreeCode(byte(s.Worktree)), s.Path))
	}
	return tool.ExecutionResult{Content: strings.Join(lines, "\n")}, nil
}

func (g *gitTool) execLog(repo *gitutil.Repository, args struct {
	Branch      string   `json:"branch"`
	Paths       []string `json:"paths"`
	Message     string   `json:"message"`
	AuthorName  string   `json:"author_name"`
	AuthorEmail string   `json:"author_email"`
	Remote      string   `json:"remote"`
	Limit       int      `json:"limit"`
	FromHash    string   `json:"from_hash"`
	ToHash      string   `json:"to_hash"`
}) (tool.ExecutionResult, error) {
	var commits []gitutil.CommitInfo
	var err error
	if args.FromHash != "" {
		commits, err = repo.LogFrom(plumbing.NewHash(args.FromHash), args.Limit)
	} else {
		commits, err = repo.Log(args.Limit)
	}
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	var lines []string
	for _, c := range commits {
		short := c.Hash.String()[:7]
		lines = append(lines, fmt.Sprintf("%s %s <%s> %s\n  %s",
			short, c.Author, c.Email,
			c.Timestamp.Format("2006-01-02 15:04:05"),
			strings.SplitN(c.Message, "\n", 2)[0],
		))
	}
	return tool.ExecutionResult{Content: strings.Join(lines, "\n\n")}, nil
}

func (g *gitTool) execDiff(repo *gitutil.Repository, args struct {
	Branch      string   `json:"branch"`
	Paths       []string `json:"paths"`
	Message     string   `json:"message"`
	AuthorName  string   `json:"author_name"`
	AuthorEmail string   `json:"author_email"`
	Remote      string   `json:"remote"`
	Limit       int      `json:"limit"`
	FromHash    string   `json:"from_hash"`
	ToHash      string   `json:"to_hash"`
}) (tool.ExecutionResult, error) {
	from := plumbing.ZeroHash
	to := plumbing.ZeroHash
	if args.FromHash != "" {
		from = plumbing.NewHash(args.FromHash)
	}
	if args.ToHash != "" {
		to = plumbing.NewHash(args.ToHash)
	}
	diff, err := repo.Diff(from, to)
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	if diff == "" {
		return tool.ExecutionResult{Content: "no differences"}, nil
	}
	return tool.ExecutionResult{Content: diff}, nil
}

func (g *gitTool) execCurrentBranch(repo *gitutil.Repository) (tool.ExecutionResult, error) {
	branch, err := repo.CurrentBranch()
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	return tool.ExecutionResult{Content: branch}, nil
}

func (g *gitTool) execListBranches(repo *gitutil.Repository) (tool.ExecutionResult, error) {
	branches, err := repo.ListBranches()
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	var lines []string
	for _, b := range branches {
		line := b.Name
		if b.Remote != "" {
			line += fmt.Sprintf(" [%s/%s]", b.Remote, b.Merge)
		}
		lines = append(lines, line)
	}
	return tool.ExecutionResult{Content: strings.Join(lines, "\n")}, nil
}

func (g *gitTool) execCreateBranch(repo *gitutil.Repository, args struct {
	Branch      string   `json:"branch"`
	Paths       []string `json:"paths"`
	Message     string   `json:"message"`
	AuthorName  string   `json:"author_name"`
	AuthorEmail string   `json:"author_email"`
	Remote      string   `json:"remote"`
	Limit       int      `json:"limit"`
	FromHash    string   `json:"from_hash"`
	ToHash      string   `json:"to_hash"`
}) (tool.ExecutionResult, error) {
	if args.Branch == "" {
		return tool.ExecutionResult{Content: "branch name is required", IsError: true}, nil
	}
	if err := repo.CreateBranch(args.Branch); err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	return tool.ExecutionResult{Content: fmt.Sprintf("created branch: %s", args.Branch)}, nil
}

func (g *gitTool) execCheckout(repo *gitutil.Repository, args struct {
	Branch      string   `json:"branch"`
	Paths       []string `json:"paths"`
	Message     string   `json:"message"`
	AuthorName  string   `json:"author_name"`
	AuthorEmail string   `json:"author_email"`
	Remote      string   `json:"remote"`
	Limit       int      `json:"limit"`
	FromHash    string   `json:"from_hash"`
	ToHash      string   `json:"to_hash"`
}) (tool.ExecutionResult, error) {
	if args.Branch == "" {
		return tool.ExecutionResult{Content: "branch name is required", IsError: true}, nil
	}
	if err := repo.Checkout(args.Branch); err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	return tool.ExecutionResult{Content: fmt.Sprintf("switched to branch: %s", args.Branch)}, nil
}

func (g *gitTool) execAdd(repo *gitutil.Repository, args struct {
	Branch      string   `json:"branch"`
	Paths       []string `json:"paths"`
	Message     string   `json:"message"`
	AuthorName  string   `json:"author_name"`
	AuthorEmail string   `json:"author_email"`
	Remote      string   `json:"remote"`
	Limit       int      `json:"limit"`
	FromHash    string   `json:"from_hash"`
	ToHash      string   `json:"to_hash"`
}) (tool.ExecutionResult, error) {
	paths := args.Paths
	if len(paths) == 0 {
		paths = []string{"."}
	}
	// Convert to relative paths for go-git
	relPaths := make([]string, 0, len(paths))
	for _, p := range paths {
		rel, err := filepath.Rel(g.projectDir, p)
		if err != nil {
			relPaths = append(relPaths, p)
			continue
		}
		relPaths = append(relPaths, rel)
	}
	if err := repo.Add(relPaths...); err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	return tool.ExecutionResult{Content: fmt.Sprintf("staged: %s", strings.Join(relPaths, ", "))}, nil
}

func (g *gitTool) execCommit(repo *gitutil.Repository, args struct {
	Branch      string   `json:"branch"`
	Paths       []string `json:"paths"`
	Message     string   `json:"message"`
	AuthorName  string   `json:"author_name"`
	AuthorEmail string   `json:"author_email"`
	Remote      string   `json:"remote"`
	Limit       int      `json:"limit"`
	FromHash    string   `json:"from_hash"`
	ToHash      string   `json:"to_hash"`
}) (tool.ExecutionResult, error) {
	if args.Message == "" {
		return tool.ExecutionResult{Content: "commit message is required", IsError: true}, nil
	}
	author := gitutil.CommitAuthor{
		Name:  args.AuthorName,
		Email: args.AuthorEmail,
	}
	if author.Name == "" {
		author.Name = "Monika"
	}
	if author.Email == "" {
		author.Email = "monika@monika.dev"
	}
	hash, err := repo.Commit(args.Message, author)
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	return tool.ExecutionResult{Content: fmt.Sprintf("committed %s: %s", hash[:7], args.Message)}, nil
}

func (g *gitTool) execAddAndCommit(repo *gitutil.Repository, args struct {
	Branch      string   `json:"branch"`
	Paths       []string `json:"paths"`
	Message     string   `json:"message"`
	AuthorName  string   `json:"author_name"`
	AuthorEmail string   `json:"author_email"`
	Remote      string   `json:"remote"`
	Limit       int      `json:"limit"`
	FromHash    string   `json:"from_hash"`
	ToHash      string   `json:"to_hash"`
}) (tool.ExecutionResult, error) {
	if args.Message == "" {
		return tool.ExecutionResult{Content: "commit message is required", IsError: true}, nil
	}
	author := gitutil.CommitAuthor{
		Name:  args.AuthorName,
		Email: args.AuthorEmail,
	}
	if author.Name == "" {
		author.Name = "Monika"
	}
	if author.Email == "" {
		author.Email = "monika@monika.dev"
	}
	hash, err := repo.AddAndCommit(args.Message, author)
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	return tool.ExecutionResult{Content: fmt.Sprintf("committed %s: %s", hash[:7], args.Message)}, nil
}

func (g *gitTool) execRemoteURL(repo *gitutil.Repository, args struct {
	Branch      string   `json:"branch"`
	Paths       []string `json:"paths"`
	Message     string   `json:"message"`
	AuthorName  string   `json:"author_name"`
	AuthorEmail string   `json:"author_email"`
	Remote      string   `json:"remote"`
	Limit       int      `json:"limit"`
	FromHash    string   `json:"from_hash"`
	ToHash      string   `json:"to_hash"`
}) (tool.ExecutionResult, error) {
	url, err := repo.RemoteURL(args.Remote)
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	return tool.ExecutionResult{Content: url}, nil
}

func (g *gitTool) execListRemotes(repo *gitutil.Repository) (tool.ExecutionResult, error) {
	remotes, err := repo.ListRemotes()
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	var lines []string
	for _, r := range remotes {
		lines = append(lines, fmt.Sprintf("%s\t%s", r.Name, strings.Join(r.URLs, ", ")))
	}
	return tool.ExecutionResult{Content: strings.Join(lines, "\n")}, nil
}

func (g *gitTool) execTags(repo *gitutil.Repository) (tool.ExecutionResult, error) {
	tags, err := repo.Tags()
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	if len(tags) == 0 {
		return tool.ExecutionResult{Content: "no tags"}, nil
	}
	return tool.ExecutionResult{Content: strings.Join(tags, "\n")}, nil
}

func (g *gitTool) execHead(repo *gitutil.Repository) (tool.ExecutionResult, error) {
	hash, err := repo.HEAD()
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	return tool.ExecutionResult{Content: hash.String()}, nil
}

func stagingCode(c byte) string {
	switch c {
	case ' ':
		return " "
	case 'M':
		return "M"
	case 'A':
		return "A"
	case 'D':
		return "D"
	case 'R':
		return "R"
	case 'C':
		return "C"
	case '?':
		return "?"
	case '!':
		return "!"
	default:
		return string(rune(c))
	}
}

func worktreeCode(c byte) string {
	return stagingCode(c)
}
