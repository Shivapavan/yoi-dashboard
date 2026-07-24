import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from './node_modules/xlsx/xlsx.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TOKEN = process.argv[2];
if (!TOKEN) { console.error('Usage: node refresh_today.mjs <JWT_TOKEN>'); process.exit(1); }

// Compute today's CDT business day (UTC-5, business day starts 4AM CDT = 9AM UTC)
function getCDTBusinessDay() {
  const now = new Date();
  // Subtract 4 hours to align with business day (4AM CDT start)
  const shifted = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10); // YYYY-MM-DD
}

const TODAY = getCDTBusinessDay();
const d = new Date(TODAY);
d.setDate(d.getDate() - 1);
const YESTERDAY = d.toISOString().slice(0, 10);
const d2 = new Date(TODAY);
d2.setDate(d2.getDate() + 1);
const TOMORROW = d2.toISOString().slice(0, 10);

console.log(`Dates: TODAY=${TODAY}, YESTERDAY=${YESTERDAY}, TOMORROW=${TOMORROW}`);

const MERCHANT_ID = '0022712560';
const LOCATION_ID = '43141083';
const HEADERS = { 'x-access-token': TOKEN, 'accept': 'application/json' };

const BIZ_START = `${TODAY}T09:00:00.000Z`;
const BIZ_END   = `${TOMORROW}T08:59:59.999Z`;
const CAL_START = `${TODAY}T05:00:00.000Z`;
const CAL_END   = `${TOMORROW}T04:59:59.999Z`;

const BASE = 'https://lighthouse-api.harbortouch.com/api/v1';

const metricMap = {
  'gross-sales':             'grossSales',
  'net-sales':               'netSales',
  'taxes':                   'taxes',
  'discounts':               'discounts',
  'voids':                   'voids',
  'cash-payments':           'cashPayments',
  'credit-card-payments':    'creditCardPayments',
  'open-tickets':            'openTickets',
};

async function apiFetch(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} for ${url}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchMetric(metric, start, end) {
  const url = `${BASE}/dashboard/financial-overview/${metric}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
  console.log(`  Fetching ${metric}...`);
  const data = await apiFetch(url);
  const arr = data?.[metric];
  let val = 0;
  if (Array.isArray(arr) && arr.length > 0) {
    val = arr.reduce((s, r) => s + (r.total ?? r.amount ?? r.value ?? 0), 0);
  } else {
    val = data?.value ?? data?.amount ?? data?.total ?? 0;
  }
  val = +Number(val).toFixed(2);
  console.log(`    ${metric} = ${val}`);
  return val;
}

function getCol(r, ...keys) {
  for (const k of keys) {
    if (r[k] !== undefined && r[k] !== '') return r[k];
  }
  return undefined;
}

async function fetchTopItems(dateStr, nextDateStr) {
  const url = `${BASE}/reports/echo-pro/xls/sales-summary-by-item-open-and-closed-tickets?start=${encodeURIComponent(dateStr + 'T09:00:00-00:00')}&end=${encodeURIComponent(nextDateStr + 'T08:59:00-00:00')}&locations[]=${LOCATION_ID}&token=${TOKEN}`;
  console.log(`  Fetching top items XLS for ${dateStr}...`);
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} for top-items: ${text.slice(0, 200)}`);
  }
  const buffer = await res.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: 0 });

  console.log(`    XLS columns: ${Object.keys(rows[0] || {}).slice(0, 10).join(', ')}`);
  console.log(`    XLS row count: ${rows.length}`);

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

async function fetchCardBreakdown(start, end) {
  const url = `${BASE}/dashboard/processing/batch-detail?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&merchantId=${MERCHANT_ID}`;
  console.log('  Fetching card breakdown...');
  const data = await apiFetch(url);
  const batches = Array.isArray(data) ? data : (data?.data ?? data?.batches ?? []);
  console.log(`    Got ${batches.length} batches`);

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
    visa: +visa.toFixed(2),
    mastercard: +mastercard.toFixed(2),
    amex: +amex.toFixed(2),
    discover: +discover.toFixed(2),
    debit: +debit.toFixed(2),
    ebt: +ebt.toFixed(2),
    returns: +returns.toFixed(2),
  };
}

