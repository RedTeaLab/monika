package main

import "fmt"

func main() {
	fmt.Print(Usage())
}

func Usage() string {
	return `Monika

Commands:
  monika provider install <package[@version]>  Install a provider plugin
  monika provider list                         List installed provider plugins

Provider-backed agent execution is not wired yet.
`
}
