// Package pluginhost manages external provider plugin binaries using
// the go-plugin framework. It defines the handshake config and host
// lifecycle for monika provider plugins.
package pluginhost

import (
	"errors"

	hplugin "github.com/hashicorp/go-plugin"
)

const (
	protocolVersion  uint = 1
	magicCookieKey        = "MONIKA_PROVIDER_PLUGIN"
	magicCookieValue      = "monika-provider-v1"
)

// Host represents a managed provider plugin binary.
type Host interface {
	Command() string
}

type host struct {
	command string
}

// Options configures a new plugin host.
type Options struct {
	Command string
}

// New creates a Host for the given plugin command. An error is returned
// if the command path is empty.
func New(opts Options) (Host, error) {
	if opts.Command == "" {
		return nil, errors.New("plugin command must not be empty")
	}
	return host{command: opts.Command}, nil
}

func (h host) Command() string {
	return h.command
}

// HandshakeConfig returns the go-plugin handshake used by both the
// monika host and provider plugins to verify compatibility.
func HandshakeConfig() hplugin.HandshakeConfig {
	return hplugin.HandshakeConfig{
		ProtocolVersion:  protocolVersion,
		MagicCookieKey:   magicCookieKey,
		MagicCookieValue: magicCookieValue,
	}
}
