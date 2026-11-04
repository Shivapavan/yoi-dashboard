import XLSX from 'xlsx';

const dateArg = process.argv[2];
const filePath = `/tmp/items_${dateArg}.xls`;

const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

// Find header row
let headerIdx = -1;
for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  if (row && row.some(cell => String(cell || '').toLowerCase().includes('item'))) {
    headerIdx = i;
    break;
  }
}

if (headerIdx === -1) {
  // Print first 10 rows for debugging
  console.error('Could not find header row. First 10 rows:');
  rows.slice(0, 10).forEach((r, i) => console.error(`Row ${i}:`, JSON.stringify(r)));
  process.exit(1);
}

const headers = rows[headerIdx].map(h => String(h || '').trim());
console.error('Headers:', headers);

const nameIdx = headers.findIndex(h => /^item$/i.test(h));
const qtyIdx = headers.findIndex(h => /^qty$/i.test(h));
// Prefer "Gross Sales" over generic revenue match
const revIdx = (() => {
  const grossIdx = headers.findIndex(h => /gross\s*sales/i.test(h));
  if (grossIdx !== -1) return grossIdx;
  return headers.findIndex(h => /^(net\s*sales|sales|revenue|amount|total)$/i.test(h));
})();

console.error(`Name col: ${nameIdx}, Qty col: ${qtyIdx}, Rev col: ${revIdx}`);

const items = [];
for (let i = headerIdx + 1; i < rows.length; i++) {
  const row = rows[i];
  if (!row || !row[nameIdx]) continue;

  const name = String(row[nameIdx] || '').trim();
  const qty = parseFloat(row[qtyIdx]) || 0;
  const rev = parseFloat(row[revIdx]) || 0;

  // Skip totals/empty rows
  if (!name || name.toLowerCase().startsWith('total') || qty === 0 || rev === 0) continue;

  items.push({ name, qty, revenue: Math.round(rev * 100) / 100 });
}

// Sort by revenue desc
items.sort((a, b) => b.revenue - a.revenue);
console.log(JSON.stringify(items));
