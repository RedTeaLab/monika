package providerinstall

import "path"

func InferBinary(packageRef, override string) string {
	if override != "" {
		return override
	}
	return path.Base(PackagePath(packageRef))
}

func PackagePath(packageRef string) string {
	for i, r := range packageRef {
		if r == '@' {
			return packageRef[:i]
		}
	}
	return packageRef
}
