import { chromium } from 'playwright';
import fs from 'fs';

const PAC = `function FindProxyForURL(url, host) {
  if (url.substring(0, 5) === 'https') return "PROXY 127.0.0.1:44237";
  return "DIRECT";
}`;
fs.writeFileSync('/tmp/chromium_proxy.pac', PAC);

const browser = await chromium.launch({
  headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-background-networking',
    '--no-first-run',
    '--proxy-pac-url=file:///tmp/chromium_proxy.pac',
  ]
});

const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();

// Intercept network to capture token from API headers or responses
let capturedToken = '';
page.on('response', async response => {
  const headers = response.headers();
  const t = headers['x-access-token'] || headers['authorization'] || '';
  if (t && t.length > 50) capturedToken = t.replace(/^Bearer\s+/i, '');
});

page.on('request', request => {
  const t = request.headers()['x-access-token'] || '';
  if (t && t.length > 50) capturedToken = t;
});

async function tryGetToken() {
  await page.goto('https://lh.shift4.com/sign-in', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.screenshot({ path: '/tmp/step1_signin.png' });

  // Wait for an actual text input (not checkbox, not hidden)
  await page.waitForSelector('input:not([type="checkbox"]):not([type="hidden"]):not([type="radio"])', { timeout: 15000 });

  // Find email and password fields more specifically
  const inputs = await page.locator('input:not([type="checkbox"]):not([type="hidden"]):not([type="radio"])').all();
  process.stderr.write(`Found ${inputs.length} visible inputs\n`);

  // Try to fill email (first text input)
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i], input[placeholder*="username" i]').first();
  const passInput = page.locator('input[type="password"]').first();

  await emailInput.fill('yumofindiamckinney@gmail.com');
  await passInput.fill('yumofindia@2025');
  await page.screenshot({ path: '/tmp/step2_filled.png' });

  // Click sign in
  await page.getByRole('button', { name: /sign.?in/i }).click();

  // Wait for navigation away from sign-in page
  await page.waitForNavigation({ timeout: 25000, waitUntil: 'domcontentloaded' });
  const landedUrl = page.url();
  process.stderr.write(`Landed on: ${landedUrl}\n`);
  await page.screenshot({ path: '/tmp/step3_after_login.png' });

  // Wait for page to settle and token to appear in localStorage
  await page.waitForTimeout(3000);

  // Try various localStorage keys
  const token = await page.evaluate(() => {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      try {
        const val = localStorage.getItem(key);
        if (!val) continue;
        const parsed = JSON.parse(val);
        const t = parsed?.authenticated?.token || parsed?.token || parsed?.accessToken || parsed?.access_token || '';
        if (t && t.length > 50) return t;
        // Check nested
        if (typeof parsed === 'object') {
          const str = JSON.stringify(parsed);
          const m = str.match(/"(?:token|accessToken|access_token|jwt)"\s*:\s*"([A-Za-z0-9._-]{50,})"/);
          if (m) return m[1];
        }
      } catch {}
    }
    return '';
  });

  return token || capturedToken;
}

let token = '';
try {
  token = await tryGetToken();
} catch (err) {
  process.stderr.write(`Attempt 1 failed: ${err.message}\n`);
  try {
    await page.goto('https://lh.shift4.com/sign-in', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    token = await tryGetToken();
  } catch (err2) {
    process.stderr.write(`Attempt 2 failed: ${err2.message}\n`);
    await page.screenshot({ path: '/tmp/error_page.png' });
    await browser.close();
    process.exit(1);
  }
}

await browser.close();

if (!token) {
  process.stderr.write('No token found in localStorage or network\n');
  process.exit(1);
}

process.stderr.write(`Token captured (length ${token.length})\n`);
console.log(token);
