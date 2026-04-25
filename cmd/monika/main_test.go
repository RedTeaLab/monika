package main

import "testing"

func TestUsageMentionsProviderInstall(t *testing.T) {
	usage := Usage()
	if !contains(usage, "monika provider install") {
		t.Fatalf("usage missing provider install: %s", usage)
	}
}

func contains(s, substr string) bool {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
