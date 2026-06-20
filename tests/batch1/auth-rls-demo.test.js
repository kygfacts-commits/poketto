// Poketto tests — Batch 1: Auth, RLS cross-user isolation, Demo read-only.
//
// Semua assertion keamanan memakai anonClient (tunduk RLS). adminClient HANYA
// dipakai untuk seed/cleanup data dummy. Test ini bypass UI sepenuhnya (langsung
// ke API) — jadi membuktikan keamanan di level DATABASE, bukan sekadar
// blockIfDemo() di frontend.
//
// CATATAN nama tabel (diverifikasi dari kode app, bukan asumsi):
//   "bills"     → scheduled_bills
//   "portfolio" → portfolio_holdings (ada juga portfolio_transactions, tak ditest di sini)

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminClient, createAnonClient, env } from '../helpers/supabaseClients.js';

const DEMO_UID = env.DEMO_USER_UID;
const A_UID = env.TEST_USER_A_UID;

// Penanda unik agar data dummy mudah disapu saat cleanup.
const MARK = `TEST_RLS_${Date.now()}`;

// Registry id data dummy milik DEMO_UID yang kita seed (untuk assert + cleanup).
const demoRowIds = {}; // { tableName: id }
// Id yang tidak sengaja lolos ter-insert oleh anonClient (kalau RLS bocor) → cleanup.
const leakedRowIds = []; // [{ table, id }]

// Parent ids (FK) — diisi saat seeding.
let demoAccountId = null;
let demoCategoryId = null;

// Builder baris dummy per tabel untuk DEMO_UID. Hanya kolom wajib/realistis.
function demoRowFor(table) {
  switch (table) {
    case 'accounts':
      // type CHECK: cash|bank|ewallet|investment|other.
      return { user_id: DEMO_UID, name: `${MARK}_acc`, type: 'bank', currency: 'IDR', initial_balance: 0 };
    case 'categories':
      // type CHECK: income|expense.
      return { user_id: DEMO_UID, name: `${MARK}_cat`, type: 'expense', icon: 'tag', color: 'lavender', is_active: true };
    case 'transactions':
      // type 'expense' (CHECK: income|expense|transfer) → transfer_type WAJIB null
      // bila bukan 'transfer'. App memasangkan transfer sbg dua baris income/expense
      // ber-transfer_type, bukan baris bertipe 'transfer'. amount harus > 0.
      return { user_id: DEMO_UID, account_id: demoAccountId, category_id: demoCategoryId, type: 'expense', transfer_type: null, amount: 1000, date: '2026-01-01', description: MARK };
    case 'budgets':
      // limit_amount harus > 0.
      return { user_id: DEMO_UID, category_id: demoCategoryId, month: '2026-01-01', limit_amount: 1000, rollover_enabled: false };
    case 'goals':
      // target_amount harus > 0.
      return { user_id: DEMO_UID, name: `${MARK}_goal`, icon: 'target', target_amount: 1000, current_amount: 0, is_completed: false };
    case 'scheduled_bills':
      // frequency CHECK: daily|weekly|monthly|yearly. day_of_month 1..31. amount > 0.
      return { user_id: DEMO_UID, name: `${MARK}_bill`, category_id: demoCategoryId, account_id: demoAccountId, amount: 1000, day_of_month: 1, frequency: 'monthly', next_due_date: '2026-02-01', is_active: true };
    case 'portfolio_holdings':
      // asset_type CHECK: saham|reksadana|obligasi|emas|kripto|lainnya. qty & avg_buy_price > 0.
      return { user_id: DEMO_UID, account_id: demoAccountId, asset_type: 'saham', asset_name: MARK, quantity: 1, avg_buy_price: 1000, currency: 'IDR' };
    case 'liabilities':
      // type CHECK: hutang|cicilan|kartu_kredit|kpr|lainnya.
      return { user_id: DEMO_UID, name: `${MARK}_liab`, type: 'hutang', total_amount: 1000, remaining_amount: 1000 };
    default:
      throw new Error(`Tidak ada builder untuk tabel: ${table}`);
  }
}

// Tabel yang diuji (urutan = aman untuk FK saat INSERT).
const TABLES = ['accounts', 'categories', 'transactions', 'budgets', 'goals', 'scheduled_bills', 'portfolio_holdings', 'liabilities'];

// ════════════════════════════════════════════════════════════════════════════
// SEED (adminClient — bypass RLS)
// ════════════════════════════════════════════════════════════════════════════
beforeAll(async () => {
  if (!DEMO_UID) throw new Error('[tests] DEMO_USER_UID kosong di tests/.env');

  // Parent dulu (accounts & categories) supaya FK tabel anak valid.
  const { data: acc, error: accErr } = await adminClient
    .from('accounts').insert(demoRowFor('accounts')).select('id').single();
  if (accErr) throw new Error(`Seed accounts gagal: ${accErr.message}`);
  demoAccountId = acc.id; demoRowIds.accounts = acc.id;

  const { data: cat, error: catErr } = await adminClient
    .from('categories').insert(demoRowFor('categories')).select('id').single();
  if (catErr) throw new Error(`Seed categories gagal: ${catErr.message}`);
  demoCategoryId = cat.id; demoRowIds.categories = cat.id;

  // Sisa tabel.
  for (const t of TABLES) {
    if (t === 'accounts' || t === 'categories') continue;
    const { data, error } = await adminClient.from(t).insert(demoRowFor(t)).select('id').single();
    if (error) throw new Error(`Seed ${t} gagal: ${error.message}`);
    demoRowIds[t] = data.id;
  }
}, 60000);

