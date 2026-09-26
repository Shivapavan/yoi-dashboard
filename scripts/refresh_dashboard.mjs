/**
 * YOI Dashboard daily refresh script.
 * 1. Logs in to Lighthouse via headless browser to get a fresh JWT
 * 2. Uses that JWT in-memory to fetch today's metrics, items, and card breakdown
 * 3. Updates data/dashboard.json in place
 * Token is never written to stdout/stderr/disk.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const BASE = 'https://lighthouse-api.harbortouch.com';
const LOCATION_ID = 43141083;
const MERCHANT_ID = '0022712560';

// CDT = UTC-5 (September is DST in US)
// Business day starts 4 AM CDT = 9 AM UTC
function centralTzOffset(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dstStart = new Date(y, 2, 1);
  while (dstStart.getDay() !== 0) dstStart.setDate(dstStart.getDate() + 1);
  dstStart.setDate(dstStart.getDate() + 7);
  const dstEnd = new Date(y, 10, 1);
  while (dstEnd.getDay() !== 0) dstEnd.setDate(dstEnd.getDate() + 1);
  return date >= dstStart && date < dstEnd ? '-05:00' : '-06:00';
}

function businessDayWindow(dateStr) {
  const utcHours = centralTzOffset(dateStr) === '-05:00' ? 5 : 6;
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d,     utcHours + 4,  0,  0,   0));
  const end   = new Date(Date.UTC(y, m - 1, d + 1, utcHours + 3, 59, 59, 999));
  return { start: start.toISOString(), end: end.toISOString() };
}

function round2(n) { return Math.round(n * 100) / 100; }

async function getToken() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  try {
    await page.goto('https://lh.shift4.com/sign-in', { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait for form to be interactive
    await page.waitForTimeout(2000);
    const emailInput = page.locator('input').first();
    const passInput = page.locator('input[type="password"]');
    await emailInput.fill('yumofindiamckinney@gmail.com');
    await passInput.fill('yumofindia@2025');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/dashboard', { timeout: 20000 });
    const session = await page.evaluate(() => {
      const s = localStorage.getItem('ember_simple_auth-session');
      if (!s) return '';
      try { return JSON.parse(s)?.authenticated?.token || ''; } catch { return ''; }
    });
    await browser.close();
    return session || null;
  } catch (err) {
    await browser.close();
    throw err;
  }
}

async function fetchMetric(token, metric, start, end) {
  try {
    const res = await fetch(
      `${BASE}/api/v1/dashboard/financial-overview/${metric}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      { headers: { 'x-access-token': token, 'accept': 'application/json' } }
    );
    if (!res.ok) return 0;
    const data = await res.json();
    const arr = data[metric] || data[Object.keys(data)[0]] || [];
    return arr.reduce((s, l) => s + (l.total || 0), 0);
  } catch { return 0; }
}

async function fetchDayMetrics(token, dateStr) {
  const { start, end } = businessDayWindow(dateStr);
  const METRICS = ['gross-sales', 'net-sales', 'taxes', 'discounts', 'voids', 'cash-payments', 'credit-card-payments', 'open-tickets'];
  const values = await Promise.all(METRICS.map(m => fetchMetric(token, m, start, end)));
  const [grossSales, netSales, taxes, discounts, voids, cashPayments, creditCard, openTickets] = values;
  return { grossSales: round2(grossSales), netSales: round2(netSales), taxes: round2(taxes), discounts: round2(discounts), voids: round2(voids), cashPayments: round2(cashPayments), creditCard: round2(creditCard), openTickets: Math.round(openTickets) };
}

async function fetchActivitySummary(token, dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().split('T')[0];
  const start = `${dateStr}T04:00:00${centralTzOffset(dateStr)}`;
  const end   = `${nextDay}T03:59:59${centralTzOffset(nextDay)}`;
  try {
    const res = await fetch(`${BASE}/api/v1/reports/echo-pro/activity-summary`, {
      method: 'POST',
      headers: { 'x-access-token': token, 'accept': 'application/json', 'content-type': 'application/json;charset=UTF-8' },
      body: JSON.stringify({ start, end, locations: [LOCATION_ID], intradayPeriodGroupGuids: [], locale: 'en-US', revenueCenterGuids: [] }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const totalsBucket = data.buckets?.find(b => b.guid === null);
    if (!totalsBucket) return null;

    // Extract taxes, discounts, voids from summary report
    let taxes = 0, discounts = 0, voids = 0;
    const summary = totalsBucket.reports?.find(r => r.name === 'Summary');
    if (summary) {
      for (const row of (summary.rows || [])) {
        const label = (row[0] || '').toLowerCase();
        const val = parseFloat((row[1] || '0').replace(/[$,]/g, '')) || 0;
        if (label.includes('tax')) taxes = val;
        if (label.includes('discount')) discounts = val;
        if (label.includes('void')) voids = val;
      }
    }

    // Extract payment totals from Payment Summary
    const paymentReport = totalsBucket.reports?.find(r => r.name === 'Payment Summary');
    let cashPayments = 0;
    if (paymentReport) {
      for (const row of (paymentReport.rows || [])) {
        const label = (row[0] || '').toLowerCase();
        const val = parseFloat((row[2] || row[1] || '0').replace(/[$,]/g, '')) || 0;
        if (/^cash/.test(label) && !label.includes('total')) cashPayments += val;
      }
    }

    return { taxes: round2(taxes), discounts: round2(discounts), voids: round2(voids), cashPayments: round2(cashPayments) };
  } catch { return null; }
}

async function fetchBatchDetail(token, dateStr) {
  // dateStr = the date whose settlement we want (batches submitted next day)
  // So fetch dateStr+1 morning
  const [y, m, d] = dateStr.split('-').map(Number);
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1));
  const nextStr = nextDay.toISOString().split('T')[0];
  const afterNext = new Date(Date.UTC(y, m - 1, d + 2));

  const start = `${nextStr}T05:00:00.000Z`;
  const end   = afterNext.toISOString();

  try {
    const res = await fetch(
      `${BASE}/api/v1/dashboard/processing/batch-detail?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&merchantId=${MERCHANT_ID}`,
      { headers: { 'x-access-token': token, 'accept': 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const batches = data.batches || [];
    if (!batches.length) return null;
    return {
      visa:       round2(batches.reduce((s, b) => s + (b.AmtVisa || 0), 0)),
      mastercard: round2(batches.reduce((s, b) => s + (b.AmtMasterCard || 0), 0)),
      amex:       round2(batches.reduce((s, b) => s + (b.AmtAmex || 0), 0)),
      discover:   round2(batches.reduce((s, b) => s + (b.AmtDiscover || 0), 0)),
      debit:      round2(batches.reduce((s, b) => s + (b.AmtDebit || 0), 0)),
      ebt:        round2(batches.reduce((s, b) => s + (b.AmtEBT || 0), 0)),
      returns:    round2(batches.reduce((s, b) => s + (b.AmtReturns || 0), 0)),
      total:      round2(batches.reduce((s, b) => s + (b.TotalAmt || 0), 0)),
    };
  } catch { return null; }
}

async function fetchItems(token, dateStr) {
  const { start, end } = businessDayWindow(dateStr);
  const startFmt = start.replace('Z', '-00:00');
  const endFmt   = end.replace('Z', '-00:00');
  const url = `${BASE}/api/v1/reports/echo-pro/xls/sales-summary-by-item-open-and-closed-tickets?start=${encodeURIComponent(startFmt)}&end=${encodeURIComponent(endFmt)}&locations%5B%5D=${LOCATION_ID}&token=${token}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const wb = XLSX.read(buffer);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    return rows.slice(1)
      .filter(r => r[0] && typeof r[0] === 'string' && !/^total/i.test(r[0]))
      .map(r => ({ name: r[0].trim(), qty: Number(r[4]) || 0, revenue: round2(Number(r[9]) || 0) }))
      .filter(it => it.qty > 0 && it.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);
  } catch { return null; }
}

// Online orders (DoorDash, UberEats, Grubhub) from Lighthouse
async function fetchOnlineOrders(token, dateStr) {
  const { start, end } = businessDayWindow(dateStr);
  const url = `${BASE}/api/v1/echo-pro/tickets?location=${LOCATION_ID}&order=${encodeURIComponent('createdAt asc')}&limit=500&complete=true`;
  try {
    const res = await fetch(url, { headers: { 'x-access-token': token, 'accept': 'application/json' } });
    if (!res.ok) return { doordash: 0, uberEats: 0, grubhub: 0, stOnline: 0 };
    const data = await res.json();
    const tickets = data.tickets || [];
    const startMs = new Date(start).getTime();
    const endMs   = new Date(end).getTime();

    let doordash = 0, uberEats = 0, grubhub = 0, stOnline = 0;
    for (const t of tickets) {
      const orderType = (t.orderTypeName || '').toLowerCase();
      const created = new Date(t.completedAt || t.createdAt).getTime();
      if (created < startMs || created > endMs) continue;
      const amount = round2(parseFloat(t.grandTotal) || 0);
      if (/doordash/.test(orderType)) doordash = round2(doordash + amount);
      else if (/uber/.test(orderType)) uberEats = round2(uberEats + amount);
      else if (/grubhub/.test(orderType)) grubhub = round2(grubhub + amount);
      else if (/online|st\s*online/i.test(orderType)) stOnline = round2(stOnline + amount);
    }
    return { doordash, uberEats, grubhub, stOnline };
  } catch { return { doordash: 0, uberEats: 0, grubhub: 0, stOnline: 0 }; }
}

function getToday() {
  // Business day starts at 4 AM CDT. Subtract 4h from "now" to get business date.
  const now = new Date(Date.now() - 4 * 60 * 60 * 1000);
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

async function main() {
  const today = getToday();
  const [ty, tm, td] = today.split('-').map(Number);
  const yesterday = new Date(Date.UTC(ty, tm - 1, td - 1)).toISOString().split('T')[0];

  console.log(`[refresh] today=${today}, yesterday=${yesterday}`);
  console.log('[refresh] Logging in to Lighthouse...');

  let token = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      token = await getToken();
      if (token) break;
    } catch (err) {
      console.error(`[refresh] Login attempt ${attempt} failed: ${err.message}`);
      if (attempt === 2) {
        console.error('[refresh] ABORTING — could not obtain token after 2 attempts');
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  if (!token) {
    console.error('[refresh] ABORTING — no token obtained');
    process.exit(1);
  }
  console.log('[refresh] Token obtained. Fetching data...');

  // Fetch all data in parallel
  const [todayMetrics, todayActivity, todayItems, yesterdayBatch, onlineOrders] = await Promise.all([
    fetchDayMetrics(token, today),
    fetchActivitySummary(token, today),
    fetchItems(token, today),
    fetchBatchDetail(token, yesterday),
    fetchOnlineOrders(token, today),
  ]);

  console.log('[refresh] grossSales=' + todayMetrics.grossSales + ' netSales=' + todayMetrics.netSales + ' taxes=' + todayMetrics.taxes);
  console.log('[refresh] items fetched: ' + (todayItems ? todayItems.length : 'null'));
  console.log('[refresh] yesterdayBatch: ' + (yesterdayBatch ? JSON.stringify(yesterdayBatch) : 'null'));
  console.log('[refresh] online: ' + JSON.stringify(onlineOrders));

  // Merge activity summary overrides for today (more accurate voids/taxes/discounts)
  const mergedMetrics = { ...todayMetrics };
  if (todayActivity) {
    if (todayActivity.taxes > 0) mergedMetrics.taxes = todayActivity.taxes;
    if (todayActivity.discounts > 0) mergedMetrics.discounts = todayActivity.discounts;
    if (todayActivity.voids > 0) mergedMetrics.voids = todayActivity.voids;
    if (todayActivity.cashPayments > 0) mergedMetrics.cashPayments = todayActivity.cashPayments;
  }

  // Read dashboard.json
  const dashPath = '/home/user/yoi-dashboard/data/dashboard.json';
  const dash = JSON.parse(readFileSync(dashPath, 'utf8'));

  // Update/add history entry for today
  const histIdx = dash.history.findIndex(h => h.date === today);
  const newEntry = {
    date: today,
    grossSales: mergedMetrics.grossSales,
    netSales: mergedMetrics.netSales,
    taxes: mergedMetrics.taxes,
    discounts: mergedMetrics.discounts,
    voids: mergedMetrics.voids,
    cashPayments: mergedMetrics.cashPayments,
    creditCard: mergedMetrics.creditCard,
    openTickets: mergedMetrics.openTickets,
    doordash: onlineOrders.doordash,
    stOnline: onlineOrders.stOnline,
    uberEats: onlineOrders.uberEats,
    grubhub: onlineOrders.grubhub,
  };

  if (histIdx >= 0) {
    // Only update if live value is higher than stored (never lower a good value)
    const stored = dash.history[histIdx];
    if (mergedMetrics.grossSales > (stored.grossSales || 0) || (stored.grossSales || 0) < 100) {
      dash.history[histIdx] = { ...stored, ...newEntry };
      console.log('[refresh] Updated existing history entry for ' + today);
    } else {
      console.log('[refresh] Stored gross is already higher — keeping stored values for ' + today);
    }
  } else {
    dash.history.push(newEntry);
    console.log('[refresh] Added new history entry for ' + today);
  }

  // Update cardBreakdown for yesterday
  if (yesterdayBatch) {
    const yIdx = dash.history.findIndex(h => h.date === yesterday);
    if (yIdx >= 0) {
      dash.history[yIdx].cardBreakdown = yesterdayBatch;
      console.log('[refresh] Updated cardBreakdown for ' + yesterday);
    } else {
      console.log('[refresh] No history entry found for ' + yesterday + ' — cannot update cardBreakdown');
    }
  }

  // Update itemsByDay for today
  if (todayItems && todayItems.length > 0) {
    const itemIdx = dash.itemsByDay ? dash.itemsByDay.findIndex(e => e.date === today) : -1;
    const itemEntry = { date: today, items: todayItems };
    if (itemIdx >= 0) {
      dash.itemsByDay[itemIdx] = itemEntry;
      console.log('[refresh] Updated itemsByDay for ' + today + ' (' + todayItems.length + ' items)');
    } else {
      if (!dash.itemsByDay) dash.itemsByDay = [];
      dash.itemsByDay.push(itemEntry);
      console.log('[refresh] Added itemsByDay entry for ' + today + ' (' + todayItems.length + ' items)');
    }
  }

  // Update top-level fields
  dash.businessDay = today;
  dash.lastUpdated = new Date().toISOString();
  dash.disputesScannedAt = new Date().toISOString();

  // Write back
  writeFileSync(dashPath, JSON.stringify(dash, null, 2) + '\n', 'utf8');
  console.log('[refresh] dashboard.json updated successfully');
}

main().catch(err => {
  console.error('[refresh] FATAL:', err);
  process.exit(1);
});
