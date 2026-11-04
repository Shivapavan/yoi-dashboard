import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const r2 = v => Math.round((v || 0) * 100) / 100;
const higher = (stored, live) => (live > stored ? live : stored);

const DASHBOARD_PATH = './data/dashboard.json';
const dashboard = JSON.parse(readFileSync(DASHBOARD_PATH, 'utf8'));

const metricsData = {
  '2026-11-02': {
    grossSales: 469.86, netSales: 434.06, taxes: 35.80, discounts: 13.00,
    voids: 0, cashPayments: 0, creditCard: 102.61, openTickets: 469.86,
    doordash: 0, stOnline: 0, uberEats: 0,
  },
  '2026-11-03': {
    grossSales: 857.95, netSales: 792.56, taxes: 65.39, discounts: 0.56,
    voids: 0, cashPayments: 14.90, creditCard: 399.27, openTickets: 857.95,
    doordash: 0, stOnline: 0, uberEats: 0,
  },
  '2026-11-04': {
    grossSales: 0, netSales: 0, taxes: 0, discounts: 0,
    voids: 0, cashPayments: 0, creditCard: 0, openTickets: 0,
    doordash: 0, stOnline: 0, uberEats: 0,
  },
};

const cardBreakdownNov3 = {
  totalSales: 486.88, visa: 294.69, mastercard: 87.61,
  amex: 92.26, discover: 12.32, debit: 0, ebt: 0, returns: 0,
};

function parseItems(date) {
  try {
    const workbook = XLSX.readFile('/tmp/items_' + date + '.xls');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i]?.some(c => /^item$/i.test(String(c || '')))) { headerIdx = i; break; }
    }
    if (headerIdx === -1) return [];
    const headers = rows[headerIdx].map(h => String(h || '').trim());
    const nameIdx = headers.findIndex(h => /^item$/i.test(h));
    const qtyIdx = headers.findIndex(h => /^qty$/i.test(h));
    const revIdx = (() => {
      const g = headers.findIndex(h => /gross\s*sales/i.test(h));
      return g !== -1 ? g : headers.findIndex(h => /^(net\s*sales|sales|revenue|amount|total)$/i.test(h));
    })();
    const items = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row?.[nameIdx]) continue;
      const name = String(row[nameIdx]).trim();
      const qty = parseFloat(row[qtyIdx]) || 0;
      const rev = parseFloat(row[revIdx]) || 0;
      if (!name || name.toLowerCase().startsWith('total') || qty === 0 || rev === 0) continue;
      items.push({ name, qty, revenue: r2(rev) });
    }
    items.sort((a, b) => b.revenue - a.revenue);
    return items;
  } catch (e) {
    console.error('Warning: Could not parse items for ' + date + ':', e.message);
    return [];
  }
}

function updateHistory(date, liveMetrics, cardBreakdown) {
  const existing = dashboard.history.find(e => e.date === date);
  if (existing) {
    if (liveMetrics.grossSales > (existing.grossSales || 0)) {
      console.log('Updating ' + date + ': stored=' + existing.grossSales + ', live=' + liveMetrics.grossSales);
      existing.grossSales = r2(higher(existing.grossSales || 0, liveMetrics.grossSales));
      existing.netSales = r2(higher(existing.netSales || 0, liveMetrics.netSales));
      existing.taxes = r2(higher(existing.taxes || 0, liveMetrics.taxes));
      existing.discounts = r2(liveMetrics.discounts);
      existing.voids = r2(liveMetrics.voids);
      existing.cashPayments = r2(liveMetrics.cashPayments);
      existing.creditCard = r2(liveMetrics.creditCard);
      existing.openTickets = r2(liveMetrics.openTickets);
      existing.doordash = existing.doordash || 0;
      existing.stOnline = existing.stOnline || 0;
      existing.uberEats = existing.uberEats || 0;
    } else {
      console.log('Keeping ' + date + ': stored=' + existing.grossSales);
    }
    if (cardBreakdown) { existing.cardBreakdown = cardBreakdown; console.log('Updated cardBreakdown for ' + date); }
  } else {
    console.log('Adding new entry for ' + date);
    const entry = { date };
    for (const [k, v] of Object.entries(liveMetrics)) entry[k] = r2(v);
    if (cardBreakdown) entry.cardBreakdown = cardBreakdown;
    const idx = dashboard.history.findIndex(e => e.date > date);
    idx === -1 ? dashboard.history.push(entry) : dashboard.history.splice(idx, 0, entry);
  }
}

function updateItemsByDay(date, items) {
  if (!items?.length) { console.log('No items for ' + date); return; }
  if (!dashboard.itemsByDay) dashboard.itemsByDay = [];
  const existing = dashboard.itemsByDay.find(e => e.date === date);
  if (existing) {
    console.log('Updating itemsByDay ' + date + ': ' + items.length + ' items');
    existing.items = items;
  } else {
    console.log('Adding itemsByDay ' + date + ': ' + items.length + ' items');
    const idx = dashboard.itemsByDay.findIndex(e => e.date > date);
    idx === -1 ? dashboard.itemsByDay.push({ date, items }) : dashboard.itemsByDay.splice(idx, 0, { date, items });
  }
}

const items02 = parseItems('2026-11-02');
const items03 = parseItems('2026-11-03');
console.log('Items: Nov2=' + items02.length + ', Nov3=' + items03.length);

updateHistory('2026-11-02', metricsData['2026-11-02'], null);
updateHistory('2026-11-03', metricsData['2026-11-03'], cardBreakdownNov3);
updateHistory('2026-11-04', metricsData['2026-11-04'], null);
updateItemsByDay('2026-11-02', items02);
updateItemsByDay('2026-11-03', items03);

const now = new Date().toISOString();
dashboard.businessDay = '2026-11-04';
dashboard.lastUpdated = now;
dashboard.disputesScannedAt = now;

writeFileSync(DASHBOARD_PATH, JSON.stringify(dashboard, null, 2));
console.log('Done! businessDay=' + dashboard.businessDay + ', history=' + dashboard.history.length + ', items=' + dashboard.itemsByDay?.length);
