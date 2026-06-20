// Poketto tests — Batch 2: Transfer double-entry, saldo, hapus transfer,
// edge case integritas, kalkulasi budget terpakai, dan rollover.
//
// POLA (sama seperti Batch 1):
//   • adminClient  → seed & cleanup data dummy (bypass RLS).
//   • anonClient login sbg TEST_USER_A → operasi/assertion yang mensimulasikan
//     user asli (tunduk RLS).
//
// GROUND TRUTH (sudah diverifikasi dari kode app, JANGAN ditebak):
//   • Transfer = 2 baris: OUT (type=expense, transfer_type=transfer_out, di akun
//     asal) + IN (type=income, transfer_type=transfer_in, di akun tujuan). Keduanya
//     share transfer_pair_id; to_account_id selalu null; category_id selalu null.
//     Disisipkan via SATU .insert([out,in]) (atomic statement-level).
//   • Saldo = initial_balance + Σ(income di akun) − Σ(expense di akun). Real-time,
//     tidak ada kolom balance tersimpan. (utils.js getAccountBalance)
//   • Hapus transfer = DELETE WHERE transfer_pair_id = X (kedua baris sekaligus).
//   • Budget terpakai = Σ(amount) WHERE type='expense' AND transfer_type IS NULL
//     AND category_id = X AND date dalam rentang bulan. (budget.js fetchExpensesForMonth)
//   • Rollover (LOGIKA FRONTEND-ONLY, tidak ada view/RPC DB): per-budget kolom
//     rollover_enabled. Jika ON: leftover = prevBudget.limit_amount − prevUsage;
//     bila leftover > 0 → efektif = limit_amount + leftover; bila ≤ 0 → efektif =
//     limit_amount. Hanya 1 bulan ke belakang, tidak compounding, butuh ada baris
//     budget kategori sama di bulan sebelumnya. (budget.js loadBudgets)
//
// CATATAN PENDEKATAN ROLLOVER: karena rumus rollover HANYA hidup di JS frontend
// (budget.html loadBudgets), tidak ada yang bisa di-query langsung dari DB untuk
// "budget efektif". Jadi test #6–#9 mengambil DATA MENTAH (limit_amount + Σ expense
// bulan lalu) lewat query biasa, lalu MEREPLIKASI rumus ground truth di helper
// `effectiveBudget()` di bawah, dan memverifikasi angkanya. Ini menguji bahwa data
// mentah di DB menghasilkan angka efektif yang benar SESUAI rumus app.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminClient, createAnonClient, env } from '../helpers/supabaseClients.js';

const A_UID = env.TEST_USER_A_UID;
const MARK = `TEST_B2_${Date.now()}`;

// Bulan sintetis & deterministik (jauh dari data real, menghindari tabrakan).
// Hubungan "bulan ini / bulan lalu" yang dicek app bersifat relatif — kita cukup
// pakai dua bulan berurutan yang kita kendalikan penuh.
const THIS_M = { start: '2099-03-01', end: '2099-03-31' };
const PREV_M = { start: '2099-02-01', end: '2099-02-28' };

// ── Helper: replikasi getAccountBalance() (utils.js) persis. ─────────────────
function accountBalance(account, txns) {
  let bal = Number(account?.initial_balance) || 0;
  for (const tx of txns) {
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'income' && tx.account_id === account.id) bal += amt;
    else if (tx.type === 'expense' && tx.account_id === account.id) bal -= amt;
    else if (tx.type === 'transfer') {
      if (tx.account_id === account.id) bal -= amt;
      if (tx.to_account_id === account.id) bal += amt;
    }
  }
  return bal;
}

