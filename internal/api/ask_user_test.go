package api

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"
)

func TestAskUserResponseRoundtrip(t *testing.T) {
	// Simulates the full ask/respond flow without Wails:
	// 1. Register a request → askUserRequests map
	// 2. Respond from another goroutine (like the frontend would)
	// 3. Verify the blocking goroutine gets the answer

	requests := make(map[string]chan AskUserResponse)
	var mu sync.Mutex

	requestID := "ask-test-1"
	ch := make(chan AskUserResponse, 1)
	mu.Lock()
	requests[requestID] = ch
	mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// Simulate frontend response after 100ms
	go func() {
		time.Sleep(100 * time.Millisecond)
		resp := AskUserResponse{RequestID: requestID, Answer: "yes indeed"}
		mu.Lock()
		if c, ok := requests[resp.RequestID]; ok {
			delete(requests, resp.RequestID)
			c <- resp
		}
		mu.Unlock()
	}()

	var answer string
	select {
	case resp := <-ch:
		answer = resp.Answer
	case <-ctx.Done():
		t.Fatal("timeout waiting for response")
	}

	if answer != "yes indeed" {
		t.Fatalf("answer = %q, want %q", answer, "yes indeed")
	}
}

func TestAskUserContextCancellation(t *testing.T) {
	requests := make(map[string]chan AskUserResponse)
	var mu sync.Mutex

	requestID := "ask-test-2"
	ch := make(chan AskUserResponse, 1)
	mu.Lock()
	requests[requestID] = ch
	mu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())

	// Cancel immediately, simulating timeout or user abort
	cancel()

	select {
	case resp := <-ch:
		t.Fatalf("unexpected response: %v", resp)
	case <-ctx.Done():
		// Expected — context cancelled
		mu.Lock()
		delete(requests, requestID)
		mu.Unlock()
	}
}

func TestAskUserJSONRoundtrip(t *testing.T) {
	// Verify AskUserResponse JSON serialize/deserialize
	resp := AskUserResponse{RequestID: "req-1", Answer: "hello world"}
	data, err := json.Marshal(resp)
	if err != nil {
		t.Fatal(err)
	}

	var parsed AskUserResponse
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed.RequestID != "req-1" || parsed.Answer != "hello world" {
		t.Fatalf("roundtrip mismatch: %+v", parsed)
	}
}

func TestAskUserEventJSONRoundtrip(t *testing.T) {
	ev := AskUserEvent{RequestID: "req-1", SessionID: "sess-1", Question: "what?"}
	data, err := json.Marshal(ev)
	if err != nil {
		t.Fatal(err)
	}

	var parsed AskUserEvent
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed.RequestID != "req-1" || parsed.SessionID != "sess-1" || parsed.Question != "what?" {
		t.Fatalf("roundtrip mismatch: %+v", parsed)
	}
}

func TestStreamEventAskUserField(t *testing.T) {
	ev := AskUserEvent{RequestID: "r1", SessionID: "s1", Question: "q"}
	se := StreamEvent{
		Type:      "ask_user",
		SessionID: "s1",
		AskUser:   &ev,
	}
	data, err := json.Marshal(se)
	if err != nil {
		t.Fatal(err)
	}

	// Verify the JSON contains the nested ask_user object
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatal(err)
	}
	askUser, ok := raw["ask_user"].(map[string]interface{})
	if !ok {
		t.Fatal("missing ask_user in serialized StreamEvent")
	}
	if askUser["question"] != "q" {
		t.Fatalf("question = %v", askUser["question"])
	}
}
