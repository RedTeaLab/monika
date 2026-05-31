//go:build windows

package api

import (
	"os"
	"os/exec"
	"path/filepath"
	"sort"
)

func openInExplorer(absPath string) error {
	// explorer.exe requires backslashes and the /select, argument must be a single token
	p := filepath.FromSlash(absPath)
	cmd := exec.Command("explorer.exe", "/select,"+p)
	return cmd.Start()
}

// listDrives returns all available drive roots on Windows (e.g. C:\, D:\).
func listDrives() []FileNode {
	var nodes []FileNode
	for _, d := range "ABCDEFGHIJKLMNOPQRSTUVWXYZ" {
		root := string(d) + ":\\"
		_, err := os.Stat(root)
		if err == nil {
			nodes = append(nodes, FileNode{
				Name:  root,
				Path:  root,
				IsDir: true,
			})
		}
	}
	sort.Slice(nodes, func(i, j int) bool {
		return nodes[i].Name < nodes[j].Name
	})
	return nodes
}
