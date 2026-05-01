//go:build !windows

package builtin

import "os/exec"

func hideWindow(cmd *exec.Cmd) {}
