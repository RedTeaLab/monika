/**
 * Socket.io client service for Monika multiplayer platform.
 *
 * This module provides a wrapper around the Socket.io client with:
 * - Automatic authentication via JWT token
 * - Auto-reconnection with exponential backoff
 * - Event subscription management
 * - Message buffering while disconnected
 * - Typing indicator debouncing
 *
 * @example
 * ```ts
 * import { socketService } from '@/services/socket';
 *
 * // Connect with token
 * socketService.connect(token);
 *
 * // Join campaign
 * socketService.joinCampaign(campaignId, characterId);
 *
 * // Send message
 * socketService.sendMessage('I search the room', 'public');
 *
 * // Listen for events
 * socketService.on('game:message', (data) => console.log(data));
 *
 * // Disconnect
 * socketService.disconnect();
 * ```
 */
import { io, Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketConnectionInfo,
  GameMessageData,
  CampaignJoinData,
} from '@/types/socket';

// =============================================================================
// Configuration
// =============================================================================

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:8000';
const RECONNECTION_DELAY = 1000; // Initial delay
const RECONNECTION_DELAY_MAX = 5000; // Maximum delay
const RECONNECTION_ATTEMPTS = 10; // Maximum attempts

// =============================================================================
// Socket Service Class
// =============================================================================

class SocketService {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private connectionInfo: Partial<SocketConnectionInfo> = {};
  private eventListeners: Map<string, Set<Function>> = new Map();
  private messageBuffer: GameMessageData[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isManualDisconnect = false;
  private typingTimer: ReturnType<typeof setTimeout> | null = null;

  // -------------------------------------------------------------------------
  // Connection Management
  // -------------------------------------------------------------------------

  /**
   * Connect to Socket.io server with authentication.
   *
   * @param token - JWT authentication token
   * @param options - Optional connection settings
   */
  connect(token: string, options?: Partial<SocketConnectionInfo>): void {
    if (this.socket?.connected) {
      console.warn('[Socket] Already connected, skipping connection');
      return;
    }

    this.connectionInfo = {
      url: options?.url || SOCKET_URL,
      token,
      autoReconnect: options?.autoReconnect ?? true,
      reconnectionAttempts: options?.reconnectionAttempts || RECONNECTION_ATTEMPTS,
      reconnectionDelay: options?.reconnectionDelay || RECONNECTION_DELAY,
    };

    console.log('[Socket] Connecting to', this.connectionInfo.url);

    this.socket = io(this.connectionInfo.url, {
      path: '/socket.io',
      auth: { token },
      reconnection: this.connectionInfo.autoReconnect,
      reconnectionAttempts: this.connectionInfo.reconnectionAttempts,
      reconnectionDelay: this.connectionInfo.reconnectionDelay,
      reconnectionDelayMax: RECONNECTION_DELAY_MAX,
      timeout: 10000,
      transports: ['websocket', 'polling'],
    });

    this.setupEventHandlers();
  }

  /**
   * Disconnect from Socket.io server.
   *
   * @param manual - True if user manually disconnected (prevents auto-reconnect)
   */
  disconnect(manual = true): void {
    this.isManualDisconnect = manual;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.eventListeners.clear();
    this.messageBuffer = [];
  }

  /**
   * Force reconnection to server.
   */
  reconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
    }

