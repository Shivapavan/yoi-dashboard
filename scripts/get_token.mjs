import { chromium } from 'playwright';

async function tryGetToken() {
  const browser = await chromium.launch({ headless: true, ignoreHTTPSErrors: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  try {
    await page.goto('https://lh.shift4.com/sign-in', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for inputs to be visible
    await page.waitForSelector('input', { timeout: 15000 });

    const emailInput = page.locator('input[type="email"], input[type="text"]').first();
    const passInput = page.locator('input[type="password"]');

    await emailInput.fill('yumofindiamckinney@gmail.com');
    await passInput.fill('yumofindia@2025');
    await page.getByRole('button', { name: /sign.?in/i }).click();

    // Wait for redirect to dashboard or for token to appear
    await page.waitForURL('**/dashboard', { timeout: 30000 });

    const session = await page.evaluate(() => {
      const s = localStorage.getItem('ember_simple_auth-session');
      return JSON.parse(s)?.authenticated?.token || '';
    });

    await browser.close();

    if (!session) {
      process.stderr.write('ERROR: No token found in localStorage\n');
      process.exit(1);
    }

    console.log(session);
  } catch (err) {
    // Try to grab token from network requests if page redirect approach failed
    try {
      const token = await page.evaluate(() => {
        const s = localStorage.getItem('ember_simple_auth-session');
        return JSON.parse(s)?.authenticated?.token || '';
      });
      await browser.close();
      if (token) {
        console.log(token);
        return;
      }
    } catch (_) { /* ignore */ }

    await browser.close();
    process.stderr.write(`ERROR: ${err.message}\n`);
    process.exit(1);
  }
}

tryGetToken().catch(err => {
  process.stderr.write(`FATAL: ${err.message}\n`);
  process.exit(1);
});
