/**
 * E2E Tests for Authentication (Login/Register)
 */

import { test, expect } from '@playwright/test';
import { login, register, logout, testUsers, navigateToGameConsole } from './helpers/utils';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToGameConsole(page);
  });

  test.describe('Login', () => {
    test('should show login form', async ({ page }) => {
      await page.goto('/login');

      // Check for login form elements
      await expect(page.locator('h1:has-text("登录")').or(page.locator('h2:has-text("登录")')).or(page.locator('title:has-text("Login")')).or(page.locator('[data-testid="login-page"]'))).toBeVisible();
      await expect(page.locator('input[name="username"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should login with valid credentials', async ({ page }) => {
      await page.goto('/login');

      // Fill and submit login form
      await page.fill('input[name="username"]', testUsers.valid.username);
      await page.fill('input[name="password"]', testUsers.valid.password);
      await page.click('button[type="submit"]');

      // Should redirect to game console
      await page.waitForURL('/', { timeout: 5000 });
      await expect(page.locator('text=/Monika/')).toBeVisible();
    });

    test('should show error with invalid credentials', async ({ page }) => {
      await page.goto('/login');

      // Fill with invalid credentials
      await page.fill('input[name="username"]', 'invaliduser');
      await page.fill('input[name="password"]', 'WrongPassword123!');

      // Check for submit button
      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      // Should show error message or stay on login page
      await expect(page).toHaveURL(/\/login/, { timeout: 3000 });
    });

    test('should validate required fields', async ({ page }) => {
      await page.goto('/login');

      // Try to submit without filling fields
      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      // Should still be on login page (validation failed)
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('Register', () => {
    test('should show registration form', async ({ page }) => {
      await page.goto('/register');

      // Check for registration form elements
      await expect(page.locator('h1:has-text("注册")').or(page.locator('h2:has-text("注册")')).or(page.locator('title:has-text("Register")')).or(page.locator('[data-testid="register-page"]'))).toBeVisible();
      await expect(page.locator('input[name="username"]')).toBeVisible();
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.locator('input[name="confirmPassword"]')).toBeVisible();
    });

    test('should register new user', async ({ page }) => {
      // Generate unique user
      const newUser = {
        username: `testuser_${Date.now()}`,
        email: `test_${Date.now()}@example.com`,
        password: 'TestPassword123!',
      };

      await page.goto('/register');

      // Fill registration form
      await page.fill('input[name="username"]', newUser.username);
      await page.fill('input[name="email"]', newUser.email);
      await page.fill('input[name="password"]', newUser.password);
      await page.fill('input[name="confirmPassword"]', newUser.password);

      // Submit form
      await page.click('button[type="submit"]');

      // Should redirect to game console after registration
      await page.waitForURL('/', { timeout: 5000 });
    });

    test('should validate password confirmation', async ({ page }) => {
      await page.goto('/register');

      // Fill form with mismatched passwords
      await page.fill('input[name="username"]', 'testuser');
      await page.fill('input[name="email"]', 'test@example.com');
      await page.fill('input[name="password"]', 'Password123!');
      await page.fill('input[name="confirmPassword"]', 'DifferentPassword123!');

      // Submit form
      await page.click('button[type="submit"]');

      // Should show validation error or stay on registration page
      await expect(page).toHaveURL(/\/register/, { timeout: 3000 });
    });

    test('should validate email format', async ({ page }) => {
      await page.goto('/register');

      // Fill with invalid email
      await page.fill('input[name="email"]', 'invalid-email');

      // Check for validation
      const emailInput = page.locator('input[name="email"]');
      const isValid = await emailInput.evaluate(el => el.checkValidity());

      // Email should be invalid
      expect(isValid).toBeFalsy();
    });
  });

  test.describe('Logout', () => {
    test('should logout successfully', async ({ page }) => {
      // First login
      await login(page);

      // Verify we're logged in
      await expect(page.locator('text=/Monika/')).toBeVisible();

      // Click logout button
      await page.click('button:has-text("退出")');

      // Should redirect to login page
      await page.waitForURL('/login', { timeout: 5000 });
      await expect(page.locator('input[name="username"]')).toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('should redirect to login when not authenticated', async ({ page }) => {
      // Try to access game console without authentication
      await page.goto('/');

      // Should redirect to login or show login form
      await page.waitForURL(/\/(login|register)/, { timeout: 5000 });
    });

    test('should have link to registration from login page', async ({ page }) => {
      await page.goto('/login');

      // Check for register link
      const registerLink = page.locator('a:has-text("注册"), a[href*="register"]');
      const hasRegisterLink = await registerLink.count() > 0;

      // May have register link or button
      expect(hasRegisterLink || await page.locator('button:has-text("注册")').count() > 0).toBeTruthy();
    });
  });
});
