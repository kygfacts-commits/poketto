// Poketto - Budget CRUD helpers
// Diimpor sebagai ES module dari pages/budget.html

import { supabase } from './supabase-client.js';

export async function fetchBudgets(userId, monthStart) {
  const { data, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('user_id', userId)
    .eq('month', monthStart);

  if (error) throw error;
  return data;
}

export async function fetchExpensesForMonth(userId, start, end) {
  const { data, error } = await supabase
    .from('transactions')
    .select('category_id, amount')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .is('transfer_type', null) // exclude transfer dari kalkulasi budget
    .gte('date', start)
    .lte('date', end);

  if (error) throw error;
  return data;
}

// Rentang bulan (start/end) untuk bulan SEBELUM monthStart ('YYYY-MM-01').
export function getPrevMonthRange(monthStart) {
  const [y, m] = monthStart.split('-').map(Number);
  const prev = new Date(y, m - 2, 1); // m-1 = bulan ini (0-index), m-2 = bulan lalu
  const startD = new Date(prev.getFullYear(), prev.getMonth(), 1);
  const endD = new Date(prev.getFullYear(), prev.getMonth() + 1, 0);
  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: iso(startD), end: iso(endD) };
}

export async function createBudget(payload) {
  const { data, error } = await supabase.from('budgets').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateBudget(id, payload) {
  const { data, error } = await supabase.from('budgets').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteBudget(id) {
  const { error } = await supabase.from('budgets').delete().eq('id', id);
  if (error) throw error;
}

// Warna progress bar: lavender <70%, peach 70-99%, merah >=100% (over budget)
export function getBudgetBarColor(percent) {
  if (percent >= 100) return 'bg-red-500';
  if (percent >= 70) return 'bg-peach';
  return 'bg-lavender';
}
