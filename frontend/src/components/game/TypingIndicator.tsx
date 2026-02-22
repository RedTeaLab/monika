/**
 * TypingIndicator Component
 *
 * Displays real-time typing indicators for users in a multiplayer session.
 * Shows who is currently typing a message.
 */
import React from 'react';
import { TypingIndicator as TypingIndicatorType } from '../../types/multiplayer';
import './TypingIndicator.css';

interface TypingIndicatorProps {
  typingUsers: TypingIndicatorType[];
  currentUserName?: string;
  className?: string;
  maxDisplay?: number;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  typingUsers,
  currentUserName,
  className = '',
  maxDisplay = 2,
}) => {
  if (typingUsers.length === 0) {
    return null;
  }

  const getDisplayName = (user: TypingIndicatorType): string => {
    return user.character_name || currentUserName || 'Someone';
  };

  const formatTypingMessage = (): string => {
    if (typingUsers.length === 1) {
      return `${getDisplayName(typingUsers[0])} is typing...`;
    }

    if (typingUsers.length === 2) {
      return `${getDisplayName(typingUsers[0])} and ${getDisplayName(typingUsers[1])} are typing...`;
    }

    const displayedUsers = typingUsers.slice(0, maxDisplay);
    const remainingCount = typingUsers.length - maxDisplay;

    if (remainingCount === 1) {
      return `${displayedUsers.map((u) => getDisplayName(u)).join(', ')} and 1 other are typing...`;
    }

    return `${displayedUsers.map((u) => getDisplayName(u)).join(', ')} and ${remainingCount} others are typing...`;
  };

  return (
    <div className={`typing-indicator ${className}`}>
      <div className="typing-dots">
        <span className="dot"></span>
        <span className="dot"></span>
        <span className="dot"></span>
      </div>
      <span className="typing-text">{formatTypingMessage()}</span>
    </div>
  );
};

export default TypingIndicator;
