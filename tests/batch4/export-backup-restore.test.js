// Poketto tests — Batch 4: Backup / Restore (FOKUS: RESTORE).
//
// POLA (sama Batch 1–3):
//   • adminClient  → seed & cleanup (bypass RLS, tapi CHECK constraint TETAP berlaku).
//   • anonClient login sbg TEST_USER_A → operasi restore (di app, restore jalan sbg
//     user biasa & tunduk RLS). Verifikasi akhir sebagian pakai adminClient untuk
//     MEMASTIKAN data benar-benar tersimpan di DB (lepas dari pandangan RLS).
//
// KENAPA HANYA RESTORE? Export (CSV/Excel/PDF di transactions.html & reports.html)
// dan unduh-JSON di backup.html murni DOM/browser: ia mem-format file dari data yang
// SUDAH ter-load di memori. Tanpa headless browser, Node tidak bisa menjalankan jalur
// itu. Export → masuk MANUAL CHECKLIST terpisah. Restore = jalur paling berisiko
// (menulis ke DB) dan bisa ditest MURNI lewat database → itulah fokus batch ini.
//
// GROUND TRUTH RESTORE (diverifikasi langsung di pages/backup.html:135-164, JANGAN
// ditebak ulang):
//   • Backup mencakup 10 tabel. RESTORE_ORDER (FK-safe):
//       categories → subcategories → accounts → goals → portfolio_holdings →
//       portfolio_transactions → budgets → scheduled_bills → transactions → liabilities
//   • Resolusi envelope: `const data = parsed.data || parsed;`  → TIDAK ada validasi
//     skema/versi. File apa pun yang JSON-valid akan diproses.
//   • Per tabel: `rows = (data[t]||[]).map(r => ({ ...r, user_id: currentUser.id }))`
//     lalu `supabase.from(t).upsert(rows)`.
//       → upsert = MERGE by primary key (id). Baris id-sama DI-OVERWRITE; baris lama
//         yang TIDAK ada di file backup TETAP ADA (tidak terhapus). BUKAN replace.
//       → user_id setiap baris DIPAKSA ke currentUser.id (aman dari sisi kepemilikan).
//   • Loop 10 panggilan upsert TERPISAH dengan `if (error) throw error;` → NON-ATOMIC:
//     gagal di tengah ⇒ tabel-tabel sebelumnya sudah ter-upsert & TIDAK di-rollback.
//
// CATATAN: file ini MEREPLIKASI loop restore backup.html secara setia (helper `restore`
// & `restoreTable` di bawah) lalu menjalankannya terhadap DB nyata sebagai TEST_USER_A,
// persis seperti app. Yang diuji adalah PERILAKU DB nyata dari operasi restore itu.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { adminClient, createAnonClient, env } from '../helpers/supabaseClients.js';

const A_UID = env.TEST_USER_A_UID;
const MARK = `TEST_B4_${Date.now()}`;

// Urutan & logika DIAMBIL PERSIS dari pages/backup.html.
const RESTORE_ORDER = [
  'categories', 'subcategories', 'accounts', 'goals', 'portfolio_holdings',
  'portfolio_transactions', 'budgets', 'scheduled_bills', 'transactions', 'liabilities',
];

// ── Replika SETIA loop restore (backup.html:150-155) ─────────────────────────
// Throw di error pertama, tanpa rollback tabel sebelumnya → membuktikan non-atomic.
async function restore(client, dataObj, userId) {
  const applied = []; // tabel yang sempat ter-upsert sebelum (mungkin) gagal
  for (const t of RESTORE_ORDER) {
    const rows = (dataObj[t] || []).map((r) => ({ ...r, user_id: userId }));
    if (rows.length === 0) continue;
    const { error } = await client.from(t).upsert(rows);
    if (error) {
      const err = new Error(error.message);
      err.failedTable = t;
      err.appliedBefore = applied.slice();
      throw err; // sama seperti `throw error;` di app — loop berhenti, TANPA rollback
    }
    applied.push(t);
  }
  return applied;
}

