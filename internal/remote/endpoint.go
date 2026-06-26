package remote

import (
	"context"
	"net"
	"sort"
	"time"

	upnp "github.com/NebulousLabs/go-upnp"
)

// UPnPMapping holds an active UPnP port mapping.
type UPnPMapping struct {
	device       *upnp.IGD
	externalIP   string
	internalPort int
	externalPort int
}

// DiscoverEndpoints collects local and optionally UPnP endpoint addresses.
func DiscoverEndpoints(listenPort int, enableUPnP bool) (endpoints []string, upnpMapping *UPnPMapping) {
	endpoints = collectLocalIPs(listenPort)

	if enableUPnP {
		if mapping := tryUPnP(listenPort); mapping != nil {
			upnpMapping = mapping
			addr := net.JoinHostPort(mapping.externalIP, itoa(mapping.externalPort))
			if !contains(endpoints, addr) {
				endpoints = append(endpoints, addr)
			}
		}
	}

	// Sort: LAN addresses first.
	sort.Slice(endpoints, func(i, j int) bool {
		return isLAN(endpoints[i]) && !isLAN(endpoints[j])
	})

	return endpoints, upnpMapping
}

func collectLocalIPs(port int) []string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil
	}
	seen := make(map[string]bool)
	var ips []string
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			default:
				continue
			}
			if ip.IsLoopback() {
				continue
			}
			// Include both IPv4 and global IPv6 addresses.
			var s string
			if ip4 := ip.To4(); ip4 != nil {
				s = net.JoinHostPort(ip4.String(), itoa(port))
			} else if ip.IsGlobalUnicast() {
				s = net.JoinHostPort(ip.String(), itoa(port))
			} else {
				continue
			}
			if !seen[s] {
				seen[s] = true
				ips = append(ips, s)
			}
		}
	}
	return ips
}

func tryUPnP(internalPort int) *UPnPMapping {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	d, err := upnp.DiscoverCtx(ctx)
	if err != nil {
		return nil
	}
	ip, err := d.ExternalIP()
	if err != nil {
		return nil
	}
	err = d.Forward(uint16(internalPort), "monika-remote")
	if err != nil {
		return nil
	}
	return &UPnPMapping{
		device:       d,
		externalIP:   ip,
		internalPort: internalPort,
		externalPort: internalPort,
	}
}

// Close releases the UPnP port mapping.
func (m *UPnPMapping) Close() error {
	if m == nil || m.device == nil {
		return nil
	}
	return m.device.Clear(uint16(m.externalPort))
}

// ExternalAddr returns the external address string.
func (m *UPnPMapping) ExternalAddr() string {
	if m == nil {
		return ""
	}
	return net.JoinHostPort(m.externalIP, itoa(m.externalPort))
}

func isLAN(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return false
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	return ip.IsPrivate()
}

func contains(slice []string, s string) bool {
	for _, item := range slice {
		if item == s {
			return true
		}
	}
	return false
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	neg := false
	if n < 0 {
		neg = true
		n = -n
	}
	for n > 0 {
		i--
		buf[i] = byte(n%10) + '0'
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
