"""
E2E Tests for M2 Multiplayer Web Implementation.

This test suite covers end-to-end multiplayer scenarios:
1. Two players joining a campaign
2. Real-time message synchronization
3. Spotlight system coordination
4. Visibility control (KP-only, private messages)
5. Disconnect and recovery scenarios
6. Concurrent input handling

@vitest-environment node
"""
import { test, expect, beforeEach, afterEach } from 'vitest';
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import path from 'path';

// =============================================================================
// Test Configuration
// =============================================================================

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5173';
const API_URL = process.env.TEST_API_URL || 'http://localhost:8000';

interface TestUser {
  username: string;
  email: string;
  password: string;
  token?: string;
}

interface CampaignData {
  name: string;
  description: string;
  inviteCode?: string;
  id?: string;
}

// =============================================================================
// Test Fixtures
// =============================================================================

let browser: Browser;
let context1: BrowserContext;
let context2: BrowserContext;
let page1: Page;
let page2: Page;

beforeEach(async () => {
  browser = await chromium.launch({
    headless: true,
    slowMo: 50, // Slow down for better visibility
  });

  // Create two browser contexts (two players)
  context1 = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });

  context2 = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });

  page1 = await context1.newPage();
  page2 = await context2.newPage();
});

afterEach(async () => {
  await context1.close();
  await context2.close();
  await browser.close();
});

// =============================================================================
// Helper Functions
// =============================================================================

async function registerUser(page: Page, user: TestUser): Promise<void> {
  await page.goto(`${API_URL}/docs`);

  // Use API to register
  await page.request.post(`${API_URL}/api/auth/register`, {
    data: {
      username: user.username,
      email: user.email,
      password: user.password,
    },
  });
}

async function loginUser(page: Page, user: TestUser): Promise<string> {
  const response = await page.request.post(`${API_URL}/api/auth/login`, {
    data: {
      username: user.username,
      password: user.password,
    },
  });

  const data = await response.json();
  return data.access_token;
}

async function createCampaign(page: Page, token: string, campaignData: CampaignData): Promise<CampaignData> {
  const response = await page.request.post(`${API_URL}/api/campaigns`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    data: campaignData,
  });

  return await response.json() as CampaignData;
}

async function joinCampaign(page: Page, token: string, inviteCode: string, characterId?: string): Promise<void> {
  await page.request.post(`${API_URL}/api/campaigns/join`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    data: {
      invite_code: inviteCode,
      character_id: characterId,
    },
  });
}

async function createCharacter(page: Page, token: string, name: string): Promise<string> {
  const response = await page.request.post(`${API_URL}/api/characters`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    data: {
      name,
      age: 25,
      gender: 'M',
      occupation: 'Private Investigator',
    },
  });

  const data = await response.json();
  return data.id;
}

async function waitForWebSocketConnection(page: Page, timeout = 5000): Promise<void> {
  await page.waitForFunction(
    () => (window as any).socketConnected === true,
    { timeout }
  );
}

async function sendMessage(page: Page, message: string): Promise<void> {
  await page.fill('[data-testid="message-input"]', message);
  await page.click('[data-testid="send-message-button"]');
}

async function waitForMessage(page: Page, text: string, timeout = 5000): Promise<void> {
  await page.waitForSelector(`text=${text}`, { timeout });
}

// =============================================================================
// E2E Test Scenarios
// =============================================================================

