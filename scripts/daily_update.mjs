/**
 * Daily dashboard refresh script.
 * Updates data/dashboard.json with latest data from Lighthouse API.
 */
import fs from 'fs';
import xlsx from 'xlsx';

const TOKEN = process.env.LIGHTHOUSE_TOKEN;
if (!TOKEN) {
  console.error('LIGHTHOUSE_TOKEN env var not set');
  process.exit(1);
}

const LOCATION_ID = '43141083';
const MERCHANT_ID = '0022712560';
const DASHBOARD_PATH = new URL('../data/dashboard.json', import.meta.url).pathname;

// Get business day dates for a given calendar date
// Business day starts at 4 AM CST (UTC-6 in Nov = 10:00 UTC)
function getBusinessDayWindow(dateStr) {
  const start = new Date(`${dateStr}T10:00:00.000Z`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setSeconds(end.getSeconds() - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function fetchMetric(metric, start, end) {
  const url = `https://lighthouse-api.harbortouch.com/api/v1/dashboard/financial-overview/${metric}?start=${start}&end=${end}`;
  const res = await fetch(url, { headers: { 'x-access-token': TOKEN } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${metric}`);
  const data = await res.json();
  const key = metric;
  return data[key]?.find(l => l.locationId === parseInt(LOCATION_ID))?.total ?? 0;
}

async function fetchAllMetrics(dateStr) {
  const { start, end } = getBusinessDayWindow(dateStr);
  console.log(`  Fetching metrics for ${dateStr} (${start} to ${end})`);
  const [grossSales, netSales, taxes, discounts, voids, cashPayments, creditCard, openTickets] = await Promise.all([
    fetchMetric('gross-sales', start, end),
    fetchMetric('net-sales', start, end),
    fetchMetric('taxes', start, end),
    fetchMetric('discounts', start, end),
    fetchMetric('voids', start, end),
    fetchMetric('cash-payments', start, end),
    fetchMetric('credit-card-payments', start, end),
    fetchMetric('open-tickets', start, end),
  ]);
  return { grossSales, netSales, taxes, discounts, voids, cashPayments, creditCard, openTickets };
}

async function fetchTopItems(dateStr) {
  const { start, end } = getBusinessDayWindow(dateStr);
  // Convert UTC to offset format for XLS endpoint
  const startOffset = start.replace('Z', '-06:00');
  const endOffset = end.replace('.999Z', '-06:00');
  const url = `https://lighthouse-api.harbortouch.com/api/v1/reports/echo-pro/xls/sales-summary-by-item-open-and-closed-tickets?start=${startOffset}&end=${endOffset}&locations[]=${LOCATION_ID}&token=${TOKEN}`;
  const res = await fetch(url, { headers: { 'x-access-token': TOKEN } });
  if (!res.ok) {
    console.warn(`  Could not fetch items for ${dateStr}: HTTP ${res.status}`);
    return null;
  }
  const buf = await res.arrayBuffer();
  const wb = xlsx.read(Buffer.from(buf), { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });
  // rows[0] = header, last row = totals
  const items = rows.slice(1, -1)
    .filter(r => r[0] && !String(r[0]).startsWith('Total') && r[4] > 0 && r[9] > 0)
    .map(r => ({ name: String(r[0]), qty: Number(r[4]), revenue: Number(r[9]) }))
    .sort((a, b) => b.revenue - a.revenue);
  return items;
}

async function fetchCardBreakdown(dateStr) {
  // Batch detail: use 05:00 UTC start of the same day
  const start = `${dateStr}T05:00:00.000Z`;
  const nextDay = new Date(`${dateStr}T05:00:00.000Z`);
  nextDay.setDate(nextDay.getDate() + 1);
  const end = nextDay.toISOString().replace('.000Z', '.999Z');
  const url = `https://lighthouse-api.harbortouch.com/api/v1/dashboard/processing/batch-detail?start=${start}&end=${end}&merchantId=${MERCHANT_ID}`;
  const res = await fetch(url, { headers: { 'x-access-token': TOKEN } });
  if (!res.ok) {
    console.warn(`  Could not fetch card breakdown for ${dateStr}: HTTP ${res.status}`);
    return null;
  }
  const data = await res.json();
  const batches = data.batches || [];
  if (batches.length === 0) return null;
  const sum = (k) => batches.reduce((acc, b) => acc + (b[k] || 0), 0);
  return {
    visa: round2(sum('AmtVisa')),
    mastercard: round2(sum('AmtMasterCard')),
    amex: round2(sum('AmtAmex')),
    discover: round2(sum('AmtDiscover')),
    debit: round2(sum('AmtDebit')),
    ebt: round2(sum('AmtEBT')),
    returns: round2(sum('AmtReturns')),
    total: round2(sum('TotalAmt')),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function todayCST() {
  // Current date in CST (UTC-6) adjusted for 4AM business day start
  const now = new Date();
  const cstNow = new Date(now.getTime() - 6 * 60 * 60 * 1000); // UTC-6
  const bizNow = new Date(cstNow.getTime() - 4 * 60 * 60 * 1000); // subtract 4h for biz day
  return bizNow.toISOString().slice(0, 10);
}

function yesterdayCST() {
  const now = new Date();
  const cstNow = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const bizNow = new Date(cstNow.getTime() - 4 * 60 * 60 * 1000);
  bizNow.setDate(bizNow.getDate() - 1);
  return bizNow.toISOString().slice(0, 10);
}

function nowCSTFormatted() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).replace(',', '') + ' CST';
}

async function main() {
  const dashboard = JSON.parse(fs.readFileSync(DASHBOARD_PATH, 'utf8'));
  const today = todayCST();
  const yesterday = yesterdayCST();

  console.log(`Today (biz day): ${today}`);
  console.log(`Yesterday (biz day): ${yesterday}`);

  // Determine which days need updating
  const daysToUpdate = [];

  // Check if yesterday needs updating (gross < $100 means partial/failed)
  const yesterdayEntry = dashboard.history.find(h => h.date === yesterday);
  if (!yesterdayEntry || yesterdayEntry.grossSales < 100) {
    daysToUpdate.push({ date: yesterday, isToday: false });
  }

  // Always update today's entry
  daysToUpdate.push({ date: today, isToday: true });

  for (const { date, isToday } of daysToUpdate) {
    console.log(`\nUpdating ${date}...`);

    // Fetch metrics
    const metrics = await fetchAllMetrics(date);
    console.log(`  Metrics: gross=$${metrics.grossSales}, net=$${metrics.netSales}`);

    // Find or create history entry
    let entry = dashboard.history.find(h => h.date === date);
    if (!entry) {
      entry = { date, grossSales: 0, netSales: 0, taxes: 0, discounts: 0, voids: 0, cashPayments: 0, creditCard: 0, openTickets: 0, doordash: 0, stOnline: 0, uberEats: 0 };
      dashboard.history.push(entry);
    }

    // Only overwrite if new value is higher (never reduce a good stored value)
    if (metrics.grossSales >= entry.grossSales) {
      Object.assign(entry, metrics);
      console.log(`  Updated history entry for ${date}`);
    } else {
      console.log(`  Skipped (stored $${entry.grossSales} > live $${metrics.grossSales})`);
    }

    // Fetch and update top items (only if there are sales)
    if (metrics.grossSales > 0) {
      const items = await fetchTopItems(date);
      if (items && items.length > 0) {
        let itemsEntry = dashboard.itemsByDay.find(e => e.date === date);
        if (!itemsEntry) {
          itemsEntry = { date, items: [] };
          dashboard.itemsByDay.push(itemsEntry);
        }
        itemsEntry.items = items;
        console.log(`  Updated ${items.length} items for ${date}`);
      }
    }

    // Fetch card breakdown for yesterday (batches settle next day)
    if (!isToday) {
      const cardBreakdown = await fetchCardBreakdown(date);
      if (cardBreakdown) {
        entry.cardBreakdown = cardBreakdown;
        console.log(`  Updated card breakdown for ${date}: total=$${cardBreakdown.total}`);
      }
    }
  }

  // Update top-level metadata
  dashboard.businessDay = today;
  dashboard.lastUpdated = nowCSTFormatted();
  dashboard.disputesScannedAt = nowCSTFormatted();

  // Sort history and itemsByDay by date
  dashboard.history.sort((a, b) => a.date.localeCompare(b.date));
  dashboard.itemsByDay.sort((a, b) => a.date.localeCompare(b.date));

  fs.writeFileSync(DASHBOARD_PATH, JSON.stringify(dashboard, null, 2));
  console.log(`\nDashboard updated successfully. businessDay=${today}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
