package update

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"monika/internal/version"
)

type VersionInfo struct {
	Version   string `json:"version"`
	CommitSHA string `json:"commitSha"`
	BuildTime string `json:"buildTime"`
}

type UpdateInfo struct {
	CurrentVersion string `json:"currentVersion"`
	LatestVersion  string `json:"latestVersion"`
	HasUpdate      bool   `json:"hasUpdate"`
	ReleaseURL     string `json:"releaseURL"`
	DownloadURL    string `json:"downloadURL"`
	ReleaseNotes   string `json:"releaseNotes"`
	AssetSize      int64  `json:"assetSize"`
}

type UpdateStatus struct {
	State      string      `json:"state"`
	Progress   int         `json:"progress"`
	Message    string      `json:"message"`
	UpdateInfo *UpdateInfo `json:"updateInfo,omitempty"`
}

type Checker struct {
	mu      sync.RWMutex
	client  *http.Client
	status  UpdateStatus
	destDir string
	logPath string
}

func NewChecker() *Checker {
	tmpDir := filepath.Join(os.TempDir(), "monika_update")
	os.MkdirAll(tmpDir, 0700)
	return &Checker{
		client:  &http.Client{Timeout: 30 * time.Second},
		status:  UpdateStatus{State: "idle"},
		logPath: filepath.Join(tmpDir, "update.log"),
	}
}

func (c *Checker) logf(format string, args ...interface{}) {
	line := fmt.Sprintf("[%s] %s\n", time.Now().Format("15:04:05"), fmt.Sprintf(format, args...))
	f, err := os.OpenFile(c.logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err != nil {
		return
	}
	defer f.Close()
	f.WriteString(line)
}

func (c *Checker) GetVersion() VersionInfo {
	return VersionInfo{
		Version:   version.Version,
		CommitSHA: version.CommitSHA,
		BuildTime: version.BuildTime,
	}
}

func (c *Checker) Status() UpdateStatus {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.status
}

func (c *Checker) setStatus(s UpdateStatus) {
	c.mu.Lock()
	c.status = s
	c.mu.Unlock()
}

// AutoCheck checks for updates if the cooldown period has passed.
// onAvailable is called when an update is available (may be nil).
func (c *Checker) AutoCheck(ctx context.Context, onAvailable func(*UpdateInfo)) {
	if !c.shouldCheck() {
		c.logf("AutoCheck: skipped, cooldown not expired")
		return
	}

	c.logf("AutoCheck: checking for updates...")
	info, err := c.CheckForUpdate(ctx)
	if err != nil {
		c.logf("AutoCheck: error: %v", err)
		return
	}
	c.recordCheck()

	if info.HasUpdate && onAvailable != nil {
		c.logf("AutoCheck: update available, notifying frontend")
		onAvailable(info)
	}
}

func (c *Checker) cooldownPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".monika", ".update_check")
}

func (c *Checker) shouldCheck() bool {
	path := c.cooldownPath()
	if path == "" {
		return true
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return true // file doesn't exist, should check
	}
	ts, err := time.Parse(time.RFC3339, strings.TrimSpace(string(data)))
	if err != nil {
		return true
	}
	return time.Since(ts) > 4*time.Hour
}

func (c *Checker) recordCheck() {
	path := c.cooldownPath()
	if path == "" {
		return
	}
	os.MkdirAll(filepath.Dir(path), 0700)
	os.WriteFile(path, []byte(time.Now().Format(time.RFC3339)), 0600)
}

type githubRelease struct {
	TagName    string        `json:"tag_name"`
	HTMLURL    string        `json:"html_url"`
	Body       string        `json:"body"`
	Prerelease bool          `json:"prerelease"`
	Draft      bool          `json:"draft"`
	Assets     []githubAsset `json:"assets"`
}

type githubAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

func (c *Checker) CheckForUpdate(ctx context.Context) (*UpdateInfo, error) {
	c.logf("CheckForUpdate: starting, current version=%s", version.Version)
	c.setStatus(UpdateStatus{State: "checking"})
	defer func() {
		c.mu.Lock()
		if c.status.State == "checking" {
			c.status.State = "idle"
		}
		c.mu.Unlock()
	}()

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest",
		version.RepoOwner, version.RepoName)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		c.setStatus(UpdateStatus{State: "error", Message: err.Error()})
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "monika-updater")
	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		c.setStatus(UpdateStatus{State: "error", Message: err.Error()})
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		c.setStatus(UpdateStatus{State: "error", Message: fmt.Sprintf("GitHub API returned %d", resp.StatusCode)})
		return nil, fmt.Errorf("github api returned %d", resp.StatusCode)
	}

	var rel githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		c.setStatus(UpdateStatus{State: "error", Message: err.Error()})
		return nil, err
	}

	current := version.Version
	latest := strings.TrimPrefix(rel.TagName, "v")
	c.logf("CheckForUpdate: current=%s, latest=%s, hasUpdate=%v", current, latest, compareVersions(latest, current) > 0)

	info := &UpdateInfo{
		CurrentVersion: current,
		LatestVersion:  latest,
		HasUpdate:      compareVersions(latest, current) > 0,
		ReleaseURL:     rel.HTMLURL,
		ReleaseNotes:   rel.Body,
	}

	assetName := platformAssetName()
	for _, a := range rel.Assets {
		if strings.EqualFold(a.Name, assetName) {
			info.DownloadURL = a.BrowserDownloadURL
			info.AssetSize = a.Size
			break
		}
	}

	if info.HasUpdate {
		c.setStatus(UpdateStatus{
			State:      "available",
			Message:    fmt.Sprintf("New version %s available", latest),
			UpdateInfo: info,
		})
	} else {
		c.setStatus(UpdateStatus{State: "idle", Message: "Up to date"})
	}

	return info, nil
}

