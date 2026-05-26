/**
 * Daily dashboard refresh script
 * Fetches today's data from Lighthouse API and updates data/dashboard.json
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as XLSX from 'xlsx';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const DATA_FILE = join(ROOT, 'data', 'dashboard.json');

const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error('Usage: node scripts/refresh.mjs <jwt-token>');
  process.exit(1);
}

// Compute CDT date (UTC-5)
const nowUTC = new Date();
const CDT_OFFSET_MS = -5 * 60 * 60 * 1000;
const cdtNow = new Date(nowUTC.getTime() + CDT_OFFSET_MS);
const todayStr     = cdtNow.toISOString().slice(0, 10);

const tomorrow = new Date(cdtNow);
tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowStr = tomorrow.toISOString().slice(0, 10);

const yesterday = new Date(cdtNow);
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayStr = yesterday.toISOString().slice(0, 10);

console.log(`Business day: ${todayStr}`);
console.log(`Window: ${todayStr}T09:00:00.000Z → ${tomorrowStr}T08:59:59.999Z`);

const BASE = 'https://lighthouse-api.harbortouch.com/api/v1';
const HEADERS = { 'x-access-token': TOKEN, 'Accept': 'application/json' };

async function fetchJSON(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchBinary(url) {
  const res = await fetch(url, { headers: { 'x-access-token': TOKEN } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.arrayBuffer();
}

// Extract dollar value from Lighthouse metric response
// Response shape: { "metric-name": [{ locationId, total }] }
function extractMetricValue(data, metricName) {
  if (!data) return 0;
  // Array keyed by metric name
  const arr = data[metricName];
  if (Array.isArray(arr) && arr.length > 0) {
    // Sum across all locations
    return arr.reduce((sum, loc) => sum + (parseFloat(loc.total) || 0), 0);
  }
  // Flat fallbacks
  const v = data.value ?? data.amount ?? data.total ?? 0;
  return parseFloat(v) || 0;
}

// Step 1: Fetch all EOD metrics
const metrics = [
  'gross-sales',
  'net-sales',
  'taxes',
  'discounts',
  'voids',
  'cash-payments',
  'credit-card-payments',
  'open-tickets',
];

const start = `${todayStr}T09:00:00.000Z`;
const end   = `${tomorrowStr}T08:59:59.999Z`;

console.log('\nFetching EOD metrics...');
const metricResults = {};

for (const metric of metrics) {
  try {
    const url = `${BASE}/dashboard/financial-overview/${metric}?start=${start}&end=${end}`;
    const data = await fetchJSON(url);
    const val = extractMetricValue(data, metric);
    console.log(`  ${metric}: ${val} (raw: ${JSON.stringify(data).slice(0, 80)})`);
    metricResults[metric] = { data, val };
  } catch (err) {
    console.error(`  WARN: Failed to fetch ${metric}:`, err.message);
    metricResults[metric] = { data: null, val: 0 };
  }
}

const grossSales         = metricResults['gross-sales'].val;
const netSales           = metricResults['net-sales'].val;
const taxes              = metricResults['taxes'].val;
const discounts          = metricResults['discounts'].val;
const voids              = metricResults['voids'].val;
const cashPayments       = metricResults['cash-payments'].val;
const creditCardPayments = metricResults['credit-card-payments'].val;
const openTickets        = metricResults['open-tickets'].val;

console.log('\nExtracted EOD values:');
console.log({ grossSales, netSales, taxes, discounts, voids, cashPayments, creditCardPayments, openTickets });

// Step 2: Fetch top items XLS
console.log('\nFetching top items XLS...');
let topItems = [];
try {
  const xlsUrl = `${BASE}/reports/echo-pro/xls/sales-summary-by-item-open-and-closed-tickets?start=${todayStr}T09:00:00-00:00&end=${tomorrowStr}T08:59:00-00:00&locations[]=43141083&token=${TOKEN}`;
  const buf = await fetchBinary(xlsUrl);
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: 0 });

  if (rows.length > 0) {
    console.log('  All XLS column keys:', Object.keys(rows[0]).join(' | '));
    console.log('  First row:', JSON.stringify(rows[0]));
  }

  // Detect revenue column dynamically
  const revenueKeys = ['Revenue', 'Gross Sales', 'Net Sales', 'Sales', 'Amount', 'Sale Total', 'Total', 'Total Cost'];
  const nameKeys    = ['Item Name', 'Item', 'Name', 'name', 'Description'];
  const qtyKeys     = ['Qty', 'Quantity', 'Count'];

  const firstRow = rows[0] || {};
  const revenueKey = revenueKeys.find(k => k in firstRow) || Object.keys(firstRow).find(k => /revenue|sales|total|amount/i.test(k)) || '';
  const nameKey    = nameKeys.find(k => k in firstRow) || 'Item';
  const qtyKey     = qtyKeys.find(k => k in firstRow) || 'Qty';

  console.log(`  Using keys → name: "${nameKey}", qty: "${qtyKey}", revenue: "${revenueKey}"`);

  topItems = rows
    .filter(r => {
      const name = String(r[nameKey] || '').trim();
      const qty  = parseFloat(r[qtyKey] || 0);
      const rev  = parseFloat(r[revenueKey] || 0);
      if (!name || /^total/i.test(name)) return false;
      if (qty === 0 && rev === 0) return false;
      return true;
    })
    .map(r => ({
      name:    String(r[nameKey] || '').trim(),
      qty:     parseFloat(r[qtyKey] || 0),
      revenue: Math.round(parseFloat(r[revenueKey] || 0) * 100) / 100,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  console.log(`  Parsed ${topItems.length} items, top 5:`, topItems.slice(0, 5));
} catch (err) {
  console.error('  WARN: XLS fetch failed:', err.message);
}

// Step 3: Fetch card breakdown (batch detail — settles next day)
console.log('\nFetching batch detail...');
let cardRows = [];
try {
  const batchStart = `${todayStr}T05:00:00.000Z`;
  const batchEnd   = `${tomorrowStr}T04:59:59.999Z`;
  const batchUrl = `${BASE}/dashboard/processing/batch-detail?start=${batchStart}&end=${batchEnd}&merchantId=0022712560`;
  const batchData = await fetchJSON(batchUrl);

  const batches = Array.isArray(batchData) ? batchData : (batchData.batches || batchData.data || []);
  console.log(`  Found ${batches.length} batch(es)`);
  if (batches.length > 0) console.log('  First batch keys:', Object.keys(batches[0]).join(', '));

  let visa = 0, mc = 0, amex = 0, discover = 0, debit = 0, ebt = 0, returns = 0;
  for (const b of batches) {
    visa     += parseFloat(b.AmtVisa       || b.visa       || 0);
    mc       += parseFloat(b.AmtMasterCard || b.masterCard || b.mastercard || 0);
    amex     += parseFloat(b.AmtAmex       || b.amex       || 0);
    discover += parseFloat(b.AmtDiscover   || b.discover   || 0);
    debit    += parseFloat(b.AmtDebit      || b.debit      || 0);
    ebt      += parseFloat(b.AmtEBT        || b.ebt        || 0);
    returns  += parseFloat(b.AmtReturns    || b.returns    || 0);
  }
  const total = visa + mc + amex + discover + debit + ebt;

  cardRows = [
    { label: 'Total Sales', amount: Math.round(total * 100) / 100, bold: true },
    { label: 'Visa',        amount: Math.round(visa * 100) / 100 },
    { label: 'Mastercard',  amount: Math.round(mc * 100) / 100 },
    { label: 'Amex',        amount: Math.round(amex * 100) / 100 },
    { label: 'Discover',    amount: Math.round(discover * 100) / 100 },
    { label: 'Debit',       amount: Math.round(debit * 100) / 100 },
    { label: 'EBT',         amount: Math.round(ebt * 100) / 100 },
    { label: 'Returns',     amount: Math.round(returns * 100) / 100 },
  ];
  console.log('  Card breakdown total:', total);
} catch (err) {
  console.error('  WARN: Batch detail fetch failed:', err.message);
}

// Step 4: Update dashboard.json
console.log('\nUpdating dashboard.json...');
const dash = JSON.parse(readFileSync(DATA_FILE, 'utf8'));

const cdtTimeStr = cdtNow.toISOString().replace('T', ' ').slice(0, 16) + ' CDT';

dash.businessDay = todayStr;
dash.lastUpdated = cdtTimeStr;
dash.businessDayWindow = `${todayStr.slice(5).replace('-', '/')} 04:00AM – ${tomorrowStr.slice(5).replace('-', '/')} 03:59AM CDT`;

dash.eod = {
  grossSales:          Math.round(grossSales * 100) / 100,
  netSales:            Math.round(netSales * 100) / 100,
  taxes:               Math.round(taxes * 100) / 100,
  voids:               Math.round(voids * 100) / 100,
  cashPayments:        Math.round(cashPayments * 100) / 100,
  creditCardPayments:  Math.round(creditCardPayments * 100) / 100,
  discounts:           Math.round(discounts * 100) / 100,
  openTickets:         Math.round(openTickets * 100) / 100,
};

if (cardRows.length > 0) {
  dash.processingDetail = {
    windowLabel: `${todayStr} 12:00AM – 11:59PM CDT`,
    rows: cardRows,
  };
}

// Update history: find or create today's entry
const todayEntry = {
  date:             todayStr,
  grossSales:       Math.round(grossSales * 100) / 100,
  netSales:         Math.round(netSales * 100) / 100,
  taxes:            Math.round(taxes * 100) / 100,
  discounts:        Math.round(discounts * 100) / 100,
  voids:            Math.round(voids * 100) / 100,
  cashPayments:     Math.round(cashPayments * 100) / 100,
  creditCard:       Math.round(creditCardPayments * 100) / 100,
  doordash:         0,
  stOnline:         0,
  uberEats:         0,
  openTickets:      Math.round(openTickets * 100) / 100,
};

const histIdx = dash.history.findIndex(h => h.date === todayStr);
if (histIdx >= 0) {
  dash.history[histIdx] = { ...dash.history[histIdx], ...todayEntry };
} else {
  dash.history.push(todayEntry);
  dash.history.sort((a, b) => a.date.localeCompare(b.date));
}

// Update yesterday's history entry with card breakdown from today's settled batch
if (cardRows.length > 0) {
  const yIdx = dash.history.findIndex(h => h.date === yesterdayStr);
  if (yIdx >= 0) {
    dash.history[yIdx].cardBreakdown = cardRows;
  }
}

// Update itemsByDay
if (topItems.length > 0) {
  const itemIdx = dash.itemsByDay.findIndex(d => d.date === todayStr);
  if (itemIdx >= 0) {
    dash.itemsByDay[itemIdx].items = topItems;
  } else {
    dash.itemsByDay.push({ date: todayStr, items: topItems });
    dash.itemsByDay.sort((a, b) => a.date.localeCompare(b.date));
  }
}

dash.disputesScannedAt = cdtTimeStr;

writeFileSync(DATA_FILE, JSON.stringify(dash, null, 2));
console.log('\n✓ Dashboard updated successfully.');
console.log(`  businessDay:    ${dash.businessDay}`);
console.log(`  lastUpdated:    ${dash.lastUpdated}`);
console.log(`  grossSales:     $${dash.eod.grossSales}`);
console.log(`  netSales:       $${dash.eod.netSales}`);
console.log(`  taxes:          $${dash.eod.taxes}`);
console.log(`  creditCard:     $${dash.eod.creditCardPayments}`);
console.log(`  openTickets:    $${dash.eod.openTickets}`);
console.log(`  topItems count: ${topItems.length}`);
