const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DASHBOARD_PATH = path.join(__dirname, '../data/dashboard.json');

// Data from Lighthouse API fetched this run
const YESTERDAY = '2026-10-25';
const TODAY = '2026-10-26';

// Yesterday's financial metrics (from financial-overview API + activity-summary)
const yesterdayData = {
  date: YESTERDAY,
  grossSales: 1456.15,
  netSales: 1345.16,
  taxes: 110.93,
  discounts: 7.50,
  voids: 20.47,
  cashPayments: 79.80,
  creditCard: 649.22,
  doordash: 94.63,
  uberEats: 514.32,
  stOnline: 117.37,
  openTickets: 0,
};

// Yesterday's card breakdown (from activity-summary Payment Summary)
// In-person credit + st-online credit (excluding DoorDash/UberEats which are tracked separately)
const yesterdayCardBreakdown = {
  total: 766.59,
  visa: 491.83,
  mastercard: 267.03,
  amex: 7.73,
  discover: 0,
  debit: 0,
  ebt: 0,
  returns: 0,
};

// Today's entry (too early in day, all zeros)
const todayData = {
  date: TODAY,
  grossSales: 0,
  netSales: 0,
  taxes: 0,
  discounts: 0,
  voids: 0,
  cashPayments: 0,
  creditCard: 0,
  doordash: 0,
  uberEats: 0,
  stOnline: 0,
  openTickets: 0,
};

// Parse yesterday's items from XLS
function parseItems(xlsPath) {
  try {
    const wb = XLSX.readFile(xlsPath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    return rows.slice(1)
      .filter(r => r[0] && typeof r[0] === 'string' && !r[0].startsWith('Total'))
      .map(r => ({ name: r[0].trim(), qty: Number(r[4]) || 0, revenue: +(Number(r[9]) || 0).toFixed(2) }))
      .filter(it => it.qty > 0 && it.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);
  } catch (e) {
    console.error('Failed to parse XLS:', e.message);
    return [];
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Now update the JSON
const dashboard = JSON.parse(fs.readFileSync(DASHBOARD_PATH, 'utf8'));

// Update businessDay and lastUpdated
dashboard.businessDay = TODAY;
const now = new Date();
const cdtOptions = { timeZone: 'America/Chicago', month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true };
const cdtStr = now.toLocaleString('en-US', cdtOptions).replace(',', '');
dashboard.lastUpdated = cdtStr + ' CDT';

// Update disputesScannedAt
dashboard.disputesScannedAt = now.toISOString();

// Ensure history array exists
if (!dashboard.history) dashboard.history = [];

// Find and update yesterday's entry
const yesterdayItems = parseItems('/tmp/items_yesterday.xls');
console.log(`Parsed ${yesterdayItems.length} items for yesterday`);

const yIdx = dashboard.history.findIndex(e => e.date === YESTERDAY);
if (yIdx >= 0) {
  const existing = dashboard.history[yIdx];
  const newEntry = {
    ...existing,
    ...yesterdayData,
    cardBreakdown: yesterdayCardBreakdown,
  };
  for (const key of ['grossSales', 'netSales', 'taxes', 'cashPayments', 'creditCard']) {
    if ((existing[key] || 0) > (newEntry[key] || 0)) {
      newEntry[key] = existing[key];
    }
  }
  dashboard.history[yIdx] = newEntry;
  console.log(`Updated yesterday (${YESTERDAY}) entry`);
} else {
  dashboard.history.push({ ...yesterdayData, cardBreakdown: yesterdayCardBreakdown });
  console.log(`Added new yesterday (${YESTERDAY}) entry`);
}

// Find and update today's entry
const tIdx = dashboard.history.findIndex(e => e.date === TODAY);
if (tIdx >= 0) {
  const existing = dashboard.history[tIdx];
  const newEntry = { ...existing, ...todayData };
  for (const key of ['grossSales', 'netSales', 'taxes', 'cashPayments', 'creditCard']) {
    if ((existing[key] || 0) > (newEntry[key] || 0)) {
      newEntry[key] = existing[key];
    }
  }
  dashboard.history[tIdx] = newEntry;
  console.log(`Updated today (${TODAY}) entry`);
} else {
  dashboard.history.push({ ...todayData });
  console.log(`Added new today (${TODAY}) entry`);
}

// Sort history by date
dashboard.history.sort((a, b) => a.date.localeCompare(b.date));

// Update itemsByDay for yesterday
if (!dashboard.itemsByDay) dashboard.itemsByDay = [];
const yItemIdx = dashboard.itemsByDay.findIndex(e => e.date === YESTERDAY);
if (yesterdayItems.length > 0) {
  if (yItemIdx >= 0) {
    dashboard.itemsByDay[yItemIdx] = { date: YESTERDAY, items: yesterdayItems };
  } else {
    dashboard.itemsByDay.push({ date: YESTERDAY, items: yesterdayItems });
  }
  console.log(`Stored ${yesterdayItems.length} items for yesterday`);
}

// Save
fs.writeFileSync(DASHBOARD_PATH, JSON.stringify(dashboard, null, 2));
console.log('dashboard.json updated successfully');

// Verify
const verify = JSON.parse(fs.readFileSync(DASHBOARD_PATH, 'utf8'));
const yEntry = verify.history.find(e => e.date === YESTERDAY);
const tEntry = verify.history.find(e => e.date === TODAY);
console.log('Verification:');
console.log('  Yesterday:', JSON.stringify({ date: yEntry?.date, grossSales: yEntry?.grossSales, netSales: yEntry?.netSales, voids: yEntry?.voids }));
console.log('  Today:', JSON.stringify({ date: tEntry?.date, grossSales: tEntry?.grossSales }));
console.log('  businessDay:', verify.businessDay);
console.log('  lastUpdated:', verify.lastUpdated);
