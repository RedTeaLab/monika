/**
 * Tests for MultiplayerGameConsole component (TDD - Test First)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MultiplayerGameConsole from '../../components/game/MultiplayerGameConsole';
import { OnlineUser, ChatMessage, SpotlightState } from '../../types/multiplayer';

describe('MultiplayerGameConsole', () => {
  const mockOnlineUsers: OnlineUser[] = [
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
      is_typing: true,
      is_speaker: true,
      status: 'online',
    },
  ];

  const mockMessages: ChatMessage[] = [
    {
      id: '1',
      sender_id: '1',
      sender_name: 'Keeper',
      content: 'Welcome to the investigation',
      visibility: { level: 'public' },
      timestamp: '2024-01-01T12:00:00Z',
    },
    {
      id: '2',
      sender_id: '2',
      sender_name: 'Player1',
      sender_character_name: 'Investigator Smith',
      content: 'I search the room for clues',
      visibility: { level: 'public' },
      timestamp: '2024-01-01T12:01:00Z',
    },
  ];

  const mockSpotlight: SpotlightState = {
    state: 'active',
    current_holder: '2',
    current_character_name: 'Investigator Smith',
    queue: [],
  };

  describe('Component Layout', () => {
    it('should render online users panel', () => {
      render(
        <MultiplayerGameConsole
          onlineUsers={mockOnlineUsers}
          messages={mockMessages}
          spotlight={mockSpotlight}
        />
      );

      expect(screen.getByText(/Online Users/i)).toBeInTheDocument();
      expect(screen.getByText('Keeper')).toBeInTheDocument();
      expect(screen.getByText('Investigator Smith')).toBeInTheDocument();
    });

    it('should render message list', () => {
      render(
        <MultiplayerGameConsole
          onlineUsers={mockOnlineUsers}
          messages={mockMessages}
          spotlight={mockSpotlight}
        />
      );

      expect(screen.getByText('Welcome to the investigation')).toBeInTheDocument();
      expect(screen.getByText('I search the room for clues')).toBeInTheDocument();
    });

    it('should render message input', () => {
      render(
        <MultiplayerGameConsole
          onlineUsers={mockOnlineUsers}
          messages={mockMessages}
          spotlight={mockSpotlight}
        />
      );

      const input = screen.getByPlaceholderText(/type a message/i);
      expect(input).toBeInTheDocument();
    });
  });

  describe('Spotlight Display', () => {
    it('should show current speaker', () => {
      render(
        <MultiplayerGameConsole
          onlineUsers={mockOnlineUsers}
          messages={mockMessages}
          spotlight={mockSpotlight}
        />
      );

      expect(screen.getByText(/Investigator Smith is speaking/i)).toBeInTheDocument();
    });

    it('should show request spotlight button when not speaker', () => {
      const notSpeakerSpotlight: SpotlightState = {
        state: 'active',
        current_holder: '1',
        current_character_name: 'Keeper',
        queue: [],
      };

      render(
        <MultiplayerGameConsole
          onlineUsers={[mockOnlineUsers[1]]}
          messages={mockMessages}
          spotlight={notSpeakerSpotlight}
          currentUserId="2"
        />
      );

      expect(screen.getByText(/Request Spotlight/i)).toBeInTheDocument();
    });

    it('should show release spotlight button when speaker', () => {
      render(
        <MultiplayerGameConsole
          onlineUsers={mockOnlineUsers}
          messages={mockMessages}
          spotlight={mockSpotlight}
          currentUserId="2"
        />
      );

      expect(screen.getByText(/Release Spotlight/i)).toBeInTheDocument();
    });
  });

  describe('Message Visibility', () => {
    it('should filter KP-only messages from players', () => {
      const messagesWithVisibility: ChatMessage[] = [
        ...mockMessages,
        {
          id: '3',
          sender_id: '1',
          sender_name: 'Keeper',
          content: 'Secret keeper note',
          visibility: { level: 'kp' },
          timestamp: '2024-01-01T12:02:00Z',
        },
      ];

      render(
        <MultiplayerGameConsole
          onlineUsers={mockOnlineUsers}
          messages={messagesWithVisibility}
          spotlight={mockSpotlight}
          currentUserId="2"
          currentUserRole="player"
        />
      );

      expect(screen.queryByText('Secret keeper note')).not.toBeInTheDocument();
    });

    it('should show KP-only messages to keeper', () => {
      const messagesWithVisibility: ChatMessage[] = [
        ...mockMessages,
        {
          id: '3',
          sender_id: '1',
          sender_name: 'Keeper',
          content: 'Secret keeper note',
          visibility: { level: 'kp' },
          timestamp: '2024-01-01T12:02:00Z',
        },
      ];

      render(
        <MultiplayerGameConsole
          onlineUsers={mockOnlineUsers}
          messages={messagesWithVisibility}
          spotlight={mockSpotlight}
          currentUserId="1"
          currentUserRole="keeper"
        />
      );

      expect(screen.getByText('Secret keeper note')).toBeInTheDocument();
    });
  });

  describe('Message Input', () => {
    it('should send message when send button is clicked', async () => {
      const onSendMessage = vi.fn();

      render(
        <MultiplayerGameConsole
          onlineUsers={mockOnlineUsers}
          messages={mockMessages}
          spotlight={mockSpotlight}
          onSendMessage={onSendMessage}
        />
      );

      const input = screen.getByPlaceholderText(/type a message/i);
      const sendButton = screen.getByText(/Send/i);

      fireEvent.change(input, { target: { value: 'Test message' } });
      fireEvent.click(sendButton);

      expect(onSendMessage).toHaveBeenCalledWith('Test message', 'public');
    });

    it('should send message on Enter key press', async () => {
      const onSendMessage = vi.fn();

      render(
        <MultiplayerGameConsole
          onlineUsers={mockOnlineUsers}
          messages={mockMessages}
          spotlight={mockSpotlight}
          onSendMessage={onSendMessage}
        />
      );

      const input = screen.getByPlaceholderText(/type a message/i);

      fireEvent.change(input, { target: { value: 'Test message' } });
      fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', keyCode: 13 });

      expect(onSendMessage).toHaveBeenCalledWith('Test message', 'public');
    });
  });

  describe('Typing Indicators', () => {
    it('should display typing indicators', () => {
      render(
        <MultiplayerGameConsole
          onlineUsers={mockOnlineUsers}
          messages={mockMessages}
          spotlight={mockSpotlight}
        />
      );

      expect(screen.getByText(/Player1 is typing/i)).toBeInTheDocument();
    });
  });
});
