package api

import (
	"fmt"
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
	return nil
}

// AddNotification stores a notification for the tray popup.
func (tm *TrayManager) AddNotification(sessionID, sessionTitle, notifType, message string) {
	tm.notifMu.Lock()

	// Dedup: if same session+type already exists, remove the old entry
	for i, n := range tm.notifications {
		if n.SessionID == sessionID && n.Type == notifType {
			tm.notifications = append(tm.notifications[:i], tm.notifications[i+1:]...)
			break
		}
	}

	n := NotificationData{
		ID:           fmt.Sprintf("notif-%d-%d", len(tm.notifications), time.Now().UnixMilli()),
		SessionID:    sessionID,
		SessionTitle: sessionTitle,
		Type:         notifType,
		Message:      message,
		Timestamp:    time.Now().UnixMilli(),
	}
	tm.notifications = append(tm.notifications, n)

	// Cap at 20 notifications (drop oldest)
	if len(tm.notifications) > 20 {
		tm.notifications = tm.notifications[len(tm.notifications)-20:]
	}

	tm.notifMu.Unlock()
	tm.emitNotificationsChanged()
}

// ClearNotifications clears all stored notifications.
func (tm *TrayManager) ClearNotifications() {
	tm.notifMu.Lock()
	tm.notifications = nil
	tm.notifMu.Unlock()
	tm.emitNotificationsChanged()
}

// GetTrayNotifications returns current notifications for the popup window.
func (tm *TrayManager) GetTrayNotifications() []NotificationData {
	tm.notifMu.Lock()
	defer tm.notifMu.Unlock()
	result := make([]NotificationData, len(tm.notifications))
	copy(result, tm.notifications)
	return result
}

func (tm *TrayManager) emitNotificationsChanged() {
	if tm.app == nil {
		return
	}
	tm.notifMu.Lock()
	data := make([]NotificationData, len(tm.notifications))
	copy(data, tm.notifications)
	tm.notifMu.Unlock()
	tm.app.Event.Emit("tray-notifications-changed", data)
}

// RemoveNotification removes a single notification by ID.
func (tm *TrayManager) RemoveNotification(notifID string) {
	tm.notifMu.Lock()
	filtered := make([]NotificationData, 0, len(tm.notifications))
	for _, n := range tm.notifications {
		if n.ID != notifID {
			filtered = append(filtered, n)
		}
	}
	tm.notifications = filtered
	tm.notifMu.Unlock()
	tm.emitNotificationsChanged()
}

// ActivateAndGetSessionID shows the main window, returns the session ID for the
// given notification, and removes the notification.
func (tm *TrayManager) ActivateAndGetSessionID(notifID string) string {
	tm.notifMu.Lock()
	var sessionID string
	for _, n := range tm.notifications {
		if n.ID == notifID {
			sessionID = n.SessionID
			break
		}
	}
	tm.notifMu.Unlock()

	if !tm.mainWindow.IsVisible() {
		wasMaximised := tm.mainWindow.IsMaximised()
		tm.mainWindow.Show()
		if wasMaximised {
			tm.mainWindow.Maximise()
		}
	}
	tm.mainWindow.Focus()

	tm.RemoveNotification(notifID)
	return sessionID
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

	// Custom left-click toggle that preserves maximised state
	tm.systemTray.OnClick(func() {
		if tm.mainWindow.IsVisible() {
			tm.mainWindow.Hide()
		} else {
			// User is opening the main window — clear all notifications
			tm.ClearNotifications()
			tm.StopBlink()

			wasMaximised := tm.mainWindow.IsMaximised()
			tm.mainWindow.Show()
			if wasMaximised {
				tm.mainWindow.Maximise()
			}
			tm.mainWindow.Focus()
		}
	})

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
	tm.notifMu.Lock()
	count := len(tm.notifications)
	tm.notifMu.Unlock()
	if count == 0 {
		return
	}
	tm.blinking = true
	tm.blinkStop = make(chan struct{})
	visible := true
	go func() {
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if visible {
					tm.systemTray.Show()
				} else {
					tm.systemTray.Hide()
				}
				visible = !visible
			case <-tm.blinkStop:
				tm.systemTray.Show()
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

	// Pause blink while popup is visible — user is already viewing messages
	tm.StopBlink()
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

	// Resume blink if there are still unread notifications
	tm.notifMu.Lock()
	hasNotifications := len(tm.notifications) > 0
	tm.notifMu.Unlock()
	if hasNotifications {
		tm.StartBlink()
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
