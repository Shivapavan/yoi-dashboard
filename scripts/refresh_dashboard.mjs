import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Token passed as first argument
const TOKEN = process.argv[2];
if (!TOKEN) {
  process.stderr.write('Usage: node refresh_dashboard.mjs <JWT_TOKEN>\n');
  process.exit(1);
}

// Dates — today is 2026-05-02 (CDT = UTC-5)
const TODAY = '2026-05-02';
const TOMORROW = '2026-05-03';
const YESTERDAY = '2026-05-01';

// Business day window (4AM CDT = 9AM UTC)
const DAY_START = `${TODAY}T09:00:00.000Z`;
const DAY_END = `${TOMORROW}T08:59:59.999Z`;

// Batch detail window for yesterday's settle (batches settle next day)
const BATCH_START = `${TODAY}T05:00:00.000Z`;
const BATCH_END = `${TOMORROW}T04:59:59.999Z`;

const BASE = 'https://lighthouse-api.harbortouch.com/api/v1';
const MERCHANT_ID = '0022712560';

async function fetchJSON(url) {
  const res = await fetch(url, {
    headers: { 'x-access-token': TOKEN }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} from ${url}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchMetric(metric) {
  const url = `${BASE}/dashboard/financial-overview/${metric}?start=${DAY_START}&end=${DAY_END}`;
  console.log(`Fetching ${metric}...`);
  try {
    const data = await fetchJSON(url);
    // Response typically has a `value` or `amount` field in dollars
    console.log(`  ${metric} raw:`, JSON.stringify(data).slice(0, 200));
    return data;
  } catch (err) {
    console.error(`  FAILED ${metric}:`, err.message);
    return null;
  }
}

async function fetchBatchDetail() {
  const url = `${BASE}/dashboard/processing/batch-detail?start=${BATCH_START}&end=${BATCH_END}&merchantId=${MERCHANT_ID}`;
  console.log('Fetching batch detail...');
  try {
    const data = await fetchJSON(url);
    console.log('  batch-detail raw:', JSON.stringify(data).slice(0, 300));
    return data;
  } catch (err) {
    console.error('  FAILED batch-detail:', err.message);
    return null;
  }
}

async function fetchTopItemsXLS() {
  const url = `${BASE}/reports/echo-pro/xls/sales-summary-by-item-open-and-closed-tickets?start=${TODAY}T09:00:00-00:00&end=${TOMORROW}T08:59:00-00:00&locations[]=43141083&token=${TOKEN}`;
  console.log('Fetching top items XLS...');
  try {
    const res = await fetch(url, {
      headers: { 'x-access-token': TOKEN }
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('  FAILED XLS fetch:', res.status, text.slice(0, 200));
      return null;
    }
    const buffer = await res.arrayBuffer();
    console.log('  XLS buffer size:', buffer.byteLength);
    return Buffer.from(buffer);
  } catch (err) {
    console.error('  FAILED top-items:', err.message);
    return null;
  }
}

function parseXLS(buffer) {
  const XLSX = require('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`  XLS rows: ${rows.length}, first row:`, rows[0]);

  // Find header row
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row && row.some(cell => typeof cell === 'string' && cell.toLowerCase().includes('item'))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    // Try to find any row that looks like a header
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      console.log(`  row[${i}]:`, rows[i]);
    }
    // Fall back to row 0 as header
    headerIdx = 0;
  }

  const headers = rows[headerIdx].map(h => (h || '').toString().trim().toLowerCase());
  console.log('  Headers:', headers);

  // Find column indices — prefer 'gross sales' over 'revenue class'
  const nameIdx = headers.findIndex(h => h === 'item' || h.includes('item name') || h.includes('name'));
  const qtyIdx = headers.findIndex(h => h.includes('qty') || h.includes('quantity') || h.includes('sold'));
  // Look for 'gross sales' first, then 'net sales', then fallback
  let revIdx = headers.findIndex(h => h === 'gross sales');
  if (revIdx === -1) revIdx = headers.findIndex(h => h === 'net sales');
  if (revIdx === -1) revIdx = headers.findIndex(h => h.includes('gross') && h.includes('sales'));
  if (revIdx === -1) revIdx = headers.findIndex(h => h.includes('amount') || h.includes('total'));

  console.log(`  Name col: ${nameIdx}, Qty col: ${qtyIdx}, Rev col: ${revIdx}`);

  const items = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[nameIdx]) continue;
    const name = row[nameIdx]?.toString().trim();
    const qty = parseFloat(row[qtyIdx]) || 0;
    const revenue = parseFloat(row[revIdx]) || 0;

    // Filter out totals/empty rows
    if (!name) continue;
    if (name.toLowerCase().startsWith('total')) continue;
    if (qty === 0 && revenue === 0) continue;

    items.push({ name, qty, revenue });
  }

  // Sort by revenue desc
  items.sort((a, b) => b.revenue - a.revenue);
  console.log(`  Parsed ${items.length} items, top 3:`, items.slice(0, 3));
  return items;
}

