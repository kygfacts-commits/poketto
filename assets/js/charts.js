// Poketto - Charts helper functions (pure, no Supabase)

export const RANGE_PRESETS = [
  { value: '7d', label: '7H' },
  { value: '1m', label: '1B' },
  { value: '3m', label: '3B' },
  { value: '6m', label: '6B' },
  { value: '1y', label: '1T' },
];

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getPresetRange(preset) {
  const end = new Date();
  const start = new Date();
  if (preset === '7d') start.setDate(start.getDate() - 6);
  else if (preset === '1m') start.setMonth(start.getMonth() - 1);
  else if (preset === '3m') start.setMonth(start.getMonth() - 3);
  else if (preset === '6m') start.setMonth(start.getMonth() - 6);
  else if (preset === '1y') start.setFullYear(start.getFullYear() - 1);
  return { start: toISODate(start), end: toISODate(end) };
}

export function buildDailySeries(transactions, start, end) {
  const days = [];
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  let cursor = new Date(sy, sm - 1, sd);
  const endDate = new Date(ey, em - 1, ed);
  while (cursor <= endDate) {
    days.push(toISODate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const incomeMap = new Map();
  const expenseMap = new Map();
  for (const tx of transactions) {
    if (tx.transfer_type) continue; // exclude transfer dari cashflow
    if (tx.type === 'income') incomeMap.set(tx.date, (incomeMap.get(tx.date) || 0) + Number(tx.amount));
    else if (tx.type === 'expense') expenseMap.set(tx.date, (expenseMap.get(tx.date) || 0) + Number(tx.amount));
  }

  return {
    labels: days.map((d) => {
      const [y, m, day] = d.split('-').map(Number);
      return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(new Date(y, m - 1, day));
    }),
    income: days.map((d) => incomeMap.get(d) || 0),
    expense: days.map((d) => expenseMap.get(d) || 0),
  };
}

// Tailwind color name -> hex pastel (~300 shade)
const COLOR_HEX = {
  slate: '#cbd5e1', gray: '#d1d5db', zinc: '#d4d4d8', neutral: '#d4d4d4', stone: '#d6d3d1',
  red: '#fca5a5', orange: '#fdba74', amber: '#fcd34d', yellow: '#fde047', lime: '#bef264',
  green: '#86efac', emerald: '#6ee7b7', teal: '#5eead4', cyan: '#67e8f9', sky: '#7dd3fc',
  blue: '#93c5fd', indigo: '#a5b4fc', violet: '#c4b5fd', purple: '#d8b4fe', fuchsia: '#f0abfc',
  pink: '#f9a8d4', rose: '#fda4af', lavender: '#A78BFA',
};

export function getCategoryHexColor(color) {
  return COLOR_HEX[color] || '#d1d5db';
}

export function buildCategoryBreakdown(transactions, categoriesById) {
  const totals = new Map();
  for (const tx of transactions) {
    if (tx.type !== 'expense' || tx.transfer_type) continue; // exclude transfer
    totals.set(tx.category_id, (totals.get(tx.category_id) || 0) + Number(tx.amount));
  }
  return [...totals.entries()]
    .map(([id, total]) => {
      const cat = categoriesById.get(id);
      return { name: cat?.name || 'Lainnya', hex: getCategoryHexColor(cat?.color), total };
    })
    .sort((a, b) => b.total - a.total);
}
