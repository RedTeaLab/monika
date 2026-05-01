//go:build !windows

package api

import "os/exec"

func command(name string, arg ...string) *exec.Cmd {
	return exec.Command(name, arg...)
}