func platformAssetName() string {
	return fmt.Sprintf("monika_%s_%s.zip", runtime.GOOS, runtime.GOARCH)
}

func compareVersions(a, b string) int {
	partsA := strings.Split(strings.TrimPrefix(a, "v"), ".")
	partsB := strings.Split(strings.TrimPrefix(b, "v"), ".")

	maxLen := len(partsA)
	if len(partsB) > maxLen {
		maxLen = len(partsB)
	}

	for i := 0; i < maxLen; i++ {
		na := 0
		nb := 0
		if i < len(partsA) {
			na, _ = strconv.Atoi(partsA[i])
		}
		if i < len(partsB) {
			nb, _ = strconv.Atoi(partsB[i])
		}
		if na > nb {
			return 1
		}
		if na < nb {
			return -1
		}
	}
	return 0
}

func (c *Checker) DownloadUpdate(ctx context.Context, downloadURL string) error {
	c.setStatus(UpdateStatus{State: "downloading", Progress: 0})

	tmpDir := filepath.Join(os.TempDir(), "monika_update")
	if err := os.MkdirAll(tmpDir, 0700); err != nil {
		c.setStatus(UpdateStatus{State: "error", Message: err.Error()})
		return err
	}
	c.destDir = tmpDir
	c.logf("DownloadUpdate: destDir=%s, url=%s", tmpDir, downloadURL)

	zipPath := filepath.Join(tmpDir, "monika_update.zip")

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
	if err != nil {
		c.setStatus(UpdateStatus{State: "error", Message: err.Error()})
		return err
	}
	req.Header.Set("User-Agent", "monika-updater")
	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	// Use a client without timeout for download — the binary can be large
	// and networks may be slow.
	dlClient := &http.Client{}
	resp, err := dlClient.Do(req)
	if err != nil {
		c.setStatus(UpdateStatus{State: "error", Message: err.Error()})
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		c.setStatus(UpdateStatus{State: "error", Message: fmt.Sprintf("download returned %d", resp.StatusCode)})
		return fmt.Errorf("download returned %d", resp.StatusCode)
	}

	out, err := os.Create(zipPath)
	if err != nil {
		c.setStatus(UpdateStatus{State: "error", Message: err.Error()})
		return err
	}
	defer out.Close()

	totalSize := resp.ContentLength
	var written int64
	buf := make([]byte, 32*1024)

	for {
		nr, readErr := resp.Body.Read(buf)
		if nr > 0 {
			nw, writeErr := out.Write(buf[:nr])
			if writeErr != nil {
				c.setStatus(UpdateStatus{State: "error", Message: writeErr.Error()})
				return writeErr
			}
			written += int64(nw)
			if totalSize > 0 {
				c.status.Progress = int(written * 100 / totalSize)
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			c.setStatus(UpdateStatus{State: "error", Message: readErr.Error()})
			return readErr
		}
	}

	c.logf("DownloadUpdate: download complete, written=%d bytes", written)

	// Extract zip.
	if err := extractZip(zipPath, tmpDir); err != nil {
		c.setStatus(UpdateStatus{State: "error", Message: err.Error()})
		return err
	}
	os.Remove(zipPath) // clean up temp zip after extraction
	c.logf("DownloadUpdate: extraction complete, files in %s:", tmpDir)
	if entries, err := os.ReadDir(tmpDir); err == nil {
		for _, e := range entries {
			c.logf("  %s", e.Name())
		}
	}
	c.logf("DownloadUpdate: ready to install")

	c.setStatus(UpdateStatus{
		State:    "downloaded",
		Progress: 100,
		Message:  "Update downloaded and ready to install",
	})

	return nil
}

func extractZip(zipPath, destDir string) error {
	if runtime.GOOS == "windows" {
		cmd := exec.Command("powershell", "-Command",
			fmt.Sprintf("Expand-Archive -Path '%s' -DestinationPath '%s' -Force", zipPath, destDir))
		output, err := cmd.CombinedOutput()
		if err != nil {
			return fmt.Errorf("unzip failed: %w: %s", err, string(output))
		}
	} else {
		cmd := exec.Command("unzip", "-o", zipPath, "-d", destDir)
		output, err := cmd.CombinedOutput()
		if err != nil {
			return fmt.Errorf("unzip failed: %w: %s", err, string(output))
		}
	}
	return nil
}
