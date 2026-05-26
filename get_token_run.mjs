import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();

try {
  await page.goto('https://lh.shift4.com/sign-in', { waitUntil: 'load', timeout: 45000 });
  await page.screenshot({ path: '/tmp/signin_page.png' });

  await page.waitForSelector('input', { timeout: 15000 });

  const emailInput = page.locator('input').first();
  const passInput = page.locator('input[type="password"]');
  await emailInput.fill('yumofindiamckinney@gmail.com');
  await passInput.fill('yumofindia@2025');
  await page.screenshot({ path: '/tmp/filled_form.png' });
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Wait for navigation away from sign-in
  await page.waitForURL('**/dashboard**', { timeout: 25000 });
  await page.screenshot({ path: '/tmp/after_login.png' });

  // Wait a moment for localStorage to populate
  await page.waitForTimeout(3000);

  const session = await page.evaluate(() => {
    const s = localStorage.getItem('ember_simple_auth-session');
    return JSON.parse(s)?.authenticated?.token || '';
  });

  await browser.close();
  if (session) {
    console.log(session);
  } else {
    // Also dump all localStorage keys
    process.stderr.write('Token empty. Dumping localStorage keys...\n');
    process.exit(1);
  }
} catch (err) {
  try {
    await page.screenshot({ path: '/tmp/error_page.png' });
    const url = page.url();
    process.stderr.write('URL at error: ' + url + '\n');
    // Try getting token anyway
    const session = await page.evaluate(() => {
      const s = localStorage.getItem('ember_simple_auth-session');
      if (s) {
        try {
          const parsed = JSON.parse(s);
          return parsed?.authenticated?.token || '';
        } catch { return ''; }
      }
      return '';
    });
    await browser.close();
    if (session) {
      console.log(session);
    } else {
      process.stderr.write('Fatal: ' + err.message + '\n');
      process.exit(1);
    }
  } catch (err2) {
    await browser.close();
    process.stderr.write('Fatal: ' + err.message + '\n');
    process.exit(1);
  }
}
