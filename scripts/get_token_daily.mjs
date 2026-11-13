import { chromium } from 'playwright';
import fs from 'fs';

// PAC file to route HTTPS through proxy
const proxyPort = (process.env.HTTPS_PROXY || 'http://127.0.0.1:38997').replace(/.*:/, '').replace(/\/$/, '');
const pacContent = `function FindProxyForURL(url, host) {
  if (url.substring(0, 5) === 'https') {
    return "PROXY 127.0.0.1:${proxyPort}";
  }
  return "DIRECT";
}`;
fs.writeFileSync('/tmp/chromium_proxy.pac', pacContent);
process.stderr.write('Proxy port: ' + proxyPort + '\n');

const executablePath = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
process.stderr.write('Using: ' + executablePath + '\n');

const browser = await chromium.launch({
  headless: true,
  executablePath,
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
    if (!page.url().includes('lh.shift4.com')) throw e;
  }
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  const LH_EMAIL = process.env.LH_EMAIL || 'yumofindiamckinney@gmail.com';
  const LH_PASS = process.env.LH_PASS;
  if (!LH_PASS) throw new Error('LH_PASS env var is required');
  await page.locator('input[type="email"]').first().fill(LH_EMAIL);
  await page.locator('input[type="password"]').first().fill(LH_PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(url => !url.toString().includes('/sign-in'), { timeout: 30000 });
  await page.waitForTimeout(3000);
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
    await page.reload();
    await page.waitForTimeout(2000);
    token = await tryLogin();
  } catch (err2) {
    process.stderr.write('Login attempt 2 failed: ' + err2.message + '\n');
    try {
      await page.screenshot({ path: '/tmp/login_fail.png' });
    } catch (e) {}
    await browser.close();
    process.exit(1);
  }
}

await browser.close();
if (!token) {
  process.stderr.write('No token found in localStorage\n');
  process.exit(1);
}
process.stdout.write(token + '\n');
