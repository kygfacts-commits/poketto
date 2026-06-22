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

// ── Portfolio transactions (buy/sell/dividend) ───────────────────────────────
export async function fetchPortfolioTransactions(userId) {
  const { data, error } = await supabase
    .from('portfolio_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data;
}

// CATATAN: sejak REVOKE INSERT/UPDATE/DELETE pada portfolio_transactions,
// INSERT langsung via PostgREST DITOLAK. Fungsi ini sekarang HANYA wrapper
// tipis ke RPC atomic add_portfolio_transaction (validasi oversell + re-sync
// holding.quantity/avg_buy_price di server, dalam satu transaksi).
// payload: { holding_id, type, quantity, price, fee, tax, date, notes }.
// JANGAN kirim user_id — dipaksa = auth.uid() di dalam RPC.
// Return: { ok, transaction, holding: { quantity, avg_buy_price } }.
export async function createPortfolioTransaction(payload) {
  const { data, error } = await supabase.rpc('add_portfolio_transaction', { payload });
  if (error) throw error;
  return data;
}

// CATATAN: wrapper tipis ke RPC atomic delete_portfolio_transaction (validasi
// invariant ledger + re-sync holding di server). DELETE langsung via PostgREST
// sudah di-REVOKE. Return: { ok, deleted_id, holding: { quantity, avg_buy_price } }.
export async function deletePortfolioTransaction(id) {
  const { data, error } = await supabase.rpc('delete_portfolio_transaction', { transaction_id: id });
  if (error) throw error;
  return data;
}

// Hitung PnL untuk satu holding berdasarkan daftar portfolio_transactions miliknya.
// avg buy = sum(qty*price + fee + tax) / sum(qty) dari transaksi 'buy'.
// quantity saat ini = total qty beli - total qty jual (jika ada transaksi beli).
export function computeHoldingPnL(holding, ptxList) {
  const buys = ptxList.filter((t) => t.type === 'buy');
  const sells = ptxList.filter((t) => t.type === 'sell');
  const divs = ptxList.filter((t) => t.type === 'dividend');

  const buyQty = buys.reduce((s, t) => s + Number(t.quantity || 0), 0);
  const buyCost = buys.reduce((s, t) => s + (Number(t.quantity || 0) * Number(t.price || 0) + Number(t.fee || 0) + Number(t.tax || 0)), 0);
  const sellQty = sells.reduce((s, t) => s + Number(t.quantity || 0), 0);

  const hasBuys = buys.length > 0;
  const avgBuy = hasBuys && buyQty > 0 ? buyCost / buyQty : Number(holding.avg_buy_price || 0);
  const qty = hasBuys ? Math.max(0, buyQty - sellQty) : Number(holding.quantity || 0);

  const currentPrice = Number(holding.current_price || avgBuy || holding.avg_buy_price || 0);
  const invested = avgBuy * qty;
  const value = currentPrice * qty;
  const unrealized = value - invested;
  const unrealizedPct = invested > 0 ? (unrealized / invested) * 100 : 0;

  const realized = sells.reduce(
    (s, t) => s + ((Number(t.price || 0) - avgBuy) * Number(t.quantity || 0) - Number(t.fee || 0) - Number(t.tax || 0)),
    0
  );
  const dividend = divs.reduce((s, t) => s + (Number(t.price || 0) - Number(t.fee || 0) - Number(t.tax || 0)), 0);

  return { avgBuy, qty, value, invested, unrealized, unrealizedPct, realized, dividend };
}
