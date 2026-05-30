//go:build windows

package api

import (
	"os/exec"
	"path/filepath"
)

func openInExplorer(absPath string) error {
	// explorer.exe requires backslashes and the /select, argument must be a single token
	p := filepath.FromSlash(absPath)
	cmd := exec.Command("explorer.exe", "/select,"+p)
	return cmd.Start()
}
