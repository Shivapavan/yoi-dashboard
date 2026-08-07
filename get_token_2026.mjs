import { chromium } from 'playwright';
import fs from 'fs';

// PAC file to route HTTPS through proxy
const pacContent = `function FindProxyForURL(url, host) {
  if (url.substring(0, 5) === 'https') {
    return "PROXY 127.0.0.1:32807";
  }
  return "DIRECT";
}`;
fs.writeFileSync('/tmp/chromium_proxy.pac', pacContent);

// Try both chromium paths
const execPaths = [
  '/opt/pw-browsers/chromium-1228/chrome-linux64/chrome',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
];

const executablePath = execPaths.find(p => fs.existsSync(p));
if (!executablePath) {
  process.stderr.write('No chromium executable found\n');
  process.exit(1);
}
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
  await page.locator('input[type="email"]').first().fill('yumofindiamckinney@gmail.com');
  await page.locator('input[type="password"]').first().fill('yumofindia@2025');
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
