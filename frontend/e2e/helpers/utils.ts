/**
 * Test utilities for E2E testing
 */

import { type Page, type Locator } from '@playwright/test';

/**
 * Test user credentials
 */
export const testUsers = {
  valid: {
    username: 'testuser',
    email: 'test@example.com',
    password: 'TestPassword123!',
  },
  new: {
    username: `testuser_${Date.now()}`,
    email: `test_${Date.now()}@example.com`,
    password: 'TestPassword123!',
  },
  // Multiplayer test users
  keeper: {
    username: 'keeper',
    email: 'keeper@test.com',
    password: 'KeeperPass123!',
  },
  player1: {
    username: 'player1',
    email: 'player1@test.com',
    password: 'Player1Pass123!',
  },
  player2: {
    username: 'player2',
    email: 'player2@test.com',
    password: 'Player2Pass123!',
  },
  player3: {
    username: 'player3',
    email: 'player3@test.com',
    password: 'Player3Pass123!',
  },
};

/**
 * Login helper - performs login and returns to main page
 */
export async function login(page: Page, user = testUsers.valid) {
  await page.goto('/login');

  // Fill login form
  await page.fill('input[name="username"]', user.username);
  await page.fill('input[name="password"]', user.password);

  // Submit form
  await page.click('button[type="submit"]');

  // Wait for navigation to game console
  await page.waitForURL('/', { timeout: 5000 });
}

/**
 * Register helper - performs registration
 */
export async function register(page: Page, user = testUsers.new) {
  await page.goto('/register');

  // Fill registration form
  await page.fill('input[name="username"]', user.username);
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);
  await page.fill('input[name="confirmPassword"]', user.password);

  // Submit form
  await page.click('button[type="submit"]');

  // Wait for navigation
  await page.waitForURL('/', { timeout: 5000 });
}

/**
 * Logout helper
 */
export async function logout(page: Page) {
  await page.click('button:has-text("退出")');
  await page.waitForURL('/login', { timeout: 3000 });
}

/**
 * Wait for message to appear in message list
 */
export async function waitForMessage(
  page: Page,
  text: string,
  timeout = 5000
): Promise<Locator> {
  return page.waitForSelector(`.message-list:has-text("${text}")`, { timeout });
}

/**
 * Send message through game console
 */
export async function sendMessage(page: Page, message: string) {
  const input = page.locator('textarea[placeholder*="消息"], textarea[placeholder*="输入"]');
  await input.fill(message);

  const sendButton = page.locator('button:has-text("发送")');
  await sendButton.click();

  // Wait for message to appear in list
  await waitForMessage(page, message);
}

/**
 * Get current state values from state panel
 */
export async function getStateValues(page: Page) {
  const hp = await page.locator('[data-testid="hp-value"]').textContent() || '0';
  const san = await page.locator('[data-testid="san-value"]').textContent() || '0';
  const luck = await page.locator('[data-testid="luck-value"]').textContent() || '0';

  return {
    hp: parseInt(hp, 10),
    san: parseInt(san, 10),
    luck: parseInt(luck, 10),
  };
}

/**
 * Wait for WebSocket connection
 */
export async function waitForWebSocket(page: Page, timeout = 5000) {
  await page.waitForFunction(
    () => {
      // @ts-ignore - accessing window properties
      return window.__monikaWebSocket?.readyState === WebSocket.OPEN;
    },
    { timeout }
  );
}

/**
 * Navigate to game console (after login)
 */
export async function navigateToGameConsole(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}

/**
 * Navigate to campaigns page
 */
export async function navigateToCampaigns(page: Page) {
  await page.goto('/campaigns');
  await page.waitForLoadState('networkidle');
}
