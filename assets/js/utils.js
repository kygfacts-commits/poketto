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