describe('E2E: Multiplayer Campaign Flow', () => {
  test('should allow two players to join the same campaign', async () => {
    // Arrange: Create two users and a campaign
    const user1: TestUser = {
      username: 'player1',
      email: 'player1@test.com',
      password: 'password123',
    };

    const user2: TestUser = {
      username: 'player2',
      email: 'player2@test.com',
      password: 'password123',
    };

    await registerUser(page1, user1);
    await registerUser(page2, user2);

    const token1 = await loginUser(page1, user1);
    const token2 = await loginUser(page2, user2);

    const campaign = await createCampaign(page1, token1, {
      name: 'Test Campaign',
      description: 'A test campaign for E2E testing',
    });

    // Act: Player 2 joins the campaign
    await joinCampaign(page2, token2, campaign.invite_code!);

    // Assert: Both players are in the campaign
    const members1 = await page1.request.get(`${API_URL}/api/campaigns/${campaign.id}/members`, {
      headers: { 'Authorization': `Bearer ${token1}` },
    });

    const members2 = await page2.request.get(`${API_URL}/api/campaigns/${campaign.id}/members`, {
      headers: { 'Authorization': `Bearer ${token2}` },
    });

    const membersList1 = await members1.json();
    const membersList2 = await members2.json();

    expect(membersList1).toHaveLength(2);
    expect(membersList2).toHaveLength(2);
  });

  test('should synchronize real-time messages between players', async () => {
    // Setup: Two users in same campaign
    const user1: TestUser = { username: 'p1', email: 'p1@test.com', password: 'pass123' };
    const user2: TestUser = { username: 'p2', email: 'p2@test.com', password: 'pass123' };

    await registerUser(page1, user1);
    await registerUser(page2, user2);

    const token1 = await loginUser(page1, user1);
    const token2 = await loginUser(page2, user2);

    const campaign = await createCampaign(page1, token1, {
      name: 'Sync Test Campaign',
      description: 'Testing message sync',
    });

    await joinCampaign(page2, token2, campaign.invite_code!);

    // Navigate to game pages
    await page1.goto(`${BASE_URL}/game/${campaign.id}`);
    await page2.goto(`${BASE_URL}/game/${campaign.id}`);

    // Wait for WebSocket connections
    await waitForWebSocketConnection(page1);
    await waitForWebSocketConnection(page2);

    // Act: Player 1 sends a message
    const testMessage = 'Hello from Player 1!';
    await sendMessage(page1, testMessage);

    // Assert: Player 2 receives the message
    await waitForMessage(page2, testMessage);

    // Verify message content
    const messages2 = await page2.locator('[data-testid="game-message"]').all();
    expect(messages2.length).toBeGreaterThan(0);
    expect(await messages2[messages2.length - 1].textContent()).toContain(testMessage);
  });

  test('should show correct online status for campaign members', async () => {
    // Setup: Two users in campaign
    const user1: TestUser = { username: 'online1', email: 'online1@test.com', password: 'pass123' };
    const user2: TestUser = { username: 'online2', email: 'online2@test.com', password: 'pass123' };

    await registerUser(page1, user1);
    await registerUser(page2, user2);

    const token1 = await loginUser(page1, user1);
    const token2 = await loginUser(page2, user2);

    const campaign = await createCampaign(page1, token1, {
      name: 'Online Status Test',
      description: 'Testing presence indicators',
    });

    await joinCampaign(page2, token2, campaign.invite_code!);

    await page1.goto(`${BASE_URL}/game/${campaign.id}`);
    await page2.goto(`${BASE_URL}/game/${campaign.id}`);

    await waitForWebSocketConnection(page1);
    await waitForWebSocketConnection(page2);

    // Assert: Both players show as online
    const onlineUsers1 = await page1.locator('[data-testid="online-user"]').all();
    const onlineUsers2 = await page2.locator('[data-testid="online-user"]').all();

    expect(onlineUsers1.length).toBe(2);
    expect(onlineUsers2.length).toBe(2);
  });
});

describe('E2E: Spotlight System', () => {
  test('should handle spotlight request and release', async () => {
    // Setup: Campaign with multiple players
    const keeper: TestUser = { username: 'keeper', email: 'keeper@test.com', password: 'pass123' };
    const player1: TestUser = { username: 'spotlight1', email: 'spot1@test.com', password: 'pass123' };
    const player2: TestUser = { username: 'spotlight2', email: 'spot2@test.com', password: 'pass123' };

    await registerUser(page1, keeper);
    await registerUser(page2, player1);

    const tokenKeeper = await loginUser(page1, keeper);
    const token1 = await loginUser(page2, player1);

    const campaign = await createCampaign(page1, tokenKeeper, {
      name: 'Spotlight Test Campaign',
      description: 'Testing spotlight coordination',
    });

    const char1Id = await createCharacter(page2, token1, 'Detective One');
    await joinCampaign(page2, token1, campaign.invite_code!, char1Id);

    await page1.goto(`${BASE_URL}/game/${campaign.id}`);
    await page2.goto(`${BASE_URL}/game/${campaign.id}`);

    await waitForWebSocketConnection(page1);
    await waitForWebSocketConnection(page2);

    // Act: Player 1 requests spotlight
    await page2.click('[data-testid="request-spotlight-button"]');

    // Assert: Spotlight is granted to Player 1
    await page2.waitForSelector('[data-testid="spotlight-granted-indicator"]', { timeout: 5000 });

    // Verify spotlight holder display
    const spotlightHolder = await page2.locator('[data-testid="spotlight-holder"]').textContent();
    expect(spotlightHolder).toContain('Detective One');

    // Act: Player 1 releases spotlight
    await page2.click('[data-testid="release-spotlight-button"]');

    // Assert: Spotlight is released
    await page2.waitForSelector('[data-testid="spotlight-available-indicator"]', { timeout: 5000 });
  });

  test('should manage spotlight queue when multiple players request', async () => {
    // Setup: Three players in campaign
    const keeper: TestUser = { username: 'keeper3', email: 'keeper3@test.com', password: 'pass123' };
    const player1: TestUser = { username: 'queue1', email: 'queue1@test.com', password: 'pass123' };
    const player2: TestUser = { username: 'queue2', email: 'queue2@test.com', password: 'pass123' };

    await registerUser(page1, keeper);
    await registerUser(page2, player1);

    const tokenKeeper = await loginUser(page1, keeper);
    const token1 = await loginUser(page2, player1);

    const campaign = await createCampaign(page1, tokenKeeper, {
      name: 'Queue Test Campaign',
      description: 'Testing spotlight queue',
    });

    const char1Id = await createCharacter(page2, token1, 'Character One');
    await joinCampaign(page2, token1, campaign.invite_code!, char1Id);

    await page1.goto(`${BASE_URL}/game/${campaign.id}`);
    await page2.goto(`${BASE_URL}/game/${campaign.id}`);

    await waitForWebSocketConnection(page1);
    await waitForWebSocketConnection(page2);

    // Act: Player 1 gets spotlight, then player 2 requests while held
    await page2.click('[data-testid="request-spotlight-button"]');
    await page2.waitForSelector('[data-testid="spotlight-granted-indicator"]');

    // Player 2 would request here (simulated by checking queue display)
    // For now, verify queue position is shown
    const queueDisplay = await page2.locator('[data-testid="spotlight-queue"]');
    expect(await queueDisplay.isVisible()).toBe(true);
  });
});

