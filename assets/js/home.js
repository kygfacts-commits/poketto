// Poketto - Home page data helpers
// Diimpor sebagai ES module dari pages/home.html

import { supabase } from './supabase-client.js';

export async function fetchAllTransactions(userId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (error) throw error;
  return data;
}

export async function fetchProfileCurrency(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('currency_preference')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data?.currency_preference || 'IDR';
}

export async function deleteTransaction(id) {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

// Hapus kedua baris transfer yang berbagi transfer_pair_id sekaligus.
export async function deleteTransactionByPair(pairId) {
  const { error } = await supabase.from('transactions').delete().eq('transfer_pair_id', pairId);
  if (error) throw error;
}

export async function fetchLiabilitiesTotal(userId) {
  const { data, error } = await supabase
    .from('liabilities')
    .select('remaining_amount')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).reduce((sum, l) => sum + Number(l.remaining_amount || 0), 0);
}

export async function fetchDailyLimit(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('daily_limit')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return Number(data?.daily_limit || 0);
}
