package host

import "testing"

func TestHandshakeConfigIsStable(t *testing.T) {
	cfg := HandshakeConfig()
	if cfg.ProtocolVersion == 0 {
		t.Fatal("protocol version must be set")
	}
	if cfg.MagicCookieKey == "" || cfg.MagicCookieValue == "" {
		t.Fatal("magic cookie must be set")
	}
}

func TestNewHostStoresPluginCommand(t *testing.T) {
	host, err := New(Options{Command: "monika-provider-test"})
	if err != nil {
		t.Fatal(err)
	}
	if host.Command() != "monika-provider-test" {
		t.Fatalf("command = %q", host.Command())
	}
}

func TestNewRejectsEmptyCommand(t *testing.T) {
	_, err := New(Options{Command: ""})
	if err == nil {
		t.Fatal("expected error for empty command")
	}
}
