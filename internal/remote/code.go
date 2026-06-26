package remote

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base32"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"

	"golang.org/x/crypto/curve25519"
)

// ConnectionCode is the payload encoded in a connection code string.
type ConnectionCode struct {
	Version    int      `json:"v"`
	PublicKey  [32]byte `json:"k"`
	ListenPort int      `json:"p"`
	Endpoints  []string `json:"e"`
	CreatedAt  int64    `json:"c"`
	ExpiresIn  int64    `json:"x"` // seconds
}

// Fingerprint returns a human-readable fingerprint of the public key.
func Fingerprint(pubKey [32]byte) string {
	h := sha256.Sum256(pubKey[:])
	s := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(h[:16])
	var buf strings.Builder
	for i := 0; i < len(s); i += 4 {
		if i > 0 {
			buf.WriteByte('-')
		}
		end := i + 4
		if end > len(s) {
			end = len(s)
		}
		buf.WriteString(s[i:end])
	}
	return buf.String()
}

// GenerateConnectionCode creates a connection code string from the given parameters.
func GenerateConnectionCode(pubKey [32]byte, listenPort int, endpoints []string, ttlSeconds int64) (string, error) {
	if len(endpoints) == 0 {
		return "", fmt.Errorf("at least one endpoint is required")
	}
	if ttlSeconds <= 0 {
		ttlSeconds = 3600
	}

	cc := ConnectionCode{
		Version:    1,
		PublicKey:  pubKey,
		ListenPort: listenPort,
		Endpoints:  endpoints,
		CreatedAt:  time.Now().Unix(),
		ExpiresIn:  ttlSeconds,
	}

	data, err := json.Marshal(cc)
	if err != nil {
		return "", fmt.Errorf("marshal connection code: %w", err)
	}

	encoded := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(data)
	return formatCode(encoded), nil
}

// ParseConnectionCode parses a connection code string and validates it.
func ParseConnectionCode(code string) (*ConnectionCode, error) {
	clean := strings.ReplaceAll(strings.TrimSpace(code), "-", "")
	clean = strings.ToUpper(clean)

	if !strings.HasPrefix(clean, "MONIKA") {
		return nil, fmt.Errorf("invalid connection code: missing MONIKA prefix")
	}
	clean = strings.TrimPrefix(clean, "MONIKA")

	data, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(clean)
	if err != nil {
		return nil, fmt.Errorf("decode connection code: %w", err)
	}

	var cc ConnectionCode
	if err := json.Unmarshal(data, &cc); err != nil {
		return nil, fmt.Errorf("parse connection code: %w", err)
	}

	if cc.Version != 1 {
		return nil, fmt.Errorf("unsupported connection code version: %d", cc.Version)
	}
	if len(cc.Endpoints) == 0 {
		return nil, fmt.Errorf("connection code has no endpoints")
	}

	expiresAt := cc.CreatedAt + cc.ExpiresIn
	if time.Now().Unix() > expiresAt {
		return nil, fmt.Errorf("connection code expired at %s", time.Unix(expiresAt, 0).Local().Format(time.RFC3339))
	}

	return &cc, nil
}

func formatCode(encoded string) string {
	var buf strings.Builder
	buf.WriteString("MONIKA")
	for i := 0; i < len(encoded); i += 4 {
		buf.WriteByte('-')
		end := i + 4
		if end > len(encoded) {
			end = len(encoded)
		}
		buf.WriteString(encoded[i:end])
	}
	return buf.String()
}

// GenerateKeyPair generates a new X25519 key pair for Noise protocol use.
func GenerateKeyPair() (pubKey [32]byte, privKey [32]byte, err error) {
	if _, err := io.ReadFull(rand.Reader, privKey[:]); err != nil {
		return pubKey, privKey, fmt.Errorf("generate key: %w", err)
	}
	curve25519.ScalarBaseMult(&pubKey, &privKey)
	return pubKey, privKey, nil
}
