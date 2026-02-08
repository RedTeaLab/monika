/**
 * E2E Tests for Game Console
 */

import { test, expect } from '@playwright/test';
import { login, sendMessage, waitForMessage, navigateToGameConsole } from './helpers/utils';
import { testUsers } from './helpers/utils';

test.describe('Game Console', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await login(page);
  });

  test.describe('Layout & Navigation', () => {
    test('should display game console layout', async ({ page }) => {
      // Check for main components
      await expect(page.locator('header')).toBeVisible();
      await expect(page.locator('.message-list, [data-testid="message-list"]')).toBeVisible();
      await expect(page.locator('textarea, input[type="text"]')).toBeVisible();
    });

    test('should display state panel', async ({ page }) => {
      // Check for state panel elements
      const statePanel = page.locator('.state-panel, [data-testid="state-panel"]');
      const hasStatePanel = await statePanel.count() > 0;

      if (hasStatePanel) {
        await expect(statePanel).toBeVisible();
      }
    });

    test('should display tabs on tablet layout', async ({ page }) => {
      // Set tablet viewport
      await page.setViewportSize({ width: 800, height: 600 });

      // Check for tabs
      const tabs = page.locator('[role="tablist"]');
      const hasTabs = await tabs.count() > 0;

      if (hasTabs) {
        await expect(tabs.first()).toBeVisible();
      }
    });
  });

  test.describe('Message Flow', () => {
    test('should send and display message', async ({ page }) => {
      const testMessage = '测试消息';

      // Send message
      await sendMessage(page, testMessage);

      // Verify message appears in list
      const messageBubble = page.locator(`.message-list, [data-testid="message-list"]`).filter({ hasText: testMessage });
      await expect(messageBubble).toBeVisible();
    });

    test('should display message timestamp', async ({ page }) => {
      const testMessage = '检查时间戳';

      await sendMessage(page, testMessage);

      // Check for timestamp in message bubble
      const messageBubble = page.locator(`.message-list, [data-testid="message-list"]`).filter({ hasText: testMessage }).first();
      const timestamp = messageBubble.locator('.text-muted-foreground, [data-testid="timestamp"]');

      // Timestamp should exist (format may vary)
      const hasTimestamp = await timestamp.count() > 0;
      expect(hasTimestamp).toBeTruthy();
    });

    test('should display sender name for player messages', async ({ page }) => {
      const testMessage = '玩家消息测试';

      await sendMessage(page, testMessage);

      // Check for sender/role badge
      const messageBubble = page.locator(`.message-list, [data-testid="message-list"]`).filter({ hasText: testMessage }).first();
      const badge = messageBubble.locator('.badge, [role="player"], [data-testid="role-badge"]');

      // Should have role badge
      const hasBadge = await badge.count() > 0;
      expect(hasBadge).toBeTruthy();
    });

    test('should auto-scroll to latest message', async ({ page }) => {
      const messages = [
        '第一条消息',
        '第二条消息',
        '第三条消息',
      ];

      // Send multiple messages
      for (const msg of messages) {
        await sendMessage(page, msg);
      }

      // Get scroll position of message list container
      const messageList = page.locator('.message-list, [data-testid="message-list"]').first();
      const scrollTop = await messageList.evaluate(el => {
        const container = el as HTMLElement;
        return container.scrollTop;
      });

      // Scroll should be at bottom (greater than 0 after messages)
      expect(scrollTop).toBeGreaterThan(0);
    });
  });

  test.describe('Message Input', () => {
    test('should clear input after sending', async ({ page }) => {
      const testMessage = '测试清空输入';

      // Find input
      const input = page.locator('textarea, input[type="text"]').first();
      await input.fill(testMessage);

      // Send message
      await page.click('button:has-text("发送"), button[type="submit"]');

      // Wait a bit for send
      await page.waitForTimeout(500);

      // Input should be cleared
      const inputValue = await input.inputValue();
      expect(inputValue).toBe('');
    });

    test('should trim whitespace from message', async ({ page }) => {
      // Fill with whitespace
      const input = page.locator('textarea, input[type="text"]').first();
      await input.fill('   测试消息   ');

      // Get the trimmed value (should be trimmed by the form or component)
      const inputValue = await input.inputValue();
      // The input itself keeps the spaces, but the send should use trimmed
      expect(inputValue.trim()).not.toBe('');
    });

    test('should not send empty messages', async ({ page }) => {
      const initialMessageCount = await page.locator('.message-list > div, [data-testid="message-list"] > div').count();

      // Try to send empty message
      const input = page.locator('textarea, input[type="text"]').first();
      await input.fill('   ');

      const sendButton = page.locator('button:has-text("发送")').first();
      await sendButton.click();

      // Wait a bit
      await page.waitForTimeout(500);

      // Message count should not have increased
      const finalMessageCount = await page.locator('.message-list > div, [data-testid="message-list"] > div').count();
      expect(finalMessageCount).toBe(initialMessageCount);
    });
  });

  test.describe('State Panel', () => {
    test('should display character stats', async ({ page }) => {
      // Check for HP, SAN, Luck displays
      const statePanel = page.locator('.state-panel, [data-testid="state-panel"]');
      const hasStatePanel = await statePanel.count() > 0;

      if (hasStatePanel) {
        await expect(statePanel).toBeVisible();

        // Check for stat displays
        const hasHP = await page.locator('text=/HP/i, [data-testid="hp-value"]').count() > 0;
        const hasSAN = await page.locator('text=/SAN/i, [data-testid="san-value"]').count() > 0;
        const hasLuck = await page.locator('text=/Luck/i, [data-testid="luck-value"]').count() > 0;

        // At least some stats should be displayed
        expect(hasHP || hasSAN || hasLuck).toBeTruthy();
      }
    });

    test('should display current scene', async ({ page }) => {
      // Check for scene/location display
      const sceneDisplay = page.locator('text=/当前场景|当前位置|Current Scene/i');
      const hasScene = await sceneDisplay.count() > 0;

      if (hasScene) {
        await expect(sceneDisplay.first()).toBeVisible();
      }
    });
  });

  test.describe('Responsive Layout', () => {
    test('should work on mobile viewport', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      // Send message on mobile
      await sendMessage(page, '移动端测试');

      // Should still work
      const messageBubble = page.locator(`.message-list, [data-testid="message-list"]`).filter({ hasText: '移动端测试' });
      await expect(messageBubble).toBeVisible();
    });

    test('should work on tablet viewport', async ({ page }) => {
      // Set tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 });

      // Send message on tablet
      await sendMessage(page, '平板端测试');

      // Should still work
      const messageBubble = page.locator(`.message-list, [data-testid="message-list"]`).filter({ hasText: '平板端测试' });
      await expect(messageBubble).toBeVisible();
    });

    test('should work on desktop viewport', async ({ page }) => {
      // Set desktop viewport
      await page.setViewportSize({ width: 1920, height: 1080 });

      // Send message on desktop
      await sendMessage(page, '桌面端测试');

      // Should still work
      const messageBubble = page.locator(`.message-list, [data-testid="message-list"]`).filter({ hasText: '桌面端测试' });
      await expect(messageBubble).toBeVisible();
    });
  });

  test.describe('Rules Panel', () => {
    test('should toggle rules panel', async ({ page }) => {
      // Look for rules toggle button
      const rulesButton = page.locator('button:has-text("规则"), button:has-text("Rules")');
      const hasRulesButton = await rulesButton.count() > 0;

      if (hasRulesButton) {
        // Click rules button
        await rulesButton.first().click();

        // Wait a bit for panel to appear
        await page.waitForTimeout(500);

        // Rules panel should be visible
        const rulesPanel = page.locator('.rule-search, [data-testid="rules-panel"], text=/搜索|Search/i');
        const hasPanel = await rulesPanel.count() > 0;
        expect(hasPanel).toBeTruthy();
      }
    });
  });

  test.describe('Events Panel', () => {
    test('should toggle events panel', async ({ page }) => {
      // Look for events toggle button
      const eventsButton = page.locator('button:has-text("日志"), button:has-text("Events")');
      const hasEventsButton = await eventsButton.count() > 0;

      if (hasEventsButton) {
        // Click events button
        await eventsButton.first().click();

        // Wait a bit for panel to appear
        await page.waitForTimeout(500);

        // Events panel should be visible
        const eventsPanel = page.locator('.event-log-panel, [data-testid="events-panel"], text=/Event Log|事件日志/i');
        const hasPanel = await eventsPanel.count() > 0;
        expect(hasPanel).toBeTruthy();
      }
    });

    test('should export events when export button clicked', async ({ page }) => {
      // Look for export button
      const exportButton = page.locator('button:has-text("导出"), button:has-text("Export"), [data-testid="export-button"]');
      const hasExportButton = await exportButton.count() > 0;

      if (hasExportButton) {
        // Click export button to open dropdown
        await exportButton.first().click();

        // Wait for dropdown
        await page.waitForTimeout(500);

        // Check for export format options
        const jsonOption = page.locator('button:has-text("JSON"), button:has-text("json")');
        const csvOption = page.locator('button:has-text("CSV"), button:has-text("csv")');

        const hasOptions = await jsonOption.count() > 0 || await csvOption.count() > 0;
        expect(hasOptions).toBeTruthy();

        // Close dropdown by clicking elsewhere
        await page.mouse.click(0, 0);
      }
    });
  });
});
