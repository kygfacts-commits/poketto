// Poketto - Smart Categorization
// Auto-suggest kategori dari deskripsi transaksi berdasarkan riwayat user sendiri.
// Tanpa AI eksternal — murni keyword matching dari data transactions yang sudah ada.
// Diimpor sebagai ES module dari pages/add.html.

import { supabase } from './supabase-client.js';

// Kata-kata umum yang tidak signifikan untuk pencocokan kategori.
const STOPWORDS = ['di', 'ke', 'dari', 'yang', 'untuk', 'dan', 'beli', 'bayar',
                   'buat', 'sama', 'aja', 'nih', 'itu', 'ini'];

export function extractKeywords(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.includes(word));
}

// Mengembalikan { categoryId, confidence, score } atau null bila tidak ada kecocokan.
// type = 'income' | 'expense'
export async function getSuggestedCategory(description, userId, type) {
  const queryKeywords = extractKeywords(description);
  if (queryKeywords.length === 0) return null;

  // Ambil maksimal 100 transaksi terakhir dengan tipe sama & deskripsi terisi.
  const { data, error } = await supabase
    .from('transactions')
    .select('category_id, description')
    .eq('user_id', userId)
    .eq('type', type)
    .not('description', 'is', null)
    .not('category_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  if (!data || data.length === 0) return null;

  const querySet = new Set(queryKeywords);

  // Skor per kategori = jumlah transaksi lama yang punya ≥1 kata signifikan cocok.
  const scoreByCategory = new Map();
  let totalMatches = 0;

  for (const tx of data) {
    if (!tx.category_id || !tx.description) continue;
    const words = extractKeywords(tx.description);
    const hasMatch = words.some((w) => querySet.has(w));
    if (!hasMatch) continue;
    totalMatches += 1;
    scoreByCategory.set(tx.category_id, (scoreByCategory.get(tx.category_id) || 0) + 1);
  }

  if (totalMatches === 0) return null;

  // Pilih kategori dengan skor tertinggi.
  let bestId = null, bestScore = 0;
  for (const [categoryId, score] of scoreByCategory) {
    if (score > bestScore) { bestScore = score; bestId = categoryId; }
  }

  if (!bestId) return null;

  return {
    categoryId: bestId,
    score: bestScore,
    confidence: bestScore / totalMatches, // 0..1
  };
}