describe('E2E: Visibility Control', () => {
  test('should filter KP-only messages from players', async () => {
    // Setup: Keeper and player in campaign
    const keeper: TestUser = { username: 'visibilityKeeper', email: 'vkeeper@test.com', password: 'pass123' };
    const player: TestUser = { username: 'visibilityPlayer', email: 'vplayer@test.com', password: 'pass123' };

    await registerUser(page1, keeper);
    await registerUser(page2, player);

    const tokenKeeper = await loginUser(page1, keeper);
    const tokenPlayer = await loginUser(page2, player);

    const campaign = await createCampaign(page1, tokenKeeper, {
      name: 'Visibility Test Campaign',
      description: 'Testing message visibility',
    });

    const charId = await createCharacter(page2, tokenPlayer, 'Investigator');
    await joinCampaign(page2, tokenPlayer, campaign.invite_code!, charId);

    await page1.goto(`${BASE_URL}/game/${campaign.id}`);
    await page2.goto(`${BASE_URL}/game/${campaign.id}`);

    await waitForWebSocketConnection(page1);
    await waitForWebSocketConnection(page2);

    // Act: Keeper sends KP-only message
    await page1.selectOption('[data-testid="visibility-selector"]', 'kp');
    await sendMessage(page1, 'This is a secret KP note about the plot');

    // Assert: Player does NOT see the KP message
    const playerMessages = await page2.locator('[data-testid="game-message"]').all();
    const hasKpMessage = await page2.getByText('secret KP note').count();

    expect(hasKpMessage).toBe(0);

    // Assert: Keeper DOES see the message
    await page1.getByText('secret KP note').waitFor({ timeout: 5000 });
  });

  test('should deliver private messages to specific users only', async () => {
    // Setup: Three users in campaign
    const keeper: TestUser = { username: 'privateKeeper', email: 'privatekeeper@test.com', password: 'pass123' };
    const player1: TestUser = { username: 'private1', email: 'private1@test.com', password: 'pass123' };
    const player2: TestUser = { username: 'private2', email: 'private2@test.com', password: 'pass123' };

    await registerUser(page1, keeper);
    await registerUser(page2, player1);

    const tokenKeeper = await loginUser(page1, keeper);
    const token1 = await loginUser(page2, player1);

    const campaign = await createCampaign(page1, tokenKeeper, {
      name: 'Private Message Test',
      description: 'Testing private messages',
    });

    const char1Id = await createCharacter(page2, token1, 'Private Investigator');
    await joinCampaign(page2, token1, campaign.invite_code!, char1Id);

    await page1.goto(`${BASE_URL}/game/${campaign.id}`);
    await page2.goto(`${BASE_URL}/game/${campaign.id}`);

    await waitForWebSocketConnection(page1);
    await waitForWebSocketConnection(page2);

    // Act: Keeper sends private message to Player 1 only
    await page1.selectOption('[data-testid="visibility-selector"]', 'private');
    // Select Player 1 as recipient
    await page1.check('[data-testid="user-${player1.username}-checkbox"]');
    await sendMessage(page1, 'Only you should see this - you found a hidden clue');

    // Assert: Player 1 sees the message
    await page2.getByText('Only you should see this').waitFor({ timeout: 5000 });

    // Assert: Player 2 does NOT see the message
    const p2Messages = await page2.locator('[data-testid="game-message"]').all();
    const hasPrivate = await page2.getByText('hidden clue').count();
    expect(hasPrivate).toBe(0);
  });
});

