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
// CDT offset (-05:00) used in activity-summary calls, matching lib/lighthouse.ts convention
const ACT_START = `${TODAY}T04:00:00-05:00`;
const ACT_END   = `${TOMORROW}T03:59:59-05:00`;
const CAL_START = `${TODAY}T05:00:00.000Z`;
const CAL_END   = `${TOMORROW}T04:59:59.999Z`;

const BASE = 'https://lighthouse-api.harbortouch.com/api/v1';

const metricMap = {
  'gross-sales':             'grossSales',
  'net-sales':               'netSales',
  'taxes':                   'taxes',
  'discounts':               'discounts',
  // voids and cash/credit overridden by activity-summary below; kept here as fallback
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

// Parse the Payment Summary rows from activity-summary into channel buckets.
// Structure alternates between channel headers (no $amount) and indented sub-rows
// (with $amount). Direct "Credit" sub-rows are Visa/MC/Amex/Discover. Delivery
// channels ("Credit - DoorDash", "Credit - uber-eats", etc.) may be a direct total
// row (has $amount) or a header followed by indented card-type sub-rows.
function parsePaymentRows(rows) {
  let cash = 0, directCredit = 0, doordash = 0, uberEats = 0, stOnline = 0, grubhub = 0;
  let mode = null;
  for (const row of rows) {
    const rawLabel = String(row[0] ?? '');
    const isIndented = rawLabel.startsWith(' ');
    const label = rawLabel.replace(/ /g, '').trim().toLowerCase();
    const amtStr = String(row[row.length - 1] ?? '');
    const amount = parseFloat(amtStr.replace(/[$,]/g, '')) || 0;
    const hasAmt = amtStr.includes('$') && amount > 0;

    if (!label || label.startsWith('total')) continue;
    if (label === 'cash')         { cash += amount; continue; }
    if (label === 'cash rounding'){ cash += amount; continue; }
    if (label === 'credit')       { mode = 'direct'; continue; }

    if (label.startsWith('credit - doordash'))  { mode = 'doordash'; if (hasAmt) doordash  += amount; continue; }
    if (label.startsWith('credit - uber'))       { mode = 'uber';     if (hasAmt) uberEats  += amount; continue; }
    if (label.startsWith('credit - st-online') ||
        label.startsWith('credit - online'))     { mode = 'stonline'; if (hasAmt) stOnline  += amount; continue; }
    if (label.startsWith('credit - grubhub'))   { mode = 'grubhub';  if (hasAmt) grubhub   += amount; continue; }
    if (label.startsWith('credit - '))          { mode = 'other';    continue; } // unknown delivery channel

    // Indented sub-rows belong to the current mode
    if (isIndented && amount > 0) {
      if      (mode === 'direct')  directCredit += amount;
      else if (mode === 'doordash') doordash    += amount;
      else if (mode === 'uber')     uberEats    += amount;
      else if (mode === 'stonline') stOnline    += amount;
      else if (mode === 'grubhub')  grubhub     += amount;
    }
  }
  return { cash, directCredit, doordash, uberEats, stOnline, grubhub };
}

async function fetchActivityPayments(actStart, actEnd) {
  console.log('  Fetching activity-summary for payment breakdown + voids...');
  const res = await fetch(`https://lighthouse-api.harbortouch.com/api/v1/reports/echo-pro/activity-summary`, {
    method: 'POST',
    headers: { ...HEADERS, 'content-type': 'application/json;charset=UTF-8' },
    body: JSON.stringify({
      start: actStart, end: actEnd,
      locations: [LOCATION_ID],
      intradayPeriodGroupGuids: [], locale: 'en-US', revenueCenterGuids: [],
    }),
  });
  if (!res.ok) { console.log(`    activity-summary HTTP ${res.status}`); return null; }
  const data = await res.json();
  const bucket = data.buckets?.find(b => b.guid === null);
  if (!bucket) return null;

  const find = name => bucket.reports?.find(r => r.name === name);

  // Payment breakdown
  const payRows = find('Payment Summary')?.rows ?? [];
  const payments = parsePaymentRows(payRows);

  // Voids (Net Void Summary — last row is Total)
  const voidRows = find('Net Void Summary')?.rows ?? [];
  const totalVoidRow = voidRows.find(r => String(r[0] ?? '').toLowerCase().includes('total'));
  const voids = totalVoidRow
    ? parseFloat(String(totalVoidRow[totalVoidRow.length - 1]).replace(/[$,]/g, '')) || 0
    : 0;

  console.log(`    payments: cash=${payments.cash} directCredit=${payments.directCredit} doordash=${payments.doordash} uber=${payments.uberEats} stOnline=${payments.stOnline} grubhub=${payments.grubhub}`);
  console.log(`    voids: ${voids}`);
  return { ...payments, voids };
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

  // Activity-summary for today: corrects voids + delivery channel payments
  console.log(`\nStep 3b: Fetching activity-summary for today (${TODAY})...`);
  let todayActivity = null;
  try {
    todayActivity = await fetchActivityPayments(ACT_START, ACT_END);
  } catch (err) {
    console.error(`  WARN: today activity-summary failed: ${err.message}`);
  }

  console.log(`\nStep 4: Fetching yesterday's (${YESTERDAY}) full data...`);
  const ydStart = `${YESTERDAY}T09:00:00.000Z`;
  const ydEnd   = `${TODAY}T08:59:59.999Z`;
  const ydActStart = `${YESTERDAY}T04:00:00-05:00`;
  const ydActEnd   = `${TODAY}T03:59:59-05:00`;
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

  console.log(`\nStep 4b: Fetching activity-summary for yesterday (${YESTERDAY})...`);
  let ydActivity = null;
  try {
    ydActivity = await fetchActivityPayments(ydActStart, ydActEnd);
  } catch (err) {
    console.error(`  WARN: yesterday activity-summary failed: ${err.message}`);
  }

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

  // Apply activity-summary corrections to today's metrics (voids + delivery channels)
  const todayVoids   = todayActivity?.voids       ?? metrics.voids;
  const todayCash    = todayActivity?.cash         ?? metrics.cashPayments;
  const todayCredit  = todayActivity?.directCredit ?? metrics.creditCardPayments;
  const todayDD      = todayActivity?.doordash     ?? 0;
  const todayUber    = todayActivity?.uberEats     ?? 0;
  const todaySTO     = todayActivity?.stOnline     ?? 0;
  const todayGrubhub = todayActivity?.grubhub      ?? 0;
  // "creditCard" in history = all non-cash card charges (direct + delivery channels)
  const todayTotalCredit = +(todayCredit + todayDD + todayUber + todaySTO + todayGrubhub).toFixed(2);

  // Update today's summary fields
  dashData.grossSales = metrics.grossSales;
  dashData.netSales = metrics.netSales;
  dashData.taxes = metrics.taxes;
  dashData.discounts = metrics.discounts;
  dashData.voids = todayVoids;
  dashData.cashPayments = todayCash;
  dashData.creditCard = todayTotalCredit;
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
  todayEntry.voids = todayVoids;
  todayEntry.cashPayments = todayCash;
  todayEntry.creditCard = todayTotalCredit;
  todayEntry.openTickets = metrics.openTickets;
  todayEntry.doordash  = todayDD;
  todayEntry.stOnline  = todaySTO;
  todayEntry.uberEats  = todayUber;
  if (todayGrubhub > 0) todayEntry.grubhub = todayGrubhub;

  // Apply activity-summary corrections to yesterday's metrics
  const ydVoids   = ydActivity?.voids       ?? ydMetrics.voids;
  const ydCash    = ydActivity?.cash         ?? ydMetrics.cashPayments;
  const ydCredit  = ydActivity?.directCredit ?? ydMetrics.creditCardPayments;
  const ydDD      = ydActivity?.doordash     ?? 0;
  const ydUber    = ydActivity?.uberEats     ?? 0;
  const ydSTO     = ydActivity?.stOnline     ?? 0;
  const ydGrubhub = ydActivity?.grubhub      ?? 0;
  const ydTotalCredit = +(ydCredit + ydDD + ydUber + ydSTO + ydGrubhub).toFixed(2);

  // Update yesterday's history entry
  const yesterdayEntry = dashData.history.find(h => h.date === YESTERDAY);
  if (yesterdayEntry) {
    // Always update yesterday now that we have accurate activity-summary data
    const prevGross = yesterdayEntry.grossSales ?? 0;
    if ((ydMetrics.grossSales ?? 0) >= prevGross || prevGross < 100) {
      yesterdayEntry.grossSales = ydMetrics.grossSales;
      yesterdayEntry.netSales = ydMetrics.netSales;
      yesterdayEntry.taxes = ydMetrics.taxes;
      yesterdayEntry.discounts = ydMetrics.discounts;
      yesterdayEntry.voids = ydVoids;
      yesterdayEntry.cashPayments = ydCash;
      yesterdayEntry.creditCard = ydTotalCredit;
      yesterdayEntry.openTickets = ydMetrics.openTickets;
      yesterdayEntry.doordash  = ydDD;
      yesterdayEntry.stOnline  = ydSTO;
      yesterdayEntry.uberEats  = ydUber;
      if (ydGrubhub > 0) yesterdayEntry.grubhub = ydGrubhub;
      console.log(`  Updated yesterday history: gross=${ydMetrics.grossSales} voids=${ydVoids} doordash=${ydDD} uber=${ydUber} stOnline=${ydSTO}`);
    } else {
      // Even if we keep old gross, always update delivery channels and voids
      yesterdayEntry.voids = ydVoids;
      yesterdayEntry.doordash  = ydDD;
      yesterdayEntry.stOnline  = ydSTO;
      yesterdayEntry.uberEats  = ydUber;
      if (ydGrubhub > 0) yesterdayEntry.grubhub = ydGrubhub;
      yesterdayEntry.creditCard = ydTotalCredit;
      console.log(`  Kept stored yesterday gross (${prevGross}); updated delivery channels + voids`);
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
