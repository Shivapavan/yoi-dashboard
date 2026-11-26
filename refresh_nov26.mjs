/**
 * Daily refresh script for 2026-11-26
 * Fetches data from Lighthouse API and updates dashboard.json
 */
import fs from 'fs';
import https from 'https';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error('Usage: node refresh_nov26.mjs <TOKEN>');
  process.exit(1);
}

const TODAY = '2026-11-26';
const YESTERDAY = '2026-11-25';
const LOCATION_ID = '43141083';
const MERCHANT_ID = '0022712560';

// Business day window for today
const START = '2026-11-26T09:00:00.000Z';
const END = '2026-11-27T08:59:59.999Z';

// Batch window (today's date = reflects yesterday's settled batches)
const BATCH_START = '2026-11-26T05:00:00.000Z';
const BATCH_END = '2026-11-27T04:59:59.999Z';

const BASE_URL = 'https://lighthouse-api.harbortouch.com/api/v1';

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'x-access-token': TOKEN,
        'Accept': 'application/json',
        ...headers,
      },
    };
    const req = https.get(url, opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({ status: res.statusCode, body, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('timeout')); });
  });
}

async function fetchMetric(metric) {
  const url = `${BASE_URL}/dashboard/financial-overview/${metric}?start=${START}&end=${END}`;
  console.log(`Fetching ${metric}...`);
  const { status, body } = await httpsGet(url);
  if (status !== 200) {
    console.error(`  ${metric}: HTTP ${status} - ${body.toString().slice(0, 200)}`);
    return null;
  }
  const data = JSON.parse(body.toString());
  console.log(`  ${metric}: ${JSON.stringify(data).slice(0, 150)}`);
  return data;
}

