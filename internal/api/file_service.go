package api

import (
	"os"
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
	// Build git status map once at top level.
	statusMap := f.gitStatusMap()

	var listDirRecursive func(relPath string) ([]FileNode, error)
	listDirRecursive = func(relPath string) ([]FileNode, error) {
		absPath := filepath.Join(f.projectDir, relPath)
		entries, err := os.ReadDir(absPath)
		if err != nil {
			return []FileNode{}, err
		}

		nodes := make([]FileNode, 0)
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

			// Populate git status from the status map.
			// git always uses forward slashes, but filepath.Join may use backslashes.
			gitPath := filepath.ToSlash(entryRelPath)
			if status, ok := statusMap[gitPath]; ok {
				node.Status = status
			}

			if entry.IsDir() {
				children, err := listDirRecursive(entryRelPath)
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

	return listDirRecursive(relPath)
}

func (f *FileService) readGitStatus() ([]FileChange, error) {
	cmd := command("git", "status", "--porcelain")
	cmd.Dir = f.projectDir
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	changes := make([]FileChange, 0)
	for _, line := range strings.Split(string(out), "\n") {
		if len(line) < 4 {
			continue
		}
		status := line[0:2]
		filename := strings.TrimSpace(line[3:])
		if idx := strings.Index(filename, " -> "); idx >= 0 {
			filename = filename[idx+4:]
		}
		if status != "" && filename != "" {
			changes = append(changes, FileChange{Path: filename, Status: status})
		}
	}
	return changes, nil
}

// gitStatusMap returns a map of file path -> git status code for the project.
func (f *FileService) gitStatusMap() map[string]string {
	changes, err := f.readGitStatus()
	if err != nil {
		return make(map[string]string)
	}
	m := make(map[string]string, len(changes))
	for _, c := range changes {
		m[c.Path] = c.Status
	}
	return m
}

func (f *FileService) ListChanges() ([]FileChange, error) {
	changes, err := f.readGitStatus()
	if err != nil {
		return []FileChange{}, nil
	}
	return changes, nil
}

func (f *FileService) GetDiff(filePath string) (DiffResult, error) {
	cmd := command("git", "diff", filePath)
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
