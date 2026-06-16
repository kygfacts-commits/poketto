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
