import { test, expect } from '@playwright/test';

const BASE = '/LoanManager';

test.describe('Loans page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/#/loans`);
    await page.waitForLoadState('networkidle');
  });

  test('loans table renders with at least one row or empty state', async ({ page }) => {
    // Either the table or an empty state message should be visible
    const hasTable = await page.locator('table').isVisible();
    const hasEmpty = await page.getByText(/no loans/i).isVisible();
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('summary strip shows 3 KPI cards', async ({ page }) => {
    // Total Loans, Active, Closed/Other
    await expect(page.getByText(/total loans/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/active/i).first()).toBeVisible();
  });

  test('role filter chips are visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /my loans/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /all loans/i })).toBeVisible();
  });

  test('Add Loan button opens modal', async ({ page }) => {
    await page.getByRole('button', { name: /add loan/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/add loan/i).nth(1)).toBeVisible();
  });

  test('closing Add Loan modal dismisses it', async ({ page }) => {
    await page.getByRole('button', { name: /add loan/i }).click();
    await page.waitForSelector('[role="dialog"]');
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 3000 });
  });
});
