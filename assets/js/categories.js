// Poketto - Category helpers
import { supabase } from './supabase-client.js';

export async function fetchCategories(type, userId = null, includeInactive = false) {
  let query = supabase.from('categories').select('*').eq('type', type);
  if (userId) {
    query = query.or(`user_id.is.null,user_id.eq.${userId}`);
  }
  if (!includeInactive) {
    query = query.filter('is_active', 'neq', false);
  }
  const { data, error } = await query.order('name', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createCategory({ name, type, icon, color, userId }) {
  const { data, error } = await supabase
    .from('categories')
    .insert({ name, type, icon, color, user_id: userId, is_active: true })
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

export async function updateCategoryColor(id, color) {
  const { error } = await supabase.rpc('update_seed_category_color', {
    category_id: id,
    new_color: color
  });
  if (error) {
    console.error('[updateCategoryColor] RPC error:', JSON.stringify(error));
    throw error;
  }
  return { id, color };
}

export async function setCategoryActive(id, isActive) {
  const { data, error } = await supabase
    .from('categories')
    .update({ is_active: isActive })
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('[setCategoryActive] Supabase error:', JSON.stringify(error));
    throw error;
  }
  return data;
}

export async function deleteCategory(id) {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

export function getCategoryColorClasses(color) {
  if (color === 'lavender') {
    return { bg: 'bg-lavender-light/50', icon: 'text-lavender-dark' };
  }
  return { bg: `bg-${color}-100`, icon: `text-${color}-500` };
}

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
  { label: 'Makanan & Minuman', icons: ['utensils','coffee','pizza','wine','beer','cake','sandwich','milk','carrot','cookie'] },
  { label: 'Belanja', icons: ['shopping-bag','shopping-cart','package','gift','tag','store','shirt','gem','watch','barcode'] },
  { label: 'Hiburan', icons: ['gamepad-2','tv','music','film','mic','headphones','camera','ticket','popcorn','radio'] },
  { label: 'Transportasi', icons: ['car','bus','train','plane','bike','ship','fuel','map-pin','truck','navigation'] },
  { label: 'Kesehatan', icons: ['heart-pulse','pill','stethoscope','activity','dumbbell','brain','eye','thermometer','baby','apple'] },
  { label: 'Pendidikan', icons: ['graduation-cap','book-open','pencil','calculator','microscope','globe','library','pen','ruler','school'] },
  { label: 'Perjalanan', icons: ['map','compass','tent','backpack','luggage','mountain','sun','umbrella','anchor','flag'] },
  { label: 'Olahraga', icons: ['trophy','target','medal','dumbbell','bike','timer','zap','shield','flame','wind'] },
  { label: 'Keuangan', icons: ['wallet','credit-card','banknote','trending-up','trending-down','piggy-bank','landmark','coins','bar-chart-2','receipt'] },
  { label: 'Perawatan Diri', icons: ['sparkles','scissors','heart','smile','star','moon','flower-2','droplets','feather','sun'] },
  { label: 'Rumah & Kehidupan', icons: ['home','sofa','bed','lamp','wrench','hammer','plug','wifi','key','door-open'] },
  { label: 'Pekerjaan', icons: ['briefcase','laptop','printer','phone','mail','calendar','clock','folder','send','file-text'] },
  { label: 'Festival', icons: ['party-popper','cake','gift','star','sparkles','music','bell','heart','flag','sun'] },
  { label: 'Lainnya', icons: ['circle','square','triangle','minus','plus','hash','at-sign','bookmark','flag','more-horizontal'] },
];
