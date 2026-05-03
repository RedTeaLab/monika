//go:build !windows

package platform

import "os/exec"

func HideWindow(_ *exec.Cmd) {}
