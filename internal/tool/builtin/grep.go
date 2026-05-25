package builtin

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"monika/internal/tool"
)

// Directories to skip during walk. Add heavy/sensitive directories here.
var skipDirs = map[string]bool{
	".git": true, "node_modules": true, "vendor": true,
	".venv": true, "venv": true, ".tox": true,
	"__pycache__": true, ".mypy_cache": true, ".pytest_cache": true,
	"dist": true, "build": true, "target": true,
	".next": true, ".nuxt": true, ".output": true,
	".cache": true, ".parcel-cache": true,
	"coverage": true, ".nyc_output": true,
	".idea": true, ".vscode": true, ".vs": true,
	"bin": true, "obj": true,
	".terraform": true, ".serverless": true,
	"tmp": true, ".tmp": true,
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

type grepTool struct {
	projectDir string
}

func NewGrep(projectDir string) tool.Tool {
	return &grepTool{projectDir: projectDir}
}

func (g *grepTool) Name() string        { return "grep" }
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

	var results []string
	var matchCount int
	var filesWalked int
	var walkErrors []string
	maxResults := 200

	filepath.Walk(searchDir, func(path string, info os.FileInfo, walkErr error) error {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		if walkErr != nil {
			walkErrors = append(walkErrors, fmt.Sprintf("%s: %s", path, walkErr))
			return nil
		}
		if info.IsDir() {
			if skipDirs[info.Name()] {
				return filepath.SkipDir
			}
			return nil
		}
		if matchCount >= maxResults {
			return filepath.SkipAll
		}
		if filesWalked >= maxWalkFiles {
			return filepath.SkipAll
		}
		if binaryExts[strings.ToLower(filepath.Ext(info.Name()))] {
			return nil
		}
		if includeRe != nil && !includeRe.MatchString(info.Name()) {
			return nil
		}

		filesWalked++
		relPath, _ := filepath.Rel(searchDir, path)
		lineMatches, err := grepFile(path, re, relPath)
		if err != nil {
			walkErrors = append(walkErrors, fmt.Sprintf("%s: %s", path, err))
			return nil
		}
		for _, m := range lineMatches {
			if matchCount >= maxResults {
				break
			}
			results = append(results, m)
			matchCount++
		}
		return nil
	})

	if len(results) == 0 {
		msg := "No matches found"
		if filesWalked >= maxWalkFiles {
			msg += fmt.Sprintf(" (walked %d files before hitting limit)", filesWalked)
		}
		if len(walkErrors) > 0 {
			msg += "\n\nwalk errors:\n" + strings.Join(walkErrors, "\n")
			return tool.ExecutionResult{Content: msg, IsError: true}, nil
		}
		return tool.ExecutionResult{Content: msg}, nil
	}
	output := strings.Join(results, "\n")
	if filesWalked >= maxWalkFiles {
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
