// Poketto - Transaction CRUD helpers
// Diimpor sebagai ES module dari pages/add.html

import { supabase } from './supabase-client.js';

export async function fetchTransactionById(id, userId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createTransaction(payload) {
  const { data, error } = await supabase.from('transactions').insert(payload).select().single();
  if (error) throw error;
  return data;
}

// Insert beberapa baris sekaligus (dipakai untuk double-entry transfer).
export async function createTransactions(rows) {
  const { data, error } = await supabase.from('transactions').insert(rows).select();
  if (error) throw error;
  return data;
}

export async function updateTransaction(id, payload) {
  const { data, error } = await supabase.from('transactions').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
