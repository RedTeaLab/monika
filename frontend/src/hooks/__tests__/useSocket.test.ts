/**
 * Tests for useSocketConnection hook.
 *
 * This test suite follows TDD principles:
 * 1. Tests are written FIRST
 * 2. Tests document expected behavior
 * 3. Implementation follows to make tests pass
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSocketConnection } from '../useSocket';

// Mock the socket service
vi.mock('@/services/socket', () => ({
  socketService: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    reconnect: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    joinCampaign: vi.fn(),
    leaveCampaign: vi.fn(),
    sendMessage: vi.fn(),
    requestSpotlight: vi.fn(),
    releaseSpotlight: vi.fn(),
    requestCutIn: vi.fn(),
    startTyping: vi.fn(),
    stopTyping: vi.fn(),
    isConnected: () => false,
    getId: () => undefined,
  },
}));

import { socketService } from '@/services/socket';

// =============================================================================
// Hook State Tests
// =============================================================================

describe('useSocketConnection - Hook State', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should return initial disconnected state', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: null,
          autoConnect: false,
        })
      );

      expect(result.current.isConnected).toBe(false);
      expect(result.current.isConnecting).toBe(false);
      expect(result.current.error).toBe(null);
      expect(result.current.currentCampaign).toBe(null);
      expect(result.current.onlineUsers).toEqual([]);
      expect(result.current.spotlightHolder).toBe(null);
      expect(result.current.spotlightQueue).toEqual([]);
      expect(result.current.messageQueue).toEqual([]);
    });

    it('should return all required actions', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: null,
          autoConnect: false,
        })
      );

      expect(typeof result.current.connect).toBe('function');
      expect(typeof result.current.disconnect).toBe('function');
      expect(typeof result.current.reconnect).toBe('function');
      expect(typeof result.current.joinCampaign).toBe('function');
      expect(typeof result.current.leaveCampaign).toBe('function');
      expect(typeof result.current.sendMessage).toBe('function');
      expect(typeof result.current.requestSpotlight).toBe('function');
      expect(typeof result.current.releaseSpotlight).toBe('function');
      expect(typeof result.current.requestCutIn).toBe('function');
      expect(typeof result.current.startTyping).toBe('function');
      expect(typeof result.current.stopTyping).toBe('function');
    });
  });

  describe('isConnected state', () => {
    it('should update isConnected when connected event fires', async () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      // Simulate connection event
      await act(async () => {
        const onCallback = (socketService.on as any).mock.calls.find(
          (call: any[]) => call[0] === 'connected'
        );

        if (onCallback && onCallback[1]) {
          onCallback[1]({ message: 'Connected', user_id: 'user-123' });
        }
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.isConnecting).toBe(false);
    });
  });

  describe('error state', () => {
    it('should update error when error event fires', async () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      const testError = new Error('Connection failed');

      await act(async () => {
        const onCallback = (socketService.on as any).mock.calls.find(
          (call: any[]) => call[0] === 'error'
        );

        if (onCallback && onCallback[1]) {
          onCallback[1]({ message: 'Connection failed' });
        }
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Connection failed');
    });
  });
});

// =============================================================================
// Connection Actions Tests
// =============================================================================

describe('useSocketConnection - Connection Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('connect()', () => {
    it('should call socketService.connect with token', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      act(() => {
        result.current.connect();
      });

      expect(socketService.connect).toHaveBeenCalledWith('test-token');
    });

    it('should not connect without token', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { result } = renderHook(() =>
        useSocketConnection({
          token: null,
          autoConnect: false,
        })
      );

      act(() => {
        result.current.connect();
      });

      expect(socketService.connect).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No token provided')
      );

      consoleSpy.mockRestore();
    });

    it('should set isConnecting to true when connecting', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      act(() => {
        result.current.connect();
      });

      expect(result.current.isConnecting).toBe(true);
    });
  });

  describe('disconnect()', () => {
    it('should call socketService.disconnect with manual flag', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      act(() => {
        result.current.disconnect();
      });

      expect(socketService.disconnect).toHaveBeenCalledWith(true);
    });

    it('should reset connection state', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      // First set some state
      act(() => {
        result.current.connect();
      });

      // Then disconnect
      act(() => {
        result.current.disconnect();
      });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.isConnecting).toBe(false);
      expect(result.current.currentCampaign).toBe(null);
    });
  });

  describe('reconnect()', () => {
    it('should call socketService.reconnect', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      act(() => {
        result.current.reconnect();
      });

      expect(socketService.reconnect).toHaveBeenCalled();
    });
  });
});

// =============================================================================
// Campaign Actions Tests
// =============================================================================

describe('useSocketConnection - Campaign Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('joinCampaign()', () => {
    it('should call socketService.joinCampaign with campaign_id', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      act(() => {
        result.current.joinCampaign('campaign-123');
      });

      expect(socketService.joinCampaign).toHaveBeenCalledWith('campaign-123');
    });

    it('should call socketService.joinCampaign with character_id', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      act(() => {
        result.current.joinCampaign('campaign-123', 'character-456');
      });

      expect(socketService.joinCampaign).toHaveBeenCalledWith(
        'campaign-123',
        'character-456'
      );
    });

    it('should update currentCampaign state', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      act(() => {
        result.current.joinCampaign('campaign-123');
      });

      expect(result.current.currentCampaign).toBe('campaign-123');
    });

    it('should update currentCampaign when campaign:joined event fires', async () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      await act(async () => {
        // Find campaign:joined callback
        const onCalls = (socketService.on as any).mock.calls;
        const joinedCall = onCalls.find((call: any[]) => call[0] === 'campaign:joined');

        if (joinedCall && joinedCall[1]) {
          joinedCall[1]({ campaign_id: 'campaign-789', members: [] });
        }
      });

      expect(result.current.currentCampaign).toBe('campaign-789');
    });
  });

  describe('leaveCampaign()', () => {
    it('should call socketService.leaveCampaign', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
          campaignId: 'campaign-123',
        })
      );

      act(() => {
        result.current.leaveCampaign('campaign-123');
      });

      expect(socketService.leaveCampaign).toHaveBeenCalledWith('campaign-123');
    });

    it('should clear currentCampaign if leaving current campaign', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
          campaignId: 'campaign-123',
        })
      );

      // First join a campaign
      act(() => {
        result.current.joinCampaign('campaign-123');
      });

      // Then leave it
      act(() => {
        result.current.leaveCampaign('campaign-123');
      });

      expect(result.current.currentCampaign).toBe(null);
    });

    it('should not clear currentCampaign if leaving different campaign', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      // Join campaign A
      act(() => {
        result.current.joinCampaign('campaign-a');
      });

      // Leave campaign B
      act(() => {
        result.current.leaveCampaign('campaign-b');
      });

      expect(result.current.currentCampaign).toBe('campaign-a');
    });
  });
});

// =============================================================================
// Messaging Actions Tests
// =============================================================================

describe('useSocketConnection - Messaging Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendMessage()', () => {
    it('should call socketService.sendMessage with content', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      act(() => {
        result.current.sendMessage('Hello world');
      });

      expect(socketService.sendMessage).toHaveBeenCalledWith(
        'Hello world',
        'public',
        undefined
      );
    });

    it('should call with visibility parameter', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      act(() => {
        result.current.sendMessage('Secret message', 'kp');
      });

      expect(socketService.sendMessage).toHaveBeenCalledWith(
        'Secret message',
        'kp',
        undefined
      );
    });

    it('should call with visible_to parameter for private messages', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      act(() => {
        result.current.sendMessage('Private message', 'private', ['user-123']);
      });

      expect(socketService.sendMessage).toHaveBeenCalledWith(
        'Private message',
        'private',
        ['user-123']
      );
    });

    it('should add message to queue when game:message event fires', async () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      const testMessage = {
        id: 'msg-123',
        sender_id: 'user-456',
        content: 'Test message',
        visibility: 'public' as const,
        timestamp: '2024-01-01T00:00:00Z',
      };

      await act(async () => {
        const onCalls = (socketService.on as any).mock.calls;
        const messageCall = onCalls.find((call: any[]) => call[0] === 'game:message');

        if (messageCall && messageCall[1]) {
          messageCall[1](testMessage);
        }
      });

      expect(result.current.messageQueue).toContainEqual(testMessage);
    });
  });
});

// =============================================================================
// Spotlight Actions Tests
// =============================================================================

describe('useSocketConnection - Spotlight Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('requestSpotlight()', () => {
    it('should call socketService.requestSpotlight', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      act(() => {
        result.current.requestSpotlight();
      });

      expect(socketService.requestSpotlight).toHaveBeenCalled();
    });

    it('should update spotlightHolder when spotlight:granted event fires', async () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      await act(async () => {
        const onCalls = (socketService.on as any).mock.calls;
        const grantedCall = onCalls.find((call: any[]) => call[0] === 'spotlight:granted');

        if (grantedCall && grantedCall[1]) {
          grantedCall[1]({ user_id: 'user-123', character_name: 'Hero' });
        }
      });

      expect(result.current.spotlightHolder).toBe('user-123');
    });
  });

  describe('releaseSpotlight()', () => {
    it('should call socketService.releaseSpotlight', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      act(() => {
        result.current.releaseSpotlight();
      });

      expect(socketService.releaseSpotlight).toHaveBeenCalled();
    });

    it('should update spotlightHolder when spotlight:released event fires', async () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      // First grant spotlight
      await act(async () => {
        const onCalls = (socketService.on as any).mock.calls;
        const grantedCall = onCalls.find((call: any[]) => call[0] === 'spotlight:granted');

        if (grantedCall && grantedCall[1]) {
          grantedCall[1]({ user_id: 'user-123' });
        }
      });

      expect(result.current.spotlightHolder).toBe('user-123');

      // Then release it
      await act(async () => {
        const releasedCall = onCalls.find((call: any[]) => call[0] === 'spotlight:released');

        if (releasedCall && releasedCall[1]) {
          releasedCall[1]({ next_user_id: null });
        }
      });

      expect(result.current.spotlightHolder).toBe(null);
    });

    it('should transfer spotlight to next user when released', async () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      await act(async () => {
        const onCalls = (socketService.on as any).mock.calls;
        const releasedCall = onCalls.find((call: any[]) => call[0] === 'spotlight:released');

        if (releasedCall && releasedCall[1]) {
          releasedCall[1]({ next_user_id: 'user-456' });
        }
      });

      expect(result.current.spotlightHolder).toBe('user-456');
    });
  });

  describe('requestCutIn()', () => {
    it('should call socketService.requestCutIn with reason', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      act(() => {
        result.current.requestCutIn('Emergency!');
      });

      expect(socketService.requestCutIn).toHaveBeenCalledWith('Emergency!');
    });
  });

  describe('spotlight queue', () => {
    it('should update spotlightQueue when spotlight:queue_updated event fires', async () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      const testQueue = [
        { user_id: 'user-1', character_name: 'Char1', position: 1, type: 'normal' as const },
        { user_id: 'user-2', character_name: 'Char2', position: 2, type: 'priority' as const },
      ];

      await act(async () => {
        const onCalls = (socketService.on as any).mock.calls;
        const queueCall = onCalls.find((call: any[]) => call[0] === 'spotlight:queue_updated');

        if (queueCall && queueCall[1]) {
          queueCall[1]({ queue: testQueue });
        }
      });

      expect(result.current.spotlightQueue).toEqual(testQueue);
    });
  });
});

// =============================================================================
// Typing Actions Tests
// =============================================================================

describe('useSocketConnection - Typing Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('startTyping()', () => {
    it('should call socketService.startTyping', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      act(() => {
        result.current.startTyping();
      });

      expect(socketService.startTyping).toHaveBeenCalled();
    });
  });

  describe('stopTyping()', () => {
    it('should call socketService.stopTyping', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      act(() => {
        result.current.stopTyping();
      });

      expect(socketService.stopTyping).toHaveBeenCalled();
    });
  });
});

// =============================================================================
// Presence State Tests
// =============================================================================

describe('useSocketConnection - Presence State', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('onlineUsers', () => {
    it('should update onlineUsers when presence:update event fires', async () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      await act(async () => {
        const onCalls = (socketService.on as any).mock.calls;
        const presenceCall = onCalls.find((call: any[]) => call[0] === 'presence:update');

        if (presenceCall && presenceCall[1]) {
          presenceCall[1]({ online_users: ['user-1', 'user-2', 'user-3'] });
        }
      });

      expect(result.current.onlineUsers).toEqual(['user-1', 'user-2', 'user-3']);
    });

    it('should handle empty online users list', async () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
        })
      );

      await act(async () => {
        const onCalls = (socketService.on as any).mock.calls;
        const presenceCall = onCalls.find((call: any[]) => call[0] === 'presence:update');

        if (presenceCall && presenceCall[1]) {
          presenceCall[1]({ online_users: [] });
        }
      });

      expect(result.current.onlineUsers).toEqual([]);
    });
  });
});

// =============================================================================
// Event Callbacks Tests
// =============================================================================

describe('useSocketConnection - Event Callbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('onConnected callback', () => {
    it('should call onConnected callback when connected', async () => {
      const onConnected = vi.fn();

      const { result } = renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
          onConnected,
        })
      );

      // Get the callback registered by the hook
      const onCalls = (socketService.on as any).mock.calls;
      const connectedCall = onCalls.find((call: any[]) => call[0] === 'connected');

      // Trigger the connected event
      await act(async () => {
        if (connectedCall && connectedCall[1]) {
          connectedCall[1]({ message: 'Connected', user_id: 'user-123' });
        }
      });

      expect(onConnected).toHaveBeenCalled();
    });
  });

  describe('onMessage callback', () => {
    it('should call onMessage callback when game:message received', async () => {
      const onMessage = vi.fn();
      const testMessage = {
        id: 'msg-123',
        sender_id: 'user-456',
        content: 'Hello',
        visibility: 'public' as const,
        timestamp: '2024-01-01T00:00:00Z',
      };

      renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
          onMessage,
        })
      );

      await act(async () => {
        const onCalls = (socketService.on as any).mock.calls;
        const messageCall = onCalls.find((call: any[]) => call[0] === 'game:message');

        if (messageCall && messageCall[1]) {
          messageCall[1](testMessage);
        }
      });

      expect(onMessage).toHaveBeenCalledWith(testMessage);
    });
  });

  describe('onMemberJoined callback', () => {
    it('should call onMemberJoined callback when member:joined received', async () => {
      const onMemberJoined = vi.fn();
      const memberData = {
        user_id: 'user-789',
        character_name: 'New Guy',
      };

      renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
          onMemberJoined,
        })
      );

      await act(async () => {
        const onCalls = (socketService.on as any).mock.calls;
        const joinedCall = onCalls.find((call: any[]) => call[0] === 'member:joined');

        if (joinedCall && joinedCall[1]) {
          joinedCall[1](memberData);
        }
      });

      expect(onMemberJoined).toHaveBeenCalledWith(memberData);
    });
  });

  describe('onMemberLeft callback', () => {
    it('should call onMemberLeft callback when member:left received', async () => {
      const onMemberLeft = vi.fn();
      const memberData = {
        user_id: 'user-999',
      };

      renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
          onMemberLeft,
        })
      );

      await act(async () => {
        const onCalls = (socketService.on as any).mock.calls;
        const leftCall = onCalls.find((call: any[]) => call[0] === 'member:left');

        if (leftCall && leftCall[1]) {
          leftCall[1](memberData);
        }
      });

      expect(onMemberLeft).toHaveBeenCalledWith(memberData);
    });
  });

  describe('onPresenceUpdate callback', () => {
    it('should call onPresenceUpdate callback when presence:update received', async () => {
      const onPresenceUpdate = vi.fn();
      const presenceData = {
        online_users: ['user-1', 'user-2'],
      };

      renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
          onPresenceUpdate,
        })
      );

      await act(async () => {
        const onCalls = (socketService.on as any).mock.calls;
        const presenceCall = onCalls.find((call: any[]) => call[0] === 'presence:update');

        if (presenceCall && presenceCall[1]) {
          presenceCall[1](presenceData);
        }
      });

      expect(onPresenceUpdate).toHaveBeenCalledWith(presenceData);
    });
  });

  describe('onError callback', () => {
    it('should call onError callback when error received', async () => {
      const onError = vi.fn();
      const errorData = { message: 'Something went wrong' };

      renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
          onError,
        })
      );

      await act(async () => {
        const onCalls = (socketService.on as any).mock.calls;
        const errorCall = onCalls.find((call: any[]) => call[0] === 'error');

        if (errorCall && errorCall[1]) {
          errorCall[1](errorData);
        }
      });

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError.mock.calls[0][0].message).toBe('Something went wrong');
    });
  });

  describe('onSpotlightGranted callback', () => {
    it('should call onSpotlightGranted callback when spotlight:granted received', async () => {
      const onSpotlightGranted = vi.fn();
      const spotlightData = {
        user_id: 'user-123',
        character_name: 'Hero',
      };

      renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
          onSpotlightGranted,
        })
      );

      await act(async () => {
        const onCalls = (socketService.on as any).mock.calls;
        const grantedCall = onCalls.find((call: any[]) => call[0] === 'spotlight:granted');

        if (grantedCall && grantedCall[1]) {
          grantedCall[1](spotlightData);
        }
      });

      expect(onSpotlightGranted).toHaveBeenCalledWith(spotlightData);
    });
  });

  describe('onSpotlightReleased callback', () => {
    it('should call onSpotlightReleased callback when spotlight:released received', async () => {
      const onSpotlightReleased = vi.fn();
      const releaseData = {
        next_user_id: 'user-456',
      };

      renderHook(() =>
        useSocketConnection({
          token: 'test-token',
          autoConnect: false,
          onSpotlightReleased,
        })
      );

      await act(async () => {
        const onCalls = (socketService.on as any).mock.calls;
        const releasedCall = onCalls.find((call: any[]) => call[0] === 'spotlight:released');

        if (releasedCall && releasedCall[1]) {
          releasedCall[1](releaseData);
        }
      });

      expect(onSpotlightReleased).toHaveBeenCalledWith(releaseData);
    });
  });
});

// =============================================================================
// Auto-connect Tests
// =============================================================================

describe('useSocketConnection - Auto-connect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should auto-connect when token is provided and autoConnect is true', () => {
    renderHook(() =>
      useSocketConnection({
        token: 'test-token',
        autoConnect: true,
      })
    );

    expect(socketService.connect).toHaveBeenCalledWith('test-token');
  });

  it('should not auto-connect when autoConnect is false', () => {
    renderHook(() =>
      useSocketConnection({
        token: 'test-token',
        autoConnect: false,
      })
    );

    expect(socketService.connect).not.toHaveBeenCalled();
  });

  it('should not auto-connect when token is null', () => {
    renderHook(() =>
      useSocketConnection({
        token: null,
        autoConnect: true,
      })
    );

    expect(socketService.connect).not.toHaveBeenCalled();
  });

  it('should disconnect on unmount if autoConnect is true', () => {
    const { unmount } = renderHook(() =>
      useSocketConnection({
        token: 'test-token',
        autoConnect: true,
      })
    );

    unmount();

    expect(socketService.disconnect).toHaveBeenCalledWith(false);
  });

  it('should not disconnect on unmount if autoConnect is false', () => {
    const { unmount } = renderHook(() =>
      useSocketConnection({
        token: 'test-token',
        autoConnect: false,
      })
    );

    unmount();

    expect(socketService.disconnect).not.toHaveBeenCalled();
  });
});
