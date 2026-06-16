// Poketto - Category helpers
// Diimpor sebagai ES module dari pages/add.html, pages/home.html, pages/categories.html

import { supabase } from './supabase-client.js';

export async function fetchCategories(type, userId = null) {
  let query = supabase.from('categories').select('*').eq('type', type);
  if (userId) {
    query = query.or(`user_id.is.null,user_id.eq.${userId}`);
  }
  const { data, error } = await query.order('name', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createCategory({ name, type, icon, color, userId }) {
  const { data, error } = await supabase
    .from('categories')
    .insert({ name, type, icon, color, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCategory(id, { name, icon, color }) {
  const { data, error } = await supabase
    .from('categories')
    .update({ name, icon, color })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCategory(id) {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
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

export const CATEGORY_COLORS = [
  { hex: '#8B5CF6', name: 'lavender' },
  { hex: '#FB923C', name: 'orange' },
  { hex: '#38BDF8', name: 'sky' },
  { hex: '#34D399', name: 'emerald' },
  { hex: '#FB7185', name: 'rose' },
  { hex: '#FBBF24', name: 'amber' },
  { hex: '#6366F1', name: 'indigo' },
  { hex: '#14B8A6', name: 'teal' },
  { hex: '#06B6D4', name: 'cyan' },
  { hex: '#A855F7', name: 'purple' },
  { hex: '#EC4899', name: 'pink' },
  { hex: '#64748B', name: 'slate' },
];

export const ICON_GROUPS = [
  { label: 'Makanan', icons: ['utensils', 'coffee', 'pizza', 'cake', 'apple', 'cookie', 'wine', 'sandwich'] },
  { label: 'Transportasi', icons: ['car', 'bus', 'plane', 'train', 'bike', 'fuel', 'map-pin', 'navigation'] },
  { label: 'Belanja', icons: ['shopping-bag', 'gift', 'tag', 'scissors', 'sparkles', 'package', 'shopping-cart', 'star'] },
  { label: 'Hiburan', icons: ['film', 'music', 'gamepad-2', 'tv', 'ticket', 'camera', 'headphones', 'mic'] },
  { label: 'Kesehatan', icons: ['heart-pulse', 'stethoscope', 'pill', 'activity', 'thermometer', 'baby', 'dumbbell', 'cross'] },
  { label: 'Pendidikan', icons: ['book-open', 'graduation-cap', 'pencil', 'library', 'brain', 'telescope', 'school', 'pen'] },
  { label: 'Keuangan', icons: ['wallet', 'credit-card', 'landmark', 'banknote', 'coins', 'trending-up', 'bar-chart-2', 'receipt'] },
  { label: 'Rumah', icons: ['home', 'sofa', 'lamp', 'bed', 'tool', 'hammer', 'door-open', 'armchair'] },
  { label: 'Utilitas', icons: ['zap', 'wifi', 'droplets', 'flame', 'trash-2', 'phone', 'laptop', 'monitor'] },
  { label: 'Sosial', icons: ['users', 'heart-handshake', 'party-popper', 'handshake', 'user', 'share-2', 'message-circle', 'bell'] },
  { label: 'Perjalanan', icons: ['globe', 'compass', 'suitcase', 'map', 'tent', 'mountain', 'sunrise', 'anchor'] },
  { label: 'Bisnis', icons: ['briefcase', 'building', 'file-text', 'calendar', 'clock', 'mail', 'send', 'folder'] },
  { label: 'Alam', icons: ['leaf', 'flower-2', 'sun', 'cloud', 'snowflake', 'tree-pine', 'rainbow', 'wind'] },
  { label: 'Lainnya', icons: ['circle', 'square', 'star', 'diamond', 'hexagon', 'infinity', 'bookmark', 'flag'] },
];
