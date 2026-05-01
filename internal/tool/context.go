package tool

import "context"

type projectDirKeyType struct{}

var projectDirKey projectDirKeyType

// WithProjectDir returns a child context carrying the project directory.
func WithProjectDir(ctx context.Context, dir string) context.Context {
	return context.WithValue(ctx, projectDirKey, dir)
}

// ProjectDirFromContext extracts the project directory from context, or empty string.
func ProjectDirFromContext(ctx context.Context) string {
	dir, _ := ctx.Value(projectDirKey).(string)
	return dir
}

// ProjectDirOrDefault returns the project directory from context, or the fallback.
func ProjectDirOrDefault(ctx context.Context, fallback string) string {
	if dir := ProjectDirFromContext(ctx); dir != "" {
		return dir
	}
	return fallback
}
