/**
 * Daily dashboard refresh script.
 * Reads LH_TOKEN env var (JWT from Lighthouse login).
 * Fetches today's metrics, top items, and yesterday's card breakdown.
 * Updates data/dashboard.json.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE = 'https://lighthouse-api.harbortouch.com';
const LOCATION_ID = 43141083;
const MERCHANT_ID = process.env.LIGHTHOUSE_MERCHANT_ID || '0022712560';
const TOKEN = process.env.LH_TOKEN;

if (!TOKEN) { console.error('ERROR: LH_TOKEN not set'); process.exit(1); }

function round2(n) { return Math.round(n * 100) / 100; }

/** Returns '-05:00' (CDT) or '-06:00' (CST) for America/Chicago */
function centralTzOffset(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dstStart = new Date(y, 2, 1);
  while (dstStart.getDay() !== 0) dstStart.setDate(dstStart.getDate() + 1);
  dstStart.setDate(dstStart.getDate() + 7); // 2nd Sunday of March
  const dstEnd = new Date(y, 10, 1);
  while (dstEnd.getDay() !== 0) dstEnd.setDate(dstEnd.getDate() + 1); // 1st Sunday of November
  return date >= dstStart && date < dstEnd ? '-05:00' : '-06:00';
}

function businessDayWindow(dateStr) {
  const offset = centralTzOffset(dateStr);
  const utcHours = offset === '-05:00' ? 5 : 6;
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, utcHours + 4, 0, 0, 0));
  const end   = new Date(Date.UTC(y, m - 1, d + 1, utcHours + 3, 59, 59, 999));
  return { start: start.toISOString(), end: end.toISOString() };
}

function headers() {
  return {
    'x-access-token': TOKEN,
    'accept': 'application/json',
    'content-type': 'application/json;charset=UTF-8',
  };
}

async function fetchMetric(metric, start, end) {
  try {
    const url = `${BASE}/api/v1/dashboard/financial-overview/${metric}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) { console.warn(`  ${metric}: HTTP ${res.status}`); return 0; }
    const data = await res.json();
    const arr = data[metric] || data[Object.keys(data)[0]] || [];
    return round2(arr.reduce((s, l) => s + (l.total || 0), 0));
  } catch (e) { console.warn(`  ${metric} error:`, e.message); return 0; }
}

async function fetchAllMetrics(dateStr) {
  const { start, end } = businessDayWindow(dateStr);
  console.log(`  Window: ${start} → ${end}`);
  const METRICS = ['gross-sales','net-sales','taxes','discounts','voids','cash-payments','credit-card-payments','open-tickets'];
  const values = await Promise.all(METRICS.map(m => fetchMetric(m, start, end)));
  const [grossSales, netSales, taxes, discounts, voids, cashPayments, creditCard, openTickets] = values;
  return { grossSales, netSales, taxes, discounts, voids, cashPayments, creditCard, openTickets };
}

async function fetchItems(dateStr) {
  try {
    const { start, end } = businessDayWindow(dateStr);
    // XLS report needs token as query param
    const url = `${BASE}/api/v1/reports/echo-pro/xls/sales-summary-by-item-open-and-closed-tickets?start=${encodeURIComponent(start.replace('Z', '-00:00'))}&end=${encodeURIComponent(end.replace('Z', '-00:00'))}&locations%5B%5D=${LOCATION_ID}&token=${TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) { console.warn(`  items: HTTP ${res.status}`); return null; }

    const buffer = Buffer.from(await res.arrayBuffer());
    const { default: XLSX } = await import(`${ROOT}/node_modules/xlsx/dist/xlsx.full.min.js`).catch(async () => {
      // fallback CJS
      const m = await import(`${ROOT}/node_modules/xlsx/xlsx.js`);
      return { default: m.default || m };
    });
    // Try require as fallback
    let wb;
    try {
      wb = XLSX.read(buffer);
    } catch {
      const { createRequire } = await import('module');
      const req = createRequire(import.meta.url);
      const XLSXr = req(`${ROOT}/node_modules/xlsx`);
      wb = XLSXr.read(buffer);
    }
    const ws = wb.Sheets[wb.SheetNames[0]];
    const { createRequire } = await import('module');
    const req = createRequire(import.meta.url);
    const XLSXr = req(`${ROOT}/node_modules/xlsx`);
    const rows = XLSXr.utils.sheet_to_json(ws, { header: 1 });

    return rows.slice(1)
      .filter(r => r[0] && typeof r[0] === 'string' && !r[0].startsWith('Total') && !r[0].startsWith('total'))
      .map(r => ({ name: r[0].trim(), qty: Number(r[4]) || 0, revenue: round2(Number(r[9]) || 0) }))
      .filter(it => it.qty > 0 && it.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);
  } catch (e) { console.warn('  items error:', e.message); return null; }
}

