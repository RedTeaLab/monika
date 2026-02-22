/**
 * Socket.io event types for Monika multiplayer platform.
 *
 * This file defines all WebSocket event types for client-server
 * communication using Socket.io.
 */

// =============================================================================
// Client → Server Events
// =============================================================================

export interface ClientToServerEvents {
  // Connection management
  'campaign:join': (data: CampaignJoinData) => void;
  'campaign:leave': (data: CampaignLeaveData) => void;

  // Game interaction
  'game:message': (data: GameMessageData) => void;

  // Spotlight system
  'spotlight:request': (data: SpotlightRequestData) => void;
  'spotlight:release': (data: SpotlightReleaseData) => void;
  'spotlight:cut-in': (data: SpotlightCutInData) => void;

  // Status indicators
  'typing:start': (data: TypingStartData) => void;
  'typing:stop': (data: TypingStopData) => void;
}

// =============================================================================
// Server → Client Events
// =============================================================================

export interface ServerToClientEvents {
  // Connection events
  'connected': (data: ConnectedData) => void;
  'campaign:joined': (data: CampaignJoinedData) => void;
  'member:joined': (data: MemberJoinedData) => void;
  'member:left': (data: MemberLeftData) => void;
  'disconnect': (reason: string) => void;

  // Message events
  'game:message': (data: GameMessageEventData) => void;

  // Spotlight events
  'spotlight:granted': (data: SpotlightGrantedData) => void;
  'spotlight:released': (data: SpotlightReleasedData) => void;
  'spotlight:queue_updated': (data: SpotlightQueueUpdatedData) => void;

  // Presence events
  'presence:update': (data: PresenceUpdateData) => void;
  'user:typing': (data: UserTypingData) => void;

  // Error events
  'error': (data: ErrorData) => void;
}

// =============================================================================
// Data Types
// =============================================================================

// Connection
export interface ConnectedData {
  message: string;
  user_id: string;
}

// Campaign Join/Leave
export interface CampaignJoinData {
  campaign_id: string;
  character_id?: string;
}

export interface CampaignLeaveData {
  campaign_id: string;
}

export interface CampaignJoinedData {
  campaign_id: string;
  members: CampaignMember[];
}

export interface CampaignMember {
  user_id: string;
  campaign_id: string;
  character_id?: string;
  character_name?: string;
  role?: string;
  connected_at?: string;
}

export interface MemberJoinedData {
  user_id: string;
  character_name?: string;
}

export interface MemberLeftData {
  user_id: string;
  character_name?: string;
}

// Game Messages
export interface GameMessageData {
  content: string;
  visibility: MessageVisibility;
  visible_to?: string[];
}

export interface GameMessageEventData {
  id: string;
  sender_id: string;
  content: string;
  visibility: MessageVisibility;
  visible_to?: string[];
  timestamp: string;
}

export type MessageVisibility = 'public' | 'kp' | 'party' | 'private';

// Spotlight
export interface SpotlightRequestData {
  // No additional data needed
}

export interface SpotlightReleaseData {
  // No additional data needed
}

export interface SpotlightCutInData {
  reason: string;
}

export interface SpotlightGrantedData {
  user_id: string;
  character_name?: string;
}

export interface SpotlightReleasedData {
  next_user_id?: string;
}

export interface SpotlightQueueUpdatedData {
  queue: QueueItem[];
}

export interface QueueItem {
  user_id: string;
  character_name?: string;
  position: number;
  type: 'normal' | 'priority';
}

// Presence
export interface PresenceUpdateData {
  online_users: string[];
}

export interface UserTypingData {
  user_id: string;
  character_name?: string;
}

// Typing
export interface TypingStartData {
  // No additional data needed
}

export interface TypingStopData {
  // No additional data needed
}

// Error
export interface ErrorData {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// Socket State
// =============================================================================

export interface SocketState {
  isConnected: boolean;
  isConnecting: boolean;
  error: Error | null;
  currentCampaign: string | null;
  onlineUsers: string[];
  spotlightHolder: string | null;
  messageQueue: GameMessageEventData[];
}

// =============================================================================
// Connection Info
// =============================================================================

export interface SocketConnectionInfo {
  url: string;
  token: string;
  autoReconnect: boolean;
  reconnectionAttempts: number;
  reconnectionDelay: number;
}
