import fs from 'fs';
import https from 'https';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const TOKEN = process.argv[2];
if (!TOKEN) { console.error('Usage: node fetch_and_update.mjs <token>'); process.exit(1); }

const TODAY     = '2026-06-02';
const YESTERDAY = '2026-06-01';
const TOMORROW  = '2026-06-03';

// Today's business day window (4AM CDT = 9AM UTC)
const TODAY_START = `${TODAY}T09:00:00.000Z`;
const TODAY_END   = `${TOMORROW}T08:59:59.999Z`;

// Yesterday's business day window
const YEST_START  = `${YESTERDAY}T09:00:00.000Z`;
const YEST_END    = `${TODAY}T08:59:59.999Z`;

// Batch detail: today's batch (covers yesterday's settled transactions)
const BATCH_START = `${TODAY}T05:00:00.000Z`;
const BATCH_END   = `${TOMORROW}T04:59:59.999Z`;

const MERCHANT_ID = '0022712560';
const LOCATION_ID = '43141083';
const BASE = 'lighthouse-api.harbortouch.com';

function httpsGet(urlStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'x-access-token': TOKEN },
      rejectUnauthorized: false,
    }, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('Timeout')));
    req.end();
  });
}

async function fetchMetrics(start, end) {
  const metrics = ['gross-sales','net-sales','taxes','voids','cash-payments','credit-card-payments','discounts','open-tickets'];
  const results = {};
  await Promise.all(metrics.map(async m => {
    const url = `https://${BASE}/api/v1/dashboard/financial-overview/${m}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    const r = await httpsGet(url);
    if (r.status !== 200) throw new Error(`${m} HTTP ${r.status}`);
    const d = JSON.parse(r.body.toString());
    const arr = d[m];
    results[m] = arr && arr[0] ? (arr[0].total || 0) : 0;
  }));
  return {
    grossSales:          Math.round(results['gross-sales'] * 100) / 100,
    netSales:            Math.round(results['net-sales'] * 100) / 100,
    taxes:               Math.round(results['taxes'] * 100) / 100,
    voids:               Math.round(results['voids'] * 100) / 100,
    cashPayments:        Math.round(results['cash-payments'] * 100) / 100,
    creditCardPayments:  Math.round(results['credit-card-payments'] * 100) / 100,
    discounts:           Math.round(results['discounts'] * 100) / 100,
    openTickets:         Math.round(results['open-tickets'] * 100) / 100,
  };
}

async function fetchItemsXls(start, end) {
  const url = `https://${BASE}/api/v1/reports/echo-pro/xls/sales-summary-by-item-open-and-closed-tickets?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&locations[]=${LOCATION_ID}&token=${TOKEN}`;
  const r = await httpsGet(url);
  if (r.status !== 200) throw new Error(`items-xls HTTP ${r.status}`);
  const wb = XLSX.read(r.body, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const items = rows
    .filter(row => {
      const name = String(row['Item'] || '').trim();
      if (!name || name.startsWith('Total') || name.startsWith('TOTAL')) return false;
      const qty = parseFloat(row['Qty'] || 0);
      const revenue = parseFloat(row['Gross Sales'] || 0);
      return !(qty === 0 && revenue === 0);
    })
    .map(row => ({
      name: String(row['Item']).trim(),
      qty: parseFloat(row['Qty'] || 0),
      revenue: Math.round(parseFloat(row['Gross Sales'] || 0) * 100) / 100,
    }))
    .sort((a, b) => b.revenue - a.revenue);
  return items;
}

async function fetchBatchDetail() {
  const url = `https://${BASE}/api/v1/dashboard/processing/batch-detail?start=${encodeURIComponent(BATCH_START)}&end=${encodeURIComponent(BATCH_END)}&merchantId=${MERCHANT_ID}`;
  const r = await httpsGet(url);
  if (r.status !== 200) throw new Error(`batch-detail HTTP ${r.status}`);
  const d = JSON.parse(r.body.toString());
  const rows = d.batches || d.data || (Array.isArray(d) ? d : []);
  let visa=0, mc=0, amex=0, discover=0, debit=0, ebt=0, returns=0;
  for (const row of rows) {
    visa     += parseFloat(row.AmtVisa || 0);
    mc       += parseFloat(row.AmtMasterCard || 0);
    amex     += parseFloat(row.AmtAmex || 0);
    discover += parseFloat(row.AmtDiscover || 0);
    debit    += parseFloat(row.AmtDebit || 0);
    ebt      += parseFloat(row.AmtEBT || 0);
    returns  += parseFloat(row.AmtReturns || 0);
  }
  const r2 = n => Math.round(n * 100) / 100;
  const total = r2(visa + mc + amex + discover + debit + ebt);
  return {
    windowLabel: `${YESTERDAY} batch (settled ${TODAY})`,
    rows: [
      { label: 'Total Sales', amount: total, bold: true },
      { label: 'Visa',        amount: r2(visa) },
      { label: 'Mastercard',  amount: r2(mc) },
      { label: 'Amex',        amount: r2(amex) },
      { label: 'Discover',    amount: r2(discover) },
      { label: 'Debit',       amount: r2(debit) },
      { label: 'EBT',         amount: r2(ebt) },
      { label: 'Returns',     amount: r2(returns) },
    ]
  };
}

function nowCDT() {
  const now = new Date();
  const cdtMs = now.getTime() + (now.getTimezoneOffset() - 300) * 60000;
  const d = new Date(cdtMs);
  const pad = n => String(n).padStart(2, '0');
  const h = d.getHours(), ampm = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12;
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${h12}:${pad(d.getMinutes())} ${ampm} CDT`;
}

// ---- Main ----
console.error('Fetching today\'s metrics...');
const todayMetrics = await fetchMetrics(TODAY_START, TODAY_END);
console.error('Today:', JSON.stringify(todayMetrics));

console.error('Fetching yesterday\'s metrics...');
const yesterdayMetrics = await fetchMetrics(YEST_START, YEST_END);
console.error('Yesterday:', JSON.stringify(yesterdayMetrics));

console.error('Fetching today\'s items XLS...');
let todayItems = [];
try {
  todayItems = await fetchItemsXls(
    `${TODAY}T09:00:00-00:00`,
    `${TOMORROW}T08:59:00-00:00`
  );
  console.error(`Got ${todayItems.length} items for today. Top 3:`, todayItems.slice(0,3).map(i => `${i.name}($${i.revenue})`).join(', '));
} catch (err) {
  console.error('Warning: today items XLS failed:', err.message);
}

console.error('Fetching yesterday\'s items XLS...');
let yesterdayItems = [];
try {
  yesterdayItems = await fetchItemsXls(
    `${YESTERDAY}T09:00:00-00:00`,
    `${TODAY}T08:59:00-00:00`
  );

  console.error(`Got ${yesterdayItems.length} items for yesterday. Top 3:`, yesterdayItems.slice(0,3).map(i => `${i.name}($${i.revenue})`).join(', '));
} catch (err) {
  console.error('Warning: yesterday items XLS failed:', err.message);
}

console.error('Fetching batch detail...');
let cardBreakdown = null;
try {
  cardBreakdown = await fetchBatchDetail();
  console.error('Card breakdown total:', cardBreakdown.rows[0].amount);
} catch (err) {
  console.error('Warning: batch detail failed:', err.message);
}

// ---- Update dashboard.json ----
console.error('Updating dashboard.json...');
const dashPath = path.resolve('./data/dashboard.json');
const dash = JSON.parse(fs.readFileSync(dashPath, 'utf8'));
const now = nowCDT();

dash.lastUpdated = now;
dash.businessDay = TODAY;
dash.businessDayWindow = `${TODAY} 04:00AM – ${TOMORROW} 03:59AM CDT`;
dash.disputesScannedAt = now;

// Update main EOD block with today's live data
dash.eod = {
  grossSales:         todayMetrics.grossSales,
  netSales:           todayMetrics.netSales,
  taxes:              todayMetrics.taxes,
  voids:              todayMetrics.voids,
  cashPayments:       todayMetrics.cashPayments,
  creditCardPayments: todayMetrics.creditCardPayments,
  discounts:          todayMetrics.discounts,
  openTickets:        todayMetrics.openTickets,
};

// Update processingDetail with batch card breakdown
if (cardBreakdown) dash.processingDetail = cardBreakdown;

// Helper: upsert history entry
function upsertHistory(date, metrics) {
  const entry = {
    date,
    grossSales:   metrics.grossSales,
    netSales:     metrics.netSales,
    taxes:        metrics.taxes,
    discounts:    metrics.discounts,
    voids:        metrics.voids,
    cashPayments: metrics.cashPayments,
    creditCard:   metrics.creditCardPayments,
    doordash: 0, stOnline: 0, uberEats: 0,
    openTickets:  metrics.openTickets,
  };
  const idx = dash.history.findIndex(e => e.date === date);
  if (idx >= 0) {
    dash.history[idx] = { ...dash.history[idx], ...entry };
  } else {
    dash.history.push(entry);
    dash.history.sort((a, b) => a.date.localeCompare(b.date));
  }
  return idx >= 0 ? idx : dash.history.findIndex(e => e.date === date);
}

// Upsert today's and yesterday's history entries
upsertHistory(TODAY, todayMetrics);
const yIdx = upsertHistory(YESTERDAY, yesterdayMetrics);

// Add card breakdown to yesterday's history entry
if (cardBreakdown && yIdx >= 0) {
  dash.history[yIdx].cardBreakdown = cardBreakdown;
}

// Upsert yesterday's items
if (yesterdayItems.length > 0) {
  const entry = { date: YESTERDAY, items: yesterdayItems };
  const iIdx = dash.itemsByDay.findIndex(e => e.date === YESTERDAY);
  if (iIdx >= 0) dash.itemsByDay[iIdx] = entry;
  else {
    dash.itemsByDay.push(entry);
    dash.itemsByDay.sort((a, b) => a.date.localeCompare(b.date));
  }
}

// Upsert today's items
if (todayItems.length > 0) {
  const entry = { date: TODAY, items: todayItems };
  const iIdx = dash.itemsByDay.findIndex(e => e.date === TODAY);
  if (iIdx >= 0) dash.itemsByDay[iIdx] = entry;
  else {
    dash.itemsByDay.push(entry);
    dash.itemsByDay.sort((a, b) => a.date.localeCompare(b.date));
  }
}

fs.writeFileSync(dashPath, JSON.stringify(dash, null, 2));
console.error('dashboard.json updated.');
console.log(JSON.stringify({
  success: true,
  today: TODAY,
  todayGrossSales: todayMetrics.grossSales,
  yesterdayGrossSales: yesterdayMetrics.grossSales,
  todayItemsCount: todayItems.length,
  yesterdayItemsCount: yesterdayItems.length,
  cardBreakdownTotal: cardBreakdown?.rows[0]?.amount ?? null,
}));
