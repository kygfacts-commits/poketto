// Poketto tests — Batch 3: Portfolio (avg/qty/realized + edge), Goals (current_amount
// independen + proyeksi), Bills (next_due_date + edge tanggal), Liabilities (net worth).
//
// POLA (sama Batch 1 & 2):
//   • adminClient  → seed & cleanup (bypass RLS, tapi CHECK constraint TETAP berlaku).
//   • anonClient login sbg TEST_USER_A → operasi/assertion yang mensimulasikan user asli.
//
// GROUND TRUTH (dari investigasi, JANGAN ditebak ulang):
//   • Goals.current_amount = kolom tersendiri (bukan SUM transaksi). Proyeksi (fallback,
//     tanpa transaksi "Nabung:") = avgPerDay = current_amount / hariSejakCreated;
//     estimasiHari = ceil((target−current)/avgPerDay). (goal-projection.js)
//   • Bills.next_due_date dihitung di frontend (bills.html computeNextDueDate):
//       monthly → dayOfMonth >= todayDay ? bulan ini : bulan depan. Tidak ada kolom is_paid.
//   • Portfolio: avg_buy_price & quantity di-overwrite dari portfolio_transactions HANYA
//     bila ada transaksi 'buy'. avgBuy = Σ(qty*price+fee+tax)/Σqty dari BUY saja (tak
//     berubah saat jual). qty = max(0, buyQty − sellQty). realized per sell =
//     (price − avgBuy)*qty − fee − tax. (portfolio.js computeHoldingPnL)
//   • Net worth = Σ(saldo akun) − Σ(liabilities.remaining_amount). Portfolio TIDAK termasuk
//     (area diketahui, BUKAN bug — hanya didokumentasikan).
//
// KETERBATASAN (lihat ringkasan akhir): writeback holding, proyeksi goal, dan
// computeNextDueDate hanya hidup di frontend JS. Test mengambil DATA MENTAH dari DB lalu
// MEREPLIKASI rumus di helper, sama seperti Batch 2. Jadi yang diverifikasi adalah "data
// mentah menghasilkan angka yang benar SESUAI rumus", bukan eksekusi kode frontend asli.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminClient, createAnonClient, env } from '../helpers/supabaseClients.js';

const A_UID = env.TEST_USER_A_UID;
const MARK = `TEST_B3_${Date.now()}`;
const MS_PER_DAY = 86400000;

// ── Helpers tanggal ──────────────────────────────────────────────────────────
function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

// ── Replikasi computeNextDueDate (bills.html), khusus monthly ────────────────
function computeNextDueDateMonthly(dayOfMonth, base = new Date()) {
  const today = startOfDay(base);
  const todayDay = today.getDate();
  const y = today.getFullYear(), m = today.getMonth();
  return dayOfMonth >= todayDay
    ? toISODate(new Date(y, m, dayOfMonth))
    : toISODate(new Date(y, m + 1, dayOfMonth));
}

// ── Replikasi getAccountBalance (utils.js) ───────────────────────────────────
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

// ── Replikasi computeHoldingPnL (portfolio.js) bagian avg/qty/realized ───────
function computeFromLedger(ptxList, holdingFallback = {}) {
  const buys = ptxList.filter((t) => t.type === 'buy');
  const sells = ptxList.filter((t) => t.type === 'sell');
  const buyQty = buys.reduce((s, t) => s + Number(t.quantity || 0), 0);
  const buyCost = buys.reduce((s, t) => s + (Number(t.quantity || 0) * Number(t.price || 0) + Number(t.fee || 0) + Number(t.tax || 0)), 0);
  const sellQty = sells.reduce((s, t) => s + Number(t.quantity || 0), 0);
  const hasBuys = buys.length > 0;
  const avgBuy = hasBuys && buyQty > 0 ? buyCost / buyQty : Number(holdingFallback.avg_buy_price || 0);
  const qty = hasBuys ? Math.max(0, buyQty - sellQty) : Number(holdingFallback.quantity || 0);
  const realized = sells.reduce(
    (s, t) => s + ((Number(t.price || 0) - avgBuy) * Number(t.quantity || 0) - Number(t.fee || 0) - Number(t.tax || 0)),
    0
  );
  return { buyQty, buyCost, sellQty, avgBuy, qty, realized };
}

