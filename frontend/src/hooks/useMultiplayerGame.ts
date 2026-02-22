/**
 * useMultiplayerGame Hook
 *
 * Manages multiplayer game state including:
 * - Online users
 * - Spotlight state
 * - Typing indicators
 * - Message sending
 * - WebSocket connection
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { OnlineUser, ChatMessage, SpotlightState, MessageVisibility, TypingIndicator as TypingIndicatorType } from '../types/multiplayer';

interface UseMultiplayerGameOptions {
  sessionId: string;
  currentUserId: string;
  currentUserRole: 'keeper' | 'player';
  wsUrl?: string;
}

interface UseMultiplayerGameReturn {
  onlineUsers: OnlineUser[];
  messages: ChatMessage[];
  spotlight: SpotlightState;
  typingIndicators: TypingIndicatorType[];
  isConnected: boolean;
  sendMessage: (content: string, visibility: MessageVisibility['level']) => void;
  requestSpotlight: () => void;
  releaseSpotlight: () => void;
}

export const useMultiplayerGame = (options: UseMultiplayerGameOptions): UseMultiplayerGameReturn => {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [spotlight, setSpotlight] = useState<SpotlightState>({ state: 'idle', queue: [] });
  const [typingIndicators, setTypingIndicators] = useState<TypingIndicatorType[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  // Connect to WebSocket
  useEffect(() => {
    if (!options.wsUrl) {
      return;
    }

    const ws = new WebSocket(`${options.wsUrl}?session_id=${options.sessionId}`);

    ws.onopen = () => {
      setIsConnected(true);
      console.log('Connected to multiplayer game');
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('Disconnected from multiplayer game');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'presence:update':
          setOnlineUsers(data.online_users);
          break;

        case 'spotlight:updated':
          setSpotlight(data.spotlight);
          break;

        case 'game:message':
          setMessages((prev) => [...prev, data.message]);
          break;

        case 'user:typing':
          setTypingIndicators((prev) => {
            const existing = prev.findIndex((t) => t.user_id === data.user_id);
            if (data.is_typing && existing === -1) {
              return [...prev, data];
            } else if (!data.is_typing && existing !== -1) {
              return prev.filter((t) => t.user_id !== data.user_id);
            }
            return prev;
          });
          break;

        default:
          console.log('Unknown message type:', data.type);
      }
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, [options.sessionId, options.wsUrl]);

  // Send message
  const sendMessage = useCallback((content: string, visibility: MessageVisibility['level']) => {
    if (!wsRef.current || !isConnected) {
      console.error('WebSocket not connected');
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'game:message',
      content,
      visibility,
      session_id: options.sessionId,
      user_id: options.currentUserId,
    }));
  }, [isConnected, options.sessionId, options.currentUserId]);

  // Request spotlight
  const requestSpotlight = useCallback(() => {
    if (!wsRef.current || !isConnected) {
      console.error('WebSocket not connected');
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'spotlight:request',
      session_id: options.sessionId,
      user_id: options.currentUserId,
    }));
  }, [isConnected, options.sessionId, options.currentUserId]);

  // Release spotlight
  const releaseSpotlight = useCallback(() => {
    if (!wsRef.current || !isConnected) {
      console.error('WebSocket not connected');
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'spotlight:release',
      session_id: options.sessionId,
      user_id: options.currentUserId,
    }));
  }, [isConnected, options.sessionId, options.currentUserId]);

  // Handle typing indicators
  const handleTypingStart = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (!wsRef.current || !isConnected) {
      return;
    }

    // Send typing start
    wsRef.current.send(JSON.stringify({
      type: 'typing:start',
      session_id: options.sessionId,
      user_id: options.currentUserId,
    }));

    // Auto-stop after 3 seconds
    typingTimeoutRef.current = setTimeout(() => {
      handleTypingStop();
    }, 3000);
  }, [isConnected, options.sessionId, options.currentUserId]);

  const handleTypingStop = useCallback(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (!wsRef.current || !isConnected) {
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'typing:stop',
      session_id: options.sessionId,
      user_id: options.currentUserId,
    }));
  }, [isConnected, options.sessionId, options.currentUserId]);

  return {
    onlineUsers,
    messages,
    spotlight,
    typingIndicators,
    isConnected,
    sendMessage,
    requestSpotlight,
    releaseSpotlight,
  };
};
