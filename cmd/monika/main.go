package main

import (
	_ "monika/internal/core"
	_ "monika/internal/tools"
	"monika/internal/tui"
)

func main() {
	tui.RunSimple()
}