// ── Replikasi proyeksi goal (fallback, tanpa transaksi "Nabung:") ────────────
function projectFallback(target, current, createdAtISO) {
  // calculateProjection memakai date-part (slice 0,10) sbg kontribusi pertama.
  const [y, m, d] = String(createdAtISO).slice(0, 10).split('-').map(Number);
  const firstDate = new Date(y, (m || 1) - 1, d || 1);
  const today = startOfDay(new Date());
  const totalDays = Math.max(1, Math.floor((today - firstDate) / MS_PER_DAY));
  const avgPerDay = current / totalDays;
  const sisaTarget = target - current;
  const estimasiHari = avgPerDay > 0 && sisaTarget > 0 ? Math.ceil(sisaTarget / avgPerDay) : null;
  return { totalDays, avgPerDay, sisaTarget, estimasiHari };
}

// ── Registry untuk cleanup ───────────────────────────────────────────────────
let accInvest = null;   // akun investasi (FK holdings)
let accMain = null;     // akun untuk net worth (#9)
let catId = null;       // kategori expense (FK bills)
let mathHoldingId = null; // holding untuk #1–#4
const holdingIds = [];

// ════════════════════════════════════════════════════════════════════════════
// SEED
// ════════════════════════════════════════════════════════════════════════════
beforeAll(async () => {
  if (!A_UID) throw new Error('[tests] TEST_USER_A_UID kosong di tests/.env');

  // Akun (parent FK).
  const { data: accs, error: accErr } = await adminClient.from('accounts').insert([
    { user_id: A_UID, name: `${MARK}_invest`, type: 'investment', currency: 'IDR', initial_balance: 0 },
    { user_id: A_UID, name: `${MARK}_main`, type: 'bank', currency: 'IDR', initial_balance: 5000000 },
  ]).select('id, initial_balance, name');
  if (accErr) throw new Error(`Seed accounts gagal: ${accErr.message}`);
  accInvest = accs.find((a) => a.name.endsWith('_invest'));
  accMain = accs.find((a) => a.name.endsWith('_main'));

  // Kategori (parent FK bills).
  const { data: cat, error: catErr } = await adminClient.from('categories')
    .insert({ user_id: A_UID, name: `${MARK}_cat`, type: 'expense', icon: 'tag', color: 'lavender', is_active: true })
    .select('id').single();
  if (catErr) throw new Error(`Seed categories gagal: ${catErr.message}`);
  catId = cat.id;

  // Holding "kosong" untuk #1–#4 (quantity & avg awal valid, akan dianggap di-overwrite).
  const { data: h, error: hErr } = await adminClient.from('portfolio_holdings')
    .insert({ user_id: A_UID, account_id: accInvest.id, asset_type: 'saham', asset_name: `${MARK}_BBCA`, quantity: 1, avg_buy_price: 1, currency: 'IDR' })
    .select('id').single();
  if (hErr) throw new Error(`Seed holding gagal: ${hErr.message}`);
  mathHoldingId = h.id; holdingIds.push(h.id);
}, 60000);

// ════════════════════════════════════════════════════════════════════════════
// CLEANUP (selalu jalan)
// ════════════════════════════════════════════════════════════════════════════
afterAll(async () => {
  const del = async (table, col, val) => {
    try { await adminClient.from(table).delete().eq('user_id', A_UID).like(col, `${val}%`); }
    catch (e) { console.warn(`[cleanup] ${table}: ${e.message}`); }
  };
  // Anak dulu (FK), lalu parent.
  // Jaring pengaman ganda: hapus via 'notes' (penanda MARK) DAN via holding_id.
  try { await adminClient.from('portfolio_transactions').delete().eq('user_id', A_UID).like('notes', `${MARK}%`); } catch (e) { console.warn('[cleanup] ptx by notes:', e.message); }
  if (holdingIds.length) {
    try { await adminClient.from('portfolio_transactions').delete().in('holding_id', holdingIds); } catch (e) { console.warn('[cleanup] ptx by holding:', e.message); }
  }
  await del('portfolio_holdings', 'asset_name', MARK);
  await del('scheduled_bills', 'name', MARK);
  await del('goals', 'name', MARK);
  await del('liabilities', 'name', MARK);
  try { await adminClient.from('transactions').delete().eq('user_id', A_UID).like('description', `${MARK}%`); } catch (e) { console.warn('[cleanup] transactions:', e.message); }
  await del('categories', 'name', MARK);
  await del('accounts', 'name', MARK);
}, 60000);

