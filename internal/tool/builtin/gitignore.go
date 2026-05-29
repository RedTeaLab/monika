package builtin

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-git/go-git/v5/plumbing/format/gitignore"
)

// ignoreMatcher reads .gitignore files and matches paths against their patterns.
// It supports nested .gitignore files discovered during directory traversal.
type ignoreMatcher struct {
	patterns []gitignore.Pattern
	hasRules bool
}

// newIgnoreMatcher creates a matcher by reading .gitignore from the project root.
// If no .gitignore exists, hasRules will be false and Match always returns false.
func newIgnoreMatcher(projectDir string) *ignoreMatcher {
	m := &ignoreMatcher{}
	m.loadFile(filepath.Join(projectDir, ".gitignore"), nil)
	return m
}

// loadFile reads a gitignore file and appends its patterns with the given domain.
func (m *ignoreMatcher) loadFile(path string, domain []string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "#") || strings.TrimSpace(line) == "" {
			continue
		}
		m.patterns = append(m.patterns, gitignore.ParsePattern(line, domain))
		m.hasRules = true
	}
}

// loadNestedGitignore reads .gitignore from the given directory.
// domain is the path from the project root to this directory (split by /).
func (m *ignoreMatcher) loadNestedGitignore(dirPath string, domain []string) {
	m.loadFile(filepath.Join(dirPath, ".gitignore"), domain)
}

// Match checks if relPath (relative to project root) should be ignored.
// isDir indicates whether the path is a directory.
func (m *ignoreMatcher) Match(relPath string, isDir bool) bool {
	if len(m.patterns) == 0 {
		return false
	}
	parts := toGitignorePath(relPath)
	for i := len(m.patterns) - 1; i >= 0; i-- {
		if result := m.patterns[i].Match(parts, isDir); result > gitignore.NoMatch {
			return result == gitignore.Exclude
		}
	}
	return false
}

// toGitignorePath normalizes a filesystem path to a slice of path elements
// suitable for the gitignore matcher (forward-slash separated).
func toGitignorePath(relPath string) []string {
	p := strings.ReplaceAll(relPath, string(filepath.Separator), "/")
	return strings.Split(p, "/")
}
