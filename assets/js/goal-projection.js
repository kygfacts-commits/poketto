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

// goal = { target_amount, current_amount, created_at }
// contributions = array riwayat "Tambah Dana" (terurut by date)
export function calculateProjection(goal, contributions) {
  const target = Number(goal.target_amount) || 0;
  const current = Number(goal.current_amount) || 0;

  // 1. Tidak ada data kontribusi.
  if (!contributions || contributions.length === 0) {
    return { status: 'no_data', message: 'Mulai nabung untuk goal ini' };
  }

  // 2. Rata-rata kontribusi per hari sejak kontribusi pertama.
  const sorted = [...contributions].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const firstDate = parseDate(sorted[0].date);
  const today = startOfToday();
  const totalDays = Math.max(1, Math.floor((today - firstDate) / MS_PER_DAY));
  const avgPerDay = current / totalDays;

  // 3. Stagnan.
  if (avgPerDay <= 0) {
    return { status: 'stalled', message: 'Belum ada progress dalam periode ini' };
  }

  // 4. Sudah tercapai.
  const sisaTarget = target - current;
  if (sisaTarget <= 0) {
    return { status: 'completed' };
  }

  // 5. Estimasi.
  const estimasiHari = Math.ceil(sisaTarget / avgPerDay);
  const estimasiTanggal = new Date(today.getTime() + estimasiHari * MS_PER_DAY);

  // 6. Kategori kecepatan.
  let status, message;
  if (estimasiHari <= 30) { status = 'fast'; message = 'Sebentar lagi! 🚀'; }
  else if (estimasiHari <= 180) { status = 'normal'; message = 'Sesuai jalur 👍'; }
  else { status = 'slow'; message = 'Perlu percepat nabung 🐢'; }

  return { status, estimasiTanggal, estimasiHari, avgPerDay, message };
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
