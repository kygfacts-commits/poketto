// Poketto - Liabilities (hutang & cicilan) CRUD helpers
// Diimpor sebagai ES module dari pages/liabilities.html

import { supabase } from './supabase-client.js';

export const LIABILITY_TYPES = [
  { value: 'hutang', label: 'Hutang' },
  { value: 'cicilan', label: 'Cicilan' },
  { value: 'kartu_kredit', label: 'Kartu Kredit' },
  { value: 'kpr', label: 'KPR' },
  { value: 'lainnya', label: 'Lainnya' },
];

export function getLiabilityTypeLabel(type) {
  return LIABILITY_TYPES.find((t) => t.value === type)?.label || 'Lainnya';
}

export async function fetchLiabilities(userId) {
  const { data, error } = await supabase
    .from('liabilities')
    .select('*')
    .eq('user_id', userId)
    .order('name', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createLiability(payload) {
  const { data, error } = await supabase.from('liabilities').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateLiability(id, payload) {
  const { data, error } = await supabase.from('liabilities').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteLiability(id) {
  const { error } = await supabase.from('liabilities').delete().eq('id', id);
  if (error) throw error;
}
