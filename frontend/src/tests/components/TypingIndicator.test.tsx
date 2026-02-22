/**
 * Tests for TypingIndicator component (TDD - Test First)
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TypingIndicator from '../../components/game/TypingIndicator';
import { TypingIndicator as TypingIndicatorType } from '../../types/multiplayer';

describe('TypingIndicator', () => {
  describe('Single Typing User', () => {
    it('should display typing indicator for one user', () => {
      const typingUsers: TypingIndicatorType[] = [
        {
          user_id: '1',
          character_name: 'Investigator Smith',
          is_typing: true,
          timestamp: new Date().toISOString(),
        },
      ];

      render(<TypingIndicator typingUsers={typingUsers} />);

      expect(screen.getByText('Investigator Smith is typing...')).toBeInTheDocument();
    });

    it('should use username when character name is not available', () => {
      const typingUsers: TypingIndicatorType[] = [
        {
          user_id: '1',
          is_typing: true,
          timestamp: new Date().toISOString(),
        },
      ];

      render(<TypingIndicator typingUsers={typingUsers} currentUserName="Player1" />);

      expect(screen.getByText('Player1 is typing...')).toBeInTheDocument();
    });
  });

  describe('Multiple Typing Users', () => {
    it('should display "and X others" when more than 2 users are typing', () => {
      const typingUsers: TypingIndicatorType[] = [
        { user_id: '1', character_name: 'User 1', is_typing: true, timestamp: new Date().toISOString() },
        { user_id: '2', character_name: 'User 2', is_typing: true, timestamp: new Date().toISOString() },
        { user_id: '3', character_name: 'User 3', is_typing: true, timestamp: new Date().toISOString() },
      ];

      render(<TypingIndicator typingUsers={typingUsers} />);

      expect(screen.getByText(/User 1, User 2 and 1 other are typing/)).toBeInTheDocument();
    });

    it('should display "X users are typing" when all typing', () => {
      const typingUsers: TypingIndicatorType[] = [
        { user_id: '1', character_name: 'User 1', is_typing: true, timestamp: new Date().toISOString() },
        { user_id: '2', character_name: 'User 2', is_typing: true, timestamp: new Date().toISOString() },
      ];

      render(<TypingIndicator typingUsers={typingUsers} />);

      expect(screen.getByText(/User 1 and User 2 are typing/)).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('should not display anything when no users are typing', () => {
      const typingUsers: TypingIndicatorType[] = [];

      const { container } = render(<TypingIndicator typingUsers={typingUsers} />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Positioning', () => {
    it('should have correct class name for positioning', () => {
      const typingUsers: TypingIndicatorType[] = [
        {
          user_id: '1',
          character_name: 'Investigator Smith',
          is_typing: true,
          timestamp: new Date().toISOString(),
        },
      ];

      const { container } = render(<TypingIndicator typingUsers={typingUsers} className="bottom-left" />);

      const indicator = container.firstChild as HTMLElement;
      expect(indicator).toHaveClass('typing-indicator');
      expect(indicator).toHaveClass('bottom-left');
    });
  });
});
