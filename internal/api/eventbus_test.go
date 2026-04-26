package api

import (
	"context"
	"testing"
	"time"
)

func TestEventBusSubscribe(t *testing.T) {
	bus := NewEventBus()
	ch := bus.Subscribe()

	ev := StreamEvent{Type: "text_delta", Content: "hello"}
	bus.Emit(ev)

	select {
	case received := <-ch:
		if received.Type != "text_delta" {
			t.Errorf("expected type text_delta, got %s", received.Type)
		}
		if received.Content != "hello" {
			t.Errorf("expected content hello, got %s", received.Content)
		}
	case <-time.After(100 * time.Millisecond):
		t.Errorf("expected to receive event within timeout")
	}
}

func TestEventBusMultipleSubscribers(t *testing.T) {
	bus := NewEventBus()
	ch1 := bus.Subscribe()
	ch2 := bus.Subscribe()

	ev := StreamEvent{Type: "tool_start", Content: "running"}
	bus.Emit(ev)

	for _, ch := range []<-chan StreamEvent{ch1, ch2} {
		select {
		case received := <-ch:
			if received.Type != "tool_start" {
				t.Errorf("expected type tool_start, got %s", received.Type)
			}
		case <-time.After(100 * time.Millisecond):
			t.Errorf("expected subscriber to receive event within timeout")
		}
	}
}

func TestEventBusCancelContext(t *testing.T) {
	bus := NewEventBus()
	ctx, cancel := context.WithCancel(context.Background())
	ch := bus.SubscribeWithContext(ctx)

	cancel()

	select {
	case _, ok := <-ch:
		if ok {
			t.Errorf("expected channel to be closed after context cancellation")
		}
	case <-time.After(100 * time.Millisecond):
		t.Errorf("channel not closed within timeout")
	}
}

func TestEventBusUnsubscribe(t *testing.T) {
	bus := NewEventBus()
	ch := bus.Subscribe()

	bus.Unsubscribe(ch)

	bus.Emit(StreamEvent{Type: "text_delta", Content: "hello"})

	select {
	case _, ok := <-ch:
		if ok {
			t.Errorf("expected channel to be closed after unsubscribe")
		}
	case <-time.After(100 * time.Millisecond):
		t.Errorf("channel not closed within timeout")
	}
}
