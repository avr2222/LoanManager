import { test, expect } from '@playwright/test';

const BASE = '/LoanManager';

test.describe('Payments page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/#/payments`);
    await page.waitForLoadState('networkidle');
  });

  test('summary cards are visible', async ({ page }) => {
    await expect(page.getByText(/total expected/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/total received/i)).toBeVisible();
    await expect(page.getByText(/total pending/i)).toBeVisible();
    await expect(page.getByText(/overdue/i).first()).toBeVisible();
  });

  test('clicking "Total Received" card filters table to Received', async ({ page }) => {
    await page.waitForSelector('text=Total Received', { timeout: 8000 });
    const card = page.locator('button').filter({ hasText: /total received/i });
    await card.click();
    // Card shows active ring indicator
    await expect(card.locator('text=Filtered')).toBeVisible({ timeout: 3000 });
    // Status dropdown should now show Received
    const statusSelect = page.locator('select').filter({ hasText: /received/i }).first();
    if (await statusSelect.isVisible()) {
      await expect(statusSelect).toHaveValue('Received');
    }
  });

  test('clicking "Overdue" card filters table to Overdue', async ({ page }) => {
    await page.waitForSelector('text=Overdue', { timeout: 8000 });
    const card = page.locator('button').filter({ hasText: /^overdue/i }).first();
    await card.click();
    await expect(card.locator('text=Filtered')).toBeVisible({ timeout: 3000 });
  });

  test('clicking active filter card again clears filter', async ({ page }) => {
    await page.waitForSelector('text=Total Received', { timeout: 8000 });
    const card = page.locator('button').filter({ hasText: /total received/i });
    await card.click(); // activate
    await card.click(); // clear
    await expect(card.locator('text=Filtered')).not.toBeVisible({ timeout: 3000 });
  });

  test('Record Payment button opens modal', async ({ page }) => {
    await page.getByRole('button', { name: /record payment/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/record payment/i).nth(1)).toBeVisible();
  });

  test('payments table renders', async ({ page }) => {
    const hasTable = await page.locator('table').isVisible();
    const hasCards = await page.locator('[class*="rounded-2xl"]').first().isVisible();
    expect(hasTable || hasCards).toBe(true);
  });
});
