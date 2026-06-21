// Poketto tests — Batch 5: RPC restore_backup(payload jsonb) — ATOMIC RESTORE.
//
// POLA (sama Batch 1–4):
//   • adminClient → seed & cleanup (bypass RLS, tapi CHECK/FK/generated TETAP berlaku).
//   • anonClient login sbg TEST_USER_A → MEMANGGIL RPC sebagai user asli (SECURITY
//     INVOKER → RLS berlaku, auth.uid() = TEST_USER_A). Persis seperti app memanggilnya.
//   • Verifikasi state DB nyata sebagian besar via adminClient (lepas dari RLS) supaya
//     kita melihat APA YANG BENAR-BENAR tersimpan, bukan sekadar yang terlihat oleh RLS.
//
// GROUND TRUTH RPC (dari fungsi yang sudah terdaftar — JANGAN ditebak ulang):
//   • Dipanggil: client.rpc('restore_backup', { payload })
//       payload = { categories:[...], accounts:[...], ... } (subset 10 tabel RESTORE_ORDER).
//   • SECURITY INVOKER; RLS aktif.
//   • user_id tiap baris DIPAKSA = auth.uid() (isi 'user_id' dari payload diabaikan).
//   • ATOMIC: gagal 1 tabel → SELURUH transaksi rollback (tidak ada yang tersimpan).
//   • ON CONFLICT (id) DO UPDATE ... WHERE t.user_id = auth.uid() (anti-collision lintas user).
//   • Kolom generated (portfolio_transactions.total) dikecualikan otomatis → dihitung DB.
//   • Sukses → { ok:true, user_id, restored:{ <tabel>: <jumlah>, ... } }.
//   • Gagal  → error: message "Restore gagal di tabel X: ..." + DETAIL tabel/kolom/constraint.
//
// FOKUS KRITIS: #2 (atomicity — kebalikan dari Batch 4 #3 yang membuktikan versi LAMA
// non-atomic) dan #4 (anti-collision lintas user). Lihat catatan #4 soal interaksi
// RLS + ON CONFLICT.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { adminClient, createAnonClient, env } from '../helpers/supabaseClients.js';

const A_UID = env.TEST_USER_A_UID;
const OTHER_UID = env.DEMO_USER_UID; // user LAIN (untuk test #4 collision); boleh kosong → #4 skip
const MARK = `TEST_B5_${Date.now()}`;

// ── Registry id untuk cleanup (anak → induk) ─────────────────────────────────
const created = {
  portfolio_transactions: [],
  portfolio_holdings: [],
  accounts: [],
  categories: [],
  goals: [],
};
let collisionAccountId = null; // row milik OTHER_UID yang sengaja dibuat di #4

function track(table, id) { created[table].push(id); return id; }

// Helper pemanggil RPC — satu pintu, biar konsisten.
async function rpcRestore(client, payload) {
  return client.rpc('restore_backup', { payload });
}

// ════════════════════════════════════════════════════════════════════════════
// CLEANUP (selalu jalan; bersihkan SEMUA termasuk row milik user lain dari #4)
// ════════════════════════════════════════════════════════════════════════════
afterAll(async () => {
  const delByIds = async (table, ids) => {
    if (!ids.length) return;
    try { await adminClient.from(table).delete().in('id', ids); }
    catch (e) { console.warn(`[cleanup] ${table} by id: ${e.message}`); }
  };
  // Urutan FK-safe: anak dulu.
  await delByIds('portfolio_transactions', created.portfolio_transactions);
  await delByIds('portfolio_holdings', created.portfolio_holdings);
  await delByIds('goals', created.goals);
  await delByIds('accounts', created.accounts);
  await delByIds('categories', created.categories);

  // Row collision milik OTHER_UID (#4) — WAJIB dibersihkan via admin (RLS tak izinkan A).
  if (collisionAccountId) {
    try { await adminClient.from('accounts').delete().eq('id', collisionAccountId); }
    catch (e) { console.warn(`[cleanup] collision account: ${e.message}`); }
  }

  // Jaring pengaman: sapu sisa bertanda MARK milik TEST_USER_A, via kolom teks yang
  // tepat per tabel (anak → induk). Hanya cadangan; pembersihan utama by-id di atas.
  const markCol = {
    portfolio_transactions: 'notes',
    portfolio_holdings: 'asset_name',
    goals: 'name',
    accounts: 'name',
    categories: 'name',
  };
  for (const [t, col] of Object.entries(markCol)) {
    try { await adminClient.from(t).delete().eq('user_id', A_UID).like(col, `${MARK}%`); }
    catch (e) { console.warn(`[cleanup] sweep ${t}.${col}: ${e.message}`); }
  }
}, 60000);

