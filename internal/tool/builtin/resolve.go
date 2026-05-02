package builtin

import (
	"fmt"
	"path/filepath"
	"strings"
)

// resolveToolPath validates that p is an absolute path inside projectDir.
func resolveToolPath(p, projectDir string) (string, error) {
	if !filepath.IsAbs(p) {
		return "", fmt.Errorf("filePath must be absolute")
	}
	absPath, err := filepath.Abs(p)
	if err != nil {
		return "", err
	}
	absProject, err := filepath.Abs(projectDir)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(absProject, absPath)
	if err != nil || strings.HasPrefix(rel, "..") {
		return "", fmt.Errorf("path %s is outside project directory", p)
	}
	return absPath, nil
}