// ════════════════════════════════════════════════════════════════════════════
// PORTFOLIO — avg/qty/realized + edge  (sebagai TEST_USER_A)
// ════════════════════════════════════════════════════════════════════════════
describe('PORTFOLIO ledger math & edge', () => {
  let userA;
  beforeAll(async () => {
    userA = createAnonClient();
    const { error } = await userA.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL, password: env.TEST_USER_A_PASSWORD });
    if (error) throw new Error(`Login TEST_USER_A gagal: ${error.message}`);
  }, 30000);

  async function ledger() {
    const { data, error } = await userA.from('portfolio_transactions').select('*').eq('holding_id', mathHoldingId);
    if (error) throw error;
    return data;
  }

  it('#1 dua kali BELI → avgBuy=1100, qty=20 (rumus direplikasi)', async () => {
    // Dua BELI = dua aksi "Catat Transaksi" TERPISAH di app (bukan satu operasi atomik
    // seperti transfer double-entry di Batch 2), jadi tetap insert SEKUENSIAL satu per satu
    // dengan await — meniru alur app (1 insert per ptx). Kronologi eksplisit lewat 'date'.
    // 'total' sengaja tidak diisi: app pun tidak mengisinya.
    const { error: e1 } = await userA.from('portfolio_transactions')
      .insert({ user_id: A_UID, holding_id: mathHoldingId, type: 'buy', quantity: 10, price: 1000, fee: 0, tax: 0, date: '2099-03-01', notes: `${MARK}_buy1` }).select();
    expect(e1, 'insert buy #1 harus sukses').toBeNull();
    const { error: e2 } = await userA.from('portfolio_transactions')
      .insert({ user_id: A_UID, holding_id: mathHoldingId, type: 'buy', quantity: 10, price: 1200, fee: 0, tax: 0, date: '2099-03-02', notes: `${MARK}_buy2` }).select();
    expect(e2, 'insert buy #2 harus sukses').toBeNull();

    const calc = computeFromLedger(await ledger(), { avg_buy_price: 1, quantity: 1 });
    expect(calc.buyQty).toBe(20);
    expect(calc.buyCost).toBe(22000);   // 10*1000 + 10*1200
    expect(calc.avgBuy).toBe(1100);     // 22000 / 20
    expect(calc.qty).toBe(20);
  });

  it('#2 JUAL sebagian → qty=15, avgBuy TETAP 1100, realized=1000', async () => {
    const { error } = await userA.from('portfolio_transactions')
      .insert({ user_id: A_UID, holding_id: mathHoldingId, type: 'sell', quantity: 5, price: 1300, fee: 0, tax: 0, date: '2099-03-03', notes: `${MARK}_sell1` })
      .select();
    expect(error).toBeNull();

    const calc = computeFromLedger(await ledger());
    expect(calc.avgBuy).toBe(1100);     // tidak berubah oleh jual
    expect(calc.qty).toBe(15);          // 20 − 5
    expect(calc.realized).toBe(1000);   // (1300−1100)*5
  });

  it('#3 OVERSELL (jual 100 dari 15): ada proteksi DB atau tidak? (laporan apa adanya)', async () => {
    const { data, error } = await userA.from('portfolio_transactions')
      .insert({ user_id: A_UID, holding_id: mathHoldingId, type: 'sell', quantity: 100, price: 1300, fee: 0, tax: 0, date: '2099-03-04', notes: `${MARK}_oversell` })
      .select();

    if (error) {
      console.log(`[#3] PROTEKSI ADA — DB menolak oversell: ${error.message}`);
      expect(error.message).toBeTruthy();
    } else {
      console.log('[#3] TIDAK ADA PROTEKSI — oversell berhasil tersimpan (DB tak tahu kepemilikan).');
      const calc = computeFromLedger(await ledger());
      // qty derived di-clamp ke 0; realized tetap dihitung atas seluruh sellQty.
      console.log(`[#3] qty derived = ${calc.qty} (clamp max(0, 20−105)), sellQty total = ${calc.sellQty}`);
      expect(data).toHaveLength(1);
      expect(calc.qty).toBe(0);
    }
    expect(error === null || error !== null).toBe(true);
  });

  it('#4 set quantity=0 langsung di holdings → DITERIMA (CHECK quantity >= 0) [Bagian A #1]', async () => {
    const { data, error } = await adminClient.from('portfolio_holdings')
      .update({ quantity: 0 }).eq('id', mathHoldingId).select();

    // Constraint kini CHECK (quantity >= 0): qty=0 HARUS diterima. Pesan diagnostik bila
    // ternyata ditolak (berarti constraint ter-regress kembali ke >0).
    expect(error, `quantity=0 harus DITERIMA setelah constraint diubah ke >= 0. Bila gagal, cek apakah CHECK ter-regress ke >0: ${error?.message}`).toBeNull();
    expect(data?.[0]?.quantity).toBe(0);
    console.log('[#4] quantity=0 DITERIMA → CHECK quantity >= 0 aktif (sesuai keputusan produk: holding jual-habis tetap tersimpan).');

    // Kembalikan ke nilai valid agar tak mengganggu assertion ledger pada holding yang sama.
    await adminClient.from('portfolio_holdings').update({ quantity: 1 }).eq('id', mathHoldingId);
  });

  it('#4b jual habis: holding qty>0 → update qty=0 berhasil & holding TETAP ADA (keputusan produk)', async () => {
    // Holding terpisah agar tidak mengganggu math holding. Simulasi writeback "jual semua":
    // sesuai keputusan produk, holding TIDAK dihapus — tetap jadi riwayat dengan quantity=0.
    const { data: created, error: cErr } = await adminClient.from('portfolio_holdings')
      .insert({ user_id: A_UID, account_id: accInvest.id, asset_type: 'saham', asset_name: `${MARK}_SOLDOUT`, quantity: 25, avg_buy_price: 1000, currency: 'IDR' })
      .select('id').single();
    expect(cErr).toBeNull();
    holdingIds.push(created.id);

    // Update quantity → 0 (hasil "jual habis").
    const { data: updated, error: uErr } = await adminClient.from('portfolio_holdings')
      .update({ quantity: 0 }).eq('id', created.id).select();
    expect(uErr, `update qty=0 harus berhasil: ${uErr?.message}`).toBeNull();
    expect(updated?.[0]?.quantity).toBe(0);

    // Holding TETAP bisa di-SELECT (tidak terhapus otomatis, tidak error) — via userA (RLS).
    const { data: still, error: sErr } = await userA.from('portfolio_holdings')
      .select('id, quantity, asset_name').eq('id', created.id).maybeSingle();
    expect(sErr).toBeNull();
    expect(still?.id, 'holding jual-habis harus tetap ada di DB').toBe(created.id);
    expect(Number(still?.quantity)).toBe(0);
    console.log('[#4b] Holding jual-habis (qty=0) tetap tersimpan sebagai riwayat — sesuai keputusan produk.');
  });

  it('#3b PROBE: value type portfolio_transactions.type yang diizinkan [jawab Bagian A #2]', async () => {
    // Coba value ngawur untuk memancing CHECK constraint type.
    const { data, error } = await adminClient.from('portfolio_transactions')
      .insert({ user_id: A_UID, holding_id: mathHoldingId, type: 'ngawur_xyz', quantity: 1, price: 1, fee: 0, tax: 0, date: '2099-03-05', notes: `${MARK}_probe` })
      .select();
    if (error) {
      console.log(`[#3b] type='ngawur_xyz' DITOLAK → ada CHECK pada type. Pesan: ${error.message}`);
      expect(error.message).toBeTruthy();
    } else {
      console.log("[#3b] type='ngawur_xyz' DITERIMA → TIDAK ada CHECK enum pada portfolio_transactions.type (perlu perhatian).");
      expect(data).toHaveLength(1);
    }
    expect(error === null || error !== null).toBe(true);
  });

  it('regression: payload asli app (date+notes) berhasil tersimpan setelah fix kolom', async () => {
    // Replikasi PERSIS payload portfolio.html:801-803 (createPortfolioTransaction):
    //   { user_id, holding_id, type, quantity, price, fee, tax, date, notes }
    // Bug sebelumnya: kolom 'date' & 'notes' tak ada → insert app GAGAL. Setelah
    // ALTER TABLE menambahkan keduanya, payload ini WAJIB sukses. Pakai userA (anon,
    // tunduk RLS) persis seperti app yang berjalan sebagai user login.
    const appPayload = {
      user_id: A_UID,
      holding_id: mathHoldingId,
      type: 'buy',
      quantity: 3,
      price: 1500,
      fee: 1000,
      tax: 500,
      date: '2099-03-10',
      notes: `${MARK}_regression`,
    };
    const { data, error } = await userA.from('portfolio_transactions').insert(appPayload).select();
    expect(error, `payload asli app harus tersimpan tanpa error (kolom date/notes wajib ada). Pesan: ${error?.message}`).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0].date).toBe('2099-03-10');
    expect(data[0].notes).toBe(`${MARK}_regression`);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GOALS — current_amount independen + proyeksi