async function main() {
  const dataPath = join(__dirname, 'data', 'dashboard.json');
  const dashData = JSON.parse(readFileSync(dataPath, 'utf8'));

  console.log(`\nStep 1: Fetching today's metrics (${TODAY})...`);
  const metrics = {};
  for (const [apiKey, jsonKey] of Object.entries(metricMap)) {
    try {
      metrics[jsonKey] = await fetchMetric(apiKey, BIZ_START, BIZ_END);
    } catch (err) {
      console.error(`  WARN: ${apiKey} failed: ${err.message}`);
      metrics[jsonKey] = 0;
    }
  }
  console.log('Today metrics:', metrics);

  console.log(`\nStep 2: Fetching today's top items...`);
  let topItems = [];
  try {
    topItems = await fetchTopItems(TODAY, TOMORROW);
    console.log(`  Got ${topItems.length} items`);
  } catch (err) {
    console.error(`  WARN: top items failed: ${err.message}`);
  }

  console.log(`\nStep 3: Fetching card breakdown for ${TODAY} (settles as yesterday's batch)...`);
  let cardBreakdown = null;
  try {
    cardBreakdown = await fetchCardBreakdown(CAL_START, CAL_END);
    console.log('  Card breakdown:', cardBreakdown);
  } catch (err) {
    console.error(`  WARN: card breakdown failed: ${err.message}`);
  }

  console.log(`\nStep 4: Fetching yesterday's (${YESTERDAY}) full data...`);
  const ydStart = `${YESTERDAY}T09:00:00.000Z`;
  const ydEnd   = `${TODAY}T08:59:59.999Z`;
  const ydMetrics = {};
  for (const [apiKey, jsonKey] of Object.entries(metricMap)) {
    try {
      ydMetrics[jsonKey] = await fetchMetric(apiKey, ydStart, ydEnd);
    } catch (err) {
      console.error(`  WARN: yesterday ${apiKey} failed: ${err.message}`);
      ydMetrics[jsonKey] = 0;
    }
  }
  console.log('Yesterday metrics:', ydMetrics);

  let ydItems = [];
  try {
    ydItems = await fetchTopItems(YESTERDAY, TODAY);
    console.log(`  Yesterday items: ${ydItems.length}`);
  } catch (err) {
    console.error(`  WARN: yesterday items failed: ${err.message}`);
  }

  console.log(`\nStep 5: Updating dashboard.json...`);

  // Update top-level fields
  dashData.businessDay = TODAY;
  // Format CDT time
  const nowCDT = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const h = nowCDT.getUTCHours();
  const m = String(nowCDT.getUTCMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  dashData.lastUpdated = `${TODAY} ${h12}:${m} ${ampm} CDT`;
  dashData.disputesScannedAt = new Date().toISOString();

  // Update today's summary fields
  dashData.grossSales = metrics.grossSales;
  dashData.netSales = metrics.netSales;
  dashData.taxes = metrics.taxes;
  dashData.discounts = metrics.discounts;
  dashData.voids = metrics.voids;
  dashData.cashPayments = metrics.cashPayments;
  dashData.creditCard = metrics.creditCardPayments;
  dashData.openTickets = metrics.openTickets;

  // Update today history entry
  let todayEntry = dashData.history.find(h => h.date === TODAY);
  if (!todayEntry) {
    todayEntry = { date: TODAY };
    dashData.history.push(todayEntry);
    dashData.history.sort((a, b) => a.date.localeCompare(b.date));
  }
  todayEntry.grossSales = metrics.grossSales;
  todayEntry.netSales = metrics.netSales;
  todayEntry.taxes = metrics.taxes;
  todayEntry.discounts = metrics.discounts;
  todayEntry.voids = metrics.voids;
  todayEntry.cashPayments = metrics.cashPayments;
  todayEntry.creditCard = metrics.creditCardPayments;
  todayEntry.openTickets = metrics.openTickets;
  todayEntry.doordash = todayEntry.doordash ?? 0;
  todayEntry.stOnline = todayEntry.stOnline ?? 0;
  todayEntry.uberEats = todayEntry.uberEats ?? 0;

  // Update yesterday's history entry
  const yesterdayEntry = dashData.history.find(h => h.date === YESTERDAY);
  if (yesterdayEntry) {
    // Only update if the new value is higher (never lower a good stored value)
    if ((ydMetrics.grossSales ?? 0) > (yesterdayEntry.grossSales ?? 0)) {
      yesterdayEntry.grossSales = ydMetrics.grossSales;
      yesterdayEntry.netSales = ydMetrics.netSales;
      yesterdayEntry.taxes = ydMetrics.taxes;
      yesterdayEntry.discounts = ydMetrics.discounts;
      yesterdayEntry.voids = ydMetrics.voids;
      yesterdayEntry.cashPayments = ydMetrics.cashPayments;
      yesterdayEntry.creditCard = ydMetrics.creditCardPayments;
      yesterdayEntry.openTickets = ydMetrics.openTickets;
      console.log(`  Updated yesterday history (new gross: ${ydMetrics.grossSales} > stored: ${yesterdayEntry.grossSales})`);
    } else {
      console.log(`  Kept stored yesterday (stored gross: ${yesterdayEntry.grossSales} >= new: ${ydMetrics.grossSales})`);
    }
    // Always update card breakdown for yesterday
    if (cardBreakdown && cardBreakdown.total > 0) {
      yesterdayEntry.cardBreakdown = cardBreakdown;
      console.log(`  Updated card breakdown for ${YESTERDAY}: $${cardBreakdown.total}`);
    }
  }

  // Update today's items
  if (topItems.length > 0) {
    if (!dashData.itemsByDay) dashData.itemsByDay = [];
    let itemEntry = dashData.itemsByDay.find(i => i.date === TODAY);
    if (!itemEntry) {
      itemEntry = { date: TODAY, items: [] };
      dashData.itemsByDay.push(itemEntry);
      dashData.itemsByDay.sort((a, b) => a.date.localeCompare(b.date));
    }
    itemEntry.items = topItems;
    console.log(`  Updated ${topItems.length} items for ${TODAY}`);
  }

  // Update yesterday's items
  if (ydItems.length > 0) {
    if (!dashData.itemsByDay) dashData.itemsByDay = [];
    let ydItemEntry = dashData.itemsByDay.find(i => i.date === YESTERDAY);
    if (!ydItemEntry) {
      ydItemEntry = { date: YESTERDAY, items: [] };
      dashData.itemsByDay.push(ydItemEntry);
      dashData.itemsByDay.sort((a, b) => a.date.localeCompare(b.date));
    }
    ydItemEntry.items = ydItems;
    console.log(`  Updated ${ydItems.length} items for ${YESTERDAY}`);
  }

  writeFileSync(dataPath, JSON.stringify(dashData, null, 2));
  console.log(`\nDone. Saved dashboard.json`);
  console.log(`  businessDay: ${dashData.businessDay}`);
  console.log(`  lastUpdated: ${dashData.lastUpdated}`);
  console.log(`  Today gross: $${metrics.grossSales}`);
  console.log(`  Yesterday gross: $${ydMetrics.grossSales}`);
  console.log(`  Top item: ${topItems[0]?.name ?? 'N/A'}`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
