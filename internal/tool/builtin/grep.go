package builtin

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"sync/atomic"

	"monika/internal/tool"
)

// Directories always skipped regardless of .gitignore.
// Hidden directories (starting with '.') are skipped separately in the walk.
var alwaysSkipDirs = map[string]bool{}

// Fallback directories skipped when no .gitignore exists in the project.
// Only non-hidden entries needed here; hidden ones are already filtered by name.
var fallbackSkipDirs = map[string]bool{
	"node_modules": true, "vendor": true,
	"__pycache__": true,
	"dist": true, "build": true, "target": true,
	"coverage": true,
	"bin": true, "obj": true,
	"tmp": true,
}

// Binary file extensions that should never be grepped.
var binaryExts = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".ico": true,
	".svg": true, ".webp": true, ".bmp": true, ".tiff": true,
	".mp3": true, ".mp4": true, ".mov": true, ".avi": true, ".mkv": true,
	".webm": true, ".wav": true, ".ogg": true, ".flac": true,
	".zip": true, ".tar": true, ".gz": true, ".bz2": true, ".xz": true,
	".7z": true, ".rar": true, ".zst": true,
	".exe": true, ".dll": true, ".so": true, ".dylib": true, ".wasm": true,
	".pdf": true, ".doc": true, ".docx": true, ".xls": true, ".xlsx": true,
	".ppt": true, ".pptx": true,
	".ttf": true, ".otf": true, ".woff": true, ".woff2": true,
	".eot": true, ".map": true,
	".class": true, ".pyc": true, ".pyo": true,
	".o": true, ".a": true, ".lib": true,
	".syso": true,
}

const maxWalkFiles = 5000
const maxResults = 200

type grepTool struct {
	projectDir string
}

func NewGrep(projectDir string) tool.Tool {
	return &grepTool{projectDir: projectDir}
}

func (g *grepTool) Name() string { return "grep" }
func (g *grepTool) Description() string {
	return "Search file contents using regular expressions. Returns file path, line number, and matching line content. Filter by file pattern using the include parameter. Capped at 200 results."
}

func (g *grepTool) Parameters() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"pattern": map[string]any{
				"type":        "string",
				"description": "The regex pattern to search for in file contents",
			},
			"path": map[string]any{
				"type":        "string",
				"description": "The directory to search in. Defaults to the project directory.",
			},
			"include": map[string]any{
				"type":        "string",
				"description": "File pattern to include in the search (e.g. \"*.go\", \"*.{ts,tsx}\")",
			},
		},
		"required": []string{"pattern"},
	}
}

type fileEntry struct {
	absPath string
	relPath string
}

