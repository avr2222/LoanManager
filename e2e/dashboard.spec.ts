import { test, expect } from '@playwright/test';

const BASE = '/LoanManager';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/`);
    await page.waitForSelector('text=Dashboard', { timeout: 10000 });
  });

  test('page loads with Dashboard heading', async ({ page }) => {
    await expect(page.getByText('Dashboard').first()).toBeVisible();
  });

  test('shows Collection Progress section', async ({ page }) => {
    await expect(page.getByText('COLLECTION PROGRESS')).toBeVisible({ timeout: 8000 });
  });

  test('overdue badge in sidebar is a non-negative number', async ({ page }) => {
    // The payments nav item badge (if present) should be a number
    const badge = page.locator('nav').getByText(/^\d+$/).first();
    if (await badge.isVisible()) {
      const text = await badge.textContent();
      expect(Number(text)).toBeGreaterThanOrEqual(0);
    }
  });

  test('Statement button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /statement/i })).toBeVisible({ timeout: 8000 });
  });
});
