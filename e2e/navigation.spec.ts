import { test, expect } from '@playwright/test';

const BASE = '/LoanManager';

test.describe('Sidebar navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.waitForSelector('text=Dashboard', { timeout: 10000 });
  });

  test('Dashboard link shows Dashboard page', async ({ page }) => {
    await page.click('a[href*="/dashboard"]');
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.locator('h1, [data-testid="page-title"]').filter({ hasText: 'Dashboard' }).first()).toBeVisible({ timeout: 5000 });
  });

  test('Loans nav link navigates to /loans', async ({ page }) => {
    await page.click('nav a[href$="/loans"]');
    await expect(page).toHaveURL(/\/loans$/);
  });

  test('Payments nav link navigates to /payments', async ({ page }) => {
    await page.click('nav a[href$="/payments"]');
    await expect(page).toHaveURL(/\/payments$/);
  });

  test('Loan Book logo navigates to dashboard', async ({ page }) => {
    // Go to loans first, then click the logo
    await page.goto(`${BASE}/loans`);
    await page.click('a[href*="/dashboard"]', { force: true });
    await expect(page).toHaveURL(/dashboard/);
  });
});

test.describe('Admin sections', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.waitForSelector('text=ADMIN', { timeout: 8000 });
  });

  test('All Loans link navigates to /loans?all=1', async ({ page }) => {
    await page.click('a[href*="loans?all=1"]');
    await expect(page).toHaveURL(/loans\?all=1/);
  });

  test('All Payments link navigates to /payments?all=1', async ({ page }) => {
    await page.click('a[href*="payments?all=1"]');
    await expect(page).toHaveURL(/payments\?all=1/);
  });
});
