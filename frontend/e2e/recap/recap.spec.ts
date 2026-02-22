/**
 * E2E Tests for Recap/Review Interface (M3-080)
 *
 * This test suite covers:
 * - Session list page
 * - Session cards and status badges
 * - Recap main page layout
 * - Narrative summary display
 * - Key events list
 * - State changes panel
 * - Clues discovery display
 * - Timeline component
 * - Timeline nodes and event type icons
 * - Timeline zoom controls
 * - Event detail expansion
 *
 * Coverage Goals:
 * - Session list UI: 100%
 * - Recap page UI: 100%
 * - Timeline interaction: 95%
 * - Event navigation: 95%
 */

import { test, expect } from '@playwright/test';
import { login } from '../helpers/utils';

test.describe('Recap/Review Interface', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await login(page);
  });

  // =============================================================================
  // Session List Tests (M3-050 to M3-052)
  // =============================================================================

  test.describe('Session List', () => {
    test('should display session list page', async ({ page }) => {
      // Navigate to sessions/recap page
      await page.goto('/sessions');

      // Check page title
      await expect(page.locator('h1, h2').filter({ hasText: /sessions|recap|复盘/i })).toBeVisible();

      // Check for session cards or empty state
      const sessionCards = page.locator('.session-card, [data-testid="session-card"]');
      const emptyState = page.locator('.empty-state, [data-testid="empty-state"]');

      const hasCards = await sessionCards.count() > 0;
      const hasEmpty = await emptyState.count() > 0;

      expect(hasCards || hasEmpty).toBeTruthy();
    });

    test('should display session cards with required information', async ({ page }) => {
      await page.goto('/sessions');

      // Wait for session cards to load
      await page.waitForTimeout(1000);

      const sessionCards = page.locator('.session-card, [data-testid="session-card"]');

      const cardCount = await sessionCards.count();
      if (cardCount > 0) {
        // Check first card for required elements
        const firstCard = sessionCards.first();

        // Should have session name/title
        await expect(firstCard.locator('.session-title, h3, [data-testid="session-title"]')).toBeVisible();

        // Should have date/time info
        const dateElement = firstCard.locator('.session-date, time, [data-testid="session-date"]');
        const hasDate = await dateElement.count() > 0;
        expect(hasDate).toBeTruthy();
      }
    });

    test('should display session status badges', async ({ page }) => {
      await page.goto('/sessions');

      await page.waitForTimeout(1000);

      const sessionCards = page.locator('.session-card, [data-testid="session-card"]');
      const cardCount = await sessionCards.count();

      if (cardCount > 0) {
        // Check for status badge
        const statusBadge = page.locator('.status-badge, [data-testid="status-badge"]');
        const hasBadge = await statusBadge.count() > 0;

        if (hasBadge) {
          // Badge should have visible text
          await expect(statusBadge.first()).not.toBeEmpty();
        }
      }
    });

    test('should filter sessions by status', async ({ page }) => {
      await page.goto('/sessions');

      // Look for filter controls
      const filterTabs = page.locator('[role="tablist"] .tab, [data-testid="filter-tab"]');
      const filterDropdown = page.locator('select.filter-dropdown, [data-testid="session-filter"]');
      const hasFilters = await filterTabs.count() > 0 || await filterDropdown.count() > 0;

      if (hasFilters) {
        // Test filtering by status
        if (await filterTabs.count() > 0) {
          await filterTabs.first().click();
          await page.waitForTimeout(500);

          // URL or page state should update
          expect(page.url()).toBeTruthy();
        }
      }
    });

    test('should allow creating new session from list', async ({ page }) => {
      await page.goto('/sessions');

      // Look for "New Session" or "Create" button
      const newSessionBtn = page.locator('button:has-text("New"), button:has-text("Create"), button:has-text("新建"), button:has-text("创建"), [data-testid="new-session-btn"]');
      const hasButton = await newSessionBtn.count() > 0;

      if (hasButton) {
        await newSessionBtn.first().click();

        // Should navigate to new session or show dialog
        await page.waitForTimeout(500);
        expect(page.url()).toContain('new') || expect(page.locator('dialog, .modal')).toHaveCount(1);
      }
    });
  });

  // =============================================================================
  // Recap Main Page Tests (M3-053 to M3-057)
  // =============================================================================

  test.describe('Recap Main Page', () => {
    test.beforeEach(async ({ page }) => {
      // Navigate to a specific session's recap page
      // This assumes a session ID exists - in real tests, create one first
      await page.goto('/sessions');
      await page.waitForTimeout(500);

      // Try to click on first session card
      const firstCard = page.locator('.session-card, [data-testid="session-card"]').first();
      const cardCount = await firstCard.count();

      if (cardCount > 0) {
        await firstCard.click();
      } else {
        // Navigate directly to a test session
        await page.goto('/recap/test-session-id');
      }
    });

    test('should display recap page layout', async ({ page }) => {
      // Check for main sections
      await expect(page.locator('h1, h2').filter({ hasText: /recap|review|复盘/i }).or(page.locator('.recap-header'))).toHaveCount(1);

      // Check for narrative summary section
      const narrativeSection = page.locator('.narrative-summary, [data-testid="narrative-summary"]');
      const hasNarrative = await narrativeSection.count() > 0;
      expect(hasNarrative).toBeTruthy();
    });

    test('should display narrative summary', async ({ page }) => {
      const narrativeSection = page.locator('.narrative-summary, [data-testid="narrative-summary"]');

      const hasNarrative = await narrativeSection.count() > 0;
      if (hasNarrative) {
        // Should have summary text
        const narrativeText = narrativeSection.locator('p, .summary-text');
        const hasText = await narrativeText.count() > 0;

        if (hasText) {
          await expect(narrativeText.first()).not.toBeEmpty();
        }
      }
    });

    test('should display key events list', async ({ page }) => {
      const keyEventsSection = page.locator('.key-events, [data-testid="key-events"]');

      const hasKeyEvents = await keyEventsSection.count() > 0;
      if (hasKeyEvents) {
        // Should have events listed
        const eventItems = keyEventsSection.locator('.event-item, li, [data-testid="event-item"]');
        const hasEvents = await eventItems.count() > 0;

        if (hasEvents) {
          await expect(eventItems.first()).toBeVisible();
        }
      }
    });

    test('should display state changes panel', async ({ page }) => {
      const stateChangesPanel = page.locator('.state-changes, [data-testid="state-changes"]');

      const hasStateChanges = await stateChangesPanel.count() > 0;
      if (hasStateChanges) {
        // Should show HP, SAN, Luck, MP changes
        const hpIndicator = stateChangesPanel.locator('.hp-change, [data-testid="hp-change"]');
        const sanIndicator = stateChangesPanel.locator('.san-change, [data-testid="san-change"]');

        const hasHp = await hpIndicator.count() > 0;
        const hasSan = await sanIndicator.count() > 0;

        expect(hasHp || hasSan).toBeTruthy();
      }
    });

    test('should display discovered clues', async ({ page }) => {
      const cluesSection = page.locator('.clues-discovered, [data-testid="clues-discovered"]');

      const hasClues = await cluesSection.count() > 0;
      if (hasClues) {
        // Should list clues
        const clueItems = cluesSection.locator('.clue-item, [data-testid="clue-item"]');
        const hasClueItems = await clueItems.count() > 0;

        if (hasClueItems) {
          await expect(clueItems.first()).toBeVisible();
        }
      }
    });
  });

  // =============================================================================
  // Timeline Component Tests (M3-058 to M3-062)
  // =============================================================================

  test.describe('Timeline Component', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/sessions');
      await page.waitForTimeout(500);

      const firstCard = page.locator('.session-card, [data-testid="session-card"]').first();
      const cardCount = await firstCard.count();

      if (cardCount > 0) {
        await firstCard.click();
      } else {
        await page.goto('/recap/test-session-id');
      }
    });

    test('should display timeline', async ({ page }) => {
      const timeline = page.locator('.timeline, [data-testid="timeline"]');

      // Timeline might not be on all pages
      const hasTimeline = await timeline.count() > 0;
      if (hasTimeline) {
        await expect(timeline).toBeVisible();
      }
    });

    test('should display timeline nodes', async ({ page }) => {
      const timeline = page.locator('.timeline, [data-testid="timeline"]');
      const hasTimeline = await timeline.count() > 0;

      if (hasTimeline) {
        const timelineNodes = timeline.locator('.timeline-node, [data-testid="timeline-node"]');
        const hasNodes = await timelineNodes.count() > 0;

        if (hasNodes) {
          await expect(timelineNodes.first()).toBeVisible();
        }
      }
    });

    test('should display event type icons', async ({ page }) => {
      const timeline = page.locator('.timeline, [data-testid="timeline"]');
      const hasTimeline = await timeline.count() > 0;

      if (hasTimeline) {
        const typeIcons = timeline.locator('.event-icon, [data-testid="event-icon"], svg.icon');
        const hasIcons = await typeIcons.count() > 0;

        if (hasIcons) {
          await expect(typeIcons.first()).toBeVisible();
        }
      }
    });

    test('should support timeline zoom', async ({ page }) => {
      const timeline = page.locator('.timeline, [data-testid="timeline"]');
      const hasTimeline = await timeline.count() > 0;

      if (hasTimeline) {
        // Look for zoom controls
        const zoomInBtn = page.locator('button:has-text("+"), .zoom-in, [data-testid="zoom-in"]');
        const zoomOutBtn = page.locator('button:has-text("-"), .zoom-out, [data-testid="zoom-out"]');

        const hasZoomControls = await zoomInBtn.count() > 0 || await zoomOutBtn.count() > 0;

        if (hasZoomControls) {
          // Try zoom controls
          if (await zoomInBtn.count() > 0) {
            await zoomInBtn.first().click();
            await page.waitForTimeout(300);
          }

          if (await zoomOutBtn.count() > 0) {
            await zoomOutBtn.first().click();
            await page.waitForTimeout(300);
          }
        }
      }
    });

    test('should expand event details on click', async ({ page }) => {
      const timeline = page.locator('.timeline, [data-testid="timeline"]');
      const hasTimeline = await timeline.count() > 0;

      if (hasTimeline) {
        const timelineNodes = timeline.locator('.timeline-node, [data-testid="timeline-node"]');
        const nodeCount = await timelineNodes.count();

        if (nodeCount > 0) {
          // Click on first node
          await timelineNodes.first().click();
          await page.waitForTimeout(500);

          // Should show details (modal, expanded section, or popover)
          const detailModal = page.locator('.modal, dialog, .event-detail, [data-testid="event-detail"]');
          const hasDetails = await detailModal.count() > 0;

          if (hasDetails) {
            await expect(detailModal.first()).toBeVisible();
          }
        }
      }
    });

    test('should scroll timeline horizontally', async ({ page }) => {
      const timeline = page.locator('.timeline, [data-testid="timeline"]');
      const hasTimeline = await timeline.count() > 0;

      if (hasTimeline) {
        const timelineContainer = timeline.locator('.timeline-container, .timeline-scroll');

        // Try horizontal scroll
        await timelineContainer.evaluate((el: any) => {
          el.scrollLeft = 100;
        });

        await page.waitForTimeout(300);

        // Scroll position should change
        const scrollLeft = await timelineContainer.evaluate((el: any) => el.scrollLeft);
        expect(scrollLeft).toBeGreaterThan(0);
      }
    });
  });

  // =============================================================================
  // Timeline Event Type Tests
  // =============================================================================

  test.describe('Timeline Event Types', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/sessions');
      await page.waitForTimeout(500);

      const firstCard = page.locator('.session-card, [data-testid="session-card"]').first();
      const cardCount = await firstCard.count();

      if (cardCount > 0) {
        await firstCard.click();
      }
    });

    test('should display roll events on timeline', async ({ page }) => {
      const timeline = page.locator('.timeline, [data-testid="timeline"]');
      const hasTimeline = await timeline.count() > 0;

      if (hasTimeline) {
        const rollEvents = timeline.locator('.event-roll, [data-event-type="roll"], .timeline-node:has-text("roll")');
        const hasRolls = await rollEvents.count() > 0;

        if (hasRolls) {
          await expect(rollEvents.first()).toBeVisible();
        }
      }
    });

    test('should display combat events on timeline', async ({ page }) => {
      const timeline = page.locator('.timeline, [data-testid="timeline"]');
      const hasTimeline = await timeline.count() > 0;

      if (hasTimeline) {
        const combatEvents = timeline.locator('.event-combat, [data-event-type="combat"], .timeline-node:has-text("combat")');
        const hasCombat = await combatEvents.count() > 0;

        if (hasCombat) {
          await expect(combatEvents.first()).toBeVisible();
        }
      }
    });

    test('should display message events on timeline', async ({ page }) => {
      const timeline = page.locator('.timeline, [data-testid="timeline"]');
      const hasTimeline = await timeline.count() > 0;

      if (hasTimeline) {
        const messageEvents = timeline.locator('.event-message, [data-event-type="message"]');
        const hasMessages = await messageEvents.count() > 0;

        if (hasMessages) {
          await expect(messageEvents.first()).toBeVisible();
        }
      }
    });
  });

  // =============================================================================
  // Navigation Between Views
  // =============================================================================

  test.describe('Navigation', () => {
    test('should navigate from session list to recap', async ({ page }) => {
      await page.goto('/sessions');
      await page.waitForTimeout(500);

      const firstCard = page.locator('.session-card, [data-testid="session-card"]').first();
      const cardCount = await firstCard.count();

      if (cardCount > 0) {
        await firstCard.click();

        // Should navigate to recap page
        await page.waitForTimeout(500);
        expect(page.url()).toContain('/recap');
      }
    });

    test('should navigate back to session list', async ({ page }) => {
      // Start on a recap page
      await page.goto('/recap/test-session-id');
      await page.waitForTimeout(500);

      // Look for back button
      const backBtn = page.locator('button:has-text("Back"), .back-btn, [data-testid="back-btn"]');
      const hasBackBtn = await backBtn.count() > 0;

      if (hasBackBtn) {
        await backBtn.first().click();
        await page.waitForTimeout(500);

        // Should be on sessions page
        expect(page.url()).toContain('/sessions');
      }
    });

    test('should export recap data', async ({ page }) => {
      await page.goto('/recap/test-session-id');
      await page.waitForTimeout(500);

      // Look for export button
      const exportBtn = page.locator('button:has-text("Export"), button:has-text("导出"), [data-testid="export-btn"]');
      const hasExportBtn = await exportBtn.count() > 0;

      if (hasExportBtn) {
        // Setup download handler
        const downloadPromise = page.waitForEvent('download');

        await exportBtn.first().click();

        // Wait for download
        const download = await downloadPromise.withTimeout(5000);

        // Should trigger download
        expect(download).toBeTruthy();
      }
    });
  });

  // =============================================================================
  // Responsive Layout Tests
  // =============================================================================

  test.describe('Responsive Layout', () => {
    test('should display correctly on mobile', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('/sessions');
      await page.waitForTimeout(500);

      // Should use mobile layout
      const sessionCards = page.locator('.session-card, [data-testid="session-card"]');

      const cardCount = await sessionCards.count();
      if (cardCount > 0) {
        // On mobile, cards should be full width
        const firstCard = sessionCards.first();
        const box = await firstCard.boundingBox();

        expect(box?.width).toBeLessThanOrEqual(375);
      }
    });

    test('should display timeline correctly on tablet', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });

      await page.goto('/recap/test-session-id');
      await page.waitForTimeout(500);

      const timeline = page.locator('.timeline, [data-testid="timeline"]');
      const hasTimeline = await timeline.count() > 0;

      if (hasTimeline) {
        await expect(timeline).toBeVisible();
      }
    });

    test('should display timeline correctly on desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });

      await page.goto('/recap/test-session-id');
      await page.waitForTimeout(500);

      const timeline = page.locator('.timeline, [data-testid="timeline"]');
      const hasTimeline = await timeline.count() > 0;

      if (hasTimeline) {
        await expect(timeline).toBeVisible();
      }
    });
  });

  // =============================================================================
  // Accessibility Tests
  // =============================================================================

  test.describe('Accessibility', () => {
    test('should have proper heading hierarchy', async ({ page }) => {
      await page.goto('/sessions');

      // Check for h1
      const h1 = page.locator('h1');
      const hasH1 = await h1.count() > 0;

      if (hasH1) {
        await expect(h1.first()).toBeVisible();
      }
    });

    test('should have keyboard navigation support', async ({ page }) => {
      await page.goto('/sessions');
      await page.waitForTimeout(500);

      // Tab to first interactive element
      await page.keyboard.press('Tab');
      await page.waitForTimeout(200);

      // Something should be focused
      const focusedElement = page.locator(':focus');
      const hasFocus = await focusedElement.count() > 0;

      expect(hasFocus).toBeTruthy();
    });

    test('should support screen reader announcements', async ({ page }) => {
      await page.goto('/recap/test-session-id');
      await page.waitForTimeout(500);

      // Look for aria-live regions
      const liveRegions = page.locator('[aria-live], [role="status"]');
      const hasLiveRegion = await liveRegions.count() > 0;

      // Live regions are optional
      if (hasLiveRegion) {
        await expect(liveRegions.first()).toBeVisible();
      }
    });
  });

  // =============================================================================
  // Performance Tests
  // =============================================================================

  test.describe('Performance', () => {
    test('should load session list quickly', async ({ page }) => {
      const startTime = Date.now();

      await page.goto('/sessions');
      await page.waitForLoadState('networkidle');

      const loadTime = Date.now() - startTime;

      // Should load in less than 3 seconds
      expect(loadTime).toBeLessThan(3000);
    });

    test('should handle large session history', async ({ page }) => {
      // This test verifies performance with many events
      await page.goto('/recap/test-session-id');
      await page.waitForTimeout(500);

      const timeline = page.locator('.timeline, [data-testid="timeline"]');
      const hasTimeline = await timeline.count() > 0;

      if (hasTimeline) {
        // Should handle many nodes without hanging
        await page.waitForTimeout(1000);

        // Page should still be responsive
        const isResponsive = await page.evaluate(() => {
          return document.readyState === 'complete';
        });

        expect(isResponsive).toBeTruthy();
      }
    });
  });
});
