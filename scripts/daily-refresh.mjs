import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from '../node_modules/xlsx/xlsx.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ------- Config -------
const TOKEN = process.argv[2];
if (!TOKEN) { console.error('Usage: node daily-refresh.mjs <JWT_TOKEN>'); process.exit(1); }

const TODAY = '2026-05-16';  // YYYY-MM-DD
const YESTERDAY = '2026-05-15';
const MERCHANT_ID = '0022712560';
const LOCATION_ID = '43141083';
const HEADERS = { 'x-access-token': TOKEN, 'accept': 'application/json' };

// Business day window: 4AM CDT (9AM UTC) to 3:59AM CDT next day (8:59AM UTC)
const BIZ_START = `${TODAY}T09:00:00.000Z`;
const BIZ_END   = '2026-05-17T08:59:59.999Z';

// Calendar day for batch detail: midnight CDT (05:00 UTC) to 11:59PM CDT (next day 04:59 UTC)
const CAL_START = `${TODAY}T05:00:00.000Z`;
const CAL_END   = '2026-05-17T04:59:59.999Z';

const BASE = 'https://lighthouse-api.harbortouch.com/api/v1';

async function apiFetch(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} for ${url}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchMetric(metric) {
  const url = `${BASE}/dashboard/financial-overview/${metric}?start=${encodeURIComponent(BIZ_START)}&end=${encodeURIComponent(BIZ_END)}`;
  console.log(`  Fetching ${metric}...`);
  const data = await apiFetch(url);
  // Response format: {"gross-sales":[{"locationId":43141083,"total":123.45}]}
  const arr = data?.[metric];
  let val = 0;
  if (Array.isArray(arr) && arr.length > 0) {
    val = arr.reduce((s, r) => s + (r.total ?? r.amount ?? r.value ?? 0), 0);
  } else {
    val = data?.value ?? data?.amount ?? data?.total ?? 0;
  }
  val = +Number(val).toFixed(2);
  console.log(`    ${metric} = ${val} (raw:`, JSON.stringify(data).slice(0, 120), ')');
  return val;
}

