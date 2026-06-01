import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', err => errors.push(err.message));

await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });

// Get all sidebar nav items
const navItems = await page.locator('nav a, nav button, aside a, aside button, [class*="sidebar"] a, [class*="sidebar"] button').all();
console.log('Nav items found:', navItems.length);
for (const item of navItems) {
  const text = await item.innerText().catch(() => '');
  const href = await item.getAttribute('href').catch(() => '');
  console.log(` - "${text.trim()}" href="${href}"`);
}

// Screenshot tabs: click each sidebar link
const sidebarLinks = await page.locator('nav a, aside a, [class*="sidebar"] a, [class*="nav"] a').all();
for (let i = 0; i < Math.min(sidebarLinks.length, 5); i++) {
  const text = await sidebarLinks[i].innerText().catch(() => `link${i}`);
  await sidebarLinks[i].click();
  await page.waitForTimeout(1000);
  const fname = `screenshot_nav_${i}_${text.trim().replace(/\s+/g, '_')}.png`;
  await page.screenshot({ path: fname, fullPage: false });
  console.log(`Screenshot: ${fname}`);
}

// Check for error/placeholder pages
const bodyText = await page.locator('body').innerText();
const hasPlaceholder = bodyText.includes('placeholder') || bodyText.includes('Placeholder') || bodyText.includes('coming soon');
console.log('Placeholder page detected:', hasPlaceholder);

console.log('JS errors:', errors.length ? errors : 'none');
await browser.close();
