package builtin

import "strings"

type diffEdit struct {
	op   byte // '-', '+', ' '
	text string
}

type diffHunk struct {
	oldStart, oldCount int
	newStart, newCount int
	lines              []string
}

// computeDiff produces unified diff lines from two file contents.
func computeDiff(filePath string, old, new string) []string {
	if old == new {
		return nil
	}
	oldLines := strings.Split(old, "\n")
	newLines := strings.Split(new, "\n")

	if len(oldLines) > 0 && oldLines[len(oldLines)-1] == "" {
		oldLines = oldLines[:len(oldLines)-1]
	}
	if len(newLines) > 0 && newLines[len(newLines)-1] == "" {
		newLines = newLines[:len(newLines)-1]
	}

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

	var edits []diffEdit
	i, j := m, n
	var stack []diffEdit
	for i > 0 || j > 0 {
		if i > 0 && j > 0 && oldLines[i-1] == newLines[j-1] {
			stack = append(stack, diffEdit{' ', oldLines[i-1]})
			i--
			j--
		} else if j > 0 && (i == 0 || dp[i][j-1] >= dp[i-1][j]) {
			stack = append(stack, diffEdit{'+', newLines[j-1]})
			j--
		} else {
			stack = append(stack, diffEdit{'-', oldLines[i-1]})
			i--
		}
	}
	for k := len(stack) - 1; k >= 0; k-- {
		edits = append(edits, stack[k])
	}

	const contextLines = 3

	// Find changed ranges
	changed := make([]bool, len(edits))
	for k, e := range edits {
		changed[k] = e.op != ' '
	}

	var hunks []diffHunk
	start := -1
	for k := 0; k < len(changed); k++ {
		if changed[k] && start == -1 {
			start = k
		}
		if !changed[k] && start != -1 {
			hunks = append(hunks, buildHunk(edits, start, k-1, contextLines))
			start = -1
		}
	}
	if start != -1 {
		hunks = append(hunks, buildHunk(edits, start, len(edits)-1, contextLines))
	}

	// Merge overlapping hunks
	merged := make([]diffHunk, 0, len(hunks))
	for _, h := range hunks {
		if len(merged) > 0 && h.oldStart <= merged[len(merged)-1].oldStart+merged[len(merged)-1].oldCount+contextLines*2 {
			last := &merged[len(merged)-1]
			last.lines = append(last.lines, h.lines...)
			last.oldCount += h.oldCount
			last.newCount += h.newCount
		} else {
			merged = append(merged, h)
		}
	}

	if len(merged) == 0 {
		return nil
	}

	var result []string
	result = append(result, "--- a/"+filePath)
	result = append(result, "+++ b/"+filePath)
	for _, h := range merged {
		header := "@@ -" + itoa(h.oldStart+1) + "," + itoa(h.oldCount) + " +" + itoa(h.newStart+1) + "," + itoa(h.newCount) + " @@"
		result = append(result, header)
		result = append(result, h.lines...)
	}
	return result
}

func buildHunk(edits []diffEdit, changeStart, changeEnd, ctx int) diffHunk {
	start := changeStart - ctx
	if start < 0 {
		start = 0
	}
	end := changeEnd + ctx
	if end >= len(edits) {
		end = len(edits) - 1
	}

	h := diffHunk{}
	for k := start; k <= end; k++ {
		switch edits[k].op {
		case ' ':
			h.lines = append(h.lines, " "+edits[k].text)
		case '-':
			h.lines = append(h.lines, "-"+edits[k].text)
		case '+':
			h.lines = append(h.lines, "+"+edits[k].text)
		}
	}

	for _, l := range h.lines {
		if l == "" {
			h.oldCount++
			h.newCount++
		} else {
			switch l[0] {
			case ' ', '-':
				h.oldCount++
			}
			switch l[0] {
			case ' ', '+':
				h.newCount++
			}
		}
	}

	for k := 0; k < start; k++ {
		switch edits[k].op {
		case ' ', '-':
			h.oldStart++
		}
		switch edits[k].op {
		case ' ', '+':
			h.newStart++
		}
	}
	return h
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	s := ""
	for n > 0 {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	return s
}