    this.isManualDisconnect = false;
    this.connect(this.connectionInfo.token!);
  }

  // -------------------------------------------------------------------------
  // Event Handlers
  // -------------------------------------------------------------------------

  private setupEventHandlers(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('[Socket] Connected with ID:', this.socket?.id);

      // Send buffered messages
      this.flushMessageBuffer();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);

      // Start reconnection if not manual disconnect
      if (!this.isManualDisconnect && this.connectionInfo.autoReconnect) {
        this.scheduleReconnect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error);
    });

    this.socket.on('error', (data) => {
      console.error('[Socket] Server error:', data);
    });

    // Server events
    this.socket.on('connected', (data) => {
      console.log('[Socket] Server confirmed connection:', data);
    });

    this.socket.on('campaign:joined', (data) => {
      console.log('[Socket] Joined campaign:', data.campaign_id);
      this.emitToListeners('campaign:joined', data);
    });

    this.socket.on('member:joined', (data) => {
      console.log('[Socket] Member joined:', data.user_id);
      this.emitToListeners('member:joined', data);
    });

    this.socket.on('member:left', (data) => {
      console.log('[Socket] Member left:', data.user_id);
      this.emitToListeners('member:left', data);
    });

    this.socket.on('game:message', (data) => {
      this.emitToListeners('game:message', data);
    });

    this.socket.on('presence:update', (data) => {
      this.emitToListeners('presence:update', data);
    });

    this.socket.on('user:typing', (data) => {
      this.emitToListeners('user:typing', data);
    });

    this.socket.on('spotlight:granted', (data) => {
      console.log('[Socket] Spotlight granted to:', data.user_id);
      this.emitToListeners('spotlight:granted', data);
    });

    this.socket.on('spotlight:released', (data) => {
      console.log('[Socket] Spotlight released');
      this.emitToListeners('spotlight:released', data);
    });

    this.socket.on('spotlight:queue_updated', (data) => {
      this.emitToListeners('spotlight:queue_updated', data);
    });
  }

  // -------------------------------------------------------------------------
  // Event Subscription
  // -------------------------------------------------------------------------

  /**
   * Subscribe to a Socket.io event.
   *
   * @param event - Event name
   * @param callback - Event handler function
   */
  on<Event extends keyof ServerToClientEvents>(
    event: Event,
    callback: (data: Parameters<ServerToClientEvents[Event]>[0]) => void
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);

    // Also listen on socket
    if (this.socket) {
      this.socket.on(event, callback as any);
    }
  }

  /**
   * Unsubscribe from a Socket.io event.
   *
   * @param event - Event name
   * @param callback - Event handler function to remove
   */
  off<Event extends keyof ServerToClientEvents>(
    event: Event,
    callback?: (data: Parameters<ServerToClientEvents[Event]>[0]) => void
  ): void {
    if (callback) {
      this.eventListeners.get(event)?.delete(callback);
      if (this.socket) {
        this.socket.off(event, callback as any);
      }
    } else {
      // Remove all listeners for this event
      this.eventListeners.delete(event);
      if (this.socket) {
        this.socket.off(event);
      }
    }
  }

  private emitToListeners<Event extends keyof ServerToClientEvents>(
    event: Event,
    data: Parameters<ServerToClientEvents[Event]>[0]
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[Socket] Error in ${event} listener:`, error);
        }
      });
    }
  }

  // -------------------------------------------------------------------------
  // Campaign Management
  // -------------------------------------------------------------------------

  /**
   * Join a campaign room.
   *
   * @param campaignId - Campaign ID
   * @param characterId - Optional character ID
   */
  joinCampaign(campaignId: string, characterId?: string): void {
    if (!this.socket?.connected) {
      console.warn('[Socket] Cannot join campaign: not connected');
      return;
    }

    const data: CampaignJoinData = { campaign_id: campaignId };
    if (characterId) {
      data.character_id = characterId;
    }

    this.socket.emit('campaign:join', data);
  }

  /**
   * Leave a campaign room.
   *
   * @param campaignId - Campaign ID
   */
  leaveCampaign(campaignId: string): void {
    if (!this.socket?.connected) {
      return;
    }

    this.socket.emit('campaign:leave', { campaign_id: campaignId });
  }

  // -------------------------------------------------------------------------
  // Messaging
  // -------------------------------------------------------------------------

  /**
   * Send a game message.
   *
   * @param content - Message content
   * @param visibility - Message visibility level
   * @param visibleTo - Optional list of user IDs for private messages
   */
  sendMessage(
    content: string,
    visibility: 'public' | 'kp' | 'party' | 'private' = 'public',
    visibleTo?: string[]
  ): void {
    const data: GameMessageData = {
      content,
      visibility,
      visible_to: visibleTo,
    };

    if (!this.socket?.connected) {
      console.warn('[Socket] Cannot send message: not connected, buffering');
      this.messageBuffer.push(data);
      return;
    }

    this.socket.emit('game:message', data);
  }

  private flushMessageBuffer(): void {
    if (this.messageBuffer.length === 0) return;

    console.log(`[Socket] Flushing ${this.messageBuffer.length} buffered messages`);

    while (this.messageBuffer.length > 0 && this.socket?.connected) {
      const message = this.messageBuffer.shift();
      if (message) {
        this.socket.emit('game:message', message);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Spotlight System
  // -------------------------------------------------------------------------

  /**
   * Request the spotlight (speaking turn).
   */
  requestSpotlight(): void {
    if (!this.socket?.connected) {
      console.warn('[Socket] Cannot request spotlight: not connected');
      return;
    }

    this.socket.emit('spotlight:request', {});
  }

  /**
   * Release the spotlight.
   */
  releaseSpotlight(): void {
    if (!this.socket?.connected) {
      console.warn('[Socket] Cannot release spotlight: not connected');
      return;
    }

    this.socket.emit('spotlight:release', {});
  }

  /**
   * Request an emergency cut-in to the spotlight queue.
   *
   * @param reason - Reason for the cut-in
   */
  requestCutIn(reason: string): void {
    if (!this.socket?.connected) {
      console.warn('[Socket] Cannot request cut-in: not connected');
      return;
    }

    this.socket.emit('spotlight:cut-in', { reason });
  }

  // -------------------------------------------------------------------------
  // Typing Indicators
  // -------------------------------------------------------------------------

  /**
   * Send typing start indicator (debounced).
   */
  startTyping(): void {
    if (this.typingTimer) {
      return; // Already typing
    }

    if (!this.socket?.connected) {
      return;
    }

    this.socket.emit('typing:start', {});

    // Auto-stop typing after 3 seconds of no calls
    this.typingTimer = setTimeout(() => {
      this.stopTyping();
    }, 3000);
  }

  /**
   * Send typing stop indicator.
   */
  stopTyping(): void {
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }

    if (!this.socket?.connected) {
      return;
    }

    this.socket.emit('typing:stop', {});
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  /**
   * Check if socket is connected.
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Get socket ID.
   */
  getId(): string | undefined {
    return this.socket?.id;
  }

  /**
   * Schedule reconnection attempt.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    const delay = this.connectionInfo.reconnectionDelay || RECONNECTION_DELAY;

    console.log(`[Socket] Scheduling reconnect in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.socket?.connected) {
        console.log('[Socket] Attempting to reconnect...');
        this.reconnect();
      }
    }, delay);
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const socketService = new SocketService();

// =============================================================================
// React Hook Integration
// =============================================================================

/**
 * Hook for accessing the socket service.
 *
 * @example
 * ```ts
 * const socket = useSocket();
 *
 * useEffect(() => {
 *   socket.connect(token);
 *   return () => socket.disconnect();
 * }, [token]);
 * ```
 */
export function useSocket() {
  return socketService;
}

export default socketService;
