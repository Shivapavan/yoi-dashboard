const { chromium } = require('playwright');

(async () => {
  const email = process.env.LIGHTHOUSE_EMAIL || '';
  const password = process.env.LIGHTHOUSE_PASSWORD || '';
  if (!email || !password) {
    process.stderr.write('LIGHTHOUSE_EMAIL and LIGHTHOUSE_PASSWORD env vars required\n');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  try {
    await page.goto('https://lh.shift4.com/sign-in', { waitUntil: 'load', timeout: 30000 });
    const emailInput = page.locator('input').first();
    const passInput = page.locator('input[type="password"]');
    await emailInput.fill(email);
    await passInput.fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    try {
      await page.waitForURL('**/dashboard', { timeout: 15000 });
    } catch (e) {
      await page.waitForTimeout(5000);
    }
    const session = await page.evaluate(() => {
      const s = localStorage.getItem('ember_simple_auth-session');
      return JSON.parse(s)?.authenticated?.token || '';
    });
    await browser.close();
    if (session) {
      console.log(session);
    } else {
      process.stderr.write('No token found in localStorage\n');
      process.exit(1);
    }
  } catch (err) {
    await browser.close();
    process.stderr.write('Login failed: ' + err.message + '\n');
    process.exit(1);
  }
})();
