import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const jsErrors = [];
const apiErrors = [];

page.on('pageerror', err => jsErrors.push(err.message));
page.on('response', res => {
  if (!res.ok() && res.url().includes('localhost:5000')) {
    apiErrors.push(`${res.status()} ${res.url()}`);
  }
});

// ── Step 1: Load app, expect login page ─────────────────────────
console.log('\n=== STEP 1: Login page ===');
await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
await page.screenshot({ path: 'e2e_01_login.png' });
const hasLogin = await page.locator('input[type="text"], input[placeholder="admin"]').isVisible();
console.log('Login form visible:', hasLogin);

// ── Step 2: Login ────────────────────────────────────────────────
console.log('\n=== STEP 2: Authenticate ===');
await page.locator('input[type="text"]').fill('admin');
await page.locator('input[type="password"]').fill('admin123');
await page.locator('button[type="submit"]').click();
await page.waitForTimeout(2000);
await page.screenshot({ path: 'e2e_02_after_login.png' });

const token = await page.evaluate(() => localStorage.getItem('token'));
console.log('Token stored:', token ? 'YES (' + token.substring(0, 30) + '...)' : 'NO — LOGIN FAILED');

if (!token) {
  console.error('FAIL: Login did not produce token');
  await browser.close();
  process.exit(1);
}

// ── Step 3: Dashboard loaded ─────────────────────────────────────
console.log('\n=== STEP 3: Dashboard ===');
await page.waitForSelector('.nav-item', { timeout: 10000 });
const bodyText = await page.locator('body').innerText();
const kpiVisible = bodyText.includes('JAMI ZAKAZ') || bodyText.includes('JAMI') || bodyText.includes('Ishlab chiqarish');
console.log('Dashboard KPI visible:', kpiVisible);
await page.screenshot({ path: 'e2e_03_dashboard.png', fullPage: true });

// ── Step 4: Test API calls returned real data ─────────────────────
console.log('\n=== STEP 4: API data check ===');
const token2 = token;
const headers = { Authorization: `Bearer ${token2}` };

const kpiRes = await fetch('http://localhost:5000/api/production/kpi', { headers });
console.log('GET /api/production/kpi:', kpiRes.status, kpiRes.ok ? 'OK' : 'FAIL');
const kpiData = await kpiRes.json();
console.log('KPI data:', JSON.stringify(kpiData));

const deptRes = await fetch('http://localhost:5000/api/production/departments', { headers });
console.log('GET /api/production/departments:', deptRes.status);
const deptData = await deptRes.json();
console.log('Departments count:', Array.isArray(deptData) ? deptData.length : 'not array — ' + JSON.stringify(deptData));

const crmRes = await fetch('http://localhost:5000/api/crm/monthly', { headers });
console.log('GET /api/crm/monthly:', crmRes.status);
const crmData = await crmRes.json();
console.log('CRM monthly data:', JSON.stringify(crmData));

// ── Step 5: Navigate to Klient-menejer ───────────────────────────
console.log('\n=== STEP 5: CRM page ===');
await page.locator('.nav-item:has-text("Klient-menejer")').click();
await page.waitForTimeout(1500);
await page.screenshot({ path: 'e2e_04_crm.png', fullPage: true });
const crmPageText = await page.locator('body').innerText();
console.log('CRM page loaded:', crmPageText.includes('Klient-menejer'));

// ── Step 6: Summary ──────────────────────────────────────────────
console.log('\n=== SUMMARY ===');
console.log('JS errors:', jsErrors.length ? jsErrors : 'none');
console.log('API 4xx/5xx:', apiErrors.length ? apiErrors : 'none');
console.log('Screenshots: e2e_01_login.png, e2e_02_after_login.png, e2e_03_dashboard.png, e2e_04_crm.png');
console.log(jsErrors.length === 0 && token ? '\nRESULT: PASS' : '\nRESULT: FAIL');

await browser.close();