// Varian satu-tabel: replika map+upsert yang SAMA, tapi mengembalikan error
// (bukan throw) agar bisa di-assert granular per tabel.
async function restoreTable(client, table, rows, userId) {
  const mapped = (rows || []).map((r) => ({ ...r, user_id: userId }));
  if (mapped.length === 0) return { data: [], error: null, mapped };
  const { data, error } = await client.from(table).upsert(mapped).select();
  return { data, error, mapped };
}

// ── Replika SETIA validasi skema minimal (backup.html, SEBELUM loop upsert) ───
// Di app: `if (parsed.app !== 'poketto') throw new Error('File ini bukan file backup
// Poketto yang valid.')` dijalankan setelah JSON.parse, sebelum `data = parsed.data
// || parsed` & sebelum loop. version SENGAJA tidak divalidasi ketat (versi apapun
// diterima selama app='poketto'), cukup dicatat.
//
// KETERBATASAN: validasi asli hidup di KODE FRONTEND (backup.html), bukan constraint
// DB. Test Node tak bisa memanggil fungsi itu langsung, jadi logic-nya DIREPLIKASI di
// sini (pola sama seperti replikasi rumus rollover/proyeksi di batch sebelumnya). Bila
// kondisi validasi di backup.html berubah, helper ini WAJIB diupdate manual juga —
// tidak ada jaminan otomatis bahwa keduanya tetap sinkron.
function assertBackupValid(parsed) {
  if (parsed.app !== 'poketto') {
    throw new Error('File ini bukan file backup Poketto yang valid.');
  }
  // version dibaca hanya untuk referensi; TIDAK dipakai untuk menolak.
  return { version: parsed.version ?? null };
}

// ── Registry untuk cleanup (termasuk sisa dari skenario gagal #3) ────────────
const createdAccountIds = [];
const createdCategoryIds = [];
const createdGoalIds = [];

// ════════════════════════════════════════════════════════════════════════════
// CLEANUP (selalu jalan; harus membersihkan SEMUA, termasuk hasil restore parsial)
// ════════════════════════════════════════════════════════════════════════════
afterAll(async () => {
  const delByIds = async (table, ids) => {
    if (!ids.length) return;
    try { await adminClient.from(table).delete().in('id', ids); }
    catch (e) { console.warn(`[cleanup] ${table} by id: ${e.message}`); }
  };
  const delByName = async (table) => {
    try { await adminClient.from(table).delete().eq('user_id', A_UID).like('name', `${MARK}%`); }
    catch (e) { console.warn(`[cleanup] ${table} by name: ${e.message}`); }
  };
  // Anak → induk. goals & accounts tak punya anak yang kita buat; categories induk
  // dari (sub)budgets/txn/bills yang TIDAK kita buat di batch ini, jadi urutan aman.
  await delByIds('goals', createdGoalIds);
  await delByName('goals');
  await delByIds('accounts', createdAccountIds);
  await delByName('accounts');
  await delByIds('categories', createdCategoryIds);
  await delByName('categories');
}, 60000);

