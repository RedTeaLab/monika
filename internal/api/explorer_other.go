//go:build !windows

package api

import (
	"os/exec"
	"runtime"
)

func openInExplorer(absPath string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", absPath)
	default:
		cmd = exec.Command("xdg-open", absPath)
	}
	return cmd.Start()
}