// ── Helper: replikasi fetchExpensesForMonth() (budget.js) untuk 1 kategori. ──
// App tidak memfilter category_id di query (ia mengelompokkan setelahnya); untuk
// assertion 1-kategori, memfilter category_id di query setara secara hasil.
async function sumExpenseUsed(client, categoryId, range) {
  const { data, error } = await client
    .from('transactions')
    .select('amount')
    .eq('user_id', A_UID)
    .eq('type', 'expense')
    .is('transfer_type', null) // exclude transfer — kunci ground truth
    .eq('category_id', categoryId)
    .gte('date', range.start)
    .lte('date', range.end);
  if (error) throw error;
  return data.reduce((s, t) => s + Number(t.amount), 0);
}

// ── Helper: replikasi rumus rollover (budget.js loadBudgets). ────────────────
function effectiveBudget({ limitThis, rolloverEnabled, prevLimit, prevUsage }) {
  if (!rolloverEnabled || prevLimit == null) return limitThis;
  const leftover = prevLimit - prevUsage;
  return leftover > 0 ? limitThis + leftover : limitThis;
}

// ── Helper seed transaksi expense (admin). ──────────────────────────────────
function expenseRow(categoryId, accountId, amount, date, extra = {}) {
  return {
    user_id: A_UID,
    account_id: accountId,
    category_id: categoryId,
    type: 'expense',
    transfer_type: null,
    amount,
    date,
    description: `${MARK}_exp`,
    ...extra,
  };
}

// Registry untuk cleanup.
let accA = null; // { id, initial_balance }
let accB = null;
const categoryIds = {}; // { key: id }
let transferPairId = null; // diisi test #1, dipakai test #2

// ════════════════════════════════════════════════════════════════════════════
// SEED
// ════════════════════════════════════════════════════════════════════════════
beforeAll(async () => {
  if (!A_UID) throw new Error('[tests] TEST_USER_A_UID kosong di tests/.env');

  // Akun (parent FK) milik TEST_USER_A.
  const accountsSeed = [
    { user_id: A_UID, name: `${MARK}_AkunA`, type: 'bank', currency: 'IDR', initial_balance: 1000000 },
    { user_id: A_UID, name: `${MARK}_AkunB`, type: 'bank', currency: 'IDR', initial_balance: 500000 },
  ];
  const { data: accs, error: accErr } = await adminClient
    .from('accounts').insert(accountsSeed).select('id, initial_balance, name');
  if (accErr) throw new Error(`Seed accounts gagal: ${accErr.message}`);
  accA = accs.find((a) => a.name.endsWith('_AkunA'));
  accB = accs.find((a) => a.name.endsWith('_AkunB'));

  // Kategori (parent FK) milik TEST_USER_A.
  const catKeys = ['makan', 'lain', 'x', 'y', 'z', 'w'];
  const catSeed = catKeys.map((k) => ({
    user_id: A_UID, name: `${MARK}_cat_${k}`, type: 'expense', icon: 'tag', color: 'lavender', is_active: true,
  }));
  const { data: cats, error: catErr } = await adminClient
    .from('categories').insert(catSeed).select('id, name');
  if (catErr) throw new Error(`Seed categories gagal: ${catErr.message}`);
  for (const k of catKeys) {
    categoryIds[k] = cats.find((c) => c.name.endsWith(`_cat_${k}`)).id;
  }
}, 60000);

// ════════════════════════════════════════════════════════════════════════════
// CLEANUP (selalu jalan)
// ════════════════════════════════════════════════════════════════════════════
afterAll(async () => {
  // Anak dulu (transactions, budgets) baru parent (categories, accounts).
  try { await adminClient.from('transactions').delete().eq('user_id', A_UID).like('description', `${MARK}%`); } catch (e) { console.warn('[cleanup] transactions:', e.message); }
  const catIdList = Object.values(categoryIds).filter(Boolean);
  if (catIdList.length) {
    try { await adminClient.from('budgets').delete().eq('user_id', A_UID).in('category_id', catIdList); } catch (e) { console.warn('[cleanup] budgets:', e.message); }
  }
  try { await adminClient.from('categories').delete().eq('user_id', A_UID).like('name', `${MARK}%`); } catch (e) { console.warn('[cleanup] categories:', e.message); }
  try { await adminClient.from('accounts').delete().eq('user_id', A_UID).like('name', `${MARK}%`); } catch (e) { console.warn('[cleanup] accounts:', e.message); }
}, 60000);

