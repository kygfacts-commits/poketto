// Poketto - Category helpers
// Diimpor sebagai ES module dari pages/add.html dan pages/home.html

import { supabase } from './supabase-client.js';

export async function fetchCategories(type) {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('type', type)
    .order('name', { ascending: true });

  if (error) throw error;
  return data;
}

// Warna kategori memakai nama warna Tailwind standar (pink, amber, teal, dll)
// plus 'lavender' (warna kustom Poketto) untuk beberapa kategori.
export function getCategoryColorClasses(color) {
  if (color === 'lavender') {
    return { bg: 'bg-lavender-light/50', icon: 'text-lavender-dark' };
  }
  return { bg: `bg-${color}-100`, icon: `text-${color}-500` };
}

// Dipakai untuk transaksi transfer, yang tidak punya category_id.
export const TRANSFER_COLOR_CLASSES = { bg: 'bg-sky-light/60', icon: 'text-sky-600' };
