package install

import "testing"

func TestInferBinaryFromPackageRef(t *testing.T) {
	got := InferBinary("github.com/acme/monika-provider-openai@v0.3.1", "")
	if got != "monika-provider-openai" {
		t.Fatalf("binary = %q", got)
	}
}

func TestInferBinaryUsesOverride(t *testing.T) {
	got := InferBinary("github.com/acme/providers/cmd/deepseek@latest", "monika-provider-deepseek")
	if got != "monika-provider-deepseek" {
		t.Fatalf("binary = %q", got)
	}
}

func TestInferBinaryEmptyPackageRefWithOverride(t *testing.T) {
	got := InferBinary("", "monika-provider-foo")
	if got != "monika-provider-foo" {
		t.Fatalf("binary = %q", got)
	}
}

func TestInferBinaryEmptyBoth(t *testing.T) {
	got := InferBinary("", "")
	if got != "" {
		t.Fatalf("binary = %q", got)
	}
}

func TestPackageWithoutVersion(t *testing.T) {
	got := PackagePath("github.com/acme/monika-provider-openai@v0.3.1")
	if got != "github.com/acme/monika-provider-openai" {
		t.Fatalf("package = %q", got)
	}
}

func TestPackagePathNoAtSign(t *testing.T) {
	got := PackagePath("github.com/acme/monika-provider-openai")
	if got != "github.com/acme/monika-provider-openai" {
		t.Fatalf("package = %q", got)
	}
}

func TestPackagePathEmpty(t *testing.T) {
	got := PackagePath("")
	if got != "" {
		t.Fatalf("package = %q", got)
	}
}
