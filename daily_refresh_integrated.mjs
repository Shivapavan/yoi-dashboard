/**
 * Integrated daily refresh: gets Lighthouse JWT via Playwright, then immediately
 * fetches today's data and updates dashboard.json — token never printed to stdout.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from './node_modules/xlsx/xlsx.mjs';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Step 1: Get JWT token via headless Playwright ---
async function getToken() {
  const pacContent = `function FindProxyForURL(url, host) {
  if (url.substring(0, 5) === 'https') {
    return "PROXY 127.0.0.1:32807";
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
      if (!page.url().includes('lh.shift4.com')) throw e;
    }
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    const emailInput = page.locator('input[type="email"]').first();
    const passInput = page.locator('input[type="password"]').first();
    const LH_EMAIL = process.env.LH_EMAIL || 'yumofindiamckinney@gmail.com';
    const LH_PASS  = process.env.LH_PASS;
    if (!LH_PASS) throw new Error('LH_PASS env var required');
    await emailInput.fill(LH_EMAIL);
    await passInput.fill(LH_PASS);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(url => !url.toString().includes('/sign-in'), { timeout: 25000 });
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
      // Reload page and retry
      await page.goto('https://lh.shift4.com/sign-in', { waitUntil: 'domcontentloaded', timeout: 30000 });
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
  return token;
}

// --- Step 2: Fetch and update dashboard ---
function getCDTBusinessDay() {
  const now = new Date();
  const cdtMs = now.getTime() - 5 * 60 * 60 * 1000;
  const cdt = new Date(cdtMs);
  const biz = new Date(cdtMs);
  if (cdt.getUTCHours() < 4) biz.setUTCDate(biz.getUTCDate() - 1);
  const p = n => String(n).padStart(2, '0');
  return `${biz.getUTCFullYear()}-${p(biz.getUTCMonth()+1)}-${p(biz.getUTCDate())}`;
}

const TODAY = getCDTBusinessDay();
const tdDate = new Date(TODAY + 'T00:00:00Z');
const ydDate = new Date(tdDate.getTime() - 86400000);
const tmDate = new Date(tdDate.getTime() + 86400000);
const _p = n => String(n).padStart(2, '0');
const YESTERDAY = `${ydDate.getUTCFullYear()}-${_p(ydDate.getUTCMonth()+1)}-${_p(ydDate.getUTCDate())}`;
const TOMORROW  = `${tmDate.getUTCFullYear()}-${_p(tmDate.getUTCMonth()+1)}-${_p(tmDate.getUTCDate())}`;

const MERCHANT_ID = '0022712560';
const LOCATION_ID = '43141083';
const BASE = 'https://lighthouse-api.harbortouch.com/api/v1';

const metricMap = {
  'gross-sales':          'grossSales',
  'net-sales':            'netSales',
  'taxes':                'taxes',
  'discounts':            'discounts',
  'voids':                'voids',
  'cash-payments':        'cashPayments',
  'credit-card-payments': 'creditCardPayments',
  'open-tickets':         'openTickets',
};

async function apiFetch(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} for ${url}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchMetric(metric, start, end, headers) {
  const url = `${BASE}/dashboard/financial-overview/${metric}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
  process.stderr.write(`  Fetching ${metric}...\n`);
  const data = await apiFetch(url, headers);
  const arr = data?.[metric];
  let val = 0;
  if (Array.isArray(arr) && arr.length > 0) {
    val = arr.reduce((s, r) => s + (r.total ?? r.amount ?? r.value ?? 0), 0);
  } else {
    val = data?.value ?? data?.amount ?? data?.total ?? 0;
  }
  val = +Number(val).toFixed(2);
  process.stderr.write(`    ${metric} = ${val}\n`);
  return val;
}

function getCol(r, ...keys) {
  for (const k of keys) {
    if (r[k] !== undefined && r[k] !== '') return r[k];
  }
  return undefined;
}

async function fetchTopItems(dateStr, nextDateStr, headers, TOKEN) {
  const url = `${BASE}/reports/echo-pro/xls/sales-summary-by-item-open-and-closed-tickets?start=${encodeURIComponent(dateStr + 'T09:00:00-00:00')}&end=${encodeURIComponent(nextDateStr + 'T08:59:00-00:00')}&locations[]=${LOCATION_ID}&token=${TOKEN}`;
  process.stderr.write(`  Fetching top items XLS for ${dateStr}...\n`);
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} for top-items: ${text.slice(0, 200)}`);
  }
  const buffer = await res.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: 0 });

  process.stderr.write(`    XLS row count: ${rows.length}\n`);

  return rows
    .map(r => {
      const name = String(getCol(r, 'Item', 'Item Name', 'Name', 'item_name') ?? '').trim();
      const qty  = Number(getCol(r, 'Qty', 'Quantity', 'qty', 'Sold') ?? 0);
      const rev  = Number(getCol(r, 'Gross Sales', 'Revenue', 'Amount', 'Total', 'revenue') ?? 0);
      return { name, qty, revenue: +rev.toFixed(2) };
    })
    .filter(i => {
      if (!i.name || i.name === '0') return false;
      if (/^total/i.test(i.name)) return false;
      if (i.qty === 0 && i.revenue === 0) return false;
      if (i.revenue <= 0) return false;
      return true;
    })
    .sort((a, b) => b.revenue - a.revenue);
}

function parsePaymentRows(rows) {
  let cash = 0, directCredit = 0, doordash = 0, uberEats = 0, stOnline = 0, grubhub = 0;
  let mode = null;
  for (const row of rows) {
    const rawLabel = String(row[0] ?? '');
    const isIndented = rawLabel.startsWith(' ');
    const label = rawLabel.replace(/ /g, '').trim().toLowerCase();
    const amtStr = String(row[row.length - 1] ?? '');
    const amount = parseFloat(amtStr.replace(/[$,]/g, '')) || 0;
    const hasAmt = amtStr.includes('$') && amount > 0;
    if (!label || label.startsWith('total')) continue;
    if (label === 'cash')          { cash += amount; continue; }
    if (label === 'cash rounding') { cash += amount; continue; }
    if (label === 'credit')        { mode = 'direct'; continue; }
    if (label.startsWith('credit - doordash'))  { mode = 'doordash'; if (hasAmt) doordash  += amount; continue; }
    if (label.startsWith('credit - uber'))       { mode = 'uber';     if (hasAmt) uberEats  += amount; continue; }
    if (label.startsWith('credit - st-online') ||
        label.startsWith('credit - online'))     { mode = 'stonline'; if (hasAmt) stOnline  += amount; continue; }
    if (label.startsWith('credit - grubhub'))   { mode = 'grubhub';  if (hasAmt) grubhub   += amount; continue; }
    if (label.startsWith('credit - '))          { mode = 'other';    continue; }
    if (isIndented && amount > 0) {
      if      (mode === 'direct')   directCredit += amount;
      else if (mode === 'doordash') doordash     += amount;
      else if (mode === 'uber')     uberEats     += amount;
      else if (mode === 'stonline') stOnline     += amount;
      else if (mode === 'grubhub')  grubhub      += amount;
    }
  }
  return { cash, directCredit, doordash, uberEats, stOnline, grubhub };
}

async function fetchActivityPayments(actStart, actEnd, headers) {
  process.stderr.write('  Fetching activity-summary...\n');
  const res = await fetch(`${BASE}/reports/echo-pro/activity-summary`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json;charset=UTF-8' },
    body: JSON.stringify({
      start: actStart, end: actEnd,
      locations: [LOCATION_ID],
      intradayPeriodGroupGuids: [], locale: 'en-US', revenueCenterGuids: [],
    }),
  });
  if (!res.ok) { process.stderr.write(`    activity-summary HTTP ${res.status}\n`); return null; }
  const data = await res.json();
  const bucket = data.buckets?.find(b => b.guid === null);
  if (!bucket) return null;
  const find = name => bucket.reports?.find(r => r.name === name);
  const payRows = find('Payment Summary')?.rows ?? [];
  const payments = parsePaymentRows(payRows);
  const voidRows = find('Net Void Summary')?.rows ?? [];
  const totalVoidRow = voidRows.find(r => String(r[0] ?? '').toLowerCase().includes('total'));
  const voids = totalVoidRow
    ? parseFloat(String(totalVoidRow[totalVoidRow.length - 1]).replace(/[$,]/g, '')) || 0
    : 0;
  process.stderr.write(`    cash=${payments.cash} credit=${payments.directCredit} dd=${payments.doordash} uber=${payments.uberEats} voids=${voids}\n`);
  return { ...payments, voids };
}

async function fetchCardBreakdown(start, end, headers) {
  const url = `${BASE}/dashboard/processing/batch-detail?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&merchantId=${MERCHANT_ID}`;
  process.stderr.write('  Fetching card breakdown...\n');
  const data = await apiFetch(url, headers);
  const batches = Array.isArray(data) ? data : (data?.data ?? data?.batches ?? []);
  process.stderr.write(`    Got ${batches.length} batches\n`);
  let visa = 0, mastercard = 0, amex = 0, discover = 0, debit = 0, ebt = 0, returns = 0;
  for (const b of batches) {
    visa       += Number(b.AmtVisa       ?? b.visa       ?? 0);
    mastercard += Number(b.AmtMasterCard ?? b.mastercard ?? 0);
    amex       += Number(b.AmtAmex       ?? b.amex       ?? 0);
    discover   += Number(b.AmtDiscover   ?? b.discover   ?? 0);
    debit      += Number(b.AmtDebit      ?? b.debit      ?? 0);
    ebt        += Number(b.AmtEBT        ?? b.ebt        ?? 0);
    returns    += Number(b.AmtReturns    ?? b.returns    ?? 0);
  }
  const total = +(visa + mastercard + amex + discover + debit + ebt - returns).toFixed(2);
  return {
    total: +total.toFixed(2),
    visa: +visa.toFixed(2), mastercard: +mastercard.toFixed(2),
    amex: +amex.toFixed(2), discover: +discover.toFixed(2),
    debit: +debit.toFixed(2), ebt: +ebt.toFixed(2), returns: +returns.toFixed(2),
  };
}

async function main() {
  process.stderr.write(`\nYOI Dashboard Daily Refresh — ${TODAY}\n`);
  process.stderr.write('Step 1: Logging in to Lighthouse...\n');

  const TOKEN = await getToken();
  process.stderr.write('Login successful.\n');

  const HEADERS = { 'x-access-token': TOKEN, 'accept': 'application/json' };

  const BIZ_START = `${TODAY}T09:00:00.000Z`;
  const BIZ_END   = `${TOMORROW}T08:59:59.999Z`;
  const ACT_START = `${TODAY}T04:00:00-05:00`;
  const ACT_END   = `${TOMORROW}T03:59:59-05:00`;
  const CAL_START = `${TODAY}T05:00:00.000Z`;
  const CAL_END   = `${TOMORROW}T04:59:59.999Z`;

  const ydStart    = `${YESTERDAY}T09:00:00.000Z`;
  const ydEnd      = `${TODAY}T08:59:59.999Z`;
  const ydActStart = `${YESTERDAY}T04:00:00-05:00`;
  const ydActEnd   = `${TODAY}T03:59:59-05:00`;

  process.stderr.write(`\nStep 2: Fetching today's metrics (${TODAY})...\n`);
  const metrics = {};
  for (const [apiKey, jsonKey] of Object.entries(metricMap)) {
    try {
      metrics[jsonKey] = await fetchMetric(apiKey, BIZ_START, BIZ_END, HEADERS);
    } catch (err) {
      process.stderr.write(`  WARN: ${apiKey} failed: ${err.message}\n`);
      metrics[jsonKey] = 0;
    }
  }

  process.stderr.write(`\nStep 3: Fetching today's top items...\n`);
  let topItems = [];
  try {
    topItems = await fetchTopItems(TODAY, TOMORROW, HEADERS, TOKEN);
    process.stderr.write(`  Got ${topItems.length} items\n`);
  } catch (err) {
    process.stderr.write(`  WARN: top items failed: ${err.message}\n`);
  }

  process.stderr.write(`\nStep 4: Fetching card breakdown...\n`);
  let cardBreakdown = null;
  try {
    cardBreakdown = await fetchCardBreakdown(CAL_START, CAL_END, HEADERS);
    process.stderr.write(`  Card breakdown total: $${cardBreakdown?.total}\n`);
  } catch (err) {
    process.stderr.write(`  WARN: card breakdown failed: ${err.message}\n`);
  }

  process.stderr.write(`\nStep 5: Fetching activity-summary for today...\n`);
  let todayActivity = null;
  try {
    todayActivity = await fetchActivityPayments(ACT_START, ACT_END, HEADERS);
  } catch (err) {
    process.stderr.write(`  WARN: today activity-summary failed: ${err.message}\n`);
  }

  process.stderr.write(`\nStep 6: Fetching yesterday's (${YESTERDAY}) data...\n`);
  const ydMetrics = {};
  for (const [apiKey, jsonKey] of Object.entries(metricMap)) {
    try {
      ydMetrics[jsonKey] = await fetchMetric(apiKey, ydStart, ydEnd, HEADERS);
    } catch (err) {
      process.stderr.write(`  WARN: yesterday ${apiKey} failed: ${err.message}\n`);
      ydMetrics[jsonKey] = 0;
    }
  }

  process.stderr.write(`\nStep 7: Fetching yesterday's activity-summary...\n`);
  let ydActivity = null;
  try {
    ydActivity = await fetchActivityPayments(ydActStart, ydActEnd, HEADERS);
  } catch (err) {
    process.stderr.write(`  WARN: yesterday activity-summary failed: ${err.message}\n`);
  }

  process.stderr.write(`\nStep 8: Fetching yesterday's top items...\n`);
  let ydItems = [];
  try {
    ydItems = await fetchTopItems(YESTERDAY, TODAY, HEADERS, TOKEN);
    process.stderr.write(`  Got ${ydItems.length} yesterday items\n`);
  } catch (err) {
    process.stderr.write(`  WARN: yesterday items failed: ${err.message}\n`);
  }

  process.stderr.write(`\nStep 9: Updating dashboard.json...\n`);

  const dataPath = join(__dirname, 'data', 'dashboard.json');
  const dashData = JSON.parse(readFileSync(dataPath, 'utf8'));

  dashData.businessDay = TODAY;
  const nowCDT = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const h = nowCDT.getUTCHours();
  const m = String(nowCDT.getUTCMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  dashData.lastUpdated = `${TODAY} ${h12}:${m} ${ampm} CDT`;
  dashData.disputesScannedAt = new Date().toISOString();

  // Apply activity-summary corrections to today's metrics
  const todayVoids   = todayActivity?.voids ?? metrics.voids;
  const todayCash    = (todayActivity != null) ? (todayActivity.cash ?? metrics.cashPayments) : metrics.cashPayments;
  const todayDD      = todayActivity?.doordash ?? 0;
  const todayUber    = todayActivity?.uberEats ?? 0;
  const todaySTO     = todayActivity?.stOnline ?? 0;
  const todayGrubhub = todayActivity?.grubhub  ?? 0;
  const todayCreditFromActivity = todayActivity != null
    ? +((todayActivity.directCredit ?? 0) + todayDD + todayUber + todaySTO + todayGrubhub).toFixed(2)
    : null;
  const todayTotalCredit = (todayCreditFromActivity !== null && todayCreditFromActivity >= metrics.creditCardPayments)
    ? todayCreditFromActivity
    : metrics.creditCardPayments;

  dashData.grossSales   = metrics.grossSales;
  dashData.netSales     = metrics.netSales;
  dashData.taxes        = metrics.taxes;
  dashData.discounts    = metrics.discounts;
  dashData.voids        = todayVoids;
  dashData.cashPayments = todayCash;
  dashData.creditCard   = todayTotalCredit;
  dashData.openTickets  = metrics.openTickets;

  // Upsert today's history entry
  let todayEntry = dashData.history.find(h => h.date === TODAY);
  if (!todayEntry) {
    todayEntry = { date: TODAY };
    dashData.history.push(todayEntry);
    dashData.history.sort((a, b) => a.date.localeCompare(b.date));
  }
  todayEntry.grossSales   = metrics.grossSales;
  todayEntry.netSales     = metrics.netSales;
  todayEntry.taxes        = metrics.taxes;
  todayEntry.discounts    = metrics.discounts;
  todayEntry.voids        = todayVoids;
  todayEntry.cashPayments = todayCash;
  todayEntry.creditCard   = todayTotalCredit;
  todayEntry.openTickets  = metrics.openTickets;
  todayEntry.doordash     = todayDD;
  todayEntry.stOnline     = todaySTO;
  todayEntry.uberEats     = todayUber;
  if (todayGrubhub > 0) todayEntry.grubhub = todayGrubhub;

  // Apply activity-summary corrections to yesterday's metrics
  const ydVoids   = ydActivity?.voids ?? ydMetrics.voids;
  const ydCash    = (ydActivity != null) ? (ydActivity.cash ?? ydMetrics.cashPayments) : ydMetrics.cashPayments;
  const ydDD      = ydActivity?.doordash ?? 0;
  const ydUber    = ydActivity?.uberEats ?? 0;
  const ydSTO     = ydActivity?.stOnline ?? 0;
  const ydGrubhub = ydActivity?.grubhub  ?? 0;
  const ydCreditFromActivity = ydActivity != null
    ? +((ydActivity.directCredit ?? 0) + ydDD + ydUber + ydSTO + ydGrubhub).toFixed(2)
    : null;
  const ydTotalCredit = (ydCreditFromActivity !== null && ydCreditFromActivity >= ydMetrics.creditCardPayments)
    ? ydCreditFromActivity
    : ydMetrics.creditCardPayments;

  const yesterdayEntry = dashData.history.find(h => h.date === YESTERDAY);
  if (yesterdayEntry) {
    const prevGross = yesterdayEntry.grossSales ?? 0;
    if ((ydMetrics.grossSales ?? 0) >= prevGross || prevGross < 100) {
      yesterdayEntry.grossSales   = ydMetrics.grossSales;
      yesterdayEntry.netSales     = ydMetrics.netSales;
      yesterdayEntry.taxes        = ydMetrics.taxes;
      yesterdayEntry.discounts    = ydMetrics.discounts;
      yesterdayEntry.voids        = ydVoids;
      yesterdayEntry.cashPayments = ydCash;
      yesterdayEntry.creditCard   = ydTotalCredit;
      yesterdayEntry.openTickets  = 0;
      yesterdayEntry.doordash     = ydDD;
      yesterdayEntry.stOnline     = ydSTO;
      yesterdayEntry.uberEats     = ydUber;
      if (ydGrubhub > 0) yesterdayEntry.grubhub = ydGrubhub;
    } else {
      yesterdayEntry.voids    = ydVoids;
      yesterdayEntry.doordash = ydDD;
      yesterdayEntry.stOnline = ydSTO;
      yesterdayEntry.uberEats = ydUber;
      if (ydGrubhub > 0) yesterdayEntry.grubhub = ydGrubhub;
      yesterdayEntry.creditCard = ydTotalCredit;
    }
    if (cardBreakdown && cardBreakdown.total > 0) {
      yesterdayEntry.cardBreakdown = cardBreakdown;
      process.stderr.write(`  Updated card breakdown for ${YESTERDAY}: $${cardBreakdown.total}\n`);
    }
  }

  // Upsert today's items
  if (topItems.length > 0) {
    if (!dashData.itemsByDay) dashData.itemsByDay = [];
    let itemEntry = dashData.itemsByDay.find(i => i.date === TODAY);
    if (!itemEntry) {
      itemEntry = { date: TODAY, items: [] };
      dashData.itemsByDay.push(itemEntry);
      dashData.itemsByDay.sort((a, b) => a.date.localeCompare(b.date));
    }
    itemEntry.items = topItems;
  }

  // Upsert yesterday's items
  if (ydItems.length > 0) {
    if (!dashData.itemsByDay) dashData.itemsByDay = [];
    let ydItemEntry = dashData.itemsByDay.find(i => i.date === YESTERDAY);
    if (!ydItemEntry) {
      ydItemEntry = { date: YESTERDAY, items: [] };
      dashData.itemsByDay.push(ydItemEntry);
      dashData.itemsByDay.sort((a, b) => a.date.localeCompare(b.date));
    }
    ydItemEntry.items = ydItems;
  }

  writeFileSync(dataPath, JSON.stringify(dashData, null, 2));
  process.stderr.write(`\nDone. dashboard.json updated.\n`);
  process.stderr.write(`  businessDay: ${dashData.businessDay}\n`);
  process.stderr.write(`  lastUpdated: ${dashData.lastUpdated}\n`);
  process.stderr.write(`  Today gross: $${metrics.grossSales}\n`);
  process.stderr.write(`  Yesterday gross: $${ydMetrics.grossSales}\n`);
  process.stderr.write(`  Today top item: ${topItems[0]?.name ?? 'N/A'}\n`);

  // Output summary to stdout (no tokens)
  console.log(JSON.stringify({
    success: true,
    today: TODAY,
    yesterday: YESTERDAY,
    todayGrossSales: metrics.grossSales,
    yesterdayGrossSales: ydMetrics.grossSales,
    todayItemsCount: topItems.length,
    yesterdayItemsCount: ydItems.length,
    cardBreakdownTotal: cardBreakdown?.total ?? null,
    lastUpdated: dashData.lastUpdated,
  }));
}

main().catch(err => {
  process.stderr.write('FATAL: ' + err.message + '\n' + (err.stack || '') + '\n');
  process.exit(1);
});
