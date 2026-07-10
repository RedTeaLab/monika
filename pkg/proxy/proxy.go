package proxy

import (
	"net/http"
	"net/url"
	"sync/atomic"
)

// proxyURL stores the user-configured proxy URL (e.g. "http://127.0.0.1:10808").
// Empty string means direct connection (no proxy).
var proxyURL atomic.Value // stores string

func init() {
	proxyURL.Store("")
}

// SetURL sets the global proxy URL used by all HTTP transports created via Func().
// Pass an empty string to disable proxying (direct connection).
func SetURL(u string) {
	proxyURL.Store(u)
}

// GetURL returns the currently configured proxy URL.
func GetURL() string {
	return proxyURL.Load().(string)
}

// Func returns an http.Transport Proxy function that uses the user-configured
// proxy URL. If no proxy URL is set, it falls back to http.ProxyFromEnvironment
// so that HTTP_PROXY/HTTPS_PROXY env vars still work.
func Func() func(*http.Request) (*url.URL, error) {
	return func(req *http.Request) (*url.URL, error) {
		u := proxyURL.Load().(string)
		if u != "" {
			return url.Parse(u)
		}
		return http.ProxyFromEnvironment(req)
	}
}
