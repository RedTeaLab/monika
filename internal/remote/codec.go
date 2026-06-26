package remote

import (
	"encoding/binary"
	"fmt"
	"io"
)

const MaxFrameSize = 16 * 1024 * 1024 // 16MB

// ReadFrame reads a length-prefixed frame from the reader.
func ReadFrame(r io.Reader) ([]byte, error) {
	var lenBuf [4]byte
	if _, err := io.ReadFull(r, lenBuf[:]); err != nil {
		return nil, fmt.Errorf("read frame length: %w", err)
	}
	length := binary.BigEndian.Uint32(lenBuf[:])
	if length == 0 {
		return nil, fmt.Errorf("empty frame")
	}
	if length > MaxFrameSize {
		return nil, fmt.Errorf("frame too large: %d bytes (max %d)", length, MaxFrameSize)
	}
	data := make([]byte, length)
	if _, err := io.ReadFull(r, data); err != nil {
		return nil, fmt.Errorf("read frame data: %w", err)
	}
	return data, nil
}

// WriteFrame writes a length-prefixed frame to the writer.
func WriteFrame(w io.Writer, data []byte) error {
	if len(data) > MaxFrameSize {
		return fmt.Errorf("frame too large: %d bytes (max %d)", len(data), MaxFrameSize)
	}
	var lenBuf [4]byte
	binary.BigEndian.PutUint32(lenBuf[:], uint32(len(data)))
	if _, err := w.Write(lenBuf[:]); err != nil {
		return fmt.Errorf("write frame length: %w", err)
	}
	if _, err := w.Write(data); err != nil {
		return fmt.Errorf("write frame data: %w", err)
	}
	return nil
}
