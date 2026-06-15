import { supabase } from './supabase-client.js';

export async function fetchGoals(userId) {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createGoal(payload) {
  const { data, error } = await supabase.from('goals').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateGoal(id, payload) {
  const { data, error } = await supabase.from('goals').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteGoal(id) {
  const { error } = await supabase.from('goals').delete().eq('id', id);
  if (error) throw error;
}
