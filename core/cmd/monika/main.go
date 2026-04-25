package main

import (
	_ "monika/engines/mcp"
	_ "monika/engines/provider"
	_ "monika/engines/skill"
)

func main() {
	Execute()
}
