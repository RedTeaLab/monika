package api

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
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

func (f *FileService) ListDir(relPath string, showHidden bool) ([]FileNode, error) {
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
			if !showHidden && (strings.HasPrefix(name, ".") || name == "node_modules") {
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
	// Get old version from git HEAD
	oldCmd := command("git", "show", "HEAD:"+filePath)
	oldCmd.Dir = f.projectDir
	oldOut, oldErr := oldCmd.Output()
	oldContent := ""
	if oldErr == nil {
		oldContent = string(oldOut)
	}

	// Get new version from working tree
	newContent := ""
	absPath := filepath.Join(f.projectDir, filePath)
	newData, newErr := os.ReadFile(absPath)
	if newErr == nil {
		newContent = string(newData)
	}

	// Compute unified diff from old + new (avoids git index issues)
	lines := computeUnifiedDiff(filePath, oldContent, newContent)

	return DiffResult{
		FilePath: filePath,
		Lines:    lines,
		Old:      oldContent,
		New:      newContent,
	}, nil
}

// GetInlineDiff computes diff between given oldContent and the current file.
func (f *FileService) GetInlineDiff(filePath, oldContent string) (DiffResult, error) {
	absPath := filepath.Join(f.projectDir, filePath)
	newData, err := os.ReadFile(absPath)
	newContent := ""
	if err == nil {
		newContent = string(newData)
	}

	lines := computeUnifiedDiff(filePath, oldContent, newContent)

	return DiffResult{
		FilePath: filePath,
		Lines:    lines,
		Old:      oldContent,
		New:      newContent,
	}, nil
}

// computeUnifiedDiff produces unified diff lines from two file contents.
func computeUnifiedDiff(filePath string, old, new string) []string {
	old = strings.ReplaceAll(old, "\r\n", "\n")
	new = strings.ReplaceAll(new, "\r\n", "\n")
	if old == new {
		return nil
	}
	oldLines := strings.Split(old, "\n")
	newLines := strings.Split(new, "\n")

	// Remove trailing empty line from split
	if len(oldLines) > 0 && oldLines[len(oldLines)-1] == "" {
		oldLines = oldLines[:len(oldLines)-1]
	}
	if len(newLines) > 0 && newLines[len(newLines)-1] == "" {
		newLines = newLines[:len(newLines)-1]
	}

	// Build LCS table
	m, n := len(oldLines), len(newLines)
	if m == 0 && n == 0 {
		return nil
	}

	dp := make([][]int, m+1)
	for i := range dp {
		dp[i] = make([]int, n+1)
	}
	for i := 1; i <= m; i++ {
		for j := 1; j <= n; j++ {
			if oldLines[i-1] == newLines[j-1] {
				dp[i][j] = dp[i-1][j-1] + 1
			} else if dp[i-1][j] >= dp[i][j-1] {
				dp[i][j] = dp[i-1][j]
			} else {
				dp[i][j] = dp[i][j-1]
			}
		}
	}

	// Generate hunks (simplified: single hunk covering all changes)
	type edit struct{ op byte; text string } // '-' delete, '+' add, ' ' context
	var edits []edit
	i, j := m, n
	var stack []edit
	for i > 0 || j > 0 {
		if i > 0 && j > 0 && oldLines[i-1] == newLines[j-1] {
			stack = append(stack, edit{' ', oldLines[i-1]})
			i--
			j--
		} else if j > 0 && (i == 0 || dp[i][j-1] >= dp[i-1][j]) {
			stack = append(stack, edit{'+', newLines[j-1]})
			j--
		} else {
			stack = append(stack, edit{'-', oldLines[i-1]})
			i--
		}
	}
	for k := len(stack) - 1; k >= 0; k-- {
		edits = append(edits, stack[k])
	}

	// Split into hunks: group edits with context
	const contextLines = 3
	type hunk struct {
		oldStart, oldCount int
		newStart, newCount int
		lines              []string
	}
	var hunks []hunk

	addHunk := func(start, end int) {
		if start > end {
			return
		}
		// Expand to include context
		ctxStart := start
		for ctxStart > 0 && start-ctxStart < contextLines {
			ctxStart--
		}
		ctxEnd := end
		for ctxEnd < len(edits)-1 && ctxEnd-end < contextLines {
			ctxEnd++
		}

		h := hunk{}
		for k := ctxStart; k <= ctxEnd; k++ {
			e := edits[k]
			switch e.op {
			case ' ':
				h.lines = append(h.lines, " "+e.text)
			case '-':
				h.lines = append(h.lines, "-"+e.text)
			case '+':
				h.lines = append(h.lines, "+"+e.text)
			}
		}
		// Count old/new lines in hunk
		for _, l := range h.lines {
			if l == "" || l[0] == ' ' || l[0] == '-' {
				h.oldCount++
			}
			if l == "" || l[0] == ' ' || l[0] == '+' {
				h.newCount++
			}
		}
		// Compute line numbers
		h.oldStart = 0
		h.newStart = 0
		for k := 0; k < ctxStart; k++ {
			e := edits[k]
			if e.op == ' ' || e.op == '-' {
				h.oldStart++
			}
			if e.op == ' ' || e.op == '+' {
				h.newStart++
			}
		}
		h.oldStart++ // 1-indexed
		h.newStart++
		hunks = append(hunks, h)
	}

	changedStart := -1
	for k, e := range edits {
		if e.op != ' ' {
			if changedStart < 0 {
				changedStart = k
			}
		} else {
			if changedStart >= 0 {
				// Check if gap is small enough to merge
				nextChange := -1
				for k2 := k + 1; k2 < len(edits); k2++ {
					if edits[k2].op != ' ' {
						nextChange = k2
						break
					}
				}
				if nextChange < 0 || nextChange-k > contextLines*2 {
					addHunk(changedStart, k-1)
					changedStart = -1
				}
			}
		}
	}
	if changedStart >= 0 {
		addHunk(changedStart, len(edits)-1)
	}

	// Output
	var result []string
	result = append(result, "--- a/"+filePath)
	result = append(result, "+++ b/"+filePath)
	for _, h := range hunks {
		header := fmt.Sprintf("@@ -%d,%d +%d,%d @@", h.oldStart, h.oldCount, h.newStart, h.newCount)
		result = append(result, header)
		result = append(result, h.lines...)
	}
	return result
}

func (f *FileService) ListChangeStats() ([]ChangeStat, error) {
	// Tracked changes via numstat
	cmd := command("git", "diff", "--numstat")
	cmd.Dir = f.projectDir
	out, err := cmd.Output()
	if err != nil {
		return []ChangeStat{}, nil
	}

	stats := make([]ChangeStat, 0)
	for _, line := range strings.Split(string(out), "\n") {
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 3 {
			continue
		}
		added, _ := strconv.Atoi(fields[0])
		deleted, _ := strconv.Atoi(fields[1])
		if added == 0 && deleted == 0 && fields[0] == "-" && fields[1] == "-" {
			continue
		}
		stats = append(stats, ChangeStat{
			Path:    fields[2],
			Added:   added,
			Deleted: deleted,
		})
	}

	// Untracked files via status --porcelain
	statusCmd := command("git", "status", "--porcelain")
	statusCmd.Dir = f.projectDir
	statusOut, statusErr := statusCmd.Output()
	if statusErr == nil {
		for _, line := range strings.Split(string(statusOut), "\n") {
			if len(line) < 3 {
				continue
			}
			if line[0:2] != "??" {
				continue
			}
			filename := strings.TrimSpace(line[3:])
			if idx := strings.Index(filename, " -> "); idx >= 0 {
				filename = filename[idx+4:]
			}
			if filename == "" {
				continue
			}
			// Count lines for new file
			absPath := filepath.Join(f.projectDir, filename)
			data, err := os.ReadFile(absPath)
			total := 0
			if err == nil {
				total = len(strings.Split(string(data), "\n"))
			}
			stats = append(stats, ChangeStat{
				Path:    filename,
				Added:   total,
				Deleted: 0,
			})
		}
	}

	return stats, nil
}