async function fetchTopItems() {
  const url = `${BASE}/reports/echo-pro/xls/sales-summary-by-item-open-and-closed-tickets?start=${encodeURIComponent(TODAY + 'T09:00:00-00:00')}&end=${encodeURIComponent('2026-05-17T08:59:00-00:00')}&locations[]=${LOCATION_ID}&token=${TOKEN}`;
  console.log('  Fetching top items XLS...');
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} for top-items: ${text.slice(0, 200)}`);
  }
  const buffer = await res.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: 0 });

  // Find column names (can vary)
  const sample = rows[0] || {};
  console.log('    XLS columns:', Object.keys(sample).slice(0, 10).join(', '));
  console.log('    XLS row count:', rows.length);
  if (rows.length > 0) console.log('    XLS first row:', JSON.stringify(rows[0]));

  // Flexible column extraction — handle various Lighthouse XLS layouts
  function getCol(r, ...keys) {
    for (const k of keys) {
      if (r[k] !== undefined && r[k] !== '') return r[k];
    }
    return undefined;
  }

  const items = rows
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

  console.log(`    Got ${items.length} items`);
  return items;
}

async function fetchCardBreakdown() {
  const url = `${BASE}/dashboard/processing/batch-detail?start=${encodeURIComponent(CAL_START)}&end=${encodeURIComponent(CAL_END)}&merchantId=${MERCHANT_ID}`;
  console.log('  Fetching card breakdown...');
  const data = await apiFetch(url);
  const batches = data?.batches || [];
  console.log(`    Got ${batches.length} batches`);
  if (batches.length === 0) return null;

  return {
    visa:       +batches.reduce((s, b) => s + (b.AmtVisa || 0), 0).toFixed(2),
    mastercard: +batches.reduce((s, b) => s + (b.AmtMasterCard || 0), 0).toFixed(2),
    amex:       +batches.reduce((s, b) => s + (b.AmtAmex || 0), 0).toFixed(2),
    discover:   +batches.reduce((s, b) => s + (b.AmtDiscover || 0), 0).toFixed(2),
    debit:      +batches.reduce((s, b) => s + (b.AmtDebit || 0), 0).toFixed(2),
    ebt:        +batches.reduce((s, b) => s + (b.AmtEBT || 0), 0).toFixed(2),
    returns:    +batches.reduce((s, b) => s + (b.AmtReturns || 0), 0).toFixed(2),
    total:      +batches.reduce((s, b) => s + (b.TotalAmt || 0), 0).toFixed(2),
  };
}

async function main() {
  console.log(`\n=== YOI Daily Refresh: ${TODAY} ===\n`);

  const dataPath = join(__dirname, '../data/dashboard.json');
  const dashData = JSON.parse(readFileSync(dataPath, 'utf8'));

  // 1. Fetch all financial metrics
  console.log('Step 1: Financial metrics...');
  const metrics = {};
  const metricMap = {
    'gross-sales': 'grossSales',
    'net-sales': 'netSales',
    'taxes': 'taxes',
    'discounts': 'discounts',
    'voids': 'voids',
    'cash-payments': 'cashPayments',
    'credit-card-payments': 'creditCardPayments',
    'open-tickets': 'openTickets',
  };

  for (const [apiKey, jsonKey] of Object.entries(metricMap)) {
    try {
      metrics[jsonKey] = await fetchMetric(apiKey);
    } catch (err) {
      console.error(`    WARN: ${apiKey} failed: ${err.message}`);
      metrics[jsonKey] = 0;
    }
  }

  console.log('\nMetrics summary:', metrics);

  // 2. Fetch top items
  console.log('\nStep 2: Top items...');
  let topItems = [];
  try {
    topItems = await fetchTopItems();
  } catch (err) {
    console.error(`  WARN: Top items failed: ${err.message}`);
  }

  // 3. Fetch card breakdown
  console.log('\nStep 3: Card breakdown...');
  let cardBreakdown = null;
  try {
    cardBreakdown = await fetchCardBreakdown();
    console.log('  Card breakdown:', cardBreakdown);
  } catch (err) {
    console.error(`  WARN: Card breakdown failed: ${err.message}`);
  }

  // 4. Update dashboard.json
  console.log('\nStep 4: Updating dashboard.json...');
  const nowCDT = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  // Update top-level EOD
  dashData.businessDay = TODAY;
  dashData.lastUpdated = nowCDT.replace(',', '').replace(/(\d+)\/(\d+)\/(\d+) (\d+):(\d+)/, '$3-$1-$2 $4:$5 CDT');
  dashData.disputesScannedAt = dashData.lastUpdated;

  dashData.eod = {
    grossSales: metrics.grossSales,
    netSales: metrics.netSales,
    taxes: metrics.taxes,
    voids: metrics.voids,
    cashPayments: metrics.cashPayments,
    creditCardPayments: metrics.creditCardPayments,
    discounts: metrics.discounts,
    openTickets: metrics.openTickets,
  };

  // Update processing detail
  if (cardBreakdown) {
    dashData.processingDetail = {
      windowLabel: `${TODAY} 12:00AM – 11:59PM CDT`,
      rows: [
        { label: 'Total Sales', amount: cardBreakdown.total, bold: true },
        { label: 'Visa', amount: cardBreakdown.visa },
        { label: 'Mastercard', amount: cardBreakdown.mastercard },
        { label: 'Amex', amount: cardBreakdown.amex },
        { label: 'Discover', amount: cardBreakdown.discover },
        { label: 'Debit', amount: cardBreakdown.debit },
        { label: 'EBT', amount: cardBreakdown.ebt },
        { label: 'Returns', amount: cardBreakdown.returns },
      ],
    };
  }

  // Update today's history entry
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
  // preserve doordash/stOnline/uberEats if already set
  todayEntry.doordash = todayEntry.doordash ?? 0;
  todayEntry.stOnline = todayEntry.stOnline ?? 0;
  todayEntry.uberEats = todayEntry.uberEats ?? 0;

  // Update yesterday's card breakdown
  if (cardBreakdown) {
    const yesterdayEntry = dashData.history.find(h => h.date === YESTERDAY);
    if (yesterdayEntry) {
      yesterdayEntry.cardBreakdown = cardBreakdown;
      console.log(`  Updated card breakdown for ${YESTERDAY}`);
    }
  }

  // Update itemsByDay for today
  if (topItems.length > 0) {
    let itemEntry = dashData.itemsByDay.find(i => i.date === TODAY);
    if (!itemEntry) {
      itemEntry = { date: TODAY, items: [] };
      dashData.itemsByDay.push(itemEntry);
      dashData.itemsByDay.sort((a, b) => a.date.localeCompare(b.date));
    }
    itemEntry.items = topItems;
    console.log(`  Updated ${topItems.length} items for ${TODAY}`);
  }

  writeFileSync(dataPath, JSON.stringify(dashData, null, 2));
  console.log(`\nSaved dashboard.json`);
  console.log(`  businessDay: ${dashData.businessDay}`);
  console.log(`  lastUpdated: ${dashData.lastUpdated}`);
  console.log(`  Gross Sales: $${metrics.grossSales}`);
  console.log(`  Net Sales:   $${metrics.netSales}`);
  console.log(`  Top item:    ${topItems[0]?.name} ($${topItems[0]?.revenue})`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
