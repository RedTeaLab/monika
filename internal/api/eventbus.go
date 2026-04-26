package api

import (
	"context"
	"fmt"
	"os"
	"sync"
)

const eventBusBufferSize = 64

type EventBus struct {
	mu          sync.RWMutex
	subscribers map[chan StreamEvent]struct{}
	closed      bool
}

func NewEventBus() *EventBus {
	return &EventBus{
		subscribers: make(map[chan StreamEvent]struct{}),
	}
}

func (eb *EventBus) Subscribe() chan StreamEvent {
	ch := make(chan StreamEvent, eventBusBufferSize)
	eb.mu.Lock()
	eb.subscribers[ch] = struct{}{}
	eb.mu.Unlock()
	return ch
}

func (eb *EventBus) SubscribeWithContext(ctx context.Context) chan StreamEvent {
	ch := make(chan StreamEvent, eventBusBufferSize)
	eb.mu.Lock()
	eb.subscribers[ch] = struct{}{}
	eb.mu.Unlock()

	go func() {
		<-ctx.Done()
		eb.unsubscribe(ch)
	}()

	return ch
}

func (eb *EventBus) Emit(ev StreamEvent) {
	eb.mu.RLock()
	defer eb.mu.RUnlock()
	if eb.closed {
		return
	}
	for ch := range eb.subscribers {
		select {
		case ch <- ev:
		default:
		}
	}
	fmt.Fprintf(os.Stderr, "[monika] EventBus.Emit: type=%s subscribers=%d\n", ev.Type, len(eb.subscribers))
}

func (eb *EventBus) Unsubscribe(ch chan StreamEvent) {
	eb.unsubscribe(ch)
}

func (eb *EventBus) unsubscribe(ch chan StreamEvent) {
	eb.mu.Lock()
	defer eb.mu.Unlock()
	if _, ok := eb.subscribers[ch]; ok {
		delete(eb.subscribers, ch)
		close(ch)
	}
}

func (eb *EventBus) Close() {
	eb.mu.Lock()
	defer eb.mu.Unlock()
	eb.closed = true
	for ch := range eb.subscribers {
		close(ch)
		delete(eb.subscribers, ch)
	}
}
