// Poketto - Subcategories helpers
import { supabase } from './supabase-client.js';

export async function fetchSubcategories(userId, categoryId = null) {
  let query = supabase
    .from('subcategories')
    .select('*')
    .eq('user_id', userId);
  if (categoryId) query = query.eq('category_id', categoryId);
  const { data, error } = await query.order('name', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createSubcategory({ userId, categoryId, name }) {
  const { data, error } = await supabase
    .from('subcategories')
    .insert({ user_id: userId, category_id: categoryId, name })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSubcategory(id) {
  const { error } = await supabase.from('subcategories').delete().eq('id', id);
  if (error) throw error;
}