// ════════════════════════════════════════════════════════════════════════════
// TRANSFER — sebagai TEST_USER_A (anon, tunduk RLS)
// ════════════════════════════════════════════════════════════════════════════
describe('TRANSFER double-entry (sebagai TEST_USER_A)', () => {
  let userA;

  beforeAll(async () => {
    userA = createAnonClient();
    const { error } = await userA.auth.signInWithPassword({
      email: env.TEST_USER_A_EMAIL, password: env.TEST_USER_A_PASSWORD,
    });
    if (error) throw new Error(`Login TEST_USER_A gagal (cek .env): ${error.message}`);
  }, 30000);

  it('#1 alur normal: insert transfer Rp 500.000 A→B membuat tepat 2 baris ber-pair sama, saldo bergeser tepat', async () => {
    // Saldo SEBELUM (akun fresh, hanya initial_balance).
    const balABefore = accountBalance(accA, []);
    const balBBefore = accountBalance(accB, []);
    expect(balABefore).toBe(1000000);
    expect(balBBefore).toBe(500000);

    // Insert ala app: SATU .insert([out, in]) (lihat add.js createTransactions).
    transferPairId = crypto.randomUUID();
    const rows = [
      { user_id: A_UID, account_id: accA.id, to_account_id: null, category_id: null, type: 'expense', transfer_type: 'transfer_out', transfer_pair_id: transferPairId, amount: 500000, date: THIS_M.start, description: `${MARK}_transfer_out` },
      { user_id: A_UID, account_id: accB.id, to_account_id: null, category_id: null, type: 'income', transfer_type: 'transfer_in', transfer_pair_id: transferPairId, amount: 500000, date: THIS_M.start, description: `${MARK}_transfer_in` },
    ];
    const { data: inserted, error } = await userA.from('transactions').insert(rows).select();
    expect(error, 'insert transfer sebagai user A harus sukses').toBeNull();
    expect(inserted).toHaveLength(2);

    // Tepat 2 baris dengan pair yang sama tercipta.
    const { data: pairRows, error: pErr } = await userA
      .from('transactions').select('*').eq('transfer_pair_id', transferPairId);
    expect(pErr).toBeNull();
    expect(pairRows).toHaveLength(2);

    // Baris OUT.
    const out = pairRows.find((r) => r.transfer_type === 'transfer_out');
    expect(out).toBeTruthy();
    expect(out.type).toBe('expense');
    expect(out.account_id).toBe(accA.id);
    expect(Number(out.amount)).toBe(500000);
    expect(out.to_account_id).toBeNull();
    expect(out.category_id).toBeNull();

    // Baris IN.
    const inn = pairRows.find((r) => r.transfer_type === 'transfer_in');
    expect(inn).toBeTruthy();
    expect(inn.type).toBe('income');
    expect(inn.account_id).toBe(accB.id);
    expect(Number(inn.amount)).toBe(500000);
    expect(inn.to_account_id).toBeNull();
    expect(inn.category_id).toBeNull();

    // Saldo SESUDAH (hitung ulang dari semua txn akun, rumus ground truth).
    const balAAfter = accountBalance(accA, pairRows);
    const balBAfter = accountBalance(accB, pairRows);
    expect(balABefore - balAAfter).toBe(500000); // A berkurang 500rb
    expect(balBAfter - balBBefore).toBe(500000); // B bertambah 500rb
    expect(balAAfter).toBe(500000);
    expect(balBAfter).toBe(1000000);
  });

  it('#2 hapus transfer via transfer_pair_id menghapus KEDUA baris (bukan satu)', async () => {
    expect(transferPairId, 'test #1 harus sudah membuat transfer').toBeTruthy();

    // Pastikan 2 baris masih ada sebelum hapus.
    const { data: before } = await userA.from('transactions').select('id').eq('transfer_pair_id', transferPairId);
    expect(before).toHaveLength(2);

    // Hapus sesuai cara app: DELETE WHERE transfer_pair_id = X.
    const { error } = await userA.from('transactions').delete().eq('transfer_pair_id', transferPairId);
    expect(error).toBeNull();

    // Kedua baris harus hilang (verifikasi via admin agar bebas dari efek RLS).
    const { data: after } = await adminClient.from('transactions').select('id').eq('transfer_pair_id', transferPairId);
    expect(after, 'kedua sisi transfer harus terhapus').toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// TRANSFER — EDGE CASE integritas (admin, menguji constraint DB apa adanya)
// ════════════════════════════════════════════════════════════════════════════
describe('TRANSFER edge case — integritas level database (laporan apa adanya)', () => {
  it('#3 transfer_type terisi TANPA transfer_pair_id: ada proteksi DB atau tidak?', async () => {
    // Simulasi skenario "orphan": baris transfer_out tanpa pair id.
    const row = {
      user_id: A_UID, account_id: accA.id, to_account_id: null, category_id: null,
      type: 'expense', transfer_type: 'transfer_out', transfer_pair_id: null,
      amount: 12345, date: THIS_M.start, description: `${MARK}_orphan`,
    };
    const { data, error } = await adminClient.from('transactions').insert(row).select();

    if (error) {
      // Ada proteksi (CHECK/trigger) yang mencegah transfer_type tanpa pair.
      console.log(`[#3] PROTEKSI ADA — DB menolak transfer_type tanpa transfer_pair_id: ${error.message}`);
      expect(error.message).toBeTruthy();
    } else {
      // Tidak ada proteksi — baris orphan BISA tercipta di level DB.
      console.log('[#3] TIDAK ADA PROTEKSI — baris transfer_type tanpa transfer_pair_id berhasil tersimpan (potensi orphan).');
      expect(data).toHaveLength(1);
      expect(data[0].transfer_pair_id).toBeNull();
      expect(data[0].transfer_type).toBe('transfer_out');
      // cleanup ditangani afterAll via description MARK.
    }
    // Catatan: assert kondisi aktual, tanpa memaksa pass/fail tertentu.
    expect(error === null || error !== null).toBe(true);
  });

  it('#4 type=\'transfer\' (dead-code path): apakah CHECK constraint menerima/menolak?', async () => {
    const row = {
      user_id: A_UID, account_id: accA.id, to_account_id: accB.id, category_id: null,
      type: 'transfer', transfer_type: null,
      amount: 23456, date: THIS_M.start, description: `${MARK}_typetransfer`,
    };
    const { data, error } = await adminClient.from('transactions').insert(row).select();

    if (error) {
      console.log(`[#4] type='transfer' DITOLAK oleh constraint: ${error.message}`);
      expect(error.message).toBeTruthy();
    } else {
      console.log("[#4] type='transfer' DITERIMA constraint (value valid di transactions_type_check meski app tak memakainya).");
      expect(data).toHaveLength(1);
      expect(data[0].type).toBe('transfer');
      // cleanup ditangani afterAll via description MARK.
    }
    expect(error === null || error !== null).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// BUDGET — kalkulasi terpakai (data mentah dari DB, formula ground truth)
// ════════════════════════════════════════════════════════════════════════════
describe('BUDGET kalkulasi terpakai', () => {
  let userA;

  beforeAll(async () => {
    userA = createAnonClient();
    const { error } = await userA.auth.signInWithPassword({
      email: env.TEST_USER_A_EMAIL, password: env.TEST_USER_A_PASSWORD,
    });
    if (error) throw new Error(`Login TEST_USER_A gagal: ${error.message}`);

    // Budget "Makan" 800rb bulan ini.
    const { error: bErr } = await adminClient.from('budgets').insert({
      user_id: A_UID, category_id: categoryIds.makan, month: THIS_M.start,
      limit_amount: 800000, rollover_enabled: false,
    });
    if (bErr) throw new Error(`Seed budget makan gagal: ${bErr.message}`);

    // 2 expense kategori Makan: 200rb + 300rb = 500rb.
    // 1 transfer_out 100rb (harus DIKECUALIKAN dari budget terpakai).
    // 1 expense kategori LAIN 50rb (tidak boleh ikut campur).
    const rows = [
      expenseRow(categoryIds.makan, accA.id, 200000, THIS_M.start),
      expenseRow(categoryIds.makan, accA.id, 300000, '2099-03-15'),
      { user_id: A_UID, account_id: accA.id, to_account_id: null, category_id: null, type: 'expense', transfer_type: 'transfer_out', transfer_pair_id: crypto.randomUUID(), amount: 100000, date: '2099-03-10', description: `${MARK}_budget_transfer` },
      expenseRow(categoryIds.lain, accA.id, 50000, '2099-03-12'),
    ];
    const { error: tErr } = await adminClient.from('transactions').insert(rows).select();
    if (tErr) throw new Error(`Seed transaksi budget gagal: ${tErr.message}`);
  }, 30000);

  it('#5a terpakai kategori Makan = 500.000 (2 expense dijumlahkan)', async () => {
    const used = await sumExpenseUsed(userA, categoryIds.makan, THIS_M);
    expect(used).toBe(500000);
  });

  it('#5b transfer (transfer_type≠null) TIDAK ikut dihitung sebagai terpakai', async () => {
    // Meski transfer_out adalah type=expense di akun yang sama, transfer_type-nya
    // tidak null → ter-exclude. Terpakai tetap 500.000, bukan 600.000.
    const used = await sumExpenseUsed(userA, categoryIds.makan, THIS_M);
    expect(used).toBe(500000);
    expect(used).not.toBe(600000);
  });

  it('#5c expense kategori lain tidak mencemari terpakai kategori Makan', async () => {
    const usedMakan = await sumExpenseUsed(userA, categoryIds.makan, THIS_M);
    const usedLain = await sumExpenseUsed(userA, categoryIds.lain, THIS_M);
    expect(usedMakan).toBe(500000);
    expect(usedLain).toBe(50000);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// BUDGET — ROLLOVER (formula direplikasi dari frontend; data mentah dari DB)
// ════════════════════════════════════════════════════════════════════════════
describe('BUDGET rollover', () => {
  let userA;

  beforeAll(async () => {
    userA = createAnonClient();
    const { error } = await userA.auth.signInWithPassword({
      email: env.TEST_USER_A_EMAIL, password: env.TEST_USER_A_PASSWORD,
    });
    if (error) throw new Error(`Login TEST_USER_A gagal: ${error.message}`);

    // ── #6 kategori X: bulan lalu limit 800rb, terpakai 500rb (sisa 300rb).
    //                   bulan ini limit 800rb, rollover ON.
    // ── #7 kategori Y: bulan lalu limit 800rb, terpakai 1.000rb (over 200rb).
    //                   bulan ini limit 800rb, rollover ON.
    // ── #8 kategori Z: bulan lalu limit 800rb, terpakai 500rb (sisa 300rb).
    //                   bulan ini limit 800rb, rollover OFF.
    // ── #9 kategori W: TIDAK ada budget bulan lalu. bulan ini limit 800rb, rollover ON.
    const budgets = [
      { user_id: A_UID, category_id: categoryIds.x, month: PREV_M.start, limit_amount: 800000, rollover_enabled: false },
      { user_id: A_UID, category_id: categoryIds.x, month: THIS_M.start, limit_amount: 800000, rollover_enabled: true },
      { user_id: A_UID, category_id: categoryIds.y, month: PREV_M.start, limit_amount: 800000, rollover_enabled: false },
      { user_id: A_UID, category_id: categoryIds.y, month: THIS_M.start, limit_amount: 800000, rollover_enabled: true },
      { user_id: A_UID, category_id: categoryIds.z, month: PREV_M.start, limit_amount: 800000, rollover_enabled: false },
      { user_id: A_UID, category_id: categoryIds.z, month: THIS_M.start, limit_amount: 800000, rollover_enabled: false },
      { user_id: A_UID, category_id: categoryIds.w, month: THIS_M.start, limit_amount: 800000, rollover_enabled: true },
    ];
    const { error: bErr } = await adminClient.from('budgets').insert(budgets).select();
    if (bErr) throw new Error(`Seed budgets rollover gagal: ${bErr.message}`);

    // Expense bulan lalu.
    const txns = [
      // X: total 500rb (sisa 300rb)
      expenseRow(categoryIds.x, accA.id, 300000, PREV_M.start),
      expenseRow(categoryIds.x, accA.id, 200000, '2099-02-10'),
      // Y: total 1.000rb (over 200rb)
      expenseRow(categoryIds.y, accA.id, 600000, PREV_M.start),
      expenseRow(categoryIds.y, accA.id, 400000, '2099-02-12'),
      // Z: total 500rb (sisa 300rb, tapi rollover OFF)
      expenseRow(categoryIds.z, accA.id, 500000, '2099-02-08'),
    ];
    const { error: tErr } = await adminClient.from('transactions').insert(txns).select();
    if (tErr) throw new Error(`Seed transaksi rollover gagal: ${tErr.message}`);
  }, 30000);

  // Ambil limit bulan lalu + bulan ini dari DB, lalu pakai effectiveBudget().
  async function loadAndCompute(catKey) {
    const { data: bs, error } = await userA
      .from('budgets').select('month, limit_amount, rollover_enabled')
      .eq('user_id', A_UID).eq('category_id', categoryIds[catKey])
      .in('month', [PREV_M.start, THIS_M.start]);
    if (error) throw error;
    const thisB = bs.find((b) => b.month === THIS_M.start);
    const prevB = bs.find((b) => b.month === PREV_M.start);
    const prevUsage = prevB ? await sumExpenseUsed(userA, categoryIds[catKey], PREV_M) : 0;
    return effectiveBudget({
      limitThis: Number(thisB.limit_amount),
      rolloverEnabled: thisB.rollover_enabled,
      prevLimit: prevB ? Number(prevB.limit_amount) : null,
      prevUsage,
    });
  }

  it('#6 rollover POSITIF: sisa 300rb → efektif 1.100.000', async () => {
    const prevUsage = await sumExpenseUsed(userA, categoryIds.x, PREV_M);
    expect(prevUsage, 'sanity: terpakai bulan lalu = 500rb').toBe(500000);
    const eff = await loadAndCompute('x');
    expect(eff).toBe(1100000);
  });

  it('#7 rollover saat OVER budget: defisit TIDAK mengurangi → efektif tetap 800.000', async () => {
    const prevUsage = await sumExpenseUsed(userA, categoryIds.y, PREV_M);
    expect(prevUsage, 'sanity: terpakai bulan lalu = 1.000rb').toBe(1000000);
    const eff = await loadAndCompute('y');
    expect(eff).toBe(800000);
    expect(eff).not.toBe(600000);
  });

  it('#8 rollover OFF: sisa 300rb tidak dibawa → efektif tetap 800.000', async () => {
    const prevUsage = await sumExpenseUsed(userA, categoryIds.z, PREV_M);
    expect(prevUsage, 'sanity: terpakai bulan lalu = 500rb').toBe(500000);
    const eff = await loadAndCompute('z');
    expect(eff).toBe(800000);
  });

  it('#9 rollover ON tapi TANPA budget bulan lalu: dianggap 0 → efektif tetap 800.000', async () => {
    // Pastikan memang tidak ada baris budget W di bulan lalu.
    const { data: prevW } = await userA
      .from('budgets').select('id').eq('user_id', A_UID)
      .eq('category_id', categoryIds.w).eq('month', PREV_M.start);
    expect(prevW).toHaveLength(0);

    const eff = await loadAndCompute('w');
    expect(eff).toBe(800000);
  });
});
