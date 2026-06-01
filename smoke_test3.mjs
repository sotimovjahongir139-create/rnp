import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', err => errors.push(err.message));

await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });

const navItems = await page.locator('.nav-item').allInnerTexts();
console.log('Nav items:', navItems);

const sections = ['Ishlab chiqarish', 'Klient-menejer', 'Sifat nazorati', 'Sotuv', 'Marketing'];
for (const label of sections) {
  await page.locator(`.nav-item:has-text("${label}")`).click();
  await page.waitForTimeout(800);
  const fname = `screenshot_${label.replace(/\s+/g, '_')}.png`;
  await page.screenshot({ path: fname, fullPage: false });
  const body = await page.locator('body').innerText();
  const firstLines = body.split('\n').filter(l => l.trim()).slice(0, 5).join(' | ');
  console.log(`[${label}] → ${firstLines.substring(0, 120)}`);
}

console.log('JS errors:', errors.length ? errors : 'none');
await browser.close();
