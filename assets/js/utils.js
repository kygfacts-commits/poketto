// Poketto - Util functions umum
// Diimpor sebagai ES module: import { formatCurrency, formatDate, getMonthRange } from './utils.js'

const CURRENCY_LOCALES = {
  IDR: 'id-ID',
  USD: 'en-US',
  SGD: 'en-SG',
};

export function formatCurrency(number, currency = 'IDR') {
  const locale = CURRENCY_LOCALES[currency] || 'id-ID';
  const fractionDigits = currency === 'IDR' ? 0 : 2;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(number);
}

export function formatDate(date, locale = 'id-ID') {
  const d = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function getAccountBalance(accountId, accounts, transactions) {
  const account = accounts.find((a) => a.id === accountId);
  const initialBalance = Number(account?.initial_balance) || 0;

  return transactions.reduce((balance, tx) => {
    const amount = Number(tx.amount) || 0;

    if (tx.type === 'income' && tx.account_id === accountId) {
      return balance + amount;
    }
    if (tx.type === 'expense' && tx.account_id === accountId) {
      return balance - amount;
    }
    if (tx.type === 'transfer') {
      if (tx.account_id === accountId) balance -= amount;
      if (tx.to_account_id === accountId) balance += amount;
    }
    return balance;
  }, initialBalance);
}

// Gabungkan dua baris transfer (transfer_out + transfer_in) dengan transfer_pair_id sama
// menjadi SATU item tampilan. Baris non-transfer dilewatkan apa adanya.
// Item gabungan: { ...rowOut, __isTransfer:true, fromAccountId, toAccountId, amount }.
// Urutan dipertahankan berdasarkan posisi kemunculan pertama dari pasangan.
export function groupTransferPairs(transactions) {
  const byPair = new Map();
  for (const tx of transactions) {
    if (!tx.transfer_pair_id) continue;
    if (!byPair.has(tx.transfer_pair_id)) byPair.set(tx.transfer_pair_id, []);
    byPair.get(tx.transfer_pair_id).push(tx);
  }

  const seen = new Set();
  const result = [];
  for (const tx of transactions) {
    if (!tx.transfer_pair_id) {
      result.push(tx);
      continue;
    }
    if (seen.has(tx.transfer_pair_id)) continue;
    seen.add(tx.transfer_pair_id);

    const pair = byPair.get(tx.transfer_pair_id);
    const out = pair.find((t) => t.transfer_type === 'transfer_out') || pair[0];
    const inn = pair.find((t) => t.transfer_type === 'transfer_in') || pair.find((t) => t !== out) || out;
    result.push({
      ...out,
      __isTransfer: true,
      id: out.id,
      transfer_pair_id: tx.transfer_pair_id,
      fromAccountId: out.account_id,
      toAccountId: inn ? inn.account_id : null,
      amount: out.amount,
    });
  }
  return result;
}

export function formatDateWithDay(date, locale = 'id-ID') {
  const d = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatThousands(value) {
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('id-ID');
}

export function parseThousands(value) {
  return Number(String(value).replace(/\D/g, '')) || 0;
}

export function attachThousandsInput(input) {
  input.addEventListener('input', (e) => {
    const cursorFromEnd = e.target.value.length - e.target.selectionStart;
    e.target.value = formatThousands(e.target.value);
    const pos = Math.max(0, e.target.value.length - cursorFromEnd);
    e.target.setSelectionRange(pos, pos);
  });
}

// ── Validasi & format input numerik (Tugas 2) ────────────────────────────────
// Attach formatter ribuan ke input integer (alias semantik dari attachThousandsInput).
// Mengembalikan fungsi getter yang membaca nilai numerik murni saat dipanggil.
export function formatNumberInput(input) {
  attachThousandsInput(input);
  return () => getRawNumber(input.value);
}

// Hapus semua titik/karakter non-digit → integer murni. Bila mengandung koma desimal
// (format id-ID), koma diperlakukan sebagai pemisah desimal.
export function getRawNumber(formattedString) {
  const str = String(formattedString ?? '').trim();
  if (str.includes(',')) {
    const cleaned = str.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
    return parseFloat(cleaned) || 0;
  }
  return parseInt(str.replace(/\D/g, ''), 10) || 0;
}

// Validasi nominal: { valid, message }. Default min 1, max 1 triliun.
export function validateAmount(value, min = 1, max = 999999999999) {
  const n = typeof value === 'number' ? value : getRawNumber(value);
  if (!n || isNaN(n) || n <= 0) {
    return { valid: false, message: 'Jumlah harus lebih dari 0' };
  }
  if (n < min) {
    return { valid: false, message: `Jumlah minimal ${formatThousands(String(min))}` };
  }
  if (n > max) {
    return { valid: false, message: `Jumlah maksimal ${formatThousands(String(max))}` };
  }
  return { valid: true, message: '' };
}

// Validasi nilai desimal (mis. quantity portfolio). Mengizinkan pecahan.
export function validateDecimal(value, min = 0, max = 999999999999) {
  const n = parseFloat(String(value).replace(/[^\d.]/g, ''));
  const num = isNaN(n) ? 0 : n;
  if (!num || num <= 0) return { valid: false, message: 'Nilai harus lebih dari 0' };
  if (num < min) return { valid: false, message: `Nilai minimal ${min}` };
  if (num > max) return { valid: false, message: `Nilai maksimal ${max}` };
  return { valid: true, message: '' };
}

// Attach handler ke input desimal: hanya izinkan digit dan satu titik desimal.
export function attachDecimalInput(input) {
  input.addEventListener('input', (e) => {
    let v = e.target.value.replace(/[^\d.]/g, '');
    const firstDot = v.indexOf('.');
    if (firstDot !== -1) {
      v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
    }
    e.target.value = v;
  });
}

// Animasi shake untuk feedback validasi gagal.
export function shakeElement(el) {
  if (!el) return;
  el.classList.add('animate-shake');
  setTimeout(() => el.classList.remove('animate-shake'), 500);
}

export function getMonthRange(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);

  const toISODate = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  return {
    start: toISODate(start),
    end: toISODate(end),
  };
}
