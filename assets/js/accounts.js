// Poketto - Account CRUD helpers
// Diimpor sebagai ES module dari pages/accounts.html

import { supabase } from './supabase-client.js';

export const ACCOUNT_TYPES = [
  { value: 'cash', label: 'Cash', icons: ['wallet', 'banknote', 'coins'] },
  { value: 'bank', label: 'Bank', icons: ['landmark', 'building-2', 'credit-card'] },
  { value: 'ewallet', label: 'E-Wallet', icons: ['smartphone', 'qr-code', 'wallet-cards'] },
  { value: 'investment', label: 'Investasi', icons: ['trending-up', 'piggy-bank', 'line-chart'] },
  { value: 'other', label: 'Lainnya', icons: ['circle-dollar-sign', 'package', 'archive'] },
];

// HINDARI emerald/green sebagai default warna akun.
export const ACCOUNT_COLORS = ['lavender', 'peach', 'sky', 'mint', 'rose', 'amber'];

export const ACCOUNT_COLOR_CLASSES = {
  lavender: { bg: 'bg-lavender-light/50', icon: 'text-lavender-dark', swatch: 'bg-lavender' },
  peach: { bg: 'bg-peach-light/60', icon: 'text-orange-500', swatch: 'bg-peach' },
  sky: { bg: 'bg-sky-light/60', icon: 'text-sky-600', swatch: 'bg-sky' },
  mint: { bg: 'bg-mint-light/60', icon: 'text-emerald-600', swatch: 'bg-mint' },
  rose: { bg: 'bg-rose-100', icon: 'text-rose-500', swatch: 'bg-rose-400' },
  amber: { bg: 'bg-amber-100', icon: 'text-amber-500', swatch: 'bg-amber-400' },
};

export function getAccountTypeLabel(type) {
  return ACCOUNT_TYPES.find((t) => t.value === type)?.label || 'Lainnya';
}

export function getAccountTypeIcons(type) {
  return ACCOUNT_TYPES.find((t) => t.value === type)?.icons || ACCOUNT_TYPES[0].icons;
}

export async function fetchAccounts(userId) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

export async function fetchTransactionsForAccounts(userId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('account_id, to_account_id, amount, type')
    .eq('user_id', userId);

  if (error) throw error;
  return data;
}

export async function createAccount(payload) {
  const { data, error } = await supabase.from('accounts').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateAccount(id, payload) {
  const { data, error } = await supabase.from('accounts').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function archiveAccount(id) {
  const { error } = await supabase.from('accounts').update({ is_archived: true }).eq('id', id);
  if (error) throw error;
}
