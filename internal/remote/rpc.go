package remote

import (
	"encoding/json"
	"fmt"
)

// JSON-RPC 2.0 standard error codes.
const (
	ErrCodeParseError     = -32700
	ErrCodeInvalidRequest = -32600
	ErrCodeMethodNotFound = -32601
	ErrCodeInvalidParams  = -32602
	ErrCodeInternalError  = -32603
)

// RPCRequest is a JSON-RPC 2.0 request.
type RPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int64           `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// RPCResponse is a JSON-RPC 2.0 response.
type RPCResponse struct {
	JSONRPC string           `json:"jsonrpc"`
	ID      int64            `json:"id"`
	Result  *json.RawMessage `json:"result,omitempty"`
	Error   *RPCError        `json:"error,omitempty"`
}

// RPCNotification is a JSON-RPC 2.0 notification (no id field).
type RPCNotification struct {
	JSONRPC string          `json:"jsonrpc"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// RPCError represents a JSON-RPC 2.0 error.
type RPCError struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

// Error implements the error interface.
func (e *RPCError) Error() string {
	return fmt.Sprintf("rpc error %d: %s", e.Code, e.Message)
}

// NewRPCResponse creates a successful response.
func NewRPCResponse(id int64, result json.RawMessage) RPCResponse {
	return RPCResponse{
		JSONRPC: "2.0",
		ID:      id,
		Result:  &result,
	}
}

// NewRPCErrorResponse creates an error response.
func NewRPCErrorResponse(id int64, code int, message string) RPCResponse {
	return RPCResponse{
		JSONRPC: "2.0",
		ID:      id,
		Error: &RPCError{
			Code:    code,
			Message: message,
		},
	}
}

// NewRPCNotification creates a notification.
func NewRPCNotification(method string, params json.RawMessage) RPCNotification {
	return RPCNotification{
		JSONRPC: "2.0",
		Method:  method,
		Params:  params,
	}
}

// IsRequest reports whether the raw JSON is an RPC request (has "id" field).
func IsRequest(data []byte) bool {
	var m struct {
		ID *int64 `json:"id"`
	}
	json.Unmarshal(data, &m)
	return m.ID != nil
}