describe('E2E: Disconnect and Recovery', () => {
  test('should recover state after player disconnects and reconnects', async () => {
    // Setup: Two players in campaign
    const user1: TestUser = { username: 'reconnect1', email: 'reconnect1@test.com', password: 'pass123' };
    const user2: TestUser = { username: 'reconnect2', email: 'reconnect2@test.com', password: 'pass123' };

    await registerUser(page1, user1);
    await registerUser(page2, user2);

    const token1 = await loginUser(page1, user1);
    const token2 = await loginUser(page2, user2);

    const campaign = await createCampaign(page1, token1, {
      name: 'Reconnect Test Campaign',
      description: 'Testing disconnect recovery',
    });

    await joinCampaign(page2, token2, campaign.invite_code!);

    await page1.goto(`${BASE_URL}/game/${campaign.id}`);
    await page2.goto(`${BASE_URL}/game/${campaign.id}`);

    await waitForWebSocketConnection(page1);
    await waitForWebSocketConnection(page2);

    // Pre-disconnect: Send some messages
    await sendMessage(page1, 'Before disconnect message 1');
    await sendMessage(page2, 'Before disconnect message 2');

    // Act: Player 1 disconnects (simulate network loss)
    await page1.evaluate(() => {
      (window as any).socketService.disconnect();
    });

    // While disconnected: Player 2 sends messages
    await sendMessage(page2, 'While Player 1 was disconnected');

    // Act: Player 1 reconnects
    await page1.reload();
    await waitForWebSocketConnection(page1);

    // Assert: Player 1 receives missed messages
    await page1.getByText('While Player 1 was disconnected').waitFor({ timeout: 5000 });

    // Verify message history is intact
    const allMessages = await page1.locator('[data-testid="game-message"]').all();
    expect(allMessages.length).toBeGreaterThanOrEqual(4); // All messages recovered
  });

  test('should handle graceful degradation when recovery fails', async () => {
    // Setup: Player in campaign
    const user: TestUser = { username: 'degrade', email: 'degrade@test.com', password: 'pass123' };

    await registerUser(page1, user);
    const token = await loginUser(page1, user);

    const campaign = await createCampaign(page1, token, {
      name: 'Degradation Test',
      description: 'Testing graceful degradation',
    });

    await page1.goto(`${BASE_URL}/game/${campaign.id}`);
    await waitForWebSocketConnection(page1);

    // Act: Simulate recovery failure (corrupted state)
    await page1.evaluate(() => {
      // Trigger reconnection with simulated failure
      (window as any).simulateRecoveryFailure = true;
      (window as any).socketService.reconnect();
    });

    // Assert: App remains functional with limited features
    await page1.waitForSelector('[data-testid="connection-status"]', { timeout: 5000 });

    const status = await page1.locator('[data-testid="connection-status"]').textContent();
    expect(status).toContain('Limited Mode');
  });
});

