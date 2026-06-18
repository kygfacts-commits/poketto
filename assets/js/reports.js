// Poketto - Reports helper functions (pure, no Supabase)

export function buildMonthlyStats(transactions, start, end) {
  // Exclude transfer (transfer_type !== null) dari perhitungan cashflow.
  const txs = transactions.filter((tx) => tx.date >= start && tx.date <= end && !tx.transfer_type);
  const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expense = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  return { income, expense, diff: income - expense };
}

export function buildTopCategories(transactions, categoriesById, start, end, n = 5) {
  const txs = transactions.filter((tx) => tx.date >= start && tx.date <= end && tx.type === 'expense' && !tx.transfer_type);
  const totals = new Map();
  for (const tx of txs) {
    totals.set(tx.category_id, (totals.get(tx.category_id) || 0) + Number(tx.amount));
  }
  const totalExpense = [...totals.values()].reduce((s, v) => s + v, 0);
  return [...totals.entries()]
    .map(([id, amount]) => {
      const cat = categoriesById.get(id);
      return { id, name: cat?.name || 'Lainnya', icon: cat?.icon || 'circle', color: cat?.color || 'slate', amount };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n)
    .map((c) => ({ ...c, pct: totalExpense > 0 ? (c.amount / totalExpense) * 100 : 0 }));
}

export function buildBudgetSummary(budgets, transactions, start, end) {
  const totalLimit = budgets.reduce((s, b) => s + Number(b.limit_amount), 0);
  const budgetCatIds = new Set(budgets.map((b) => b.category_id));
  const totalUsed = transactions
    .filter((tx) => tx.date >= start && tx.date <= end && tx.type === 'expense' && !tx.transfer_type && budgetCatIds.has(tx.category_id))
    .reduce((s, tx) => s + Number(tx.amount), 0);
  const remaining = totalLimit - totalUsed;
  const pctRemaining = totalLimit > 0 ? Math.max(0, (remaining / totalLimit) * 100) : 0;
  return { totalLimit, totalUsed, remaining, pctRemaining };
}
