import { supabase } from './supabase-client.js';

export async function updateTransaction(id, payload) {
  const { data, error } = await supabase.from('transactions').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
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