async function fetchBatchDetail(forDate) {
  // Batch for a date settles the NEXT day, so we look at next-day's morning
  try {
    const [y, m, d] = forDate.split('-').map(Number);
    const nextDate = new Date(Date.UTC(y, m - 1, d + 1));
    const nextStr = nextDate.toISOString().split('T')[0];
    const nextNext = new Date(Date.UTC(y, m - 1, d + 2));
    const start = `${nextStr}T05:00:00.000Z`;
    const end = nextNext.toISOString();

    const url = `${BASE}/api/v1/dashboard/processing/batch-detail?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&merchantId=${MERCHANT_ID}`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) { console.warn(`  batch-detail: HTTP ${res.status}`); return null; }
    const data = await res.json();
    const batches = data.batches || [];
    if (!batches.length) { console.log('  batch-detail: no batches found'); return null; }
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
  } catch (e) { console.warn('  batch-detail error:', e.message); return null; }
}

function nowCDT() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }) + ' CST';
}

// --- Main ---
const TODAY = '2026-11-12';
const YESTERDAY = '2026-11-11';

console.log(`\n=== YOI Daily Refresh: ${TODAY} ===`);

// Step 1: Fetch today's metrics
console.log('\n[1] Fetching today metrics...');
const metrics = await fetchAllMetrics(TODAY);
console.log('  Metrics:', JSON.stringify(metrics));

// Step 1b: If today is $0, also fetch yesterday (may be a not-yet-open day)
//           Backfill any day with stored gross < $100 from the live API (data rules)
console.log(`\n[1b] Fetching yesterday metrics for backfill (${YESTERDAY})...`);
const yestMetrics = await fetchAllMetrics(YESTERDAY);
console.log('  Yesterday metrics:', JSON.stringify(yestMetrics));

// Step 2: Fetch top items for today (and yesterday if today is empty)
console.log('\n[2] Fetching top items for today...');
const items = await fetchItems(TODAY);
console.log(`  Today items: ${items ? items.length + ' rows' : 'failed/0'}`);
if (items && items.length > 0) {
  console.log('  Top 5:', items.slice(0, 5).map(i => `${i.name}($${i.revenue})`).join(', '));
}

let yestItems = null;
const dashCheck = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'dashboard.json'), 'utf-8'));
const yestItemsEntry = dashCheck.itemsByDay?.find(e => e.date === YESTERDAY);
if (!yestItemsEntry || !yestItemsEntry.items?.length) {
  console.log(`\n[2b] Fetching items for yesterday (${YESTERDAY})...`);
  yestItems = await fetchItems(YESTERDAY);
  console.log(`  Yesterday items: ${yestItems ? yestItems.length + ' rows' : 'failed'}`);
}

// Step 3: Fetch card breakdown for yesterday
console.log(`\n[3] Fetching card breakdown for ${YESTERDAY} batch...`);
const cardBreakdown = await fetchBatchDetail(YESTERDAY);
console.log('  Card breakdown:', cardBreakdown ? JSON.stringify(cardBreakdown) : 'not available');

// Step 4: Update dashboard.json
console.log('\n[4] Updating dashboard.json...');
const dashPath = path.join(ROOT, 'data', 'dashboard.json');
const dash = JSON.parse(fs.readFileSync(dashPath, 'utf-8'));

// Update top-level fields
dash.businessDay = TODAY;
dash.lastUpdated = nowCDT();
dash.disputesScannedAt = new Date().toISOString();

