package update

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
)

func (c *Checker) InstallUpdate() error {
	exePath, err := os.Executable()
	if err != nil {
		return err
	}

	newExe := filepath.Join(c.destDir, "monika.exe")
	if _, err := os.Stat(newExe); os.IsNotExist(err) {
		return fmt.Errorf("new binary not found: %s", newExe)
	}

	exeDir := filepath.Dir(exePath)

	// 1. Rename the old exe (Windows allows renaming a running exe).
	oldPath := filepath.Join(exeDir, "monika.old.exe")
	os.Remove(oldPath) // clean up leftover from previous update
	if err := os.Rename(exePath, oldPath); err != nil {
		return fmt.Errorf("rename old exe: %w", err)
	}

	// 2. Copy new exe into place.
	if err := copyFile(newExe, exePath); err != nil {
		// Rollback: rename old back
		os.Rename(oldPath, exePath)
		return fmt.Errorf("copy new exe: %w", err)
	}

	// 3. Clean up old exe on next startup via a detached cmd.
	cleanupScript := filepath.Join(exeDir, "cleanup.bat")
	script := "@echo off\r\n" +
		"ping -n 3 127.0.0.1 >nul\r\n" +
		"del /F /Q \"" + oldPath + "\" >nul 2>&1\r\n" +
		"del /F /Q \"" + filepath.Join(c.destDir, "monika.exe") + "\" >nul 2>&1\r\n" +
		"del \"%~f0\"\r\n"
	os.WriteFile(cleanupScript, []byte(script), 0700)
	exec.Command("cmd", "/c", "start", "", "/b", "cmd", "/c", cleanupScript).Start()

	// 4. Launch the new version.
	exec.Command("cmd", "/c", "start", "", exePath).Start()

	os.Exit(0)
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Close()
}
