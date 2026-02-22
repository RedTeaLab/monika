/**
 * E2E Tests for Visibility Control System
 */

import { test, expect } from '@playwright/test';
import { login, navigateToGameConsole } from '../helpers/utils';
import { testUsers } from '../helpers/utils';

test.describe('Visibility Control', () => {
  test.describe('Visibility Selector', () => {
    test.beforeEach(async ({ page }) => {
      await login(page, testUsers.keeper);
      await navigateToGameConsole(page);
    });

    test('should display visibility selector', async ({ page }) => {
      const selector = page.locator('[data-testid="visibility-selector"]');
      await expect(selector).toBeVisible();
    });

    test('should have visibility options', async ({ page }) => {
      await page.click('[data-testid="visibility-selector"]');

      // Check for visibility options
      await expect(page.locator('text=Public')).toBeVisible();
      await expect(page.locator('text=KP Only')).toBeVisible();
      await expect(page.locator('text=Party')).toBeVisible();
      await expect(page.locator('text=Private')).toBeVisible();
    });

    test('should default to public visibility', async ({ page }) => {
      const selector = page.locator('[data-testid="visibility-selector"]');
      const selectedValue = await selector.inputValue();
      expect(selectedValue).toBe('public');
    });
  });

  test.describe('KP Only Messages', () => {
    test('should allow keeper to send KP-only messages', async ({ page }) => {
      await login(page, testUsers.keeper);
      await navigateToGameConsole(page);

      // Select KP-only visibility
      await page.click('[data-testid="visibility-selector"]');
      await page.click('text=KP Only');

      // Send message
      await page.fill('textarea, input[type="text"]', 'Secret: The monster is real');
      await page.press('textarea, input[type="text"]', 'Enter');

      // Message should appear for keeper
      await expect(page.locator('text=Secret: The monster is real')).toBeVisible();

      // Should have KP-only badge
      const badge = page.locator('[data-visibility="kp"]');
      await expect(badge).toBeVisible();
    });

    test('should NOT show KP-only messages to players', async ({ page, context }) => {
      // Keeper sends KP-only message
      const keeperPage = await context.newPage();
      await login(keeperPage, testUsers.keeper);
      await navigateToGameConsole(keeperPage);

      await keeperPage.click('[data-testid="visibility-selector"]');
      await keeperPage.click('text=KP Only');
      await keeperPage.fill('textarea, input[type="text"]', 'This is KP only');
      await keeperPage.press('textarea, input[type="text"]', 'Enter');

      // Player joins same session
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      // Player should NOT see the KP-only message
      await expect(page.locator('text=This is KP only')).not.toBeVisible();

      // Keeper should still see it
      await expect(keeperPage.locator('text=This is KP only')).toBeVisible();

      await keeperPage.close();
    });

    test('should show KP-only badge on messages', async ({ page }) => {
      await login(page, testUsers.keeper);
      await navigateToGameConsole(page);

      await page.click('[data-testid="visibility-selector"]');
      await page.click('text=KP Only');
      await page.fill('textarea, input[type="text"]', 'Secret message');
      await page.press('textarea, input[type="text"]', 'Enter');

      // Check for badge
      const badge = page.locator('[data-visibility="kp"]');
      await expect(badge).toBeVisible();
      await expect(badge).toContainText(/KP|Secret/i);
    });
  });

  test.describe('Party Messages', () => {
    test('should show party messages to all players and keeper', async ({ page, context }) => {
      // Player1 sends party message
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      await page.click('[data-testid="visibility-selector"]');
      await page.click('text=Party');
      await page.fill('textarea, input[type="text"]', 'Party message');
      await page.press('textarea, input[type="text"]', 'Enter');

      // Player1 should see it
      await expect(page.locator('text=Party message')).toBeVisible();

      // Keeper should also see it
      const keeperPage = await context.newPage();
      await login(keeperPage, testUsers.keeper);
      await navigateToGameConsole(keeperPage);

      await expect(keeperPage.locator('text=Party message')).toBeVisible();

      await keeperPage.close();
    });
  });

  test.describe('Private Messages', () => {
    test('should allow selecting recipient for private messages', async ({ page }) => {
      await login(page, testUsers.keeper);
      await navigateToGameConsole(page);

      // Select private visibility
      await page.click('[data-testid="visibility-selector"]');
      await page.click('text=Private');

      // Should show player selector
      const playerSelector = page.locator('[data-testid="private-recipient-selector"]');
      await expect(playerSelector).toBeVisible();
    });

    test('should only show private message to recipient', async ({ page, context }) => {
      // Keeper sends private message to player1
      const keeperPage = await context.newPage();
      await login(keeperPage, testUsers.keeper);
      await navigateToGameConsole(keeperPage);

      await keeperPage.click('[data-testid="visibility-selector"]');
      await keeperPage.click('text=Private');
      await keeperPage.selectOption('[data-testid="private-recipient-selector"]', 'player1');
      await keeperPage.fill('textarea, input[type="text"]', 'Private for player1');
      await keeperPage.press('textarea, input[type="text"]', 'Enter');

      // Player1 should see it
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      await expect(page.locator('text=Private for player1')).toBeVisible();

      // Player2 should NOT see it
      const player2Page = await context.newPage();
      await login(player2Page, testUsers.player2);
      await navigateToGameConsole(player2Page);

      await expect(player2Page.locator('text=Private for player1')).not.toBeVisible();

      await keeperPage.close();
      await player2Page.close();
    });

    test('should show private badge on private messages', async ({ page }) => {
      await login(page, testUsers.keeper);
      await navigateToGameConsole(page);

      await page.click('[data-testid="visibility-selector"]');
      await page.click('text=Private');
      await page.selectOption('[data-testid="private-recipient-selector"]', 'player1');
      await page.fill('textarea, input[type="text"]', 'Private message');
      await page.press('textarea, input[type="text"]', 'Enter');

      // Check for private badge
      const badge = page.locator('[data-visibility="private"]');
      await expect(badge).toBeVisible();
    });
  });

  test.describe('Visibility Filtering in History', () => {
    test('should filter messages by visibility in history view', async ({ page }) => {
      await login(page, testUsers.keeper);
      await navigateToGameConsole(page);

      // Open message history
      await page.click('[data-testid="message-history-btn"]');

      // Should have filter options
      const filterCheckbox = page.locator('[data-testid="show-kp-only-filter"]');
      await expect(filterCheckbox).toBeVisible();
    });

    test('should allow filtering to see only KP messages', async ({ page }) => {
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      // Open filters
      await page.click('[data-testid="message-filters"]');

      // KP-only filter should not be available to players
      const kpFilter = page.locator('[data-testid="show-kp-only-filter"]');
      expect(await kpFilter.count()).toBe(0);
    });
  });
});
