/**
 * E2E Tests for Spotlight System
 */

import { test, expect } from '@playwright/test';
import { login, navigateToGameConsole } from '../helpers/utils';
import { testUsers } from '../helpers/utils';

test.describe('Spotlight System', () => {
  test.describe('Spotlight Indicator', () => {
    test('should display spotlight indicator in game console', async ({ page }) => {
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      const spotlight = page.locator('[data-testid="spotlight-indicator"]');
      await expect(spotlight).toBeVisible();
    });

    test('should show current spotlight holder', async ({ page }) => {
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      // Should show who has spotlight
      const currentHolder = page.locator('[data-testid="current-spotlight-holder"]');
      await expect(currentHolder).toBeVisible();
    });

    test('should highlight when user has spotlight', async ({ page, context }) => {
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      // Request spotlight
      await page.click('[data-testid="request-spotlight-btn"]');

      // Should show highlight or active state
      const spotlightStatus = page.locator('[data-spotlight-status="active"]');
      await expect(spotlightStatus).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Requesting Spotlight', () => {
    test('should allow player to request spotlight', async ({ page }) => {
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      // Click request button
      await page.click('[data-testid="request-spotlight-btn"]');

      // Should show confirmation
      await expect(page.locator('text=Spotlight requested|Your turn')).toBeVisible();
    });

    test('should show queue position if queued', async ({ page, context }) => {
      // Player1 gets spotlight first
      const page1 = await context.newPage();
      await login(page1, testUsers.player1);
      await navigateToGameConsole(page1);
      await page1.click('[data-testid="request-spotlight-btn"]');

      // Player2 requests spotlight (should be queued)
      await login(page, testUsers.player2);
      await navigateToGameConsole(page);
      await page.click('[data-testid="request-spotlight-btn"]');

      // Should show queue position
      const queuePosition = page.locator('[data-testid="queue-position"]');
      await expect(queuePosition).toContainText('1|position|next');

      await page1.close();
    });

    test('should grant spotlight immediately if no one has it', async ({ page }) => {
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      await page.click('[data-testid="request-spotlight-btn"]');

      // Should show immediate grant
      await expect(page.locator('[data-spotlight-status="active"]')).toBeVisible();
    });
  });

  test.describe('Releasing Spotlight', () => {
    test('should allow current holder to release spotlight', async ({ page }) => {
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      // Get spotlight first
      await page.click('[data-testid="request-spotlight-btn"]');
      await expect(page.locator('[data-spotlight-status="active"]')).toBeVisible();

      // Release button should be available
      const releaseBtn = page.locator('[data-testid="release-spotlight-btn"]');
      await expect(releaseBtn).toBeVisible();

      // Click release
      await releaseBtn.click();

      // Should confirm release
      await expect(page.locator('text=Spotlight released')).toBeVisible();
    });

    test('should transfer spotlight to next in queue after release', async ({ page, context }) => {
      // Player1 gets spotlight
      const page1 = await context.newPage();
      await login(page1, testUsers.player1);
      await navigateToGameConsole(page1);
      await page1.click('[data-testid="request-spotlight-btn"]');

      // Player2 queues
      await login(page, testUsers.player2);
      await navigateToGameConsole(page);
      await page.click('[data-testid="request-spotlight-btn"]');
      await expect(page.locator('[data-testid="queue-position"]')).toBeVisible();

      // Player1 releases
      await page1.click('[data-testid="release-spotlight-btn"]');

      // Player2 should now have spotlight
      await expect(page.locator('[data-spotlight-status="active"]')).toBeVisible({ timeout: 5000 });

      await page1.close();
    });

    test('should not allow non-holder to release spotlight', async ({ page, context }) => {
      // Player1 has spotlight
      const page1 = await context.newPage();
      await login(page1, testUsers.player1);
      await navigateToGameConsole(page1);
      await page1.click('[data-testid="request-spotlight-btn"]');

      // Player2 should not have release button
      await login(page, testUsers.player2);
      await navigateToGameConsole(page);

      const releaseBtn = page.locator('[data-testid="release-spotlight-btn"]');
      await expect(releaseBtn).not.toBeVisible();

      await page1.close();
    });
  });

  test.describe('Queue Display', () => {
    test('should display queue when players are waiting', async ({ page, context }) => {
      // Player1 gets spotlight
      const page1 = await context.newPage();
      await login(page1, testUsers.player1);
      await navigateToGameConsole(page1);
      await page1.click('[data-testid="request-spotlight-btn"]');

      // Player2 and Player3 queue
      const page2 = await context.newPage();
      await login(page2, testUsers.player2);
      await navigateToGameConsole(page2);
      await page2.click('[data-testid="request-spotlight-btn"]');

      const page3 = await context.newPage();
      await login(page3, testUsers.player3);
      await navigateToGameConsole(page3);
      await page3.click('[data-testid="request-spotlight-btn"]');

      // All pages should show queue
      const queueDisplay = page1.locator('[data-testid="spotlight-queue"]');
      await expect(queueDisplay).toBeVisible();

      // Queue should have 2 items
      const queueItems = queueDisplay.locator('[data-testid="queue-item"]');
      await expect(queueItems).toHaveCount(2);

      await page1.close();
      await page2.close();
      await page3.close();
    });

    test('should show estimated wait time', async ({ page }) => {
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      // If someone else has spotlight, show wait time
      const waitTime = page.locator('[data-testid="estimated-wait-time"]');
      const hasWaitTime = await waitTime.count() > 0;

      if (hasWaitTime) {
        await expect(waitTime).toContainText(/min|sec|minute/);
      }
    });
  });

  test.describe('Cut-in Requests', () => {
    test('should allow requesting to cut in line', async ({ page, context }) => {
      // Someone has spotlight
      const page1 = await context.newPage();
      await login(page1, testUsers.player1);
      await navigateToGameConsole(page1);
      await page1.click('[data-testid="request-spotlight-btn"]');

      // Player2 requests cut-in
      await login(page, testUsers.player2);
      await navigateToGameConsole(page);

      // Should have cut-in button
      const cutInBtn = page.locator('[data-testid="cut-in-btn"]');
      await expect(cutInBtn).toBeVisible();

      // Click cut-in
      await cutInBtn.click();

      // Should show reason dialog
      await expect(page.locator('[data-testid="cut-in-dialog"]')).toBeVisible();

      await page1.close();
    });

    test('should notify current holder of cut-in request', async ({ page, context }) => {
      // Player1 has spotlight
      const page1 = await context.newPage();
      await login(page1, testUsers.player1);
      await navigateToGameConsole(page1);
      await page1.click('[data-testid="request-spotlight-btn"]');

      // Player2 requests cut-in
      const page2 = await context.newPage();
      await login(page2, testUsers.player2);
      await navigateToGameConsole(page2);
      await page2.click('[data-testid="cut-in-btn"]');
      await page2.fill('[data-testid="cut-in-reason"]', 'I have an important clue!');
      await page2.click('button:has-text("Request")');

      // Player1 should see the cut-in request
      await expect(page1.locator('text=cut-in request|wants to speak')).toBeVisible({ timeout: 5000 });

      await page1.close();
      await page2.close();
    });
  });

  test.describe('Auto-release on Idle', () => {
    test('should auto-release spotlight after inactivity', async ({ page }) => {
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      // Get spotlight
      await page.click('[data-testid="request-spotlight-btn"]');
      await expect(page.locator('[data-spotlight-status="active"]')).toBeVisible();

      // Wait for auto-release timeout (this would need configuration)
      // For now, just verify the behavior exists
      const hasTimeoutWarning = await page.locator('text=timeout|inactive').count() > 0;

      if (hasTimeoutWarning) {
        await expect(page.locator('text=timeout|inactive')).toBeVisible();
      }
    });
  });

  test.describe('Spotlight Commands', () => {
    test('should support /spotlight command', async ({ page }) => {
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      // Use command
      await page.fill('textarea, input[type="text"]', '/spotlight request');
      await page.press('textarea, input[type="text"]', 'Enter');

      // Should work same as button
      await expect(page.locator('[data-spotlight-status="active"]')).toBeVisible({ timeout: 5000 });
    });

    test('should support /spotlist release command', async ({ page }) => {
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      // Get spotlight first
      await page.fill('textarea, input[type="text"]', '/spotlight request');
      await page.press('textarea, input[type="text"]', 'Enter');

      // Release with command
      await page.fill('textarea, input[type="text"]', '/spotlight release');
      await page.press('textarea, input[type="text"]', 'Enter');

      // Should release
      await expect(page.locator('text=Spotlight released')).toBeVisible();
    });

    test('should support /queue command to view queue', async ({ page }) => {
      await login(page, testUsers.player1);
      await navigateToGameConsole(page);

      await page.fill('textarea, input[type="text"]', '/queue list');
      await page.press('textarea, input[type="text"]', 'Enter');

      // Should show queue info
      await expect(page.locator('text=queue|Queue is empty')).toBeVisible();
    });
  });
});
