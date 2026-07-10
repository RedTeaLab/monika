package builtin

import "testing"

func TestMaskURL(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"user:pass", "postgres://alice:s3cr3t@dbhost:5432/mydb", "postgres://***@dbhost:5432/mydb"},
		{"user only", "https://token@api.example.com/v1", "https://***@api.example.com/v1"},
		{"no creds", "https://api.example.com/v1", "https://api.example.com/v1"},
		{"plain host", "localhost:3000", "localhost:3000"},
		{"empty", "", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := maskURL(c.in)
			if got != c.want {
				t.Errorf("maskURL(%q) = %q, want %q", c.in, got, c.want)
			}
		})
	}
}
