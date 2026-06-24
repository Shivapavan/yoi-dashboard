import { chromium } from 'playwright';

const proxyServer = process.env.HTTPS_PROXY || '';
const launchArgs = [
  '--ignore-certificate-errors',
  '--disable-web-security',
  '--no-sandbox',
];
if (proxyServer) launchArgs.push(`--proxy-server=${proxyServer}`);
const browser = await chromium.launch({
  headless: true,
  args: launchArgs,
});

const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  ...(proxyServer ? { proxy: { server: proxyServer } } : {}),
});
const page = await context.newPage();

async function tryLogin() {
  await page.goto('https://lh.shift4.com/sign-in', { waitUntil: 'load', timeout: 30000 });
  // Wait for inputs to appear
  await page.waitForSelector('input', { timeout: 10000 });
  const emailInput = page.locator('input').first();
  const passInput = page.locator('input[type="password"]');
  await emailInput.fill('yumofindiamckinney@gmail.com');
  await passInput.fill('yumofindia@2025');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard', { timeout: 20000 });
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
