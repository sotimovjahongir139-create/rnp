import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push(err.message));

console.log('Navigating to localhost:3000...');
await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });

const title = await page.title();
console.log('Page title:', title);

// Screenshot 1: initial load
await page.screenshot({ path: 'screenshot_01_home.png', fullPage: true });
console.log('Screenshot 1 saved: screenshot_01_home.png');

// Check visible text
const bodyText = await page.locator('body').innerText();
const lines = bodyText.split('\n').filter(l => l.trim()).slice(0, 20);
console.log('Visible text (first 20 lines):\n', lines.join('\n'));

// Check for sidebar links / navigation
const navLinks = await page.locator('a, button, [role="button"]').allInnerTexts();
console.log('Clickable elements:', navLinks.filter(t => t.trim()).slice(0, 15));

// Try clicking CRM tab if exists
const crmLink = page.locator('text=CRM').first();
const crmVisible = await crmLink.isVisible().catch(() => false);
if (crmVisible) {
  console.log('Clicking CRM tab...');
  await crmLink.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'screenshot_02_crm.png', fullPage: true });
  console.log('Screenshot 2 saved: screenshot_02_crm.png');
}

// Check for any loading spinners stuck
const spinners = await page.locator('.spinner, .loading, [class*="load"]').count();
console.log('Stuck loaders:', spinners);

// JS console errors
console.log('JS errors:', errors.length ? errors : 'none');

await browser.close();
console.log('DONE');
