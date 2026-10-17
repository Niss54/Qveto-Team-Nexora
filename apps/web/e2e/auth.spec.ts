import { test, expect } from '@playwright/test';

test.describe('Qveto Web Application - Base UI & Auth Flows', () => {
  test('Landing page renders title and CTA buttons', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Qveto/i);
    await expect(page.locator('h1')).toContainText('Modern project management');
    await expect(page.getByRole('link', { name: /Get Started Free/i })).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: 'Sign In', exact: true })).toBeVisible();
  });

  test('Navigate from landing page to Sign In page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('main').getByRole('link', { name: 'Sign In', exact: true }).click();

    await expect(page).toHaveURL(/.*login/);
    await expect(page.locator('h2')).toContainText('Sign in to your account');
    await expect(page.getByLabel(/Email address/i)).toBeVisible();
    await expect(page.getByLabel(/Password/i)).toBeVisible();
  });

  test('Navigate from login page to Register page', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /create a new account/i }).click();

    await expect(page).toHaveURL(/.*register/);
    await expect(page.locator('h2')).toContainText('Create your Qveto account');
    await expect(page.getByLabel(/Full Name/i)).toBeVisible();
    await expect(page.getByLabel(/Email address/i)).toBeVisible();
    await expect(page.getByLabel(/Password/i)).toBeVisible();
  });

  test('Registration form shows client validation for short password', async ({ page }) => {
    await page.goto('/register');

    await page.getByLabel(/Full Name/i).fill('John Doe');
    await page.getByLabel(/Email address/i).fill('john@example.com');
    await page.getByLabel(/Password/i).fill('short');

    await page.getByRole('button', { name: /Create Account/i }).click();

    await expect(page.locator('.bg-red-50')).toBeVisible();
    await expect(page.locator('.bg-red-50')).toContainText(/at least 8 characters/i);
  });

  test('Unauthenticated user visiting /dashboard is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard');

    // Should redirect to /login
    await expect(page).toHaveURL(/.*login/);
    await expect(page.locator('h2')).toContainText('Sign in to your account');
  });
});
