import { supabase } from './supabase-client.js';

export async function fetchBills(userId) {
  const { data, error } = await supabase
    .from('scheduled_bills')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createBill(payload) {
  const { data, error } = await supabase.from('scheduled_bills').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateBill(id, payload) {
  const { data, error } = await supabase.from('scheduled_bills').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteBill(id) {
  const { error } = await supabase.from('scheduled_bills').delete().eq('id', id);
  if (error) throw error;
}
