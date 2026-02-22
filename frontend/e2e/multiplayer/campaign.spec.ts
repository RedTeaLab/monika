/**
 * E2E Tests for Multiplayer Campaign Features
 */

import { test, expect } from '@playwright/test';
import { login, navigateToCampaigns } from '../helpers/utils';
import { testUsers } from '../helpers/utils';

test.describe('Multiplayer Campaign', () => {
  test.describe('Campaign Creation', () => {
    test.beforeEach(async ({ page }) => {
      await login(page, testUsers.keeper);
    });

    test('should create a new campaign', async ({ page }) => {
      // Navigate to campaigns
      await navigateToCampaigns(page);

      // Click create campaign button
      await page.click('button:has-text("Create Campaign"), [data-testid="create-campaign-btn"]');

      // Fill campaign form
      await page.fill('input[name="name"]', 'The Haunting');
      await page.fill('textarea[name="description"]', 'A classic CoC scenario');
      await page.fill('input[name="max_players"]', '4');

      // Submit
      await page.click('button:has-text("Create"), [data-testid="submit-campaign"]');

      // Verify campaign created
      await expect(page.locator('text=The Haunting')).toBeVisible();
      await expect(page.locator('text=Invite Code')).toBeVisible();
    });

    test('should display invite code', async ({ page }) => {
      await navigateToCampaigns(page);

      // Open existing campaign
      await page.click('.campaign-card:first-child');

      // Check for invite code display
      const inviteCode = page.locator('[data-testid="invite-code"]');
      await expect(inviteCode).toBeVisible();

      // Verify format (8 characters)
      const code = await inviteCode.textContent();
      expect(code?.length).toBe(8);
    });

    test('should copy invite code to clipboard', async ({ page }) => {
      await navigateToCampaigns(page);
      await page.click('.campaign-card:first-child');

      // Click copy button
      await page.click('[data-testid="copy-invite-code"]');

      // Verify success message
      await expect(page.locator('text=Invite code copied')).toBeVisible();
    });
  });

  test.describe('Campaign Joining', () => {
    test('should join campaign with invite code', async ({ page }) => {
      // Login as player
      await login(page, testUsers.player1);

      // Navigate to campaigns
      await navigateToCampaigns(page);

      // Click join campaign button
      await page.click('button:has-text("Join Campaign"), [data-testid="join-campaign-btn"]');

      // Enter invite code
      await page.fill('input[name="inviteCode"]', 'TEST1234');

      // Submit
      await page.click('button:has-text("Join")');

      // Verify joined
      await expect(page.locator('text=Successfully joined')).toBeVisible();
    });

    test('should show error for invalid invite code', async ({ page }) => {
      await login(page, testUsers.player1);
      await navigateToCampaigns(page);

      await page.click('button:has-text("Join Campaign")');
      await page.fill('input[name="inviteCode"]', 'INVALID');

      await page.click('button:has-text("Join")');

      // Verify error message
      await expect(page.locator('text=Invalid invite code')).toBeVisible();
    });
  });

  test.describe('Member Management', () => {
    test.beforeEach(async ({ page }) => {
      await login(page, testUsers.keeper);
    });

    test('should display member list', async ({ page }) => {
      await navigateToCampaigns(page);
      await page.click('.campaign-card:first-child');

      // Check for member list
      const memberList = page.locator('[data-testid="member-list"]');
      await expect(memberList).toBeVisible();

      // Should show keeper
      await expect(page.locator('text=keeper')).toBeVisible();
    });

    test('should show online status of members', async ({ page }) => {
      await navigateToCampaigns(page);
      await page.click('.campaign-card:first-child');

      // Look for online indicator
      const onlineIndicator = page.locator('[data-status="online"]');
      const hasOnline = await onlineIndicator.count() > 0;

      if (hasOnline) {
        await expect(onlineIndicator.first()).toBeVisible();
      }
    });

    test('should allow removing members', async ({ page }) => {
      await navigateToCampaigns(page);
      await page.click('.campaign-card:first-child');

      // Find a member (not keeper)
      const memberRow = page.locator('.member-row:not(:has-text("keeper"))').first();

      const hasMember = await memberRow.count() > 0;
      if (hasMember) {
        // Click remove button
        await memberRow.locator('[data-testid="remove-member"]').click();

        // Confirm removal
        await page.click('button:has-text("Remove")');

        // Verify success message
        await expect(page.locator('text=Member removed')).toBeVisible();
      }
    });
  });

  test.describe('Multiplayer Game Console', () => {
    test('should show multiple players in console', async ({ page }) => {
      await login(page, testUsers.keeper);
      await navigateToCampaigns(page);
      await page.click('.campaign-card:first-child');

      // Start game session
      await page.click('button:has-text("Start Game"), [data-testid="start-game"]');

      // Check for multiple player indicators
      const playerIndicators = page.locator('[data-testid="player-indicator"]');
      await expect(playerIndicators).toHaveCount(2); // At least keeper and one player
    });

    test('should display messages from all players', async ({ page }) => {
      await login(page, testUsers.keeper);
      await navigateToCampaigns(page);
      await page.click('.campaign-card:first-child');

      // Start game
      await page.click('button:has-text("Start Game")');

      // Send message
      await page.fill('textarea, input[type="text"]', 'Hello everyone!');
      await page.press('textarea, input[type="text"]', 'Enter');

      // Verify message appears
      await expect(page.locator('text=Hello everyone!')).toBeVisible();

      // Should show sender name
      await expect(page.locator('.message-bubble').first()).toContainText(/keeper|player/);
    });
  });
});