async function fetchCardBreakdown() {
  const url = `${BASE_URL}/dashboard/processing/batch-detail?start=${BATCH_START}&end=${BATCH_END}&merchantId=${MERCHANT_ID}`;
  console.log('Fetching card breakdown...');
  const { status, body } = await httpsGet(url);
  if (status !== 200) {
    console.error(`  batch-detail: HTTP ${status} - ${body.toString().slice(0, 200)}`);
    return null;
  }
  const data = JSON.parse(body.toString());
  console.log(`  batch-detail: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function fetchTopItems() {
  const startXls = '2026-11-26T09:00:00-00:00';
  const endXls = '2026-11-27T08:59:00-00:00';
  const url = `${BASE_URL}/reports/echo-pro/xls/sales-summary-by-item-open-and-closed-tickets?start=${startXls}&end=${endXls}&locations[]=${LOCATION_ID}&token=${TOKEN}`;
  console.log('Fetching top items XLS...');
  const { status, body, headers } = await httpsGet(url);
  if (status !== 200) {
    console.error(`  top-items: HTTP ${status} - ${body.toString().slice(0, 200)}`);
    return null;
  }
  console.log(`  top-items: got ${body.length} bytes, content-type: ${headers['content-type']}`);

  try {
    const wb = XLSX.read(body, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    console.log(`  XLS rows: ${rows.length}, first few: ${JSON.stringify(rows.slice(0, 3))}`);
    return rows;
  } catch (e) {
    console.error('  Failed to parse XLS:', e.message);
    try {
      const json = JSON.parse(body.toString());
      console.log('  Got JSON response:', JSON.stringify(json).slice(0, 300));
      return json;
    } catch {}
    return null;
  }
}

function extractValue(data) {
  if (!data) return 0;
  if (typeof data === 'number') return data;
  if (data.value !== undefined) return parseFloat(data.value) || 0;
  if (data.total !== undefined) return parseFloat(data.total) || 0;
  if (data.amount !== undefined) return parseFloat(data.amount) || 0;
  if (data.grossSales !== undefined) return parseFloat(data.grossSales) || 0;
  if (data.netSales !== undefined) return parseFloat(data.netSales) || 0;
  if (Array.isArray(data)) {
    return data.reduce((sum, item) => sum + (parseFloat(item.amount || item.value || item.total || 0)), 0);
  }
  // Handle shape like {"gross-sales": [{locationId, total}]}
  for (const key of Object.keys(data)) {
    const val = data[key];
    if (Array.isArray(val) && val.length > 0 && val[0].total !== undefined) {
      return val.reduce((sum, loc) => sum + (parseFloat(loc.total) || 0), 0);
    }
    if (typeof val === 'number' && key !== 'count') return val;
  }
  console.log('  Unknown value shape:', JSON.stringify(data).slice(0, 200));
  return 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function parseTopItems(rows) {
  if (!rows || !Array.isArray(rows)) return [];

  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row && row.some && row.some(cell => typeof cell === 'string' &&
        (cell.toLowerCase().includes('item') || cell.toLowerCase().includes('name')))) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    console.log('  No header found, trying first row as header');
    headerIdx = 0;
  }

  const headers = rows[headerIdx];
  console.log('  Headers:', headers);

  let nameCol = -1, qtyCol = -1, revenueCol = -1;
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || '').toLowerCase();
    if ((h.includes('item') || h.includes('name') || h.includes('description')) && nameCol === -1) nameCol = i;
    if ((h.includes('qty') || h.includes('quantity') || h.includes('sold')) && qtyCol === -1) qtyCol = i;
    // Prefer 'gross sales' over 'revenue class'
    if (h === 'gross sales' && revenueCol === -1) revenueCol = i;
    else if (h === 'net sales' && revenueCol === -1) revenueCol = i;
    else if ((h.includes('revenue') && !h.includes('class')) && revenueCol === -1) revenueCol = i;
    else if ((h.includes('sales') || h.includes('amount') || h.includes('total')) && revenueCol === -1) revenueCol = i;
  }

  console.log(`  Cols: name=${nameCol}, qty=${qtyCol}, revenue=${revenueCol}`);

  if (nameCol === -1) return [];

  const items = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[nameCol]) continue;

    const name = String(row[nameCol] || '').trim();
    if (!name) continue;
    if (name.toLowerCase().startsWith('total')) continue;

    const qty = parseFloat(row[qtyCol] || 0);
    const revenue = parseFloat(row[revenueCol] || 0);

    if (qty === 0 && revenue === 0) continue;
    if (revenue === 0) continue;

    items.push({ name, qty, revenue: round2(revenue) });
  }

  items.sort((a, b) => b.revenue - a.revenue);
  return items;
}

function parseCardBreakdown(data) {
  if (!data) return null;

  let visa = 0, mastercard = 0, amex = 0, discover = 0, debit = 0, ebt = 0, returns = 0;

  const rows = Array.isArray(data) ? data : (data.data || data.rows || data.batches || []);

  if (Array.isArray(rows)) {
    for (const row of rows) {
      visa += parseFloat(row.AmtVisa || row.visa || row.Visa || 0);
      mastercard += parseFloat(row.AmtMasterCard || row.mastercard || row.MasterCard || row.mc || 0);
      amex += parseFloat(row.AmtAmex || row.amex || row.Amex || 0);
      discover += parseFloat(row.AmtDiscover || row.discover || row.Discover || 0);
      debit += parseFloat(row.AmtDebit || row.debit || row.Debit || 0);
      ebt += parseFloat(row.AmtEBT || row.ebt || row.EBT || 0);
      returns += parseFloat(row.AmtReturns || row.returns || row.Returns || 0);
    }
  } else if (typeof data === 'object') {
    visa = parseFloat(data.AmtVisa || data.visa || 0);
    mastercard = parseFloat(data.AmtMasterCard || data.mastercard || 0);
    amex = parseFloat(data.AmtAmex || data.amex || 0);
    discover = parseFloat(data.AmtDiscover || data.discover || 0);
    debit = parseFloat(data.AmtDebit || data.debit || 0);
    ebt = parseFloat(data.AmtEBT || data.ebt || 0);
    returns = parseFloat(data.AmtReturns || data.returns || 0);
  }

  return {
    visa: round2(visa),
    mastercard: round2(mastercard),
    amex: round2(amex),
    discover: round2(discover),
    debit: round2(debit),
    ebt: round2(ebt),
    returns: round2(returns),
  };
}

// Main
console.log(`\n=== YOI Dashboard Refresh: ${TODAY} ===\n`);

const metrics = {};
const metricNames = ['gross-sales', 'net-sales', 'taxes', 'discounts', 'voids', 'cash-payments', 'credit-card-payments', 'open-tickets'];

for (const metric of metricNames) {
  const data = await fetchMetric(metric);
  metrics[metric] = data;
}

const cardData = await fetchCardBreakdown();
const xlsRows = await fetchTopItems();

console.log('\n=== Parsing results ===\n');

const grossSales = round2(extractValue(metrics['gross-sales']));
const netSales = round2(extractValue(metrics['net-sales']));
const taxes = round2(extractValue(metrics['taxes']));
const discounts = round2(extractValue(metrics['discounts']));
const voids = round2(extractValue(metrics['voids']));
const cashPayments = round2(extractValue(metrics['cash-payments']));
const creditCard = round2(extractValue(metrics['credit-card-payments']));
const openTickets = round2(extractValue(metrics['open-tickets']));

console.log(`Gross Sales: $${grossSales}`);
console.log(`Net Sales: $${netSales}`);
console.log(`Taxes: $${taxes}`);
console.log(`Discounts: $${discounts}`);
console.log(`Voids: $${voids}`);
console.log(`Cash: $${cashPayments}`);
console.log(`Credit: $${creditCard}`);
console.log(`Open Tickets: $${openTickets}`);

const cardBreakdown = parseCardBreakdown(cardData);
console.log(`Card Breakdown (yesterday ${YESTERDAY}):`, JSON.stringify(cardBreakdown));

const topItems = parseTopItems(xlsRows);
console.log(`Top Items (${topItems.length} items):`, JSON.stringify(topItems.slice(0, 5)));

console.log('\n=== Updating dashboard.json ===\n');

const dashPath = '/home/user/yoi-dashboard/data/dashboard.json';
const dash = JSON.parse(fs.readFileSync(dashPath, 'utf-8'));

const nowUtc = new Date();
const nowCst = new Date(nowUtc.getTime() - 6 * 3600 * 1000);
const timeStr = nowCst.toLocaleString('en-US', {
  month: '2-digit', day: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: true
}).replace(',', '') + ' CST';

dash.businessDay = TODAY;
dash.lastUpdated = timeStr;
dash.grossSales = grossSales;
dash.netSales = netSales;
dash.taxes = taxes;
dash.discounts = discounts;
dash.voids = voids;
dash.cashPayments = cashPayments;
dash.creditCard = creditCard;
dash.openTickets = openTickets;
dash.disputesScannedAt = new Date().toISOString();

dash.eod = {
  grossSales,
  netSales,
  taxes,
  discounts,
  voids,
  cashPayments,
  creditCardPayments: creditCard,
  openTickets,
};

let histIdx = dash.history.findIndex(h => h.date === TODAY);
const newHistEntry = {
  date: TODAY,
  grossSales,
  netSales,
  taxes,
  discounts,
  voids,
  cashPayments,
  creditCard,
  openTickets,
  doordash: 0,
  stOnline: 0,
  uberEats: 0,
};

if (histIdx >= 0) {
  if (dash.history[histIdx].cardBreakdown) {
    newHistEntry.cardBreakdown = dash.history[histIdx].cardBreakdown;
  }
  dash.history[histIdx] = newHistEntry;
  console.log('Updated existing history entry for', TODAY);
} else {
  dash.history.push(newHistEntry);
  console.log('Added new history entry for', TODAY);
}

if (cardBreakdown) {
  let yIdx = dash.history.findIndex(h => h.date === YESTERDAY);
  if (yIdx >= 0) {
    dash.history[yIdx].cardBreakdown = cardBreakdown;
    console.log(`Updated cardBreakdown for ${YESTERDAY}`);
  } else {
    console.log(`No history entry found for ${YESTERDAY} to update cardBreakdown`);
  }
}

if (topItems.length > 0) {
  let iIdx = dash.itemsByDay.findIndex(d => d.date === TODAY);
  const newItemsEntry = { date: TODAY, items: topItems };
  if (iIdx >= 0) {
    dash.itemsByDay[iIdx] = newItemsEntry;
  } else {
    dash.itemsByDay.push(newItemsEntry);
  }
  console.log(`Updated itemsByDay for ${TODAY} with ${topItems.length} items`);
}

fs.writeFileSync(dashPath, JSON.stringify(dash, null, 2));
console.log('\n=== dashboard.json updated successfully ===\n');
