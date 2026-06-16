import { supabase } from './supabase-client.js';

export async function fetchHoldings(userId) {
  const { data, error } = await supabase
    .from('portfolio_holdings')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createHolding(payload) {
  const { data, error } = await supabase.from('portfolio_holdings').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateHolding(id, payload) {
  const { data, error } = await supabase.from('portfolio_holdings').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteHolding(id) {
  const { error } = await supabase.from('portfolio_holdings').delete().eq('id', id);
  if (error) throw error;
}
