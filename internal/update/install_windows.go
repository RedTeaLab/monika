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
	script := fmt.Sprintf(`@echo off
:loop
tasklist /fi "IMAGENAME eq %s" 2>nul | find /i "%s" >nul 2>&1
if not errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto loop
)
move /Y "%s" "%s"
start "" "%s"
del "%%~f0"
`, filepath.Base(exePath), filepath.Base(exePath),
		newExe, exePath,
		exePath)

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
