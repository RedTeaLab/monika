//go:build ignore

package main

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math"
	"os"
)

func main() {
	sizes := []int{16, 32, 48, 256}
	var pngs [][]byte

	for _, sz := range sizes {
		img := renderIcon(sz)
		var buf bytes.Buffer
		png.Encode(&buf, img)
		pngs = append(pngs, buf.Bytes())
	}

	// Write ICO containing all sizes
	var ico bytes.Buffer
	// Header
	binary.Write(&ico, binary.LittleEndian, uint16(0))   // reserved
	binary.Write(&ico, binary.LittleEndian, uint16(1))   // type = ICO
	binary.Write(&ico, binary.LittleEndian, uint16(len(pngs))) // count

	dataOffset := uint32(6 + 16*len(pngs))
	for i, sz := range sizes {
		w := uint8(sz)
		h := uint8(sz)
		if sz >= 256 {
			w = 0
			h = 0
		}
		ico.WriteByte(w) // width
		ico.WriteByte(h) // height
		ico.WriteByte(0) // color count
		ico.WriteByte(0) // reserved
		binary.Write(&ico, binary.LittleEndian, uint16(1))  // color planes
		binary.Write(&ico, binary.LittleEndian, uint16(32)) // bpp
		binary.Write(&ico, binary.LittleEndian, uint32(len(pngs[i])))
		binary.Write(&ico, binary.LittleEndian, dataOffset)
		dataOffset += uint32(len(pngs[i]))
	}

	for _, p := range pngs {
		ico.Write(p)
	}

	os.WriteFile("icon.ico", ico.Bytes(), 0644)

	// Also write individual PNGs for go-winres (it accepts PNG too)
	for i, sz := range sizes {
		if sz == 256 {
			os.WriteFile("icon.png", pngs[i], 0644)
		} else {
			name := "icon" + itoa(sz) + ".png"
			os.WriteFile(name, pngs[i], 0644)
		}
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	s := ""
	for n > 0 {
		s = string(rune('0'+n%10)) + s
		n /= 10
	}
	return s
}

func renderIcon(sz int) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, sz, sz))

	// Background: dark rounded square
	bg := color.RGBA{24, 24, 30, 255}
	draw.Draw(img, img.Bounds(), &image.Uniform{bg}, image.Point{}, draw.Src)

	// Rounded square background
	radius := float64(sz) * 0.18
	pad := float64(sz) * 0.08
	fg := color.RGBA{38, 38, 52, 255}
	fillRoundedRect(img, pad, pad, float64(sz)-pad, float64(sz)-pad, radius, fg)

	// Draw "M" letter
	strokeW := float64(sz) * 0.11
	mLeft := float64(sz) * 0.24
	mRight := float64(sz) * 0.76
	mTop := float64(sz) * 0.22
	mBot := float64(sz) * 0.78
	midY := mTop + (mBot-mTop)*0.55
	cx := float64(sz) * 0.5

	accent := color.RGBA{200, 200, 218, 255}

	// Left bar
	fillRect(img, mLeft, mTop, mLeft+strokeW, mBot, accent)
	// Right bar
	fillRect(img, mRight-strokeW, mTop, mRight, mBot, accent)

	// Left diagonal: top of left bar -> center midpoint
	drawThickLine(img, mLeft+strokeW/2, mTop, cx-strokeW*0.3, midY, strokeW, accent)
	// Right diagonal: center midpoint -> top of right bar
	drawThickLine(img, cx+strokeW*0.3, midY, mRight-strokeW/2, mTop, strokeW, accent)

	return img
}

func fillRoundedRect(img *image.RGBA, x1, y1, x2, y2, r float64, c color.Color) {
	for y := int(y1); y < int(y2); y++ {
		for x := int(x1); x < int(x2); x++ {
			fx := float64(x) + 0.5
			fy := float64(y) + 0.5
			inside := true
			corners := [][2]float64{
				{x1 + r, y1 + r},
				{x2 - r, y1 + r},
				{x1 + r, y2 - r},
				{x2 - r, y2 - r},
			}
			zones := [4][2]bool{
				{fx < x1+r, fy < y1+r},
				{fx > x2-r, fy < y1+r},
				{fx < x1+r, fy > y2-r},
				{fx > x2-r, fy > y2-r},
			}
			for i := 0; i < 4; i++ {
				if zones[i][0] && zones[i][1] {
					dx := fx - corners[i][0]
					dy := fy - corners[i][1]
					if dx*dx+dy*dy > r*r {
						inside = false
					}
					break
				}
			}
			if inside {
				img.Set(x, y, c)
			}
		}
	}
}

func fillRect(img *image.RGBA, x1, y1, x2, y2 float64, c color.Color) {
	for y := int(math.Round(y1)); y < int(math.Round(y2)); y++ {
		for x := int(math.Round(x1)); x < int(math.Round(x2)); x++ {
			img.Set(x, y, c)
		}
	}
}

func drawThickLine(img *image.RGBA, x1, y1, x2, y2, w float64, c color.Color) {
	dx := x2 - x1
	dy := y2 - y1
	length := math.Sqrt(dx*dx + dy*dy)
	if length == 0 {
		return
	}
	// perpendicular direction
	px := -dy / length * w / 2
	py := dx / length * w / 2

	// Four corners of the thick line
	pts := [][2]float64{
		{x1 + px, y1 + py},
		{x1 - px, y1 - py},
		{x2 - px, y2 - py},
		{x2 + px, y2 + py},
	}

	minY := int(math.Round(math.Min(y1, y2) - w))
	maxY := int(math.Round(math.Max(y1, y2) + w))
	minX := int(math.Round(math.Min(x1, x2) - w))
	maxX := int(math.Round(math.Max(x1, x2) + w))

	for y := minY; y <= maxY; y++ {
		for x := minX; x <= maxX; x++ {
			if pointInQuad(float64(x)+0.5, float64(y)+0.5, pts) {
				img.Set(x, y, c)
			}
		}
	}
}

func pointInQuad(px, py float64, quad [][2]float64) bool {
	n := len(quad)
	inside := false
	j := n - 1
	for i := 0; i < n; i++ {
		yi, xi := quad[i][1], quad[i][0]
		yj, xj := quad[j][1], quad[j][0]
		if ((yi > py) != (yj > py)) && (px < (xj-xi)*(py-yi)/(yj-yi)+xi) {
			inside = !inside
		}
		j = i
	}
	return inside
}
