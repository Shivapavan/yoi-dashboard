import pkg from '../node_modules/playwright/index.js';
const { chromium } = pkg;

const browser = await chromium.launch({
  headless: true,
  executablePath: '/opt/pw-browsers/chromium',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    `--proxy-server=${process.env.HTTPS_PROXY || 'http://127.0.0.1:34821'}`,
    `--ignore-certificate-errors-spki-list`,
  ],
  proxy: { server: process.env.HTTPS_PROXY || 'http://127.0.0.1:34821' },
});

try {
  const page = await browser.newPage();
  await page.goto('https://lh.shift4.com/sign-in', { waitUntil: 'domcontentloaded', timeout: 45000 });

  const emailInput = page.locator('input').first();
  const passInput = page.locator('input[type="password"]');
  await emailInput.fill(process.env.LH_EMAIL);
  await passInput.fill(process.env.LH_PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Wait for navigation away from sign-in
  try {
    await page.waitForURL((url) => !url.includes('/sign-in'), { timeout: 25000 });
  } catch {
    await page.waitForTimeout(5000);
  }

  // Read token from localStorage
  const token = await page.evaluate(() => {
    const s = localStorage.getItem('ember_simple_auth-session');
    if (!s) return '';
    return JSON.parse(s)?.authenticated?.token || '';
  });

  await browser.close();

  if (!token) {
    process.stderr.write('ERROR: No token found in localStorage\n');
    process.exit(1);
  }

  process.stdout.write(token + '\n');
} catch (err) {
  process.stderr.write('ERROR: ' + err.message + '\n');
  await browser.close().catch(() => {});
  process.exit(1);
}
