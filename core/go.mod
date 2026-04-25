module monika

go 1.25.5

require (
	github.com/spf13/cobra v1.10.2
	gopkg.in/yaml.v3 v3.0.1
	monika/engine v0.0.0
	monika/engines/mcp v0.0.0
	monika/engines/provider v0.0.0
	monika/engines/skill v0.0.0
)

require (
	github.com/inconshreveable/mousetrap v1.1.0 // indirect
	github.com/spf13/pflag v1.0.9 // indirect
)

replace (
	monika/engine => ../engine
	monika/engines/mcp => ../engines/mcp
	monika/engines/provider => ../engines/provider
	monika/engines/skill => ../engines/skill
)