function extractValue(data, metric) {
  if (data === null || data === undefined) return 0;
  if (typeof data === 'number') return data;
  if (typeof data === 'object') {
    // Handle {metricName: [{locationId: X, total: Y}]} shape from Lighthouse
    if (metric && data[metric] !== undefined) return extractValue(data[metric], null);
    // Array: sum totals or use first element
    if (Array.isArray(data)) {
      if (data.length === 0) return 0;
      if (data.length === 1) return extractValue(data[0], null);
      return data.reduce((sum, item) => sum + (parseFloat(item?.total || item?.value || item?.amount || 0)), 0);
    }
    if (data.total !== undefined) return parseFloat(data.total) || 0;
    if (data.value !== undefined) return parseFloat(data.value) || 0;
    if (data.amount !== undefined) return parseFloat(data.amount) || 0;
    if (data.data) return extractValue(data.data, metric);
    console.log(`  Unknown shape for ${metric}:`, Object.keys(data));
  }
  return 0;
}

// Now do the work
console.log('\n=== Fetching financial metrics ===');
const metrics = ['gross-sales', 'net-sales', 'taxes', 'discounts', 'voids', 'cash-payments', 'credit-card-payments', 'open-tickets'];
const metricData = {};
for (const m of metrics) {
  metricData[m] = await fetchMetric(m);
}

console.log('\n=== Fetching batch detail ===');
const batchData = await fetchBatchDetail();

console.log('\n=== Fetching top items XLS ===');
const xlsBuffer = await fetchTopItemsXLS();
let topItems = [];
if (xlsBuffer) {
  topItems = parseXLS(xlsBuffer);
}

// Extract values
const grossSales = extractValue(metricData['gross-sales'], 'gross-sales');
const netSales = extractValue(metricData['net-sales'], 'net-sales');
const taxes = extractValue(metricData['taxes'], 'taxes');
const discounts = extractValue(metricData['discounts'], 'discounts');
const voids = extractValue(metricData['voids'], 'voids');
const cashPayments = extractValue(metricData['cash-payments'], 'cash-payments');
const creditCardPayments = extractValue(metricData['credit-card-payments'], 'credit-card-payments');
const openTickets = extractValue(metricData['open-tickets'], 'open-tickets');

console.log('\n=== Extracted values ===');
console.log({ grossSales, netSales, taxes, discounts, voids, cashPayments, creditCardPayments, openTickets });

// Extract card breakdown from batch data
let cardBreakdown = { visa: 0, mastercard: 0, amex: 0, discover: 0, debit: 0, ebt: 0, returns: 0 };
if (batchData) {
  const batches = Array.isArray(batchData) ? batchData : (batchData.data || batchData.batches || [batchData]);
  for (const batch of batches) {
    if (!batch) continue;
    cardBreakdown.visa += parseFloat(batch.AmtVisa || batch.visa || 0);
    cardBreakdown.mastercard += parseFloat(batch.AmtMasterCard || batch.mastercard || 0);
    cardBreakdown.amex += parseFloat(batch.AmtAmex || batch.amex || 0);
    cardBreakdown.discover += parseFloat(batch.AmtDiscover || batch.discover || 0);
    cardBreakdown.debit += parseFloat(batch.AmtDebit || batch.debit || 0);
    cardBreakdown.ebt += parseFloat(batch.AmtEBT || batch.ebt || 0);
    cardBreakdown.returns += parseFloat(batch.AmtReturns || batch.returns || 0);
  }
}
console.log('Card breakdown:', cardBreakdown);

