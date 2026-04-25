package main

import (
	"strings"
	"testing"
)

func TestUsageMentionsProviderInstall(t *testing.T) {
	usage := Usage()

	if usage == "" {
		t.Fatal("usage is empty")
	}
	if !strings.Contains(usage, "Monika") {
		t.Fatalf("usage missing header Monika: %s", usage)
	}
	if !strings.Contains(usage, "monika provider install") {
		t.Fatalf("usage missing provider install: %s", usage)
	}
	if !strings.Contains(usage, "monika provider list") {
		t.Fatalf("usage missing provider list: %s", usage)
	}
}
