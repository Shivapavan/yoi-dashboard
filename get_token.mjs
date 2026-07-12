import { chromium } from 'playwright';
import fs from 'fs';

// Write a PAC file that only routes HTTPS through proxy (plain HTTP goes direct)
// This avoids Chromium sending non-CONNECT requests through the proxy, which it rejects
const pacContent = `function FindProxyForURL(url, host) {
  if (url.substring(0, 5) === 'https') {
    return "PROXY 127.0.0.1:44237";
  }
  return "DIRECT";
}`;
fs.writeFileSync('/tmp/chromium_proxy.pac', pacContent);

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

async function tryLogin() {
  try {
    await page.goto('https://lh.shift4.com/sign-in', { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    // domcontentloaded may still throw on SPA initial load; proceed if URL is correct
    if (!page.url().includes('lh.shift4.com')) throw e;
  }
  // Wait for the email input to appear (SPA renders after JS loads)
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  const emailInput = page.locator('input[type="email"]').first();
  const passInput = page.locator('input[type="password"]').first();
  await emailInput.fill('yumofindiamckinney@gmail.com');
  await passInput.fill('yumofindia@2025');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Wait for redirect away from sign-in (dashboard URL varies)
  await page.waitForURL(url => !url.toString().includes('/sign-in'), { timeout: 25000 });
  // Give the SPA a moment to store the session token
  await page.waitForTimeout(2000);
  const session = await page.evaluate(() => {
    const s = localStorage.getItem('ember_simple_auth-session');
    return JSON.parse(s)?.authenticated?.token || '';
  });
  return session;
}

let token = '';
try {
  token = await tryLogin();
} catch (err) {
  process.stderr.write('Login attempt 1 failed: ' + err.message + '\n');
  try {
    token = await tryLogin();
  } catch (err2) {
    process.stderr.write('Login attempt 2 failed: ' + err2.message + '\n');
    await browser.close();
    process.exit(1);
  }
}

await browser.close();
if (!token) {
  process.stderr.write('No token found in localStorage\n');
  process.exit(1);
}
console.log(token);
