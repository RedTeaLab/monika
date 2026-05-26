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

	newExe := filepath.Join(c.destDir, "monika.exe")
	if _, err := os.Stat(newExe); os.IsNotExist(err) {
		return fmt.Errorf("new binary not found: %s", newExe)
	}

	batPath := filepath.Join(c.destDir, "update.bat")

	// Use copy+del+start to avoid cross-volume move issues.
	script := "@echo off\r\n" +
		"ping -n 3 127.0.0.1 >nul\r\n" +
		":retry\r\n" +
		"copy /Y \"" + newExe + "\" \"" + exePath + "\" >nul 2>&1\r\n" +
		"if errorlevel 1 (\r\n" +
		"    ping -n 2 127.0.0.1 >nul\r\n" +
		"    goto retry\r\n" +
		")\r\n" +
		"del /F /Q \"" + newExe + "\" >nul 2>&1\r\n" +
		"start \"\" \"" + exePath + "\"\r\n" +
		"del \"%~f0\"\r\n"

	if err := os.WriteFile(batPath, []byte(script), 0700); err != nil {
		return err
	}

	cmd := exec.Command("cmd", "/c", batPath)
	if err := cmd.Start(); err != nil {
		return err
	}

	os.Exit(0)
	return nil
}
