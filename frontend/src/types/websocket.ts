/**
 * WebSocket message types for real-time game communication
 */

export type ToneType = 'mystery' | 'horror' | 'action' | 'calm';
export type UrgencyType = 'low' | 'medium' | 'high';

export interface StateChanges {
  current_scene?: string;
  world_state?: {
    leads?: string[];
    location?: string;
    npcs?: Record<string, any>;
  };
}

export interface ToolCall {
  name: 'search_rules';
  arguments: Record<string, string>;
  result_id?: string;
}

export interface ToolResult {
  tool: string;
  result: {
    query?: string;
    results?: Array<{
      id: string;
      title: string;
      category: string;
      content: string;
      relevance_score: number;
      related_rules: Array<{
        id: string;
        title: string;
        category: string;
        content: string;
      }>;
    }>;
    total?: number;
    error?: string;
  };
}

export interface LLMResponse {
  narrative: string;
  tone: ToneType;
  urgency: UrgencyType;
  state_changes?: StateChanges;
  suggestions?: string[];
  audio_cue?: string;
  requires_roll: boolean;
  tool_results?: ToolResult[];
}

export interface UserMessage {
  type: 'user_message';
  content: string;
  timestamp: string;
}

export interface KeeperMessage {
  type: 'keeper_message';
  content: LLMResponse;
  is_streaming: boolean;
  timestamp?: string;
}

export interface StateUpdate {
  type: 'state_update';
  content: {
    current_scene: string;
    world_state: Record<string, any>;
  };
}

export interface ErrorMessage {
  type: 'error';
  content: string;
}

export interface ChaseStartedMessage {
  type: 'chase_started';
  chase_id: string;
}

export interface ChaseEndedMessage {
  type: 'chase_ended';
  chase_id: string;
  winner?: 'fugitive' | 'pursuer';
}

export type ServerMessage = KeeperMessage | StateUpdate | ErrorMessage | ChaseStartedMessage | ChaseEndedMessage;
