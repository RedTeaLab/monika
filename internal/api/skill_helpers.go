package api

import (
	"archive/zip"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func downloadFile(url, dest string) error {
	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, resp.Status)
	}
	f, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, resp.Body)
	return err
}

func extractZip(src, dest string) error {
	r, err := zip.OpenReader(src)
	if err != nil {
		return err
	}
	defer r.Close()
	cleanDest := filepath.Clean(dest)
	os.MkdirAll(cleanDest, 0o755)
	for _, f := range r.File {
		fpath := filepath.Join(cleanDest, f.Name)
		if !strings.HasPrefix(filepath.Clean(fpath), cleanDest+string(os.PathSeparator)) {
			continue
		}
		if f.Name == "" || strings.HasSuffix(f.Name, "/") {
			os.MkdirAll(fpath, 0o755)
			continue
		}
		if err := os.MkdirAll(filepath.Dir(fpath), 0o755); err != nil {
			return err
		}
		outFile, err := os.OpenFile(fpath, os.O_CREATE|os.O_WRONLY, f.Mode())
		if err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			outFile.Close()
			return err
		}
		_, err = io.Copy(outFile, rc)
		rc.Close()
		outFile.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

func copyDir(src, dst string) error {
	return copyDirFiltered(src, dst, nil)
}

var defaultSkillSkipNames = map[string]bool{
	".git": true, ".github": true, ".gitignore": true,
	"README.md": true, "LICENSE": true, "LICENSE.md": true,
	"CHANGELOG.md": true, ".DS_Store": true,
}

func copySkillDir(src, dst string) error {
	return copyDirFiltered(src, dst, defaultSkillSkipNames)
}

func copyDirFiltered(src, dst string, skipNames map[string]bool) error {
	os.MkdirAll(dst, 0o755)
	return filepath.WalkDir(src, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, path)
		if skipNames != nil && rel != "." && skipNames[d.Name()] && !strings.Contains(rel, string(filepath.Separator)) {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		dstPath := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(dstPath, 0o755)
		}
		return copyFile(path, dstPath)
	})
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
	_, err = io.Copy(out, in)
	return err
}
