/**
 * React hook for Socket.io connection management.
 *
 * This hook provides a complete React-friendly interface for Socket.io
 * with automatic connection lifecycle, event subscriptions, and state updates.
 *
 * @example
 * ```tsx
 * function GameComponent() {
 *   const { isConnected, joinCampaign, sendMessage } = useSocketConnection({
 *     token: userToken,
 *     onMessage: (data) => console.log('New message:', data),
 *   });
 *
 *   return (
 *     <div>
 *       <ConnectionStatus connected={isConnected} />
 *       <button onClick={() => joinCampaign(campaignId)}>Join Campaign</button>
 *     </div>
 *   );
 * }
 * ```
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { socketService } from '@/services/socket';
import type {
  GameMessageEventData,
  PresenceUpdateData,
  MemberJoinedData,
  MemberLeftData,
  SpotlightGrantedData,
  SpotlightReleasedData,
  QueueItem,
} from '@/types/socket';

// =============================================================================
// Hook State
// =============================================================================

export interface SocketConnectionState {
  // Connection status
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;

  // Campaign
  currentCampaign: string | null;

  // Presence
  onlineUsers: string[];

  // Spotlight
  spotlightHolder: string | null;
  spotlightQueue: QueueItem[];

  // Messages
  messageQueue: GameMessageEventData[];
}

export interface UseSocketConnectionOptions {
  token: string | null;
  autoConnect?: boolean;
  campaignId?: string | null;
  characterId?: string | null;

  // Event callbacks
  onConnected?: () => void;
  onDisconnected?: (reason: string) => void;
  onError?: (error: Error) => void;
  onMessage?: (message: GameMessageEventData) => void;
  onPresenceUpdate?: (presence: PresenceUpdateData) => void;
  onMemberJoined?: (member: MemberJoinedData) => void;
  onMemberLeft?: (member: MemberLeftData) => void;
  onSpotlightGranted?: (data: SpotlightGrantedData) => void;
  onSpotlightReleased?: (data: SpotlightReleasedData) => void;
}

export interface UseSocketConnectionReturn extends SocketConnectionState {
  // Actions
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;

  // Campaign actions
  joinCampaign: (campaignId: string, characterId?: string) => void;
  leaveCampaign: (campaignId: string) => void;

  // Messaging actions
  sendMessage: (
    content: string,
    visibility?: 'public' | 'kp' | 'party' | 'private',
    visibleTo?: string[]
  ) => void;

  // Spotlight actions
  requestSpotlight: () => void;
  releaseSpotlight: () => void;
  requestCutIn: (reason: string) => void;

  // Typing actions
  startTyping: () => void;
  stopTyping: () => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useSocketConnection(
  options: UseSocketConnectionOptions
): UseSocketConnectionReturn {
  const {
    token,
    autoConnect = true,
    campaignId: initialCampaignId,
    characterId: initialCharacterId,
    onConnected,
    onDisconnected,
    onError,
    onMessage,
    onPresenceUpdate,
    onMemberJoined,
    onMemberLeft,
    onSpotlightGranted,
    onSpotlightReleased,
  } = options;

  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Campaign state
  const [currentCampaign, setCurrentCampaign] = useState<string | null>(initialCampaignId || null);

  // Presence state
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

  // Spotlight state
  const [spotlightHolder, setSpotlightHolder] = useState<string | null>(null);
  const [spotlightQueue, setSpotlightQueue] = useState<QueueItem[]>([]);

  // Message state
  const [messageQueue, setMessageQueue] = useState<GameMessageEventData[]>([]);

  // Refs to avoid stale closures
  const eventHandlerRefs = useRef({
    onConnected,
    onDisconnected,
    onError,
    onMessage,
    onPresenceUpdate,
    onMemberJoined,
    onMemberLeft,
    onSpotlightGranted,
    onSpotlightReleased,
  });

  // Update refs when callbacks change
  useEffect(() => {
    eventHandlerRefs.current = {
      onConnected,
      onDisconnected,
      onError,
      onMessage,
      onPresenceUpdate,
      onMemberJoined,
      onMemberLeft,
      onSpotlightGranted,
      onSpotlightReleased,
    };
  }, [
    onConnected,
    onDisconnected,
    onError,
    onMessage,
    onPresenceUpdate,
    onMemberJoined,
    onMemberLeft,
    onSpotlightGranted,
    onSpotlightReleased,
  ]);

  // -------------------------------------------------------------------------
  // Connection Management
  // -------------------------------------------------------------------------

  const connect = useCallback(() => {
    if (!token) {
      console.warn('[useSocketConnection] No token provided, cannot connect');
      return;
    }

    setIsConnecting(true);
    setError(null);

    socketService.connect(token);

    // Listen for connection confirmation
    socketService.on('connected', () => {
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);
      eventHandlerRefs.current.onConnected?.();
    });
  }, [token]);

  const disconnect = useCallback(() => {
    socketService.disconnect(true);
    setIsConnected(false);
    setIsConnecting(false);
    setCurrentCampaign(null);
  }, []);

  const reconnect = useCallback(() => {
    socketService.reconnect();
  }, []);

  // -------------------------------------------------------------------------
  // Auto-connect
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (autoConnect && token && !isConnected && !isConnecting) {
      connect();
    }

    return () => {
      // Only disconnect on unmount if we auto-connected
      if (autoConnect) {
        socketService.disconnect(false);
      }
    };
  }, [token, autoConnect, isConnected, isConnecting, connect]);

  // -------------------------------------------------------------------------
  // Event Listeners
  // -------------------------------------------------------------------------

  useEffect(() => {
    // Connection events
    const handleDisconnect = (reason: string) => {
      setIsConnected(false);
      eventHandlerRefs.current.onDisconnected?.(reason);
    };

    const handleError = (data: { message: string }) => {
      const error = new Error(data.message);
      setError(error);
      eventHandlerRefs.current.onError?.(error);
    };

    socketService.on('disconnect', handleDisconnect as any);
    socketService.on('error', handleError as any);

    // Campaign events
    const handleCampaignJoined = (data: { campaign_id: string }) => {
      setCurrentCampaign(data.campaign_id);
    };

    socketService.on('campaign:joined', handleCampaignJoined as any);

    // Member events
    const handleMemberJoined = (data: MemberJoinedData) => {
      eventHandlerRefs.current.onMemberJoined?.(data);
    };

    const handleMemberLeft = (data: MemberLeftData) => {
      eventHandlerRefs.current.onMemberLeft?.(data);
    };

    socketService.on('member:joined', handleMemberJoined as any);
    socketService.on('member:left', handleMemberLeft as any);

    // Message events
    const handleGameMessage = (data: GameMessageEventData) => {
      setMessageQueue((prev) => [...prev, data]);
      eventHandlerRefs.current.onMessage?.(data);
    };

    socketService.on('game:message', handleGameMessage as any);

    // Presence events
    const handlePresenceUpdate = (data: PresenceUpdateData) => {
      setOnlineUsers(data.online_users);
      eventHandlerRefs.current.onPresenceUpdate?.(data);
    };

    socketService.on('presence:update', handlePresenceUpdate as any);

    // Spotlight events
    const handleSpotlightGranted = (data: SpotlightGrantedData) => {
      setSpotlightHolder(data.user_id);
      eventHandlerRefs.current.onSpotlightGranted?.(data);
    };

    const handleSpotlightReleased = (data: SpotlightReleasedData) => {
      setSpotlightHolder(data.next_user_id || null);
      eventHandlerRefs.current.onSpotlightReleased?.(data);
    };

    const handleSpotlightQueueUpdated = (data: { queue: QueueItem[] }) => {
      setSpotlightQueue(data.queue);
    };

    socketService.on('spotlight:granted', handleSpotlightGranted as any);
    socketService.on('spotlight:released', handleSpotlightReleased as any);
    socketService.on('spotlight:queue_updated', handleSpotlightQueueUpdated as any);

    // Cleanup
    return () => {
      socketService.off('disconnect');
      socketService.off('error');
      socketService.off('campaign:joined');
      socketService.off('member:joined');
      socketService.off('member:left');
      socketService.off('game:message');
      socketService.off('presence:update');
      socketService.off('spotlight:granted');
      socketService.off('spotlight:released');
      socketService.off('spotlight:queue_updated');
    };
  }, []);

  // -------------------------------------------------------------------------
  // Campaign Actions
  // -------------------------------------------------------------------------

  const joinCampaign = useCallback((campaignId: string, characterId?: string) => {
    socketService.joinCampaign(campaignId, characterId);
    setCurrentCampaign(campaignId);
  }, []);

  const leaveCampaign = useCallback((campaignId: string) => {
    socketService.leaveCampaign(campaignId);
    if (currentCampaign === campaignId) {
      setCurrentCampaign(null);
    }
  }, [currentCampaign]);

  // -------------------------------------------------------------------------
  // Messaging Actions
  // -------------------------------------------------------------------------

  const sendMessage = useCallback(
    (
      content: string,
      visibility: 'public' | 'kp' | 'party' | 'private' = 'public',
      visibleTo?: string[]
    ) => {
      socketService.sendMessage(content, visibility, visibleTo);
    },
    []
  );

  // -------------------------------------------------------------------------
  // Spotlight Actions
  // -------------------------------------------------------------------------

  const requestSpotlight = useCallback(() => {
    socketService.requestSpotlight();
  }, []);

  const releaseSpotlight = useCallback(() => {
    socketService.releaseSpotlight();
  }, []);

  const requestCutIn = useCallback((reason: string) => {
    socketService.requestCutIn(reason);
  }, []);

  // -------------------------------------------------------------------------
  // Typing Actions
  // -------------------------------------------------------------------------

  const startTyping = useCallback(() => {
    socketService.startTyping();
  }, []);

  const stopTyping = useCallback(() => {
    socketService.stopTyping();
  }, []);

  // -------------------------------------------------------------------------
  // Return State and Actions
  // -------------------------------------------------------------------------

  return {
    // State
    isConnected,
    isConnecting,
    error,
    currentCampaign,
    onlineUsers,
    spotlightHolder,
    spotlightQueue,
    messageQueue,

    // Actions
    connect,
    disconnect,
    reconnect,
    joinCampaign,
    leaveCampaign,
    sendMessage,
    requestSpotlight,
    releaseSpotlight,
    requestCutIn,
    startTyping,
    stopTyping,
  };
}

export default useSocketConnection;
