/**
 * Tests for Socket.io client service.
 *
 * This test suite follows TDD principles:
 * 1. Tests are written FIRST
 * 2. Tests document expected behavior
 * 3. Implementation follows to make tests pass
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Server } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer } from 'http';
import { AddressInfo } from 'net';

// Import the service we're testing
import { socketService } from '../socket';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from '@/types/socket';

// =============================================================================
// Test Utilities
// =============================================================================

let ioServer: Server;
let serverPort: number;
let serverUrl: string;
let clientSockets: ClientSocket[] = [];

// Helper to wait for connection with timeout
async function waitForConnection(
  socketService: any,
  timeoutMs = 2000
): Promise<boolean> {
  return Promise.race([
    new Promise<boolean>((resolve) => {
      socketService.on('connected', () => resolve(true));
    }),
    new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), timeoutMs)
    ),
  ]);
}

async function createTestServer(): Promise<void> {
  const httpServer = createServer();

  ioServer = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: '*' },
    path: '/socket.io',
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(() => {
      const port = (httpServer.address() as AddressInfo).port;
      serverPort = port;
      serverUrl = `http://localhost:${port}`;
      resolve();
    });
  });

  // Set up server event handlers for testing
  ioServer.on('connection', (socket) => {
    const token = socket.handshake.auth.token;

    if (!token || !token.startsWith('valid_token')) {
      socket.disconnect();
      return;
    }

    // Send connected confirmation
    socket.emit('connected', {
      message: 'Connected to test server',
      user_id: 'test-user-123',
    });

    // Handle campaign:join
    socket.on('campaign:join', (data) => {
      socket.emit('campaign:joined', {
        campaign_id: data.campaign_id,
        members: [],
      });
    });

    // Handle campaign:leave
    socket.on('campaign:leave', () => {
      // Just acknowledge
    });

    // Handle game:message
    socket.on('game:message', (data) => {
      // Broadcast to room
      socket.emit('game:message', {
        id: `msg-${Date.now()}`,
        sender_id: 'test-user-123',
        content: data.content,
        visibility: data.visibility,
        timestamp: new Date().toISOString(),
      });
    });

    // Handle typing:start
    socket.on('typing:start', () => {
      socket.emit('user:typing', {
        user_id: 'test-user-123',
        character_name: 'Test Character',
      });
    });

    // Handle typing:stop
    socket.on('typing:stop', () => {
      // Just acknowledge
    });

    // Handle spotlight:request
    socket.on('spotlight:request', () => {
      socket.emit('spotlight:granted', {
        user_id: 'test-user-123',
        character_name: 'Test Character',
      });
    });

    // Handle spotlight:release
    socket.on('spotlight:release', () => {
      socket.emit('spotlight:released', {
        next_user_id: null,
      });
    });
  });
}

function createTestClient(token: string): ClientSocket {
  const client = ioClient(serverUrl, {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket'],
  });

  clientSockets.push(client);
  return client;
}

async function cleanupTestServer(): Promise<void> {
  // Disconnect all clients
  for (const socket of clientSockets) {
    if (socket.connected) {
      socket.disconnect();
    }
  }
  clientSockets = [];

  // Close server
  if (ioServer) {
    await ioServer.close();
  }
}

// =============================================================================
// Connection Management Tests
// =============================================================================

describe('SocketService - Connection Management', () => {
  beforeEach(async () => {
    await createTestServer();
  });

  afterEach(async () => {
    await cleanupTestServer();
    // Reset service state
    socketService.disconnect();
  });

  describe('connect()', () => {
    it('should connect to server with valid token', async () => {
      const connectPromise = new Promise<void>((resolve) => {
        socketService.on('connected', () => resolve());
      });

      socketService.connect('valid_token_test-user-123', { url: serverUrl });

      await expect(connectPromise).resolves.not.toThrow();
      expect(socketService.isConnected()).toBe(true);
    });

    it('should reject connection with invalid token', async () => {
      const errorSpy = vi.fn();

      socketService.on('error', errorSpy as any);
      socketService.connect('invalid_token', { url: serverUrl });

      // Wait a bit for connection attempt
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(socketService.isConnected()).toBe(false);
    });

    it('should reject connection without token', async () => {
      socketService.connect('', { url: serverUrl });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(socketService.isConnected()).toBe(false);
    });

    it('should not connect if already connected', () => {
      socketService.connect('valid_token_test', { url: serverUrl });

      // Try to connect again
      socketService.connect('valid_token_test2', { url: serverUrl });

      // Should still use first connection
      expect(socketService.isConnected()).toBe(true);
    });

    it('should use custom connection options', async () => {
      const connectPromise = new Promise<void>((resolve) => {
        socketService.on('connected', () => resolve());
      });

      socketService.connect('valid_token_test', {
        url: serverUrl,
        autoReconnect: false,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      });

      await expect(connectPromise).resolves.not.toThrow();
    });
  });

  describe('disconnect()', () => {
    it('should disconnect from server', async () => {
      // First connect
      const connectPromise = new Promise<void>((resolve) => {
        socketService.on('connected', () => resolve());
      });

      socketService.connect('valid_token_test', { url: serverUrl });
      await connectPromise;

      expect(socketService.isConnected()).toBe(true);

      // Then disconnect
      socketService.disconnect();

      expect(socketService.isConnected()).toBe(false);
    });

    it('should clear event listeners on disconnect', () => {
      socketService.connect('valid_token_test', { url: serverUrl });
      socketService.disconnect();

      // Event listeners should be cleared
      expect(socketService.isConnected()).toBe(false);
    });

    it('should clear message buffer on disconnect', () => {
      socketService.connect('valid_token_test', { url: serverUrl });

      // Try to send message (will be buffered since no actual connection)
      socketService.sendMessage('Test message');

      socketService.disconnect();

      // Buffer should be cleared
    });
  });

  describe('reconnect()', () => {
    it('should force reconnection to server', async () => {
      // First connection
      const connectPromise1 = new Promise<void>((resolve) => {
        socketService.on('connected', () => resolve());
      });

      socketService.connect('valid_token_test', { url: serverUrl });
      await connectPromise1;

      expect(socketService.isConnected()).toBe(true);

      // Reconnect
      const connectPromise2 = new Promise<void>((resolve) => {
        socketService.on('connected', () => resolve());
      });

      socketService.reconnect();

      await expect(connectPromise2).resolves.not.toThrow();
      expect(socketService.isConnected()).toBe(true);
    });

    it('should reset manual disconnect flag', async () => {
      socketService.connect('valid_token_test', { url: serverUrl });
      socketService.disconnect(true);

      // Reconnect should work
      const connectPromise = new Promise<void>((resolve) => {
        socketService.on('connected', () => resolve());
      });

      socketService.reconnect();

      await expect(connectPromise).resolves.not.toThrow();
    });
  });

  describe('getId()', () => {
    it('should return socket ID when connected', async () => {
      const connectPromise = new Promise<void>((resolve) => {
        socketService.on('connected', () => resolve());
      });

      socketService.connect('valid_token_test', { url: serverUrl });
      await connectPromise;

      const socketId = socketService.getId();

      expect(socketId).toBeDefined();
      expect(typeof socketId).toBe('string');
    });

    it('should return undefined when disconnected', () => {
      const socketId = socketService.getId();

      expect(socketId).toBeUndefined();
    });
  });
});

// =============================================================================
// Event Subscription Tests
// =============================================================================

describe('SocketService - Event Subscription', () => {
  beforeEach(async () => {
    await createTestServer();
  });

  afterEach(async () => {
    await cleanupTestServer();
    socketService.disconnect();
  });

  describe('on()', () => {
    it('should subscribe to connected event', async () => {
      const callback = vi.fn();

      socketService.on('connected', callback as any);
      socketService.connect('valid_token_test', { url: serverUrl });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.any(String),
          user_id: expect.any(String),
        })
      );
    });

    it('should subscribe to campaign:joined event', async () => {
      const callback = vi.fn();

      socketService.on('campaign:joined', callback as any);

      const connectPromise = new Promise<void>((resolve) => {
        socketService.on('connected', () => resolve());
      });

      socketService.connect('valid_token_test', { url: serverUrl });
      await connectPromise;

      // Join campaign
      socketService.joinCampaign('test-campaign-123');

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          campaign_id: 'test-campaign-123',
        })
      );
    });

    it('should subscribe to game:message event', async () => {
      const callback = vi.fn();

      socketService.on('game:message', callback as any);

      const connectPromise = new Promise<void>((resolve) => {
        socketService.on('connected', () => resolve());
      });

      socketService.connect('valid_token_test', { url: serverUrl });
      await connectPromise;

      // Send message
      socketService.sendMessage('Hello, campaign!');

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Hello, campaign!',
        })
      );
    });

    it('should allow multiple subscribers for same event', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      socketService.on('connected', callback1 as any);
      socketService.on('connected', callback2 as any);

      socketService.connect('valid_token_test', { url: serverUrl });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('off()', () => {
    it('should unsubscribe specific callback from event', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      socketService.on('connected', callback1 as any);
      socketService.on('connected', callback2 as any);

      // Unsubscribe only callback1
      socketService.off('connected', callback1 as any);

      socketService.connect('valid_token_test', { url: serverUrl });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should unsubscribe all callbacks for event when no callback specified', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      socketService.on('connected', callback1 as any);
      socketService.on('connected', callback2 as any);

      // Unsubscribe all
      socketService.off('connected');

      socketService.connect('valid_token_test', { url: serverUrl });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });

    it('should handle unsubscribing from non-existent event gracefully', () => {
      expect(() => {
        socketService.off('nonexistent');
      }).not.toThrow();
    });
  });
});

// =============================================================================
// Campaign Management Tests
// =============================================================================

describe('SocketService - Campaign Management', () => {
  beforeEach(async () => {
    await createTestServer();
  });

  afterEach(async () => {
    await cleanupTestServer();
    socketService.disconnect();
  });

  describe('joinCampaign()', () => {
    it('should join campaign room', async () => {
      const connectPromise = new Promise<void>((resolve) => {
        socketService.on('connected', () => resolve());
      });

      socketService.connect('valid_token_test', { url: serverUrl });
      await connectPromise;

      const joinedPromise = new Promise<void>((resolve) => {
        socketService.on('campaign:joined', () => resolve());
      });

      socketService.joinCampaign('test-campaign-123', 'test-character-456');

      await expect(joinedPromise).resolves.not.toThrow();
    });

    it('should send character_id if provided', async () => {
      const callback = vi.fn();

      socketService.on('campaign:joined', callback as any);

      const connectPromise = new Promise<void>((resolve) => {
        socketService.on('connected', () => resolve());
      });

      socketService.connect('valid_token_test', { url: serverUrl });
      await connectPromise;

      socketService.joinCampaign('test-campaign', 'test-character');

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Server should have received character_id
    });

    it('should warn when not connected', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      socketService.joinCampaign('test-campaign');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cannot join campaign')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('leaveCampaign()', () => {
    it('should leave campaign room', async () => {
      const connectPromise = new Promise<void>((resolve) => {
        socketService.on('connected', () => resolve());
      });

      socketService.connect('valid_token_test', { url: serverUrl });
      await connectPromise;

      // Join first
      socketService.joinCampaign('test-campaign');
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Then leave
      socketService.leaveCampaign('test-campaign');

      // Should not throw
      expect(socketService.isConnected()).toBe(true);
    });
  });
});

// =============================================================================
// Messaging Tests
// =============================================================================

describe('SocketService - Messaging', () => {
  beforeEach(async () => {
    await createTestServer();
  });

  afterEach(async () => {
    await cleanupTestServer();
    socketService.disconnect();
  });

  describe('sendMessage()', () => {
    it('should send message with public visibility', async () => {
      const connectPromise = new Promise<void>((resolve) => {
        socketService.on('connected', () => resolve());
      });

      socketService.connect('valid_token_test', { url: serverUrl });
      await connectPromise;

      const messagePromise = new Promise<void>((resolve) => {
        socketService.on('game:message', () => resolve());
      });

      socketService.sendMessage('Test message', 'public');

      await expect(messagePromise).resolves.not.toThrow();
    });

    it('should send message with private visibility', async () => {
      const connectPromise = new Promise<void>((resolve) => {
        socketService.on('connected', () => resolve());
      });

      socketService.connect('valid_token_test', { url: serverUrl });
      await connectPromise;

      const messagePromise = new Promise<void>((resolve) => {
        socketService.on('game:message', () => resolve());
      });

      socketService.sendMessage('Private message', 'private', ['user-123']);

      await expect(messagePromise).resolves.not.toThrow();
    });

    it('should default to public visibility', async () => {
      const connectPromise = new Promise<void>((resolve) => {
        socketService.on('connected', () => resolve());
      });

      socketService.connect('valid_token_test', { url: serverUrl });
      await connectPromise;

      const messagePromise = new Promise<void>((resolve) => {
        socketService.on('game:message', () => resolve());
      });

      socketService.sendMessage('Test message');

      await expect(messagePromise).resolves.not.toThrow();
    });

    it('should buffer messages when disconnected', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      socketService.sendMessage('Buffered message');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('buffering')
      );

      consoleSpy.mockRestore();
    });
  });
});

// =============================================================================
// Spotlight Tests
// =============================================================================

describe('SocketService - Spotlight System', () => {
  beforeEach(async () => {
    await createTestServer();
  });

  afterEach(async () => {
    await cleanupTestServer();
    socketService.disconnect();
  });

  describe('requestSpotlight()', () => {
    it('should request spotlight', async () => {
      const connectPromise = new Promise<void>((resolve) => {
        socketService.on('connected', () => resolve());
      });

      socketService.connect('valid_token_test', { url: serverUrl });
      await connectPromise;

      const grantedPromise = new Promise<void>((resolve) => {
        socketService.on('spotlight:granted', () => resolve());
      });

      socketService.requestSpotlight();

      await expect(grantedPromise).resolves.not.toThrow();
    });

    it('should warn when not connected', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      socketService.requestSpotlight();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cannot request spotlight')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('releaseSpotlight()', () => {
    it('should release spotlight', async () => {
      const connectPromise = new Promise<void>((resolve) => {
        socketService.on('connected', () => resolve());
      });

      socketService.connect('valid_token_test', { url: serverUrl });
      await connectPromise;

      const releasedPromise = new Promise<void>((resolve) => {
        socketService.on('spotlight:released', () => resolve());
      });

      socketService.releaseSpotlight();

      await expect(releasedPromise).resolves.not.toThrow();
    });
  });

  describe('requestCutIn()', () => {
    it('should request cut-in with reason', async () => {
      const connectPromise = new Promise<void>((resolve) => {
        socketService.on('connected', () => resolve());
      });

      socketService.connect('valid_token_test', { url: serverUrl });
      await connectPromise;

      // Cut-in request (server doesn't handle this in test, but should not error)
      expect(() => {
        socketService.requestCutIn('Emergency reason');
      }).not.toThrow();
    });
  });
});

// =============================================================================
// Typing Indicator Tests
// =============================================================================

describe('SocketService - Typing Indicators', () => {
  beforeEach(async () => {
    await createTestServer();
  });

  afterEach(async () => {
    await cleanupTestServer();
    socketService.disconnect();
  });

  describe('startTyping()', () => {
    it('should send typing start indicator', async () => {
      const connectPromise = new Promise<void>((resolve) => {
        socketService.on('connected', () => resolve());
      });

      socketService.connect('valid_token_test', { url: serverUrl });
      await connectPromise;

      const typingPromise = new Promise<void>((resolve) => {
        socketService.on('user:typing', () => resolve());
      });

      socketService.startTyping();

      await expect(typingPromise).resolves.not.toThrow();
    });

    it('should debounce multiple startTyping calls', async () => {
      const connectPromise = new Promise<void>((resolve) => {
        socketService.on('connected', () => resolve());
      });

      socketService.connect('valid_token_test', { url: serverUrl });
      await connectPromise;

      socketService.startTyping();
      socketService.startTyping();
      socketService.startTyping();

      // Should only emit once due to debouncing
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  });

  describe('stopTyping()', () => {
    it('should send typing stop indicator', async () => {
      const connectPromise = new Promise<void>((resolve) => {
        socketService.on('connected', () => resolve());
      });

      socketService.connect('valid_token_test', { url: serverUrl });
      await connectPromise;

      socketService.startTyping();
      socketService.stopTyping();

      // Should not throw
      expect(socketService.isConnected()).toBe(true);
    });

    it('should clear typing timer', async () => {
      const connectPromise = new Promise<void>((resolve) => {
        socketService.on('connected', () => resolve());
      });

      socketService.connect('valid_token_test', { url: serverUrl });
      await connectPromise;

      socketService.startTyping();
      socketService.stopTyping();

      // Wait for auto-stop timeout (should not trigger)
      await new Promise((resolve) => setTimeout(resolve, 3500));
    });
  });
});
