package pluginhost

import hplugin "github.com/hashicorp/go-plugin"

const (
	protocolVersion uint = 1
	magicCookieKey       = "MONIKA_PROVIDER_PLUGIN"
	magicCookieValue     = "monika-provider-v1"
)

type Options struct {
	Command string
}

type Host struct {
	command string
}

func New(opts Options) Host {
	return Host{command: opts.Command}
}

func (h Host) Command() string {
	return h.command
}

func HandshakeConfig() hplugin.HandshakeConfig {
	return hplugin.HandshakeConfig{
		ProtocolVersion:  protocolVersion,
		MagicCookieKey:   magicCookieKey,
		MagicCookieValue: magicCookieValue,
	}
}
