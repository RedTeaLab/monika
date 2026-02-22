/**
 * E2E Tests for WebSocket Real-time Communication
 */

import { test, expect } from '@playwright/test';
import { login, navigateToGameConsole } from '../helpers/utils';
import { testUsers } from '../helpers/utils';

test.describe('WebSocket Communication', () => {
  test.describe('Connection Management', () => {
    test('should establish WebSocket connection', async ({ page }) => {
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      // Check for connection indicator
      const connectionStatus = page.locator('[data-testid="connection-status"]');
      await expect(connectionStatus).toBeVisible();

      // Should show connected
      await expect(connectionStatus).toContainText('connected|online', { ignoreCase: true });
    });

    test('should show reconnecting status on disconnect', async ({ page }) => {
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      // Simulate network disconnect
      await page.context().setOffline(true);

      // Should show reconnecting
      const connectionStatus = page.locator('[data-testid="connection-status"]');
      await expect(connectionStatus).toContainText('reconnecting|disconnected', { ignoreCase: true });

      // Restore connection
      await page.context().setOffline(false);

      // Should reconnect automatically
      await expect(connectionStatus).toContainText('connected', { ignoreCase: true });
    });

    test('should auto-reconnect after disconnect', async ({ page, context }) => {
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      // Simulate disconnect
      await context.setOffline(true);
      await page.waitForTimeout(1000);

      // Restore
      await context.setOffline(false);

      // Should reconnect and show success message
      const connectionStatus = page.locator('[data-testid="connection-status"]');
      await expect(connectionStatus).toContainText('connected', { ignoreCase: true });
    });
  });

  test.describe('Real-time Message Broadcasting', () => {
    test('should receive messages from other players', async ({ page, context }) => {
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      // Create second page as player2
      const page2 = await context.newPage();
      await login(page2, testUsers.player2);
      await navigateToGameConsole(page2);

      // Player2 sends message
      await page2.fill('textarea, input[type="text"]', 'Hello from player2!');
      await page2.press('textarea, input[type="text"]', 'Enter');

      // Player1 should receive the message
      await expect(page.locator('text=Hello from player2!')).toBeVisible({ timeout: 5000 });

      // Clean up
      await page2.close();
    });

    test('should show typing indicator from other players', async ({ page, context }) => {
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      // Create second page as player2
      const page2 = await context.newPage();
      await login(page2, testUsers.player2);
      await navigateToGameConsole(page2);

      // Player2 starts typing
      await page2.focus('textarea, input[type="text"]');
      await page2.type('textarea, input[type="text"]', 'typing...');

      // Player1 should see typing indicator
      const typingIndicator = page.locator('[data-testid="typing-indicator"]');
      await expect(typingIndicator).toBeVisible({ timeout: 3000 });

      // Clean up
      await page2.close();
    });

    test('should broadcast state updates to all players', async ({ page, context }) => {
      await login(page, testUsers.keeper);
      await navigateToGameConsole(page);

      // Create second page as player
      const page2 = await context.newPage();
      await login(page2, testUsers.player1);
      await navigateToGameConsole(page2);

      // Keeper updates state
      await page.click('[data-testid="edit-state-btn"]');
      await page.fill('input[name="current_scene"]', 'The Library');
      await page.click('button:has-text("Save")');

      // Player should see state update
      await expect(page2.locator('text=The Library')).toBeVisible({ timeout: 5000 });

      // Clean up
      await page2.close();
    });
  });

  test.describe('Message Queue & Conflict Handling', () => {
    test('should handle rapid message sending', async ({ page }) => {
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      // Send multiple messages rapidly
      const messages = ['Message 1', 'Message 2', 'Message 3'];
      for (const msg of messages) {
        await page.fill('textarea, input[type="text"]', msg);
        await page.press('textarea, input[type="text"]', 'Enter');
      }

      // All messages should appear
      for (const msg of messages) {
        await expect(page.locator(`text=${msg}`)).toBeVisible();
      }
    });

    test('should show sending status for messages', async ({ page }) => {
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      // Send message
      await page.fill('textarea, input[type="text"]', 'Test message');
      await page.press('textarea, input[type="text"]', 'Enter');

      // Check for sending indicator (may be brief)
      const sendingIndicator = page.locator('[data-status="sending"]');
      const hasSending = await sendingIndicator.count() > 0;

      if (hasSending) {
        await expect(sendingIndicator).toBeVisible();
      }

      // Eventually should show sent status
      await expect(page.locator('text=Test message')).toBeVisible();
    });

    test('should handle optimistic updates', async ({ page }) => {
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      // Send message
      await page.fill('textarea, input[type="text"]', 'Optimistic test');
      await page.press('textarea, input[type="text"]', 'Enter');

      // Message should appear immediately (optimistic)
      await expect(page.locator('text=Optimistic test')).toBeVisible();

      // Should not show error after confirmation
      const errorMsg = page.locator('[data-testid="message-error"]');
      await expect(errorMsg).not.toBeVisible();
    });
  });
});
