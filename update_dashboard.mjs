import { readFileSync, writeFileSync } from 'fs';
import XLSX from 'xlsx';

const round2 = n => Math.round(n * 100) / 100;

// ── Data collected from API calls ───────────────────────────────────────────

// Today (2026-08-15) metrics — early morning, restaurant not open yet
const todayMetrics = {
  grossSales: 0,
  netSales: 0,
  taxes: 0,
  discounts: 0,
  voids: 0,
  cashPayments: 0,
  creditCard: 0,
  openTickets: 21.63,
};

// Yesterday (2026-08-14) backfill — scraped 0 but API shows real data
const yesterdayMetrics = {
  grossSales: 3679.74,
  netSales: 3399.31,
  taxes: 280.43,
  discounts: 6.30,
  voids: 0,
  cashPayments: 46.70,
  creditCard: 2898.46,
  openTickets: 3679.74,
};

// Card breakdown settling today (2026-08-15) = yesterday's (2026-08-14) sales
// Batches: [17.31 Visa] + [1820.50 Visa, 638.54 MC, 439.42 Amex]
const yesterdayCardBreakdown = {
  total: round2(17.31 + 2898.46),
  visa: round2(17.31 + 1820.50),
  mastercard: round2(638.54),
  amex: round2(439.42),
  discover: 0,
  debit: 0,
  ebt: 0,
  returns: 0,
};

// ── Parse top items XLS ──────────────────────────────────────────────────────

function parseItems(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  // Col indices: 0=Item, 4=Qty, 9=GrossSales
  return rows
    .slice(1)
    .filter(r => {
      const name = String(r[0] || '');
      const qty = Number(r[4] || 0);
      const revenue = Number(r[9] || 0);
      return name && !name.startsWith('Total') && qty > 0 && revenue > 0;
    })
    .map(r => ({
      name: String(r[0]).trim(),
      qty: Number(r[4]),
      revenue: round2(Number(r[9])),
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

const todayItems = parseItems('/tmp/items_today.xls');
const yesterdayItems = parseItems('/tmp/items_yesterday.xls');

console.log(`Today items: ${todayItems.length}`);
console.log(`Yesterday items: ${yesterdayItems.length}`);

// ── Update dashboard.json ────────────────────────────────────────────────────

const dashPath = '/home/user/yoi-dashboard/data/dashboard.json';
const dash = JSON.parse(readFileSync(dashPath, 'utf8'));

// Helper: upsert history entry
function upsertHistory(date, updates) {
  let entry = dash.history.find(h => h.date === date);
  if (!entry) {
    entry = {
      date,
      grossSales: 0, netSales: 0, taxes: 0, discounts: 0, voids: 0,
      cashPayments: 0, creditCard: 0, openTickets: 0,
      doordash: 0, stOnline: 0, uberEats: 0,
    };
    dash.history.push(entry);
    dash.history.sort((a, b) => a.date.localeCompare(b.date));
  }
  for (const [k, v] of Object.entries(updates)) {
    // Never reduce a good stored value for dollar metrics
    if (typeof v === 'number' && typeof entry[k] === 'number' && k !== 'openTickets') {
      entry[k] = Math.max(entry[k], v);
    } else {
      entry[k] = v;
    }
  }
}

// Helper: upsert itemsByDay entry
function upsertItems(date, items) {
  let entry = (dash.itemsByDay || []).find(i => i.date === date);
  if (!entry) {
    if (!dash.itemsByDay) dash.itemsByDay = [];
    entry = { date, items: [] };
    dash.itemsByDay.push(entry);
    dash.itemsByDay.sort((a, b) => a.date.localeCompare(b.date));
  }
  entry.items = items;
}

// ── Apply updates ────────────────────────────────────────────────────────────

// Today (2026-08-15) — early morning data (all zeros except openTickets)
upsertHistory('2026-08-15', {
  ...todayMetrics,
  doordash: 0, stOnline: 0, uberEats: 0,
});

// Today's top items
upsertItems('2026-08-15', todayItems);

// Yesterday (2026-08-14) — backfill from API
upsertHistory('2026-08-14', {
  ...yesterdayMetrics,
  doordash: 0, stOnline: 0, uberEats: 0,
  cardBreakdown: yesterdayCardBreakdown,
});

// Yesterday's top items
upsertItems('2026-08-14', yesterdayItems);

// Update top-level EOD fields (today's data)
dash.businessDay = '2026-08-15';
dash.lastUpdated = '2026-08-15 9:13 AM CDT';
dash.grossSales = todayMetrics.grossSales;
dash.netSales = todayMetrics.netSales;
dash.taxes = todayMetrics.taxes;
dash.discounts = todayMetrics.discounts;
dash.voids = todayMetrics.voids;
dash.cashPayments = todayMetrics.cashPayments;
dash.creditCard = todayMetrics.creditCard;
dash.openTickets = todayMetrics.openTickets;

// Update disputesScannedAt
dash.disputesScannedAt = new Date().toISOString();

// Update eod object
dash.eod = {
  grossSales: todayMetrics.grossSales,
  netSales: todayMetrics.netSales,
  taxes: todayMetrics.taxes,
  voids: todayMetrics.voids,
  cashPayments: todayMetrics.cashPayments,
  creditCardPayments: todayMetrics.creditCard,
  discounts: todayMetrics.discounts,
  openTickets: todayMetrics.openTickets,
};

// Update processingDetail with yesterday's card breakdown
dash.processingDetail = {
  windowLabel: '2026-08-14 batch (settled 2026-08-15)',
  rows: [
    { label: 'Total Sales', amount: yesterdayCardBreakdown.total, bold: true },
    { label: 'Visa', amount: yesterdayCardBreakdown.visa },
    { label: 'Mastercard', amount: yesterdayCardBreakdown.mastercard },
    { label: 'Amex', amount: yesterdayCardBreakdown.amex },
    { label: 'Discover', amount: yesterdayCardBreakdown.discover },
    { label: 'Debit', amount: yesterdayCardBreakdown.debit },
    { label: 'EBT', amount: yesterdayCardBreakdown.ebt },
    { label: 'Returns', amount: yesterdayCardBreakdown.returns },
  ],
};

// ── Write ────────────────────────────────────────────────────────────────────

writeFileSync(dashPath, JSON.stringify(dash, null, 2));
console.log('dashboard.json updated successfully.');
console.log(`  businessDay: ${dash.businessDay}`);
console.log(`  openTickets: ${dash.openTickets}`);
console.log(`  Yesterday gross: ${dash.history.find(h=>h.date==='2026-08-14')?.grossSales}`);
console.log(`  Yesterday cardBreakdown total: ${dash.history.find(h=>h.date==='2026-08-14')?.cardBreakdown?.total}`);
console.log(`  Today items: ${dash.itemsByDay?.find(i=>i.date==='2026-08-15')?.items?.length}`);
console.log(`  Yesterday items: ${dash.itemsByDay?.find(i=>i.date==='2026-08-14')?.items?.length}`);
