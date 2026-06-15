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