// ════════════════════════════════════════════════════════════════════════════
// CLEANUP (selalu jalan walau ada test gagal)
// ════════════════════════════════════════════════════════════════════════════
afterAll(async () => {
  // Urutan terbalik dari seed (anak dulu, lalu parent) agar FK tidak menghalangi.
  const reverse = [...TABLES].reverse();
  for (const t of reverse) {
    // Hapus row dummy yang kita track…
    if (demoRowIds[t]) {
      try { await adminClient.from(t).delete().eq('id', demoRowIds[t]); }
      catch (e) { console.warn(`[cleanup] gagal hapus ${t}#${demoRowIds[t]}: ${e.message}`); }
    }
    // …dan sapu sisa apa pun bertanda MARK milik DEMO_UID (jaring pengaman).
    try { await adminClient.from(t).delete().eq('user_id', DEMO_UID).like('name', `${MARK}%`); } catch {}
  }
  // transactions/portfolio pakai kolom non-"name" untuk marker.
  try { await adminClient.from('transactions').delete().eq('user_id', DEMO_UID).eq('description', MARK); } catch {}
  try { await adminClient.from('portfolio_holdings').delete().eq('user_id', DEMO_UID).eq('asset_name', MARK); } catch {}

  // Bersihkan row yang bocor ter-insert anonClient (kalau RLS bocor).
  for (const { table, id } of leakedRowIds) {
    try { await adminClient.from(table).delete().eq('id', id); } catch {}
  }
}, 60000);

