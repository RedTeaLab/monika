package main

import (
	_ "monika/engines/mcp"
	_ "monika/engines/provider/deepseek"
	_ "monika/engines/skill"
)

func main() {
	Execute()
}
