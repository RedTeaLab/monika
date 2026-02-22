/**
 * Types for Multiplayer Features
 */

export interface OnlineUser {
  id: string;
  username: string;
  character_id?: string;
  character_name?: string;
  avatar_url?: string;
  is_typing: boolean;
  is_speaker: boolean;
  queue_position?: number;
  role: 'keeper' | 'player';
  status: 'online' | 'away' | 'offline';
}

export interface MessageVisibility {
  level: 'public' | 'kp' | 'party' | 'private';
  visible_to?: string[];
}

export interface ChatMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_character_name?: string;
  content: string;
  visibility: MessageVisibility;
  timestamp: string;
  is_highlighted?: boolean;
}

export interface SpotlightState {
  state: 'idle' | 'active' | 'queued';
  current_holder?: string;
  current_character_name?: string;
  queue: Array<{
    user_id: string;
    character_name?: string;
    position: number;
    timestamp: string;
  }>;
}

export interface TypingIndicator {
  user_id: string;
  character_name?: string;
  is_typing: boolean;
  timestamp: string;
}

export interface MultiplayerGameState {
  online_users: OnlineUser[];
  spotlight: SpotlightState;
  typing_indicators: TypingIndicator[];
  message_queue: number;
}

export interface MentionSuggestion {
  id: string;
  name: string;
  character_name?: string;
  type: 'user' | 'character';
}