// CDT time string
const now = new Date();
const cdtOffset = -5 * 60; // CDT = UTC-5
const cdtTime = new Date(now.getTime() + cdtOffset * 60000);
const pad = n => n.toString().padStart(2, '0');
const lastUpdated = `${TODAY} ${pad(cdtTime.getUTCHours())}:${pad(cdtTime.getUTCMinutes())} CDT`;
const disputesScannedAt = lastUpdated;

// Read and update dashboard.json
const dashPath = path.join(__dirname, '..', 'data', 'dashboard.json');
const dash = JSON.parse(readFileSync(dashPath, 'utf-8'));

// Update top-level EOD
dash.businessDay = TODAY;
dash.lastUpdated = lastUpdated;
dash.disputesScannedAt = disputesScannedAt;
dash.businessDayWindow = `05/02 04:00AM – 05/03 03:59AM CDT`;

dash.eod = {
  grossSales,
  netSales,
  taxes,
  voids,
  cashPayments,
  creditCardPayments,
  discounts,
  openTickets
};

// Update processingDetail
const totalSales = cardBreakdown.visa + cardBreakdown.mastercard + cardBreakdown.amex +
  cardBreakdown.discover + cardBreakdown.debit + cardBreakdown.ebt;
dash.processingDetail = {
  windowLabel: `05/01 12:00AM – 11:59PM CDT`,
  rows: [
    { label: 'Total Sales', amount: parseFloat(totalSales.toFixed(2)), bold: true },
    { label: 'Visa', amount: parseFloat(cardBreakdown.visa.toFixed(2)) },
    { label: 'Mastercard', amount: parseFloat(cardBreakdown.mastercard.toFixed(2)) },
    { label: 'Amex', amount: parseFloat(cardBreakdown.amex.toFixed(2)) },
    { label: 'Discover', amount: parseFloat(cardBreakdown.discover.toFixed(2)) },
    { label: 'Debit', amount: parseFloat(cardBreakdown.debit.toFixed(2)) },
    { label: 'EBT', amount: parseFloat(cardBreakdown.ebt.toFixed(2)) },
    { label: 'Returns', amount: parseFloat(cardBreakdown.returns.toFixed(2)) }
  ]
};

// Update history for today
const historyEntry = {
  date: TODAY,
  grossSales,
  netSales,
  taxes,
  discounts,
  voids,
  cashPayments,
  creditCard: creditCardPayments,
  doordash: 0,
  stOnline: 0,
  uberEats: 0,
  openTickets
};

const histIdx = dash.history.findIndex(h => h.date === TODAY);
if (histIdx >= 0) {
  dash.history[histIdx] = historyEntry;
} else {
  dash.history.push(historyEntry);
}

// Update yesterday's history with card breakdown
const yesterdayIdx = dash.history.findIndex(h => h.date === YESTERDAY);
if (yesterdayIdx >= 0) {
  dash.history[yesterdayIdx].cardBreakdown = cardBreakdown;
}

// Update itemsByDay for today
if (topItems.length > 0) {
  const itemsEntry = { date: TODAY, items: topItems };
  const itemsIdx = dash.itemsByDay.findIndex(d => d.date === TODAY);
  if (itemsIdx >= 0) {
    dash.itemsByDay[itemsIdx] = itemsEntry;
  } else {
    dash.itemsByDay.push(itemsEntry);
  }
}

writeFileSync(dashPath, JSON.stringify(dash, null, 2));
console.log('\n=== dashboard.json updated successfully ===');
console.log(`businessDay: ${dash.businessDay}`);
console.log(`lastUpdated: ${dash.lastUpdated}`);
console.log(`history entries: ${dash.history.length}`);
console.log(`itemsByDay entries: ${dash.itemsByDay.length}`);
