package api

import (
	"bytes"
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// NotificationData represents a single notification for the tray popup.
type NotificationData struct {
	ID           string `json:"id"`
	SessionID    string `json:"session_id"`
	SessionTitle string `json:"session_title"`
	Type         string `json:"type"`
	Message      string `json:"message"`
	Timestamp    int64  `json:"timestamp"`
}

type TrayManager struct {
	app          *application.App
	systemTray   *application.SystemTray
	mainWindow   application.Window
	popupWindow  *application.WebviewWindow

	normalIcon    []byte
	highlightIcon []byte
	iconData      []byte

	mu          sync.Mutex
	blinkStop   chan struct{}
	blinking    bool

	popupDebounce *time.Timer

	notifications []NotificationData
	notifMu       sync.Mutex
}

func NewTrayManager(app *application.App, mainWindow application.Window, iconData []byte) *TrayManager {
	return &TrayManager{
		app:        app,
		mainWindow: mainWindow,
		iconData:   iconData,
	}
}

func (tm *TrayManager) loadIcons() error {
	tm.normalIcon = tm.iconData
	tm.highlightIcon = brightenPNG(tm.iconData, 1.2)
	return nil
}

func brightenPNG(data []byte, factor float64) []byte {
	reader := bytes.NewReader(data)
	img, _, err := image.Decode(reader)
	if err != nil {
		// Return a copy so normalIcon and highlightIcon don't share the same slice
		return append([]byte{}, data...)
	}
	bounds := img.Bounds()
	bright := image.NewRGBA(bounds)
	draw.Draw(bright, bounds, img, bounds.Min, draw.Src)
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			c := bright.RGBAAt(x, y)
			c.R = clamp(float64(c.R) * factor)
			c.G = clamp(float64(c.G) * factor)
			c.B = clamp(float64(c.B) * factor)
			bright.SetRGBA(x, y, c)
		}
	}
	var buf bytes.Buffer
	_ = png.Encode(&buf, bright)
	return buf.Bytes()
}

func clamp(v float64) uint8 {
	if v > 255 {
		return 255
	}
	return uint8(v)
}

// AddNotification stores a notification for the tray popup.
func (tm *TrayManager) AddNotification(sessionID, sessionTitle, notifType, message string) {
	tm.notifMu.Lock()
	defer tm.notifMu.Unlock()
	n := NotificationData{
		ID:           fmt.Sprintf("notif-%d-%d", len(tm.notifications), time.Now().UnixMilli()),
		SessionID:    sessionID,
		SessionTitle: sessionTitle,
		Type:         notifType,
		Message:      message,
		Timestamp:    time.Now().UnixMilli(),
	}
	tm.notifications = append(tm.notifications, n)
}

// ClearNotifications clears all stored notifications.
func (tm *TrayManager) ClearNotifications() {
	tm.notifMu.Lock()
	defer tm.notifMu.Unlock()
	tm.notifications = nil
}

// GetTrayNotifications returns current notifications for the popup window.
func (tm *TrayManager) GetTrayNotifications() []NotificationData {
	tm.notifMu.Lock()
	defer tm.notifMu.Unlock()
	result := make([]NotificationData, len(tm.notifications))
	copy(result, tm.notifications)
	return result
}

func (tm *TrayManager) Init() error {
	if err := tm.loadIcons(); err != nil {
		return err
	}

	tm.systemTray = tm.app.SystemTray.New()
	tm.systemTray.SetIcon(tm.normalIcon)
	tm.systemTray.SetTooltip("Monika")

	// Right-click menu: Exit only
	menu := tm.app.Menu.New()
	menu.Add("退出").OnClick(func(c *application.Context) {
		tm.Close()
		tm.app.Quit()
	})
	tm.systemTray.SetMenu(menu)

	// Attach main window for left-click toggle
	tm.systemTray.AttachWindow(tm.mainWindow).WindowOffset(5)

	// Mouse enter -> show popup if main window is hidden
	tm.systemTray.OnMouseEnter(func() {
		if tm.mainWindow.IsVisible() {
			return
		}
		tm.mu.Lock()
		if tm.popupDebounce != nil {
			tm.popupDebounce.Stop()
			tm.popupDebounce = nil
		}
		tm.mu.Unlock()
		tm.showPopup()
	})

	// Mouse leave -> hide popup after debounce
	tm.systemTray.OnMouseLeave(func() {
		tm.mu.Lock()
		tm.popupDebounce = time.AfterFunc(300*time.Millisecond, func() {
			tm.hidePopup()
		})
		tm.mu.Unlock()
	})

	tm.systemTray.Run()
	return nil
}

func (tm *TrayManager) StartBlink() {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	if tm.blinking || tm.systemTray == nil {
		return
	}
	tm.blinking = true
	tm.blinkStop = make(chan struct{})
	normal := true
	go func() {
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if normal {
					tm.systemTray.SetIcon(tm.normalIcon)
				} else {
					tm.systemTray.SetIcon(tm.highlightIcon)
				}
				normal = !normal
			case <-tm.blinkStop:
				tm.systemTray.SetIcon(tm.normalIcon)
				return
			}
		}
	}()
}

func (tm *TrayManager) StopBlink() {
	tm.mu.Lock()
	defer tm.mu.Unlock()
	if !tm.blinking {
		return
	}
	tm.blinking = false
	close(tm.blinkStop)
}

func (tm *TrayManager) Close() {
	tm.StopBlink()
	tm.mu.Lock()
	pw := tm.popupWindow
	tm.popupWindow = nil
	tm.mu.Unlock()
	if pw != nil {
		pw.Close()
	}
	if tm.systemTray != nil {
		tm.systemTray.Destroy()
	}
}

func (tm *TrayManager) showPopup() {
	tm.mu.Lock()
	pw := tm.popupWindow
	if pw == nil {
		tm.mu.Unlock()
		tm.createPopupWindow()
		tm.mu.Lock()
		pw = tm.popupWindow
	}
	tm.mu.Unlock()
	if pw == nil {
		return
	}
	if err := tm.systemTray.PositionWindow(pw, 5); err != nil {
		return
	}
	pw.Show()
	pw.Focus()
}

func (tm *TrayManager) hidePopup() {
	tm.mu.Lock()
	if tm.popupDebounce != nil {
		tm.popupDebounce.Stop()
		tm.popupDebounce = nil
	}
	pw := tm.popupWindow
	tm.mu.Unlock()
	if pw != nil {
		pw.Hide()
	}
}

func (tm *TrayManager) HidePopup() {
	tm.hidePopup()
}

func (tm *TrayManager) createPopupWindow() {
	pw := tm.app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:       "tray-popup",
		Title:      "",
		Width:      280,
		Height:     200,
		MinWidth:   280,
		MinHeight:  150,
		MaxWidth:   280,
		MaxHeight:  400,
		Frameless:  true,
		DisableResize: true,
		Hidden:     true,
		AlwaysOnTop: true,
		HideOnFocusLost: true,
		Windows: application.WindowsWindow{
			HiddenOnTaskbar: true,
		},
		URL: "/#/tray-popup",
	})
	tm.mu.Lock()
	tm.popupWindow = pw
	tm.mu.Unlock()
}
