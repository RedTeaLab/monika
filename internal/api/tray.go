package api

import (
	"bytes"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

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
}

func NewTrayManager(app *application.App, mainWindow application.Window, iconData []byte) *TrayManager {
	return &TrayManager{
		app:       app,
		mainWindow: mainWindow,
		iconData:  iconData,
	}
}

func (tm *TrayManager) loadIcons() error {
	normalPNG, err := icoToPNG(tm.iconData)
	if err != nil {
		return err
	}
	tm.normalIcon = normalPNG
	tm.highlightIcon = brightenPNG(normalPNG, 1.2)
	return nil
}

func icoToPNG(data []byte) ([]byte, error) {
	reader := bytes.NewReader(data)
	img, _, err := image.Decode(reader)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func brightenPNG(data []byte, factor float64) []byte {
	reader := bytes.NewReader(data)
	img, _, err := image.Decode(reader)
	if err != nil {
		return data
	}
	bounds := img.Bounds()
	bright := image.NewRGBA(bounds)
	draw.Draw(bright, bounds, img, bounds.Min, draw.Src)
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			c := bright.RGBAAt(x, y)
			r := uint8(clamp(float64(c.R) * factor))
			g := uint8(clamp(float64(c.G) * factor))
			b := uint8(clamp(float64(c.B) * factor))
			bright.SetRGBA(x, y, color.RGBA{R: r, G: g, B: b, A: c.A})
		}
	}
	var buf bytes.Buffer
	_ = png.Encode(&buf, bright)
	return buf.Bytes()
}

func clamp(v float64) float64 {
	if v > 255 {
		return 255
	}
	return v
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
	tm.mu.Unlock()

	if pw == nil {
		tm.createPopupWindow()
		tm.mu.Lock()
		pw = tm.popupWindow
		tm.mu.Unlock()
	}

	if pw == nil {
		return
	}
	// Position near tray icon
	if err := tm.systemTray.PositionWindow(pw, 5); err != nil {
		return
	}
	pw.Show()
	pw.Focus()
}

func (tm *TrayManager) hidePopup() {
	tm.mu.Lock()
	pw := tm.popupWindow
	tm.mu.Unlock()
	if pw != nil {
		pw.Hide()
	}
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
