package api

import (
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

type FileService struct {
	projectDir string
}

func NewFileService(projectDir string) *FileService {
	return &FileService{projectDir: projectDir}
}

type FileNode struct {
	Name     string     `json:"name"`
	Path     string     `json:"path"`
	IsDir    bool       `json:"is_dir"`
	Children []FileNode `json:"children,omitempty"`
	Status   string     `json:"status,omitempty"`
}

func (f *FileService) ReadFile(relPath string) (FileContent, error) {
	absPath := filepath.Join(f.projectDir, relPath)
	data, err := os.ReadFile(absPath)
	if err != nil {
		if os.IsNotExist(err) {
			return FileContent{Path: relPath, Exist: false}, nil
		}
		return FileContent{}, err
	}
	return FileContent{
		Path:    relPath,
		Content: string(data),
		Exist:   true,
	}, nil
}

func (f *FileService) WriteFile(relPath, content string) error {
	absPath := filepath.Join(f.projectDir, relPath)
	if err := os.MkdirAll(filepath.Dir(absPath), 0755); err != nil {
		return err
	}
	return os.WriteFile(absPath, []byte(content), 0644)
}

func (f *FileService) ListDir(relPath string) ([]FileNode, error) {
	absPath := filepath.Join(f.projectDir, relPath)
	entries, err := os.ReadDir(absPath)
	if err != nil {
		return nil, err
	}

	var nodes []FileNode
	for _, entry := range entries {
		name := entry.Name()
		if strings.HasPrefix(name, ".") || name == "node_modules" {
			continue
		}

		entryRelPath := filepath.Join(relPath, name)
		node := FileNode{
			Name:  name,
			Path:  entryRelPath,
			IsDir: entry.IsDir(),
		}

		if entry.IsDir() {
			children, err := f.ListDir(entryRelPath)
			if err != nil {
				return nil, err
			}
			node.Children = children
		}

		nodes = append(nodes, node)
	}

	sort.Slice(nodes, func(i, j int) bool {
		if nodes[i].IsDir != nodes[j].IsDir {
			return nodes[i].IsDir
		}
		return nodes[i].Name < nodes[j].Name
	})

	return nodes, nil
}

func (f *FileService) ListChanges() ([]FileChange, error) {
	cmd := exec.Command("git", "status", "--porcelain")
	cmd.Dir = f.projectDir
	out, err := cmd.Output()
	if err != nil {
		return []FileChange{}, nil
	}

	var changes []FileChange
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if len(line) < 4 {
			continue
		}
		status := strings.TrimSpace(line[0:2])
		filename := strings.TrimSpace(line[3:])

		if idx := strings.Index(filename, " -> "); idx >= 0 {
			filename = filename[idx+4:]
		}

		if status == "" || filename == "" {
			continue
		}

		changes = append(changes, FileChange{Path: filename, Status: status})
	}

	return changes, nil
}

func (f *FileService) GetDiff(filePath string) (DiffResult, error) {
	cmd := exec.Command("git", "diff", filePath)
	cmd.Dir = f.projectDir
	out, err := cmd.Output()
	if err != nil {
		return DiffResult{}, err
	}

	raw := strings.TrimSpace(string(out))
	var lines []string
	if raw != "" {
		lines = strings.Split(raw, "\n")
	}

	return DiffResult{
		FilePath: filePath,
		Lines:    lines,
	}, nil
}
