import { chromium, type FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export default async function globalSetup(_config: FullConfig) {
  const email = process.env.VITE_TEST_EMAIL;
  const password = process.env.VITE_TEST_PASSWORD;

  if (!email || !password) {
    console.warn('[E2E] VITE_TEST_EMAIL / VITE_TEST_PASSWORD not set in .env.test — skipping auth setup');
    // Write empty storage state so tests don't crash on missing file
    const authDir = path.resolve('e2e/.auth');
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
    fs.writeFileSync(path.join(authDir, 'admin.json'), JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:5173/LoanManager/');
  // Wait for login form
  await page.waitForSelector('input[placeholder*="example.com"]', { timeout: 10000 });

  await page.fill('input[placeholder*="example.com"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for successful navigation to dashboard
  await page.waitForURL('**/LoanManager/**', { timeout: 15000 });
  await page.waitForSelector('text=Dashboard', { timeout: 10000 });

  await page.context().storageState({ path: 'e2e/.auth/admin.json' });
  await browser.close();

  console.log('[E2E] Auth setup complete — session saved');
}