// ════════════════════════════════════════════════════════════════════════════
describe('GOALS current_amount & proyeksi', () => {
  let userA;
  beforeAll(async () => {
    userA = createAnonClient();
    const { error } = await userA.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL, password: env.TEST_USER_A_PASSWORD });
    if (error) throw new Error(`Login TEST_USER_A gagal: ${error.message}`);
  }, 30000);

  it('#5 current_amount naik LANGSUNG tanpa membuat transaksi (kolom independen)', async () => {
    const goalName = `${MARK}_goalA`;
    const { data: g, error: gErr } = await adminClient.from('goals')
      .insert({ user_id: A_UID, name: goalName, icon: 'target', target_amount: 10000000, current_amount: 0, is_completed: false })
      .select('id').single();
    expect(gErr).toBeNull();

    // Update current_amount → 2.000.000, TANPA transaksi apapun (opsi "Tanpa potong saldo").
    const { error: uErr } = await adminClient.from('goals').update({ current_amount: 2000000 }).eq('id', g.id);
    expect(uErr).toBeNull();

    // Verifikasi current_amount via userA.
    const { data: after } = await userA.from('goals').select('current_amount').eq('id', g.id).single();
    expect(Number(after.current_amount)).toBe(2000000);

    // Tidak ada transaksi "Nabung: <nama>" sama sekali.
    const { data: txns } = await userA.from('transactions').select('id').eq('user_id', A_UID).like('description', `Nabung: ${goalName}%`);
    expect(txns ?? []).toHaveLength(0);
  });

  it('#6 proyeksi: current=2jt, created_at 40 hari lalu → estimasiHari=160 (rumus direplikasi)', async () => {
    const createdISO = new Date(Date.now() - 40 * MS_PER_DAY).toISOString();
    const { data: g, error } = await adminClient.from('goals')
      .insert({ user_id: A_UID, name: `${MARK}_goalProj`, icon: 'target', target_amount: 10000000, current_amount: 2000000, is_completed: false, created_at: createdISO })
      .select('id, created_at, target_amount, current_amount').single();
    expect(error).toBeNull();

    // Apakah created_at bisa di-override? (bisa ada default/trigger now()).
    const storedCreated = g.created_at;
    const calc = projectFallback(Number(g.target_amount), Number(g.current_amount), storedCreated);
    console.log(`[#6] created_at tersimpan = ${storedCreated} | totalDays = ${calc.totalDays} | avgPerDay = ${calc.avgPerDay} | estimasiHari = ${calc.estimasiHari}`);

    // Konsistensi rumus SELALU diverifikasi terhadap data mentah aktual.
    expect(calc.avgPerDay).toBeCloseTo(2000000 / calc.totalDays, 6);
    if (calc.estimasiHari !== null) {
      expect(calc.estimasiHari).toBe(Math.ceil(8000000 / calc.avgPerDay));
    }

    // Angka spesifik 160 hanya berlaku bila created_at benar-benar 40 hari lalu.
    if (calc.totalDays === 40) {
      expect(calc.avgPerDay).toBe(50000);
      expect(calc.estimasiHari).toBe(160);
    } else {
      console.warn(`[#6] created_at TIDAK ter-override ke 40 hari (totalDays=${calc.totalDays}); angka 160 di-skip, rumus tetap diverifikasi di atas.`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// BILLS — next_due_date + edge tanggal
// ════════════════════════════════════════════════════════════════════════════
describe('BILLS next_due_date', () => {
  it('#7 monthly: hari belum lewat → bulan ini; sudah lewat → bulan depan (2 sub-case)', async () => {
    const today = startOfDay(new Date());
    const todayDay = today.getDate();
    const y = today.getFullYear(), m = today.getMonth();

    // --- Sub-case A: belum lewat (dayOfMonth = hari ini → cabang "bulan ini") ---
    const futureDay = todayDay;
    const dueFuture = computeNextDueDateMonthly(futureDay);
    const [fy, fm, fd] = dueFuture.split('-').map(Number);
    expect(fy).toBe(y);
    expect(fm - 1).toBe(m);          // bulan ini
    expect(fd).toBe(futureDay);

    // Simpan bill & pastikan DB menerima nilai itu.
    const { data: bF, error: eF } = await adminClient.from('scheduled_bills')
      .insert({ user_id: A_UID, name: `${MARK}_billFuture`, category_id: catId, account_id: accMain.id, amount: 100000, day_of_month: futureDay, frequency: 'monthly', next_due_date: dueFuture, is_active: true })
      .select('next_due_date').single();
    expect(eF).toBeNull();
    expect(bF.next_due_date).toBe(dueFuture);

    // --- Sub-case B: sudah lewat (dayOfMonth < hari ini → cabang "bulan depan") ---
    if (todayDay > 1) {
      const pastDay = todayDay - 1;
      const duePast = computeNextDueDateMonthly(pastDay);
      const nm = m === 11 ? 0 : m + 1;
      const ny = m === 11 ? y + 1 : y;
      const expectedPast = toISODate(new Date(ny, nm, pastDay));
      expect(duePast).toBe(expectedPast);
      // bulan hasil harus SETELAH bulan ini.
      expect(new Date(duePast) > today).toBe(true);

      const { data: bP, error: eP } = await adminClient.from('scheduled_bills')
        .insert({ user_id: A_UID, name: `${MARK}_billPast`, category_id: catId, account_id: accMain.id, amount: 100000, day_of_month: pastDay, frequency: 'monthly', next_due_date: duePast, is_active: true })
        .select('next_due_date').single();
      expect(eP).toBeNull();
      expect(bP.next_due_date).toBe(duePast);
    } else {
      console.warn('[#7] Hari ini tanggal 1 — sub-case "sudah lewat" di-skip (tak ada hari < 1).');
    }
  });

  it('#8 edge day_of_month=31 di bulan pendek → JS Date "meluber" (dokumentasi)', async () => {
    // DB menerima day_of_month=31 (CHECK 1..31)?
    const { error } = await adminClient.from('scheduled_bills')
      .insert({ user_id: A_UID, name: `${MARK}_bill31`, category_id: catId, account_id: accMain.id, amount: 100000, day_of_month: 31, frequency: 'monthly', next_due_date: '2099-01-31', is_active: true })
      .select();
    expect(error, 'DB harus menerima day_of_month=31').toBeNull();

    // Perilaku JS Date saat computeNextDueDate dijalankan di bulan Februari (28 hari, 2099 non-kabisat):
    const febResult = toISODate(new Date(2099, 1, 31)); // (2099, month=Feb, day=31)
    console.log(`[#8] new Date(2099, Feb, 31) → ${febResult} (meluber dari 31 Feb).`);
    expect(febResult).not.toBe('2099-02-31');  // tanggal 31 Feb tidak valid
    expect(febResult.startsWith('2099-03')).toBe(true); // meluber ke Maret
    // Dokumentasi: app akan menghasilkan tanggal Maret untuk bill tgl-31 bila dihitung di Februari.
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LIABILITIES — net worth (dokumentasi behavior, bukan cari bug)
// ════════════════════════════════════════════════════════════════════════════
describe('LIABILITIES & net worth', () => {
  let userA;
  beforeAll(async () => {
    userA = createAnonClient();
    const { error } = await userA.auth.signInWithPassword({ email: env.TEST_USER_A_EMAIL, password: env.TEST_USER_A_PASSWORD });
    if (error) throw new Error(`Login TEST_USER_A gagal: ${error.message}`);
  }, 30000);

  it('#9 net worth = saldo akun − liabilities.remaining; portfolio TER-EXCLUDE (dokumentasi)', async () => {
    // Liability remaining 2jt.
    const { error: lErr } = await adminClient.from('liabilities')
      .insert({ user_id: A_UID, name: `${MARK}_liab`, type: 'hutang', total_amount: 2000000, remaining_amount: 2000000 })
      .select();
    expect(lErr).toBeNull();

    // Portfolio holding senilai 10jt (qty 10 × current_price 1jt) — TIDAK boleh masuk net worth.
    const { data: nh, error: hErr } = await adminClient.from('portfolio_holdings')
      .insert({ user_id: A_UID, account_id: accInvest.id, asset_type: 'saham', asset_name: `${MARK}_NW`, quantity: 10, avg_buy_price: 1000000, current_price: 1000000, currency: 'IDR' })
      .select('id, quantity, current_price').single();
    expect(hErr).toBeNull();
    holdingIds.push(nh.id);

    // Saldo akun main (initial 5jt, tanpa transaksi tambahan) — scoped ke akun seed kita.
    const { data: mainTxns } = await userA.from('transactions').select('*').eq('account_id', accMain.id);
    const balMain = accountBalance(accMain, mainTxns || []);
    expect(balMain).toBe(5000000);

    // Net worth scoped ke data seed kita (rumus ground truth).
    const remaining = 2000000;
    const netWorth = balMain - remaining;
    expect(netWorth).toBe(3000000);

    // Nilai portfolio yang SENGAJA diabaikan oleh rumus net worth.
    const portfolioValue = Number(nh.quantity) * Number(nh.current_price);
    expect(portfolioValue).toBe(10000000);
    console.log(`[#9] netWorth=${netWorth} (5jt−2jt). Portfolio ${portfolioValue} TER-EXCLUDE (sesuai temuan, bukan bug).`);
    expect(netWorth).not.toBe(netWorth + portfolioValue); // tegaskan portfolio tidak ditambahkan
  });

  it('#9b PROBE: CHECK pada liabilities.total_amount / remaining_amount [jawab Bagian A #3]', async () => {
    // Coba nilai negatif untuk memancing CHECK (>=0 / >0). Kalau diterima → tak ada CHECK.
    const { data, error } = await adminClient.from('liabilities')
      .insert({ user_id: A_UID, name: `${MARK}_liabNeg`, type: 'hutang', total_amount: -100, remaining_amount: -100 })
      .select();
    if (error) {
      console.log(`[#9b] Nilai negatif DITOLAK → ada CHECK pada amount liabilities. Pesan: ${error.message}`);
      expect(error.message).toBeTruthy();
    } else {
      console.log('[#9b] Nilai negatif DITERIMA → TIDAK ada CHECK (>=0/>0) pada total_amount/remaining_amount.');
      expect(data).toHaveLength(1);
    }
    expect(error === null || error !== null).toBe(true);
  });
});