// ════════════════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════════════════
describe('AUTH', () => {
  it('env TEST_USER_A_* terisi (kalau tidak, test auth/RLS tak bermakna)', () => {
    expect(env.TEST_USER_A_EMAIL, 'TEST_USER_A_EMAIL kosong di .env').toBeTruthy();
    expect(env.TEST_USER_A_PASSWORD, 'TEST_USER_A_PASSWORD kosong di .env').toBeTruthy();
    expect(env.TEST_USER_A_UID, 'TEST_USER_A_UID kosong di .env').toBeTruthy();
  });

  it('login TEST_USER_A berhasil & return session valid', async () => {
    const c = createAnonClient();
    const { data, error } = await c.auth.signInWithPassword({
      email: env.TEST_USER_A_EMAIL, password: env.TEST_USER_A_PASSWORD,
    });
    expect(error).toBeNull();
    expect(data.session).toBeTruthy();
    expect(data.session.access_token).toBeTruthy();
    expect(data.user.id).toBe(A_UID);
  });

  it('login password salah → gagal dengan error jelas (bukan crash)', async () => {
    const c = createAnonClient();
    const { data, error } = await c.auth.signInWithPassword({
      email: env.TEST_USER_A_EMAIL, password: 'password-yang-pasti-salah-123!',
    });
    expect(error).toBeTruthy();
    expect(error.message).toMatch(/invalid|credential/i);
    expect(data.session).toBeNull();
  });

  it('login email tidak terdaftar → gagal dengan error jelas', async () => {
    const c = createAnonClient();
    const { data, error } = await c.auth.signInWithPassword({
      email: `tidak-ada-${Date.now()}@poketto.invalid`, password: 'whatever-123!',
    });
    expect(error).toBeTruthy();
    expect(data.session).toBeNull();
  });

  it('getSession() setelah login return user dengan UID yang cocok', async () => {
    const c = createAnonClient();
    await c.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL, password: env.TEST_USER_A_PASSWORD });
    const { data, error } = await c.auth.getSession();
    expect(error).toBeNull();
    expect(data.session?.user?.id).toBe(A_UID);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// RLS — CROSS-USER ISOLATION  (test paling kritis)
// ════════════════════════════════════════════════════════════════════════════
describe('RLS cross-user isolation (sebagai TEST_USER_A)', () => {
  let userA; // anonClient yang sudah login sebagai A

  beforeAll(async () => {
    userA = createAnonClient();
    const { error } = await userA.auth.signInWithPassword({
      email: env.TEST_USER_A_EMAIL, password: env.TEST_USER_A_PASSWORD,
    });
    if (error) throw new Error(`Login TEST_USER_A gagal (cek .env): ${error.message}`);
  }, 30000);

  for (const table of TABLES) {
    describe(`tabel: ${table}`, () => {
      it('SELECT sukses & TIDAK mengembalikan row milik user lain (DEMO)', async () => {
        const { data, error } = await userA.from(table).select('*');
        expect(error, `SELECT ${table} harus sukses tanpa error RLS`).toBeNull();
        expect(Array.isArray(data)).toBe(true);
        // Tidak boleh ada satupun row milik DEMO_UID.
        expect(data.every((r) => r.user_id !== DEMO_UID)).toBe(true);
        // Row dummy DEMO yang kita seed tidak boleh terlihat.
        expect(data.some((r) => r.id === demoRowIds[table])).toBe(false);
      });

      it('UPDATE row milik DEMO → ditolak rapi (0 row, bukan error 500)', async () => {
        const { data, error } = await userA
          .from(table).update({ user_id: DEMO_UID }).eq('id', demoRowIds[table]).select();
        // RLS yang benar: invisible row → 0 baris ter-update, tanpa error server.
        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);
        // Pastikan row DEMO masih utuh (cek via admin).
        const { data: still } = await adminClient.from(table).select('id').eq('id', demoRowIds[table]).maybeSingle();
        expect(still?.id).toBe(demoRowIds[table]);
      });

      it('DELETE row milik DEMO → ditolak rapi (0 row)', async () => {
        const { data, error } = await userA.from(table).delete().eq('id', demoRowIds[table]).select();
        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);
        const { data: still } = await adminClient.from(table).select('id').eq('id', demoRowIds[table]).maybeSingle();
        expect(still?.id, `row DEMO di ${table} tidak boleh terhapus oleh user lain`).toBe(demoRowIds[table]);
      });

      it('INSERT spoof user_id=DEMO → ditolak RLS (WITH CHECK)', async () => {
        // Bangun row valid TAPI dengan user_id = DEMO (spoof kepemilikan).
        const row = demoRowFor(table);
        const { data, error } = await userA.from(table).insert(row).select();
        // Diharapkan: error RLS (mis. 42501) ATAU tidak ada baris yang masuk.
        const inserted = data ?? [];
        if (inserted.length) {
          // RLS BOCOR — catat untuk cleanup lalu gagalkan test.
          inserted.forEach((r) => leakedRowIds.push({ table, id: r.id }));
        }
        expect(error, `INSERT spoof ke ${table} seharusnya ditolak RLS`).toBeTruthy();
        expect(inserted).toHaveLength(0);
      });
    });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// DEMO MODE READ-ONLY  (di-skip bila DEMO_USER_PASSWORD tidak diisi)
// ════════════════════════════════════════════════════════════════════════════
const DEMO_PW = env.DEMO_USER_PASSWORD;
if (!DEMO_PW) {
  // eslint-disable-next-line no-console
  console.warn(
    '\n[tests] ⏭️  Blok "DEMO MODE READ-ONLY" di-SKIP: DEMO_USER_PASSWORD belum diisi di tests/.env.\n' +
    '        Ini disengaja — kita TIDAK mereset password akun demo tanpa konfirmasi.\n' +
    '        Untuk menjalankannya, isi DEMO_USER_PASSWORD di tests/.env lalu run ulang.\n'
  );
}

(DEMO_PW ? describe : describe.skip)('DEMO MODE read-only (sebagai DEMO_USER, RLS-level)', () => {
  let demo; // anonClient login sebagai demo

  beforeAll(async () => {
    demo = createAnonClient();
    const { error } = await demo.auth.signInWithPassword({
      email: env.DEMO_USER_EMAIL, password: DEMO_PW,
    });
    if (error) throw new Error(`Login DEMO gagal (cek DEMO_USER_PASSWORD): ${error.message}`);
  }, 30000);

  for (const table of TABLES) {
    describe(`tabel: ${table}`, () => {
      it('INSERT sebagai demo → ditolak DB (RLS block_demo), bukan cuma frontend', async () => {
        const row = demoRowFor(table); // user_id = DEMO (data miliknya sendiri)
        const { data, error } = await demo.from(table).insert(row).select();
        const inserted = data ?? [];
        inserted.forEach((r) => leakedRowIds.push({ table, id: r.id }));
        expect(error, `demo INSERT ke ${table} harus ditolak di level DB`).toBeTruthy();
        expect(inserted).toHaveLength(0);
      });

      it('UPDATE row demo sendiri → ditolak (0 row / error)', async () => {
        // Update no-op (user_id ke nilai sama) — kolom ada di semua tabel, jadi
        // yang diuji murni policy demo, bukan schema. RESTRICTIVE block_demo
        // harus menolak: error ATAU 0 row ter-update.
        const { data, error } = await demo
          .from(table).update({ user_id: DEMO_UID }).eq('id', demoRowIds[table]).select();
        const changed = data ?? [];
        expect(changed.length === 0 || !!error).toBe(true);
      });

      it('DELETE row demo sendiri → ditolak (0 row / error)', async () => {
        const { data, error } = await demo.from(table).delete().eq('id', demoRowIds[table]).select();
        const deleted = data ?? [];
        expect(deleted.length === 0 || !!error).toBe(true);
        // Konfirmasi row masih ada via admin.
        const { data: still } = await adminClient.from(table).select('id').eq('id', demoRowIds[table]).maybeSingle();
        expect(still?.id).toBe(demoRowIds[table]);
      });
    });
  }
});