// ════════════════════════════════════════════════════════════════════════════
describe('RPC restore_backup — atomic, aman, sesuai ground truth', () => {
  let userA;

  beforeAll(async () => {
    if (!A_UID) throw new Error('[tests] TEST_USER_A_UID kosong di tests/.env');
    userA = createAnonClient();
    const { error } = await userA.auth.signInWithPassword({
      email: env.TEST_USER_A_EMAIL,
      password: env.TEST_USER_A_PASSWORD,
    });
    if (error) throw new Error(`Login TEST_USER_A gagal: ${error.message}`);
  }, 30000);

  // ──────────────────────────────────────────────────────────────────────────
  // #1 RESTORE SUKSES NORMAL
  // ──────────────────────────────────────────────────────────────────────────
  it('#1 sukses normal: categories + accounts tersimpan, restored melaporkan jumlah benar', async () => {
    const catId = track('categories', randomUUID());
    const accId = track('accounts', randomUUID());

    const payload = {
      categories: [{ id: catId, user_id: A_UID, name: `${MARK}_Kat1`, type: 'expense', icon: 'tag', color: 'sky', is_active: true }],
      accounts: [{ id: accId, user_id: A_UID, name: `${MARK}_Akun1`, type: 'bank', currency: 'IDR', initial_balance: 250000 }],
    };

    const { data, error } = await rpcRestore(userA, payload);
    expect(error, `RPC harus sukses: ${error?.message}`).toBeNull();
    expect(data?.ok).toBe(true);
    expect(data?.user_id).toBe(A_UID);
    expect(data?.restored?.categories).toBe(1);
    expect(data?.restored?.accounts).toBe(1);

    // Verifikasi data BENAR-BENAR ada di DB (via admin, lepas dari RLS).
    const { data: cat } = await adminClient.from('categories').select('id, name').eq('id', catId).maybeSingle();
    const { data: acc } = await adminClient.from('accounts').select('id, initial_balance').eq('id', accId).maybeSingle();
    expect(cat?.name).toBe(`${MARK}_Kat1`);
    expect(Number(acc?.initial_balance)).toBe(250000);
    console.log('[#1] Sukses normal: restored =', JSON.stringify(data.restored));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // #2 ATOMICITY — PALING KRITIS (kebalikan Batch 4 #3)
  //    categories(ok) + accounts(ok) + goals(target_amount=-100 → GAGAL CHECK).
  //    Versi LAMA (Batch 4 #3): categories+accounts TETAP tersimpan (non-atomic).
  //    Versi RPC: SEMUA harus rollback → categories+accounts TIDAK tersimpan.
  // ──────────────────────────────────────────────────────────────────────────
  it('#2 ATOMIC: goals gagal → categories & accounts ikut ROLLBACK (nol data tersimpan)', async () => {
    const catId = track('categories', randomUUID());
    const accId = track('accounts', randomUUID());
    const goalId = track('goals', randomUUID());

    const payload = {
      categories: [{ id: catId, user_id: A_UID, name: `${MARK}_KatAtomic`, type: 'expense', icon: 'tag', color: 'sky', is_active: true }],
      accounts: [{ id: accId, user_id: A_UID, name: `${MARK}_AkunAtomic`, type: 'bank', currency: 'IDR', initial_balance: 500000 }],
      goals: [{ id: goalId, user_id: A_UID, name: `${MARK}_GoalBuruk`, icon: 'target', target_amount: -100, current_amount: 0, is_completed: false }],
    };

    const { data, error } = await rpcRestore(userA, payload);

    // (a) RPC MENGEMBALIKAN ERROR (bukan sukses), dan menyebut tabel goals.
    expect(data, 'tidak boleh ada data sukses saat goals melanggar CHECK').toBeNull();
    expect(error, 'RPC harus error karena goals.target_amount=-100').not.toBeNull();
    expect(error.message).toMatch(/Restore gagal di tabel goals/i);
    console.log(`[#2] RPC error (sesuai harapan): ${error.message}`);

    // (b) PEMBUKTIAN ATOMIC: categories & accounts (yang di-proses SEBELUM goals)
    //     TIDAK tersimpan sama sekali — kebalikan total dari Batch 4 #3.
    const { data: cat } = await adminClient.from('categories').select('id').eq('id', catId).maybeSingle();
    const { data: acc } = await adminClient.from('accounts').select('id').eq('id', accId).maybeSingle();
    const { data: goal } = await adminClient.from('goals').select('id').eq('id', goalId).maybeSingle();
    expect(cat, 'categories HARUS ikut ter-rollback (beda dari versi lama non-atomic)').toBeNull();
    expect(acc, 'accounts HARUS ikut ter-rollback (beda dari versi lama non-atomic)').toBeNull();
    expect(goal, 'goal buruk jelas tidak tersimpan').toBeNull();
    console.log('[#2] DIBUKTIKAN ATOMIC: nol baris tertulis (categories+accounts ikut rollback). Non-atomic Batch 4 #3 TERSELESAIKAN.');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // #3 USER_ID DIPAKSA = auth.uid() (replikasi Batch 4 #5 untuk RPC)
  //    Payload membawa user_id user LAIN/acak → harus ditimpa jadi TEST_USER_A.
  // ──────────────────────────────────────────────────────────────────────────
  it('#3 user_id dipaksa: payload ber-user_id asing → tersimpan sebagai TEST_USER_A', async () => {
    const accId = track('accounts', randomUUID());
    const FOREIGN_UID = OTHER_UID || randomUUID(); // nilai apa pun; akan ditimpa server.

    const payload = {
      accounts: [{ id: accId, user_id: FOREIGN_UID, name: `${MARK}_AkunForcedUid`, type: 'bank', currency: 'IDR', initial_balance: 123000 }],
    };
    expect(FOREIGN_UID).not.toBe(A_UID);

    const { data, error } = await rpcRestore(userA, payload);
    expect(error, `RPC harus sukses: ${error?.message}`).toBeNull();
    expect(data?.restored?.accounts).toBe(1);

    // Verifikasi via admin: user_id baris = A_UID (dipaksa), BUKAN FOREIGN_UID.
    const { data: acc } = await adminClient.from('accounts').select('id, user_id').eq('id', accId).maybeSingle();
    expect(acc?.user_id, 'user_id wajib dipaksa ke pemanggil (auth.uid())').toBe(A_UID);
    expect(acc?.user_id).not.toBe(FOREIGN_UID);
    console.log('[#3] user_id payload diabaikan; baris tersimpan milik TEST_USER_A.');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // #4 ANTI-COLLISION ID LINTAS USER (test baru)
  //    Seed 1 account milik OTHER_UID (via admin). Lalu A me-restore account ber-id
  //    SAMA dgn data berbeda. Invarian keamanan yang WAJIB benar di kedua kemungkinan
  //    perilaku (lihat catatan): baris milik user lain TIDAK berubah/tertimpa.
  //
  //    CATATAN interaksi RLS + ON CONFLICT: dgn RLS aktif, baris konflik milik user lain
  //    "tak terlihat" oleh A. Tergantung semantik PostgreSQL, hasilnya bisa:
  //      (i) no-op aman (WHERE t.user_id=auth.uid() → tak meng-update), ATAU
  //      (ii) unique-violation aman (RLS menyembunyikan baris → konflik muncul sbg error).
  //    KEDUANYA AMAN: tidak ada overwrite, tidak ada kebocoran isi baris user lain, dan
  //    (untuk ii) seluruh transaksi rollback. Test meng-assert invarian itu & MENCATAT
  //    jalur mana yang terjadi — bukan memaksa satu mekanisme.
  // ──────────────────────────────────────────────────────────────────────────
  it('#4 collision lintas user: baris milik user lain TIDAK tertimpa & tidak bocor', async () => {
    if (!OTHER_UID) {
      console.warn('[#4] DILEWATI: DEMO_USER_UID kosong di tests/.env (butuh user kedua).');
      return;
    }

    collisionAccountId = randomUUID();
    const ORIGINAL_NAME = `${MARK}_MILIK_USER_LAIN`;
    const ORIGINAL_BAL = 4242000;

    // Seed via admin sbg milik OTHER_UID (bypass RLS).
    const { error: seedErr } = await adminClient.from('accounts').insert({
      id: collisionAccountId, user_id: OTHER_UID, name: ORIGINAL_NAME,
      type: 'bank', currency: 'IDR', initial_balance: ORIGINAL_BAL,
    }).select();
    expect(seedErr, `seed account milik user lain: ${seedErr?.message}`).toBeNull();

    // A mencoba "restore" baris ber-id SAMA dengan data berbeda.
    const payload = {
      accounts: [{ id: collisionAccountId, user_id: A_UID, name: `${MARK}_SERANGAN_TIMPA`, type: 'cash', currency: 'USD', initial_balance: 1 }],
    };
    const { data, error } = await rpcRestore(userA, payload);

    // INVARIAN UTAMA (HARD): baris milik user lain TETAP utuh — nama & saldo asli.
    const { data: row } = await adminClient.from('accounts')
      .select('user_id, name, initial_balance, type, currency').eq('id', collisionAccountId).maybeSingle();
    expect(row, 'baris milik user lain harus masih ada').not.toBeNull();
    expect(row.user_id, 'kepemilikan tidak boleh berpindah ke A').toBe(OTHER_UID);
    expect(row.name, 'nama tidak boleh tertimpa').toBe(ORIGINAL_NAME);
    expect(Number(row.initial_balance), 'saldo tidak boleh tertimpa').toBe(ORIGINAL_BAL);
    expect(row.type).toBe('bank');
    expect(row.currency).toBe('IDR');

    // Tidak ada kebocoran ISI baris user lain di pesan error (kalau pun ada error).
    if (error) {
      expect(error.message, 'pesan error tidak boleh membocorkan data baris user lain')
        .not.toContain(ORIGINAL_NAME);
      console.log(`[#4] Jalur AMAN-ERROR (RLS+ON CONFLICT): ${error.message} — baris user lain tetap utuh.`);
    } else {
      console.log('[#4] Jalur AMAN-NOOP:', JSON.stringify(data?.restored), '— baris user lain tetap utuh.');
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // #5 KOLOM GENERATED DIABAIKAN DENGAN AMAN (portfolio_transactions.total)
  //    Kirim total=999999999 (salah). DB harus menghitung quantity*price+fee+tax.
  // ──────────────────────────────────────────────────────────────────────────
  it('#5 generated column: field total sembarangan diabaikan, DB hitung sendiri', async () => {
    const accId = track('accounts', randomUUID());
    const holdingId = track('portfolio_holdings', randomUUID());
    const ptxId = track('portfolio_transactions', randomUUID());

    const QTY = 10, PRICE = 1000, FEE = 50, TAX = 25;
    const EXPECTED_TOTAL = QTY * PRICE + FEE + TAX; // 10075
    const BOGUS_TOTAL = 999999999;

    // Satu RPC: accounts → portfolio_holdings → portfolio_transactions (urut FK aman).
    const payload = {
      accounts: [{ id: accId, user_id: A_UID, name: `${MARK}_AkunInvest`, type: 'investment', currency: 'IDR', initial_balance: 0 }],
      portfolio_holdings: [{ id: holdingId, user_id: A_UID, account_id: accId, asset_type: 'saham', asset_name: `${MARK}_BBCA`, quantity: 1, avg_buy_price: 1, currency: 'IDR' }],
      portfolio_transactions: [{
        id: ptxId, user_id: A_UID, holding_id: holdingId, type: 'buy',
        quantity: QTY, price: PRICE, fee: FEE, tax: TAX, date: '2099-05-01',
        notes: `${MARK}_ptx`, total: BOGUS_TOTAL, // ← nilai SALAH yang harus diabaikan
      }],
    };

    const { data, error } = await rpcRestore(userA, payload);
    expect(error, `RPC harus sukses (generated column diabaikan, bukan error): ${error?.message}`).toBeNull();
    expect(data?.restored?.portfolio_transactions).toBe(1);

    // Verifikasi total = hasil hitung DB, BUKAN 999999999.
    const { data: ptx } = await adminClient.from('portfolio_transactions')
      .select('id, total, quantity, price, fee, tax').eq('id', ptxId).maybeSingle();
    expect(ptx, 'ptx harus tersimpan').not.toBeNull();
    expect(Number(ptx.total), 'total harus dihitung DB (qty*price+fee+tax)').toBe(EXPECTED_TOTAL);
    expect(Number(ptx.total), 'total TIDAK boleh = nilai bogus dari payload').not.toBe(BOGUS_TOTAL);
    console.log(`[#5] total tersimpan = ${ptx.total} (= ${EXPECTED_TOTAL}), bukan ${BOGUS_TOTAL}. Generated column aman.`);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // #6 OVERWRITE BY ID MASIH BEKERJA (regresi upsert lama)
  // ──────────────────────────────────────────────────────────────────────────
  it('#6 overwrite by id: restore ulang id sama → 1 baris ter-update, bukan duplikat', async () => {
    const accId = track('accounts', randomUUID());

    // Restore #1.
    const r1 = await rpcRestore(userA, {
      accounts: [{ id: accId, user_id: A_UID, name: `${MARK}_AkunOverwrite`, type: 'bank', currency: 'IDR', initial_balance: 1000000 }],
    });
    expect(r1.error, `restore #1: ${r1.error?.message}`).toBeNull();

    // Restore #2: id SAMA, saldo beda.
    const r2 = await rpcRestore(userA, {
      accounts: [{ id: accId, user_id: A_UID, name: `${MARK}_AkunOverwrite`, type: 'bank', currency: 'IDR', initial_balance: 2000000 }],
    });
    expect(r2.error, `restore #2: ${r2.error?.message}`).toBeNull();

    // Hanya 1 baris untuk id itu, saldo = nilai terbaru.
    const { data: rows } = await adminClient.from('accounts').select('id, initial_balance').eq('id', accId);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].initial_balance)).toBe(2000000);
    console.log('[#6] Overwrite by id: 1.000.000 → 2.000.000 pada baris sama (1 baris).');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // #7 TABEL TIDAK ADA DI PAYLOAD = SKIP, TIDAK ERROR
  // ──────────────────────────────────────────────────────────────────────────
  it('#7 tabel absen di payload → di-skip (restored=0), bukan error', async () => {
    const catId = track('categories', randomUUID());

    const { data, error } = await rpcRestore(userA, {
      categories: [{ id: catId, user_id: A_UID, name: `${MARK}_KatOnly`, type: 'income', icon: 'tag', color: 'mint', is_active: true }],
    });
    expect(error, `RPC harus sukses walau hanya 1 tabel: ${error?.message}`).toBeNull();
    expect(data?.ok).toBe(true);
    expect(data?.restored?.categories).toBe(1);
    // Tabel yang tidak dikirim → 0 (bukan undefined, bukan error).
    expect(data?.restored?.accounts).toBe(0);
    expect(data?.restored?.transactions).toBe(0);
    expect(data?.restored?.liabilities).toBe(0);
    console.log('[#7] Hanya categories dikirim; tabel lain restored=0, tanpa error.');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // #8 AUTH GUARD — panggil tanpa sesi login (client anon, belum authenticated).
  //    Karena GRANT EXECUTE hanya ke role 'authenticated', client anon ditolak di
  //    lapisan privilege (permission denied) SEBELUM sempat masuk badan fungsi —
  //    ini sama-sama "ditolak dengan error yang sesuai, bukan crash generik".
  // ──────────────────────────────────────────────────────────────────────────
  it('#8 auth guard: pemanggilan tanpa sesi ditolak (bukan crash generik)', async () => {
    const anon = createAnonClient(); // TIDAK signIn → role anon, tanpa auth.uid().
    const accId = randomUUID(); // tidak akan tersimpan; safety saja.

    const { data, error } = await rpcRestore(anon, {
      accounts: [{ id: accId, user_id: A_UID, name: `${MARK}_AnonTolak`, type: 'bank', currency: 'IDR', initial_balance: 1 }],
    });

    expect(data, 'tanpa sesi tidak boleh ada hasil sukses').toBeNull();
    expect(error, 'pemanggilan anon harus ditolak dengan error').not.toBeNull();
    // Terima salah satu jalur penolakan yang valid: privilege (anon tak punya EXECUTE)
    // ATAU auth guard internal (auth.uid() IS NULL / 28000).
    expect(
      /permission denied|not.*authoriz|Tidak terautentikasi|28000|42501/i.test(
        `${error.message} ${error.code ?? ''} ${error.details ?? ''}`
      ),
      `error penolakan harus bermakna, dapat: ${error.message} (code=${error.code})`
    ).toBe(true);

    // Pastikan benar-benar tidak ada baris tertulis.
    const { data: leaked } = await adminClient.from('accounts').select('id').eq('id', accId).maybeSingle();
    expect(leaked, 'tidak boleh ada baris tertulis dari pemanggilan anon').toBeNull();
    console.log(`[#8] Anon ditolak: ${error.message} (code=${error.code ?? '-'}).`);
  });
});
