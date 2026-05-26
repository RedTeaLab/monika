//go:build !windows

package update

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func (c *Checker) InstallUpdate() error {
	exePath, err := os.Executable()
	if err != nil {
		return err
	}

	newExe := filepath.Join(c.destDir, "monika")
	if _, err := os.Stat(newExe); os.IsNotExist(err) {
		return fmt.Errorf("new binary not found: %s", newExe)
	}

	scriptPath := filepath.Join(c.destDir, "update.sh")
	script := fmt.Sprintf(`#!/bin/sh
sleep 2
cp -f "%s" "%s"
chmod +x "%s"
"%s" &
rm -f "$0"
`, newExe, exePath, exePath, exePath)

	if err := os.WriteFile(scriptPath, []byte(script), 0755); err != nil {
		return err
	}

	cmd := exec.Command("/bin/sh", scriptPath)
	if err := cmd.Start(); err != nil {
		return err
	}

	os.Exit(0)
	return nil
}