func (g *grepTool) Execute(ctx context.Context, args json.RawMessage) (tool.ExecutionResult, error) {
	var params struct {
		Pattern string `json:"pattern"`
		Path    string `json:"path"`
		Include string `json:"include"`
	}
	if err := json.Unmarshal(args, &params); err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}

	re, err := regexp.Compile(params.Pattern)
	if err != nil {
		return tool.ExecutionResult{Content: fmt.Sprintf("invalid regex: %s", err), IsError: true}, nil
	}

	absProject, err := filepath.Abs(tool.ProjectDirOrDefault(ctx, g.projectDir))
	if err != nil {
		return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
	}
	if real, err := filepath.EvalSymlinks(absProject); err == nil {
		absProject = real
	}

	searchDir := absProject
	if params.Path != "" {
		if !filepath.IsAbs(params.Path) {
			return tool.ExecutionResult{Content: "path must be absolute", IsError: true}, nil
		}
		searchDir, err = filepath.Abs(params.Path)
		if err != nil {
			return tool.ExecutionResult{Content: err.Error(), IsError: true}, nil
		}
		if real, err := filepath.EvalSymlinks(searchDir); err == nil {
			searchDir = real
		}
	}

	rel, err := filepath.Rel(absProject, searchDir)
	if err != nil || strings.HasPrefix(rel, "..") {
		return tool.ExecutionResult{Content: "path is outside project directory", IsError: true}, nil
	}

	var includeRe *regexp.Regexp
	if params.Include != "" {
		pattern := globToRegex(params.Include)
		includeRe, err = regexp.Compile(pattern)
		if err != nil {
			return tool.ExecutionResult{Content: fmt.Sprintf("invalid include pattern: %s", err), IsError: true}, nil
		}
	}

	ignore := newIgnoreMatcher(absProject)

	// Phase 1: Collect candidate files using os.ReadDir (batch readdir, no per-entry lstat).
	var files []fileEntry
	var walkErrors []string
	fileCount := 0

	var walk func(dir string, relToSearch string)
	walk = func(dir string, relToSearch string) {
		select {
		case <-ctx.Done():
			return
		default:
		}

		entries, err := os.ReadDir(dir)
		if err != nil {
			walkErrors = append(walkErrors, fmt.Sprintf("%s: %s", dir, err))
			return
		}

		for _, entry := range entries {
			select {
			case <-ctx.Done():
				return
			default:
			}

			name := entry.Name()
			if len(name) > 0 && name[0] == '.' {
				continue
			}

			absPath := filepath.Join(dir, name)
			relPath := filepath.Join(relToSearch, name)
			relToProject, _ := filepath.Rel(absProject, absPath)

			if entry.IsDir() {
				if ignore.hasRules {
					if ignore.Match(relToProject, true) {
						continue
					}
					ignore.loadNestedGitignore(absPath, toGitignorePath(relToProject))
				} else if fallbackSkipDirs[name] {
					continue
				}
				walk(absPath, relPath)
				continue
			}

			if fileCount >= maxWalkFiles {
				return
			}
			if ignore.hasRules && ignore.Match(relToProject, false) {
				continue
			}
			if binaryExts[strings.ToLower(filepath.Ext(name))] {
				continue
			}
			if includeRe != nil && !includeRe.MatchString(name) {
				continue
			}
			fileCount++
			files = append(files, fileEntry{absPath: absPath, relPath: relPath})
		}
	}

	walk(searchDir, ".")

	if len(walkErrors) > 0 && len(files) == 0 {
		return tool.ExecutionResult{
			Content: "walk errors:\n" + strings.Join(walkErrors, "\n"),
			IsError: true,
		}, nil
	}

	if len(files) == 0 {
		return tool.ExecutionResult{Content: "No matches found"}, nil
	}

	// Phase 2: Concurrent grep with worker pool.
	type grepResult struct {
		relPath string
		lines   []string
		err     error
	}

	numWorkers := runtime.NumCPU()
	if numWorkers > len(files) {
		numWorkers = len(files)
	}
	if numWorkers < 1 {
		numWorkers = 1
	}

	fileCh := make(chan fileEntry, len(files))
	resultCh := make(chan grepResult, len(files))
	var totalMatchCount int64

	var wg sync.WaitGroup
	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for fe := range fileCh {
				if atomic.LoadInt64(&totalMatchCount) >= int64(maxResults) {
					return
				}
				lines, err := grepFile(fe.absPath, re, fe.relPath)
				resultCh <- grepResult{relPath: fe.relPath, lines: lines, err: err}
			}
		}()
	}

	// Feed files and close channel.
	go func() {
		for _, fe := range files {
			fileCh <- fe
		}
		close(fileCh)
	}()

	// Close resultCh when all workers done.
	go func() {
		wg.Wait()
		close(resultCh)
	}()

	var results []string
	for gr := range resultCh {
		if gr.err != nil {
			walkErrors = append(walkErrors, fmt.Sprintf("%s: %s", gr.relPath, gr.err))
			continue
		}
		if len(gr.lines) == 0 {
			continue
		}
		for _, l := range gr.lines {
			if len(results) >= maxResults {
				break
			}
			results = append(results, l)
		}
		atomic.AddInt64(&totalMatchCount, int64(len(gr.lines)))
	}

	if len(results) == 0 {
		msg := "No matches found"
		if fileCount >= maxWalkFiles {
			msg += fmt.Sprintf(" (walked %d files before hitting limit)", fileCount)
		}
		if len(walkErrors) > 0 {
			msg += "\n\nwalk errors:\n" + strings.Join(walkErrors, "\n")
			return tool.ExecutionResult{Content: msg, IsError: true}, nil
		}
		return tool.ExecutionResult{Content: msg}, nil
	}

	// Sort by file path then line number for deterministic output.
	sort.Slice(results, func(i, j int) bool {
		return results[i] < results[j]
	})

	output := strings.Join(results, "\n")
	if fileCount >= maxWalkFiles {
		output += fmt.Sprintf("\n\nwalk truncated: reached %d file limit", maxWalkFiles)
	}
	if len(walkErrors) > 0 {
		output += "\n\nwalk errors:\n" + strings.Join(walkErrors, "\n")
	}
	return tool.ExecutionResult{Content: output}, nil
}

func grepFile(path string, re *regexp.Regexp, relPath string) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var results []string
	scanner := bufio.NewScanner(f)
	lineNum := 0
	for scanner.Scan() {
		lineNum++
		if re.MatchString(scanner.Text()) {
			results = append(results, fmt.Sprintf("%s:%d: %s", relPath, lineNum, scanner.Text()))
		}
	}
	return results, scanner.Err()
}

func globToRegex(glob string) string {
	re := regexp.QuoteMeta(glob)
	re = strings.ReplaceAll(re, `\*`, ".*")
	re = strings.ReplaceAll(re, `\{`, "(?:")
	re = strings.ReplaceAll(re, `\}`, ")")
	re = strings.ReplaceAll(re, `\,`, "|")
	return "^" + re + "$"
}
