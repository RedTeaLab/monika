/**
 * Typing Indicator Component for Socket.io.
 *
 * Displays which users are currently typing in the campaign.
 *
 * @example
 * ```tsx
 * <TypingIndicator
 *   typingUsers={typingUsers}
 *   currentUserId={currentUserId}
 * />
 * ```
 */
import React, { useEffect, useState } from 'react';
import { User } from 'lucide-react';

export interface TypingUser {
  user_id: string;
  character_name?: string;
  timestamp: number;
}

export interface TypingIndicatorProps {
  typingUsers: TypingUser[];
  currentUserId: string;
  className?: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  typingUsers,
  currentUserId,
  className = '',
}) => {
  // Filter out current user and expired typing indicators (older than 5 seconds)
  const [activeTypers, setActiveTypers] = useState<TypingUser[]>([]);

  useEffect(() => {
    const now = Date.now();
    const filtered = typingUsers.filter(
      (user) => user.user_id !== currentUserId && now - user.timestamp < 5000
    );
    setActiveTypers(filtered);
  }, [typingUsers, currentUserId]);

  // Auto-clear after 10 seconds of no updates
  useEffect(() => {
    if (activeTypers.length === 0) return;

    const timer = setTimeout(() => {
      setActiveTypers([]);
    }, 10000);

    return () => clearTimeout(timer);
  }, [activeTypers]);

  if (activeTypers.length === 0) {
    return null;
  }

  // Generate display text
  const getTypingText = () => {
    const names = activeTypers.map((u) => u.character_name || `User ${u.user_id.slice(0, 4)}`);

    if (names.length === 1) {
      return `${names[0]} is typing...`;
    } else if (names.length === 2) {
      return `${names[0]} and ${names[1]} are typing...`;
    } else {
      return `${names[0]} and ${names.length - 1} others are typing...`;
    }
  };

  return (
    <div className={`flex items-center gap-2 text-sm text-muted-foreground animate-fade-in ${className}`}>
      <div className="flex gap-1">
        <span className="animate-bounce" style={{ animationDelay: '0ms' }}>
          •
        </span>
        <span className="animate-bounce" style={{ animationDelay: '150ms' }}>
          •
        </span>
        <span className="animate-bounce" style={{ animationDelay: '300ms' }}>
          •
        </span>
      </div>
      <span>{getTypingText()}</span>
    </div>
  );
};

/**
 * Compact typing indicator with avatar dots.
 */
export interface TypingDotsProps {
  isTyping: boolean;
  className?: string;
}

export const TypingDots: React.FC<TypingDotsProps> = ({ isTyping, className = '' }) => {
  if (!isTyping) return null;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );
};

export default TypingIndicator;
