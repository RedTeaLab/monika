package agent

import "testing"

func TestPromptConstantsNotEmpty(t *testing.T) {
	constants := map[string]string{
		"PromptIdentity":         PromptIdentity,
		"PromptToolUsage":        PromptToolUsage,
		"PromptPlanning":         PromptPlanning,
		"PromptCodeQuality":      PromptCodeQuality,
		"PromptResponseStyle":    PromptResponseStyle,
		"PromptSafetyBoundaries": PromptSafetyBoundaries,
		"PromptRemember":         PromptRemember,
	}
	for name, value := range constants {
		if value == "" {
			t.Errorf("%s is empty", name)
		}
	}
}

func TestPromptTokenBudget(t *testing.T) {
	total := len(PromptIdentity) +
		len(PromptToolUsage) +
		len(PromptPlanning) +
		len(PromptCodeQuality) +
		len(PromptResponseStyle) +
		len(PromptSafetyBoundaries) +
		len(PromptRemember)

	const maxChars = 15000
	if total > maxChars {
		t.Errorf("total prompt size %d chars exceeds budget %d", total, maxChars)
	}
	t.Logf("total prompt size: %d chars (~%d estimated tokens)", total, total/4)
}
