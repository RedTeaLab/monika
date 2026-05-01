package builtin

import "monika/internal/tool"

func RegisterDefaults(r *tool.ToolRegistry, projectDir string) error {
	r.Register(NewFileRead(projectDir))
	r.Register(NewFileWrite(projectDir))
	r.Register(NewFileEdit(projectDir))
	r.Register(NewFileList(projectDir))
	r.Register(NewGlob(projectDir))
	r.Register(NewGrep(projectDir))
	sh, err := NewBash(projectDir)
	if err != nil {
		return err
	}
	r.Register(sh)
	return nil
}
