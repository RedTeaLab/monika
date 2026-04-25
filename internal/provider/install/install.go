// Package install provides utilities for planning and executing
// provider-plugin installations from Go module package references.
package install

import "path"

// InferBinary returns the binary name for a provider plugin, given a Go
// package reference and an optional override. If override is non-empty, it
// is returned directly. Otherwise the binary name is inferred from the
// last path segment of the package reference (with any @version stripped).
func InferBinary(packageRef, override string) string {
	if override != "" {
		return override
	}
	pkg := PackagePath(packageRef)
	if pkg == "" {
		return ""
	}
	return path.Base(pkg)
}

// PackagePath strips the @version suffix from a Go package reference.
// If no @ is present the full reference is returned unchanged.
func PackagePath(packageRef string) string {
	for i, r := range packageRef {
		if r == '@' {
			return packageRef[:i]
		}
	}
	return packageRef
}
