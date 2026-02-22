/**
 * MultiplayerGameConsole Component
 *
 * Main multiplayer game console that combines:
 * - Online users panel
 * - Message list with visibility filtering
 * - Message input with visibility selector
 * - Spotlight controls
 * - Typing indicators
 */
import React, { useState, useCallback, useEffect } from 'react';
import { OnlineUser, ChatMessage, SpotlightState, MessageVisibility, TypingIndicator as TypingIndicatorType } from '../../types/multiplayer';
import { OnlineUsersPanel } from './OnlineUsersPanel';
import { TypingIndicator } from './TypingIndicator';
import './MultiplayerGameConsole.css';

interface MultiplayerGameConsoleProps {
  onlineUsers: OnlineUser[];
  messages: ChatMessage[];
  spotlight: SpotlightState;
  typingIndicators?: TypingIndicatorType[];
  currentUserId?: string;
  currentUserRole?: 'keeper' | 'player';
  onSendMessage?: (content: string, visibility: MessageVisibility['level']) => void;
  onRequestSpotlight?: () => void;
  onReleaseSpotlight?: () => void;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
}

export const MultiplayerGameConsole: React.FC<MultiplayerGameConsoleProps> = ({
  onlineUsers,
  messages,
  spotlight,
  typingIndicators = [],
  currentUserId,
  currentUserRole = 'player',
  onSendMessage,
  onRequestSpotlight,
  onReleaseSpotlight,
  onTypingStart,
  onTypingStop,
}) => {
  const [messageInput, setMessageInput] = useState('');
  const [selectedVisibility, setSelectedVisibility] = useState<MessageVisibility['level']>('public');
  const [isTyping, setIsTyping] = useState(false);

  // Filter messages based on user role and visibility
  const visibleMessages = messages.filter((message) => {
    // Sender always sees their own messages
    if (message.sender_id === currentUserId) {
      return true;
    }

    // Keeper sees all messages
    if (currentUserRole === 'keeper') {
      return true;
    }

    // Players see public, party, and private@self messages
    if (message.visibility.level === 'public' || message.visibility.level === 'party') {
      return true;
    }

    if (message.visibility.level === 'private') {
      return message.visibility.visible_to?.includes(currentUserId || '');
    }

    return false;
  });

  // Handle message send
  const handleSendMessage = useCallback(() => {
    if (!messageInput.trim() || !onSendMessage) {
      return;
    }

    onSendMessage(messageInput, selectedVisibility);
    setMessageInput('');
    setSelectedVisibility('public');
  }, [messageInput, selectedVisibility, onSendMessage]);

  // Handle keyboard input
  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  // Handle typing indicators
  useEffect(() => {
    if (!messageInput && isTyping) {
      setIsTyping(false);
      onTypingStop?.();
    } else if (messageInput && !isTyping) {
      setIsTyping(true);
      onTypingStart?.();
    }
  }, [messageInput, isTyping, onTypingStart, onTypingStop]);

  // Check if current user is speaker
  const isSpeaker = currentUserId && spotlight.current_holder === currentUserId;

  // Get current user info
  const currentUser = onlineUsers.find((u) => u.id === currentUserId);

  return (
    <div className="multiplayer-game-console">
      {/* Left sidebar - Online users */}
      <aside className="sidebar-left">
        <OnlineUsersPanel
          users={onlineUsers}
          spotlight={spotlight}
          onUserClick={(user) => console.log('User clicked:', user)}
        />
      </aside>

      {/* Main content area */}
      <main className="console-main">
        {/* Spotlight status bar */}
        <div className="spotlight-bar">
          {spotlight.state === 'idle' && (
            <button
              className="spotlight-button"
              onClick={onRequestSpotlight}
              disabled={!onRequestSpotlight}
            >
              🎤 Request Spotlight
            </button>
          )}

          {spotlight.state === 'active' && spotlight.current_character_name && (
            <div className="spotlight-status">
              <span className="speaker-name">🎤 {spotlight.current_character_name} is speaking</span>
              {isSpeaker && onReleaseSpotlight && (
                <button className="release-button" onClick={onReleaseSpotlight}>
                  Release
                </button>
              )}
            </div>
          )}

          {spotlight.state === 'queued' && spotlight.queue.length > 0 && (
            <div className="spotlight-queue">
              <span className="queue-info">
                Queue position: {spotlight.queue.findIndex((q) => q.user_id === currentUserId) + 1}
              </span>
            </div>
          )}
        </div>

        {/* Messages list */}
        <div className="messages-container">
          <div className="messages-list">
            {visibleMessages.map((message) => (
              <div
                key={message.id}
                className={`message ${message.is_highlighted ? 'highlighted' : ''} ${message.visibility.level === 'kp' ? 'kp-only' : ''}`}
              >
                <div className="message-header">
                  <span className="sender-name">
                    {message.sender_character_name || message.sender_name}
                  </span>
                  <span className="message-time">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </span>
                  {message.visibility.level !== 'public' && (
                    <span className="visibility-badge">{message.visibility.level}</span>
                  )}
                </div>
                <div className="message-content">{message.content}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Message input */}
        <div className="message-input-container">
          <div className="visibility-selector">
            <select
              value={selectedVisibility}
              onChange={(e) => setSelectedVisibility(e.target.value as MessageVisibility['level'])}
              className="visibility-select"
            >
              <option value="public">Public</option>
              {currentUserRole === 'keeper' && <option value="kp">KP Only</option>}
              <option value="party">Party</option>
              <option value="private">Private</option>
            </select>
          </div>

          <input
            type="text"
            className="message-input"
            placeholder="Type a message..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyPress={handleKeyPress}
          />

          <button
            className="send-button"
            onClick={handleSendMessage}
            disabled={!messageInput.trim()}
          >
            Send
          </button>
        </div>

        {/* Typing indicators */}
        {typingIndicators.length > 0 && (
          <div className="typing-indicators">
            {typingIndicators.map((indicator) => (
              <TypingIndicator
                key={indicator.user_id}
                typingUsers={[indicator]}
                currentUserName={indicator.character_name}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default MultiplayerGameConsole;
