package remote

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net"
	"time"

	noise "github.com/go-i2p/go-noise"
)

const noisePattern = "Noise_XX_25519_ChaChaPoly_BLAKE2s"

// NoiseListener wraps a net.Listener with Noise Protocol encryption.
type NoiseListener struct {
	listener   net.Listener
	noiseLn    *noise.NoiseListener
	staticPriv [32]byte // our static private key
	staticPub  [32]byte // our static public key
}

// NewNoiseListener creates a new Noise listener with a generated key pair.
func NewNoiseListener(ln net.Listener, staticPriv, staticPub [32]byte) (*NoiseListener, error) {
	cfg := noise.NewListenerConfig(noisePattern)
	cfg.WithStaticKey(staticPriv[:])

	nl, err := noise.NewNoiseListener(ln, cfg)
	if err != nil {
		return nil, fmt.Errorf("create noise listener: %w", err)
	}
	return &NoiseListener{
		listener:   ln,
		noiseLn:    nl,
		staticPriv: staticPriv,
		staticPub:  staticPub,
	}, nil
}

// Accept waits for and returns the next encrypted connection.
func (nl *NoiseListener) Accept() (net.Conn, error) {
	conn, err := nl.noiseLn.Accept()
	if err != nil {
		return nil, err
	}
	return conn, nil
}

// Addr returns the listener's network address.
func (nl *NoiseListener) Addr() net.Addr {
	return nl.listener.Addr()
}

// Close closes the listener.
func (nl *NoiseListener) Close() error {
	return nl.noiseLn.Close()
}

// StaticPubKey returns the listener's static public key.
func (nl *NoiseListener) StaticPubKey() [32]byte {
	return nl.staticPub
}

// NoiseDialer dials a remote address using Noise encryption.
func NoiseDialer(addr string, remotePubKey [32]byte, handshakeTimeout time.Duration) (net.Conn, error) {
	cfg := noise.NewConnConfig(noisePattern, true) // initiator = true
	cfg.WithRemoteKey(remotePubKey[:])
	cfg.WithHandshakeTimeout(handshakeTimeout)

	conn, err := noise.DialNoiseWithHandshake("tcp", addr, cfg)
	if err != nil {
		return nil, fmt.Errorf("noise dial %s: %w", addr, err)
	}
	return conn, nil
}

// VerifyKeyFingerprint returns true if the peer's public key matches the expected fingerprint.
// The fingerprint is computed as SHA256(pubKey)[:16].
func VerifyKeyFingerprint(pubKey [32]byte, fingerprint string) bool {
	return Fingerprint(pubKey) == fingerprint
}

// HashPublicKey returns the hex-encoded SHA256 hash of a public key for logging.
func HashPublicKey(pubKey [32]byte) string {
	h := sha256.Sum256(pubKey[:])
	return hex.EncodeToString(h[:8])
}
