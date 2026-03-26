package tools

var TOOLS []Tool

type Tool interface {
	Name() string
	Description() string
	Parameters() map[string]any
	Execute(args ...string) string
}

func init() {
	RegisterTool(&BashTool{})
}

func RegisterTool(tool Tool) {
	TOOLS = append(TOOLS, tool)
}
