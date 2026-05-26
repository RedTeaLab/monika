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
	c.logf("InstallUpdate: exePath=%s", exePath)

	newExe := filepath.Join(c.destDir, "monika.exe")
	if _, err := os.Stat(newExe); os.IsNotExist(err) {
		return fmt.Errorf("new binary not found: %s", newExe)
	}
	c.logf("InstallUpdate: newExe=%s, size=%d", newExe, fileSize(newExe))

	exeDir := filepath.Dir(exePath)
	oldPath := filepath.Join(exeDir, "monika.old.exe")

	// 1. Remove leftover from previous update, if any.
	os.Remove(oldPath)

	// 2. Rename running exe (Windows allows rename of in-use files).
	if err := os.Rename(exePath, oldPath); err != nil {
		c.logf("InstallUpdate: rename failed: %v", err)
		return fmt.Errorf("rename old exe: %w", err)
	}
	c.logf("InstallUpdate: renamed %s -> %s", exePath, oldPath)

	// 3. Copy new exe into place.
	if err := copyFile(newExe, exePath); err != nil {
		os.Rename(oldPath, exePath) // rollback
		c.logf("InstallUpdate: copy failed: %v", err)
		return fmt.Errorf("copy new exe: %w", err)
	}
	c.logf("InstallUpdate: copied %s -> %s", newExe, exePath)

	// 4. Launch new version.
	cmd := exec.Command(exePath)
	cmd.Dir = exeDir
	if err := cmd.Start(); err != nil {
		os.Rename(oldPath, exePath) // rollback
		c.logf("InstallUpdate: start failed: %v", err)
		return fmt.Errorf("start new exe: %w", err)
	}
	c.logf("InstallUpdate: new process started, pid=%d, exiting", cmd.Process.Pid)

	// 5. Exit old process.
	os.Exit(0)
	return nil
}

func fileSize(path string) int64 {
	info, err := os.Stat(path)
	if err != nil {
		return -1
	}
	return info.Size()
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

// CleanupOld removes leftover monika.old.exe from a previous update.
func CleanupOld(exeDir string) {
	oldPath := filepath.Join(exeDir, "monika.old.exe")
	if _, err := os.Stat(oldPath); err == nil {
		os.Remove(oldPath)
	}
}