// Update eod with today's data (or yesterday's if today has no sales yet)
const eodSource = metrics.grossSales > 0 ? metrics : yestMetrics;
const eodDate = metrics.grossSales > 0 ? TODAY : YESTERDAY;
console.log(`  Using ${eodDate} data for EOD display`);
dash.eod = {
  grossSales:          eodSource.grossSales,
  netSales:            eodSource.netSales,
  taxes:               eodSource.taxes,
  discounts:           eodSource.discounts,
  voids:               eodSource.voids,
  cashPayments:        eodSource.cashPayments,
  creditCardPayments:  eodSource.creditCard,
  openTickets:         eodSource.openTickets,
};

// Helper to update or create a history entry
function upsertHistoryEntry(dash, date, m) {
  let entry = dash.history.find(e => e.date === date);
  if (!entry) {
    entry = { date, grossSales: 0, netSales: 0, taxes: 0, discounts: 0, voids: 0, cashPayments: 0, creditCard: 0, doordash: 0, stOnline: 0, uberEats: 0, openTickets: 0 };
    dash.history.push(entry);
  }
  // Only update if new value is higher (per data rules), except for today's live values
  entry.grossSales   = Math.max(entry.grossSales   || 0, m.grossSales);
  entry.netSales     = Math.max(entry.netSales     || 0, m.netSales);
  entry.taxes        = m.taxes;
  entry.discounts    = m.discounts;
  entry.voids        = m.voids;
  entry.cashPayments = m.cashPayments;
  entry.creditCard   = Math.max(entry.creditCard   || 0, m.creditCard);
  entry.openTickets  = m.openTickets;
  return entry;
}

// Update history for today
upsertHistoryEntry(dash, TODAY, metrics);

// Backfill yesterday if stored value was < $100 and live shows more
const yestStoredEntry = dash.history.find(e => e.date === YESTERDAY);
if (yestMetrics.grossSales > 100 && (!yestStoredEntry || (yestStoredEntry.grossSales || 0) < 100)) {
  console.log(`  Backfilling ${YESTERDAY} (stored: $${yestStoredEntry?.grossSales || 0}, live: $${yestMetrics.grossSales})`);
  upsertHistoryEntry(dash, YESTERDAY, yestMetrics);
} else if (yestStoredEntry && yestMetrics.grossSales > (yestStoredEntry.grossSales || 0)) {
  console.log(`  Updating ${YESTERDAY} with higher live value`);
  upsertHistoryEntry(dash, YESTERDAY, yestMetrics);
}

// Update yesterday's cardBreakdown if we got one
if (cardBreakdown) {
  let yestEntry = dash.history.find(e => e.date === YESTERDAY);
  if (yestEntry) {
    yestEntry.cardBreakdown = cardBreakdown;
    console.log(`  Updated cardBreakdown for ${YESTERDAY}`);
  }
}

// Update itemsByDay
if (!dash.itemsByDay) dash.itemsByDay = [];
if (items && items.length > 0) {
  let itemsEntry = dash.itemsByDay.find(e => e.date === TODAY);
  if (!itemsEntry) { itemsEntry = { date: TODAY, items: [] }; dash.itemsByDay.push(itemsEntry); }
  itemsEntry.items = items;
}
if (yestItems && yestItems.length > 0) {
  let itemsEntry = dash.itemsByDay.find(e => e.date === YESTERDAY);
  if (!itemsEntry) { itemsEntry = { date: YESTERDAY, items: [] }; dash.itemsByDay.push(itemsEntry); }
  itemsEntry.items = yestItems;
}

// Sort history by date
dash.history.sort((a, b) => a.date.localeCompare(b.date));
if (dash.itemsByDay) dash.itemsByDay.sort((a, b) => a.date.localeCompare(b.date));

fs.writeFileSync(dashPath, JSON.stringify(dash, null, 2));
console.log('  dashboard.json updated');

console.log('\n=== Refresh complete ===');
console.log(`Today (${TODAY}): grossSales=$${metrics.grossSales}, net=$${metrics.netSales}`);
console.log(`Yesterday (${YESTERDAY}): grossSales=$${yestMetrics.grossSales}, net=$${yestMetrics.netSales}`);
console.log(`Items today: ${items ? items.length : 0} rows, top: ${items?.[0]?.name || 'n/a'}`);
console.log(`Items yesterday: ${yestItems ? yestItems.length : '(already stored)'} rows`);
console.log(`Yesterday card total: $${cardBreakdown?.total ?? 'n/a'}`);