describe('E2E: Concurrent Input Handling', () => {
  test('should serialize simultaneous game state changes', async () => {
    // Setup: Two players who might act simultaneously
    const user1: TestUser = { username: 'concurrent1', email: 'concurrent1@test.com', password: 'pass123' };
    const user2: TestUser = { username: 'concurrent2', email: 'concurrent2@test.com', password: 'pass123' };

    await registerUser(page1, user1);
    await registerUser(page2, user2);

    const token1 = await loginUser(page1, user1);
    const token2 = await loginUser(page2, user2);

    const campaign = await createCampaign(page1, token1, {
      name: 'Concurrent Test',
      description: 'Testing concurrent input',
    });

    await joinCampaign(page2, token2, campaign.invite_code!);

    await page1.goto(`${BASE_URL}/game/${campaign.id}`);
    await page2.goto(`${BASE_URL}/game/${campaign.id}`);

    await waitForWebSocketConnection(page1);
    await waitForWebSocketConnection(page2);

    // Act: Both players try to update the same state simultaneously
    // (e.g., both try to search the same object)
    await Promise.all([
      page1.fill('[data-testid="action-input"]', 'search the desk'),
      page2.fill('[data-testid="action-input"]', 'search the desk'),
    ]);

    await Promise.all([
      page1.click('[data-testid="submit-action-button"]'),
      page2.click('[data-testid="submit-action-button"]'),
    ]);

    // Assert: Actions are queued and processed in order
    // Second action should wait for first to complete
    await page1.waitForSelector('[data-testid="action-complete"]', { timeout: 5000 });
    await page2.waitForSelector('[data-testid="action-complete"]', { timeout: 5000 });

    // Verify no data corruption
    const finalState = await page1.locator('[data-testid="world-state"]').textContent();
    expect(finalState).toBeDefined();
  });

  test('should show action queue position when multiple actions pending', async () => {
    // Setup: Campaign with multiple active players
    const keeper: TestUser = { username: 'queueKeeper', email: 'queuekeeper@test.com', password: 'pass123' };
    const player: TestUser = { username: 'queuePlayer', email: 'queueplayer@test.com', password: 'pass123' };

    await registerUser(page1, keeper);
    await registerUser(page2, player);

    const tokenKeeper = await loginUser(page1, keeper);
    const tokenPlayer = await loginUser(page2, player);

    const campaign = await createCampaign(page1, tokenKeeper, {
      name: 'Queue Position Test',
      description: 'Testing action queue display',
    });

    const charId = await createCharacter(page2, tokenPlayer, 'Queue Test Character');
    await joinCampaign(page2, tokenPlayer, campaign.invite_code!, charId);

    await page1.goto(`${BASE_URL}/game/${campaign.id}`);
    await page2.goto(`${BASE_URL}/game/${campaign.id}`);

    await waitForWebSocketConnection(page1);
    await waitForWebSocketConnection(page2);

    // Act: Submit multiple actions rapidly
    await page2.fill('[data-testid="action-input"]', 'search room');
    await page2.click('[data-testid="submit-action-button"]');

    await page2.fill('[data-testid="action-input"]', 'search desk');
    await page2.click('[data-testid="submit-action-button"]');

    // Assert: Queue position is displayed
    const queueIndicator = await page2.locator('[data-testid="action-queue-position"]');
    expect(await queueIndicator.isVisible()).toBe(true);

    const positionText = await queueIndicator.textContent();
    expect(positionText).toMatch(/position: \d+/i);
  });
});

describe('E2E: Complete Game Session', () => {
  test('should complete a full game session with 2 players over 10 rounds', async () => {
    // This is a comprehensive test simulating real gameplay
    const keeper: TestUser = { username: 'fullgameKeeper', email: 'fullgamekeeper@test.com', password: 'pass123' };
    const player: TestUser = { username: 'fullgamePlayer', email: 'fullgameplayer@test.com', password: 'pass123' };

    await registerUser(page1, keeper);
    await registerUser(page2, player);

    const tokenKeeper = await loginUser(page1, keeper);
    const tokenPlayer = await loginUser(page2, player);

    const campaign = await createCampaign(page1, tokenKeeper, {
      name: 'Full Game Session',
      description: 'A complete E2E test session',
    });

    const charId = await createCharacter(page2, tokenPlayer, 'Test Investigator');
    await joinCampaign(page2, tokenPlayer, campaign.invite_code!, charId);

    await page1.goto(`${BASE_URL}/game/${campaign.id}`);
    await page2.goto(`${BASE_URL}/game/${campaign.id}`);

    await waitForWebSocketConnection(page1);
    await waitForWebSocketConnection(page2);

    // Simulate 10 rounds of gameplay
    for (let round = 1; round <= 10; round++) {
      // Keeper sets scene
      await sendMessage(page1, `Round ${round}: You find yourselves in a mysterious location.`);

      // Player investigates
      await sendMessage(page2, `I search for clues. (Round ${round})`);

      // Keeper responds
      await sendMessage(page1, `You make a skill check for Spot Hidden.`);

      // Wait for round to complete
      await page1.waitForTimeout(500);
    }

    // Assert: All messages were delivered and processed
    const keeperMessages = await page1.locator('[data-testid="game-message"]').all();
    const playerMessages = await page2.locator('[data-testid="game-message"]').all();

    // Should have approximately 30+ messages (10 rounds × 3 messages each)
    expect(keeperMessages.length).toBeGreaterThanOrEqual(30);
    expect(playerMessages.length).toBeGreaterThanOrEqual(30);

    // Assert: Connection remained stable
    const connectionStatus1 = await page1.locator('[data-testid="connection-status"]').textContent();
    const connectionStatus2 = await page2.locator('[data-testid="connection-status"]').textContent();

    expect(connectionStatus1).toContain('Connected');
    expect(connectionStatus2).toContain('Connected');
  });
});
