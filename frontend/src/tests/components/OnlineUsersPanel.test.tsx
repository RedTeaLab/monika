/**
 * Tests for OnlineUsersPanel component (TDD - Test First)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import OnlineUsersPanel from '../../components/game/OnlineUsersPanel';
import { OnlineUser } from '../../types/multiplayer';

describe('OnlineUsersPanel', () => {
  const mockUsers: OnlineUser[] = [
    {
      id: '1',
      username: 'Keeper',
      role: 'keeper',
      is_typing: false,
      is_speaker: false,
      status: 'online',
    },
    {
      id: '2',
      username: 'Player1',
      character_id: 'char1',
      character_name: 'Investigator Smith',
      role: 'player',
      is_typing: false,
      is_speaker: true,
      status: 'online',
    },
    {
      id: '3',
      username: 'Player2',
      character_id: 'char2',
      character_name: 'Dr. Jones',
      role: 'player',
      is_typing: true,
      is_speaker: false,
      queue_position: 1,
      status: 'online',
    },
  ];

  describe('User List Display', () => {
    it('should display all online users', () => {
      render(<OnlineUsersPanel users={mockUsers} spotlight={{ state: 'active', current_holder: '2' }} />);

      expect(screen.getByText('Keeper')).toBeInTheDocument();
      expect(screen.getByText('Investigator Smith')).toBeInTheDocument();
      expect(screen.getByText('Dr. Jones')).toBeInTheDocument();
    });

    it('should show speaker indicator for current speaker', () => {
      render(<OnlineUsersPanel users={mockUsers} spotlight={{ state: 'active', current_holder: '2' }} />);

      const speakerIndicator = screen.getByText(/🎤/); // Microphone emoji for speaker
      expect(speakerIndicator).toBeInTheDocument();
    });

    it('should show typing indicator for typing users', () => {
      render(<OnlineUsersPanel users={mockUsers} spotlight={{ state: 'active', current_holder: '2' }} />);

      const typingIndicator = screen.getByText(/Dr\. Jones.*is typing/i);
      expect(typingIndicator).toBeInTheDocument();
    });

    it('should show queue position for queued users', () => {
      render(<OnlineUsersPanel users={mockUsers} spotlight={{ state: 'active', current_holder: '2' }} />);

      expect(screen.getByText(/#1/)).toBeInTheDocument();
    });
  });

  describe('User Status', () => {
    it('should display online status', () => {
      const userWithStatus: OnlineUser = {
        ...mockUsers[0],
        status: 'online',
      };

      render(<OnlineUsersPanel users={[userWithStatus]} spotlight={{ state: 'idle' }} />);

      const onlineIndicator = screen.getByTitle(/online/i);
      expect(onlineIndicator).toBeInTheDocument();
      expect(onlineIndicator).toHaveClass('status-online');
    });

    it('should display away status', () => {
      const userWithStatus: OnlineUser = {
        ...mockUsers[0],
        status: 'away',
      };

      render(<OnlineUsersPanel users={[userWithStatus]} spotlight={{ state: 'idle' }} />);

      const awayIndicator = screen.getByTitle(/away/i);
      expect(awayIndicator).toBeInTheDocument();
      expect(awayIndicator).toHaveClass('status-away');
    });

    it('should display offline status', () => {
      const userWithStatus: OnlineUser = {
        ...mockUsers[0],
        status: 'offline',
      };

      render(<OnlineUsersPanel users={[userWithStatus]} spotlight={{ state: 'idle' }} />);

      const offlineIndicator = screen.getByTitle(/offline/i);
      expect(offlineIndicator).toBeInTheDocument();
      expect(offlineIndicator).toHaveClass('status-offline');
    });
  });

  describe('User Interactions', () => {
    it('should call onUserClick when user is clicked', () => {
      const onUserClick = vi.fn();

      render(
        <OnlineUsersPanel
          users={mockUsers}
          spotlight={{ state: 'idle' }}
          onUserClick={onUserClick}
        />
      );

      const userElement = screen.getByText('Keeper');
      userElement.click();

      expect(onUserClick).toHaveBeenCalledWith(mockUsers[0]);
    });
  });

  describe('Empty State', () => {
    it('should display message when no users online', () => {
      render(<OnlineUsersPanel users={[]} spotlight={{ state: 'idle' }} />);

      expect(screen.getByText(/no users online/i)).toBeInTheDocument();
    });
  });

  describe('Role Indicators', () => {
    it('should show keeper badge for keeper role', () => {
      render(<OnlineUsersPanel users={mockUsers} spotlight={{ state: 'idle' }} />);

      const keeperBadge = screen.getByText(/KP/i);
      expect(keeperBadge).toBeInTheDocument();
    });

    it('should not show keeper badge for player role', () => {
      render(<OnlineUsersPanel users={mockUsers} spotlight={{ state: 'idle' }} />);

      const playerElements = screen.getAllByText('Player1');
      const playerElement = playerElements[0].closest('.user-item');

      expect(playerElement?.querySelector('.keeper-badge')).not.toBeInTheDocument();
    });
  });
});