// ════════════════════════════════════════════════════════════════════════════
// RESTORE — perilaku DB nyata (sebagai TEST_USER_A)
// ════════════════════════════════════════════════════════════════════════════
describe('RESTORE (backup.html) — merge, overwrite, non-atomic, schema-validation, user_id-forced', () => {
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
  // #1 RESTORE = MERGE, BUKAN REPLACE (membantah warning UI "akan menimpa data")
  // ──────────────────────────────────────────────────────────────────────────
  it('#1 MERGE bukan REPLACE: 2 akun lama TETAP ADA setelah restore file berisi 1 akun', async () => {
    // Seed 2 akun lama (sudah ada di DB SEBELUM restore).
    const lama1 = { id: randomUUID(), user_id: A_UID, name: `${MARK}_Akun Lama 1`, type: 'bank', currency: 'IDR', initial_balance: 100000 };
    const lama2 = { id: randomUUID(), user_id: A_UID, name: `${MARK}_Akun Lama 2`, type: 'cash', currency: 'IDR', initial_balance: 200000 };
    const { error: seedErr } = await adminClient.from('accounts').insert([lama1, lama2]).select();
    expect(seedErr, `seed 2 akun lama: ${seedErr?.message}`).toBeNull();
    createdAccountIds.push(lama1.id, lama2.id);

    // "File backup" yang HANYA berisi 1 akun (id baru, tak overlap akun lama).
    const dariBackup = { id: randomUUID(), user_id: A_UID, name: `${MARK}_Akun Dari Backup`, type: 'bank', currency: 'IDR', initial_balance: 300000 };
    createdAccountIds.push(dariBackup.id);
    const backupFile = { app: 'poketto', version: 1, data: { accounts: [dariBackup] } };

    // Jalankan restore (sbg TEST_USER_A, tunduk RLS) — hanya tabel accounts yang berisi.
    const applied = await restore(userA, backupFile.data, A_UID);
    expect(applied).toContain('accounts');

    // Verifikasi via adminClient: KETIGA akun ada (2 lama + 1 backup) → MERGE.
    const { data: rows, error: vErr } = await adminClient
      .from('accounts').select('id, name').in('id', [lama1.id, lama2.id, dariBackup.id]);
    expect(vErr).toBeNull();
    const ids = (rows || []).map((r) => r.id);
    expect(ids).toContain(lama1.id);      // akun lama TIDAK terhapus
    expect(ids).toContain(lama2.id);      // akun lama TIDAK terhapus
    expect(ids).toContain(dariBackup.id); // akun backup ditambahkan
    expect(rows).toHaveLength(3);
    console.log('[#1] Restore = MERGE: 2 akun lama TETAP ada + 1 akun backup → kontradiksi dengan warning UI "akan menimpa data".');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // #2 OVERWRITE BY ID (baris id-sama di-update, BUKAN duplikat baru)
  // ──────────────────────────────────────────────────────────────────────────
  it('#2 OVERWRITE by id: initial_balance 1.000.000 → 9.999.999, bukan baris duplikat', async () => {
    const akunId = randomUUID();
    const seed = { id: akunId, user_id: A_UID, name: `${MARK}_Akun X`, type: 'bank', currency: 'IDR', initial_balance: 1000000 };
    const { error: seedErr } = await adminClient.from('accounts').insert(seed).select();
    expect(seedErr, `seed Akun X: ${seedErr?.message}`).toBeNull();
    createdAccountIds.push(akunId);

    // "Backup" berisi baris dengan id SAMA tapi saldo berbeda.
    const dariBackup = { id: akunId, user_id: A_UID, name: `${MARK}_Akun X`, type: 'bank', currency: 'IDR', initial_balance: 9999999 };
    const { error: rErr } = await restoreTable(userA, 'accounts', [dariBackup], A_UID);
    expect(rErr, `restore overwrite: ${rErr?.message}`).toBeNull();

    // Verifikasi via adminClient: id itu kini 9.999.999, dan HANYA ADA 1 baris (overwrite).
    const { data: rows, error: vErr } = await adminClient
      .from('accounts').select('id, initial_balance').eq('id', akunId);
    expect(vErr).toBeNull();
    expect(rows).toHaveLength(1);                       // bukan duplikat
    expect(Number(rows[0].initial_balance)).toBe(9999999); // tertimpa
    console.log('[#2] Overwrite by id: saldo 1.000.000 → 9.999.999 pada baris yang sama (1 baris, bukan 2).');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // #3 NON-ATOMIC — RESTORE SETENGAH JADI (paling kritis)
  // ──────────────────────────────────────────────────────────────────────────
  it('#3 NON-ATOMIC: goals gagal (CHECK) TAPI categories & accounts sebelumnya TETAP tersimpan', async () => {
    const catId = randomUUID();
    const accId = randomUUID();
    const goalId = randomUUID();
    createdCategoryIds.push(catId);
    createdAccountIds.push(accId);
    createdGoalIds.push(goalId); // didaftarkan untuk cleanup walau (diharapkan) gagal insert

    // Backup multi-tabel. Urutan restore: categories (sukses) → accounts (sukses) →
    // goals (GAGAL: target_amount = -100 melanggar CHECK target_amount > 0).
    const data = {
      categories: [{ id: catId, user_id: A_UID, name: `${MARK}_KatRestore`, type: 'expense', icon: 'tag', color: 'sky', is_active: true }],
      accounts: [{ id: accId, user_id: A_UID, name: `${MARK}_AkunRestore`, type: 'bank', currency: 'IDR', initial_balance: 500000 }],
      goals: [{ id: goalId, user_id: A_UID, name: `${MARK}_GoalBuruk`, icon: 'target', target_amount: -100, current_amount: 0, is_completed: false }],
    };

    // Jalankan restore penuh — DIHARAPKAN throw saat tabel goals.
    let thrown = null;
    try {
      await restore(userA, data, A_UID);
    } catch (e) {
      thrown = e;
    }

    // (a) Restore MEMANG gagal, dan gagalnya di tabel goals (bukan sebelumnya).
    expect(thrown, 'restore harus gagal karena goals.target_amount=-100 melanggar CHECK').not.toBeNull();
    expect(thrown.failedTable).toBe('goals');
    expect(thrown.appliedBefore).toEqual(['categories', 'accounts']); // dua tabel sempat ter-upsert
    console.log(`[#3] Restore berhenti di tabel "goals": ${thrown.message}`);

    // (b) categories & accounts yang ter-upsert SEBELUM kegagalan TETAP ADA (no rollback).
    const { data: cat } = await adminClient.from('categories').select('id').eq('id', catId).maybeSingle();
    const { data: acc } = await adminClient.from('accounts').select('id').eq('id', accId).maybeSingle();
    expect(cat?.id, 'categories harus TETAP tersimpan walau goals gagal').toBe(catId);
    expect(acc?.id, 'accounts harus TETAP tersimpan walau goals gagal').toBe(accId);

    // (c) goals yang melanggar CHECK TIDAK tersimpan (insert-nya yang menggagalkan loop).
    const { data: goal } = await adminClient.from('goals').select('id').eq('id', goalId).maybeSingle();
    expect(goal, 'goal buruk tidak boleh tersimpan').toBeNull();

    console.log('[#3] DIBUKTIKAN: "restore setengah jadi" — categories+accounts tertulis, goals gagal, TANPA rollback. Inilah risiko data-corruption non-atomic.');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // #4 VALIDASI SKEMA MINIMAL (fix baru: tolak non-Poketto, version tetap longgar)
  // ──────────────────────────────────────────────────────────────────────────
  it('#4a file TANPA field app → restore DITOLAK SEBELUM upsert (tidak ada data tertulis)', async () => {
    const akunId = randomUUID();
    createdAccountIds.push(akunId); // safety cleanup, walau DIHARAPKAN tidak tersimpan

    // "File backup" tanpa field 'app' sama sekali (juga tanpa 'version'): hanya key
    // tabel langsung — persis file yang dulu (sebelum fix) diam-diam diproses.
    const parsed = {
      accounts: [{ id: akunId, user_id: A_UID, name: `${MARK}_NoApp`, type: 'bank', currency: 'IDR', initial_balance: 777000 }],
    };
    expect('app' in parsed).toBe(false);

    // Replika SETIA urutan backup.html: validasi DULU; throw → loop upsert tak pernah jalan.
    let thrown = null;
    let applied = null;
    try {
      assertBackupValid(parsed);             // di app: throw sebelum `data` & loop
      const data = parsed.data || parsed;
      applied = await restore(userA, data, A_UID);
    } catch (e) { thrown = e; }

    expect(thrown, 'file tanpa app=poketto harus ditolak (fix baru)').not.toBeNull();
    expect(thrown.message).toBe('File ini bukan file backup Poketto yang valid.');
    expect(applied, 'loop upsert TIDAK boleh sempat berjalan').toBeNull();

    // Pastikan benar-benar tidak ada baris tertulis (ditolak sebelum menyentuh DB).
    const { data: acc } = await adminClient.from('accounts').select('id').eq('id', akunId).maybeSingle();
    expect(acc, 'tidak boleh ada baris dari file yang ditolak').toBeNull();
    console.log('[#4a] File tanpa app=poketto DITOLAK sebelum upsert — nol data tertulis (sesuai fix baru).');
  });

  it('#4b app:poketto TANPA field version → restore TETAP diproses (version tak divalidasi ketat)', async () => {
    const akunId = randomUUID();
    createdAccountIds.push(akunId);

    // app valid, TANPA field 'version' (mensimulasikan backup lama yang sah).
    const parsed = {
      app: 'poketto',
      data: { accounts: [{ id: akunId, user_id: A_UID, name: `${MARK}_NoVersion`, type: 'bank', currency: 'IDR', initial_balance: 555000 }] },
    };
    expect('version' in parsed).toBe(false);

    // Validasi LOLOS (app benar; version diabaikan), restore lanjut normal.
    const meta = assertBackupValid(parsed);
    expect(meta.version).toBeNull(); // tidak ada version → dicatat null, BUKAN ditolak
    const data = parsed.data || parsed;
    const applied = await restore(userA, data, A_UID);

    const { data: acc, error } = await adminClient.from('accounts').select('id, initial_balance').eq('id', akunId).maybeSingle();
    expect(error).toBeNull();
    expect(applied).toContain('accounts');
    expect(acc?.id).toBe(akunId);
    expect(Number(acc?.initial_balance)).toBe(555000);
    console.log('[#4b] Backup app=poketto TANPA version TETAP berhasil di-restore (version sengaja longgar, backup lama tak terblokir).');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // #5 user_id DIPAKSA KE USER SAAT INI (proteksi kepemilikan bekerja)
  // ──────────────────────────────────────────────────────────────────────────
  it('#5 user_id DIPAKSA: baris backup ber-user_id orang lain → tersimpan sbg TEST_USER_A', async () => {
    const akunId = randomUUID();
    const otherUid = randomUUID(); // user_id "asing" di dalam file backup (bukan TEST_USER_A)
    createdAccountIds.push(akunId);
    expect(otherUid).not.toBe(A_UID);

    // "Backup" dengan baris yang membawa user_id BERBEDA di datanya.
    const data = {
      accounts: [{ id: akunId, user_id: otherUid, name: `${MARK}_PaksaUser`, type: 'bank', currency: 'IDR', initial_balance: 123456 }],
    };

    // Restore sbg TEST_USER_A → map memaksa user_id ke A_UID (backup.html:151).
    const applied = await restore(userA, data, A_UID);
    expect(applied).toContain('accounts');

    // Verifikasi via adminClient: user_id tersimpan = TEST_USER_A, BUKAN otherUid.
    const { data: acc, error } = await adminClient
      .from('accounts').select('id, user_id').eq('id', akunId).maybeSingle();
    expect(error).toBeNull();
    expect(acc?.id).toBe(akunId);
    expect(acc?.user_id).toBe(A_UID);          // dipaksa ke user saat ini
    expect(acc?.user_id).not.toBe(otherUid);   // user_id asli file diabaikan
    console.log(`[#5] user_id file (${otherUid.slice(0, 8)}…) DITIMPA → tersimpan sbg TEST_USER_A (${A_UID.slice(0, 8)}…). Proteksi kepemilikan bekerja.`);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // #6 REGRESI: fix validasi TIDAK boleh mengganggu alur restore sah yang normal
  // ──────────────────────────────────────────────────────────────────────────
  it('#6 REGRESI: backup valid lengkap (app:poketto + version + envelope) → restore tetap berhasil', async () => {
    const akunId = randomUUID();
    createdAccountIds.push(akunId);

    // Bentuk PERSIS seperti output export backup.html (app, version, exported_at,
    // user_id, data) — file sah yang harus tetap lolos setelah fix validasi.
    const parsed = {
      app: 'poketto',
      version: 1,
      exported_at: new Date().toISOString(),
      user_id: A_UID,
      data: { accounts: [{ id: akunId, user_id: A_UID, name: `${MARK}_Valid`, type: 'bank', currency: 'IDR', initial_balance: 888000 }] },
    };

    const meta = assertBackupValid(parsed); // harus LOLOS tanpa throw
    expect(meta.version).toBe(1);
    const data = parsed.data || parsed;
    const applied = await restore(userA, data, A_UID);

    const { data: acc, error } = await adminClient.from('accounts').select('id, initial_balance').eq('id', akunId).maybeSingle();
    expect(error).toBeNull();
    expect(applied).toContain('accounts');
    expect(acc?.id).toBe(akunId);
    expect(Number(acc?.initial_balance)).toBe(888000);
    console.log('[#6] Backup Poketto valid (app+version) tetap di-restore normal — fix validasi tidak mengganggu alur sah.');
  });
});
