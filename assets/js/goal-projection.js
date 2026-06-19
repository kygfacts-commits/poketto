// Poketto - Goal Projection
// Estimasi kapan sebuah goal akan tercapai berdasarkan kecepatan menabung user.
// Tidak ada tabel riwayat kontribusi terpisah di schema, jadi sumber data:
//   1. Transaksi "Nabung: <nama goal>" (dibuat saat Tambah Dana memotong saldo akun) — riwayat akurat.
//   2. Fallback: created_at goal + current_amount bila tidak ada transaksi eksplisit.
// Diimpor sebagai ES module dari pages/goals.html.

const MS_PER_DAY = 86400000;

// Normalisasi 'YYYY-MM-DD' atau ISO timestamp ke Date lokal (tengah malam).
function parseDate(str) {
  const [y, m, d] = String(str).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function startOfToday() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

// Bangun array kontribusi { date, amount } untuk sebuah goal dari daftar transaksi user.
// Mengembalikan array terurut menaik (date ascending). Lihat catatan sumber data di atas.
export function buildContributions(goal, transactions = []) {
  const tag = `Nabung: ${goal.name}`;
  const list = (transactions || [])
    .filter((t) => t.type === 'expense' && t.description === tag)
    .map((t) => ({ date: t.date, amount: Number(t.amount) }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  if (list.length > 0) return list;

  // Fallback sederhana: anggap progres terkumpul sejak goal dibuat.
  if (Number(goal.current_amount) > 0 && goal.created_at) {
    return [{ date: String(goal.created_at).slice(0, 10), amount: Number(goal.current_amount), synthetic: true }];
  }
  return [];
}

// Lengkapi hasil proyeksi dengan info deadline (target_date) bila goal punya.
// Membandingkan kecepatan aktual (avgPerDay) dengan yang dibutuhkan agar tepat waktu.
function attachDeadline(base, goal) {
  if (!goal.target_date) return { ...base, hasDeadline: false };

  const today = startOfToday();
  const deadline = parseDate(goal.target_date);
  const sisaHariDeadline = Math.ceil((deadline - today) / MS_PER_DAY);
  const sisaTarget = (Number(goal.target_amount) || 0) - (Number(goal.current_amount) || 0);
  // Berapa yang HARUS ditabung per hari untuk capai deadline.
  const requiredPerDay = sisaHariDeadline > 0 ? Math.ceil(sisaTarget / sisaHariDeadline) : sisaTarget;
  const avgPerDay = base.avgPerDay || 0;

  let deadlineStatus;
  if (base.status === 'completed') deadlineStatus = 'completed';
  else if (base.status === 'no_data') deadlineStatus = 'no_data';
  else if (avgPerDay >= requiredPerDay) deadlineStatus = 'on_track';
  else deadlineStatus = 'behind';

  return { ...base, hasDeadline: true, sisaHariDeadline, requiredPerDay, deadlineStatus };
}

// goal = { target_amount, current_amount, created_at, target_date? }
// contributions = array riwayat "Tambah Dana" (terurut by date)
export function calculateProjection(goal, contributions) {
  const target = Number(goal.target_amount) || 0;
  const current = Number(goal.current_amount) || 0;
  let base;

  // 1. Tidak ada data kontribusi.
  if (!contributions || contributions.length === 0) {
    base = { status: 'no_data', message: 'Mulai nabung untuk goal ini' };
  } else {
    // 2. Rata-rata kontribusi per hari sejak kontribusi pertama.
    const sorted = [...contributions].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const firstDate = parseDate(sorted[0].date);
    const today = startOfToday();
    const totalDays = Math.max(1, Math.floor((today - firstDate) / MS_PER_DAY));
    const avgPerDay = current / totalDays;
    const sisaTarget = target - current;

    if (avgPerDay <= 0) {
      // 3. Stagnan.
      base = { status: 'stalled', message: 'Belum ada progress dalam periode ini' };
    } else if (sisaTarget <= 0) {
      // 4. Sudah tercapai.
      base = { status: 'completed' };
    } else {
      // 5. Estimasi.
      const estimasiHari = Math.ceil(sisaTarget / avgPerDay);
      const estimasiTanggal = new Date(today.getTime() + estimasiHari * MS_PER_DAY);

      // 6. Kategori kecepatan.
      let status, message;
      if (estimasiHari <= 30) { status = 'fast'; message = 'Sebentar lagi! 🚀'; }
      else if (estimasiHari <= 180) { status = 'normal'; message = 'Sesuai jalur 👍'; }
      else { status = 'slow'; message = 'Perlu percepat nabung 🐢'; }

      base = { status, estimasiTanggal, estimasiHari, avgPerDay, message };
    }
  }

  return attachDeadline(base, goal);
}

// Simulasi "apa jika nabung Rp X/hari". Mengembalikan { days, date } atau null.
export function simulateProjection(remaining, perDay) {
  if (perDay <= 0 || remaining <= 0) return null;
  const days = Math.ceil(remaining / perDay);
  const date = new Date(startOfToday().getTime() + days * MS_PER_DAY);
  return { days, date };
}

// Format tanggal Indonesia: "12 Jun 2026".
export function formatProjectionDate(date) {
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Simulasi berbasis HARI: user pilih ingin selesai dalam berapa hari → hitung rupiah/hari.
export function simulateByDays(remainingAmount, days) {
  if (days <= 0) return { perDay: remainingAmount, valid: false };
  const perDay = Math.ceil(remainingAmount / days);
  return { perDay, valid: true };
}

// Apakah sebuah kontribusi tergolong "besar" (≥ 5 hari nabung dengan kecepatan normal)?
export function isSignificantContribution(amount, avgPerDayBefore) {
  if (!avgPerDayBefore || avgPerDayBefore <= 0) return false;
  return amount >= avgPerDayBefore * 5;
}
