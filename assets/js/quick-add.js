// Poketto — Quick Add bottom sheet
// Long-press tombol + di bottom nav → buka sheet input transaksi cepat.
// Tap singkat tetap navigate ke add.html (form lengkap).

import { supabase } from './supabase-client.js';
import { fetchAccounts } from './accounts.js';
import { fetchCategories, getCategoryColorClasses } from './categories.js';
import { createTransaction } from './add.js';
import { showToast } from './toast.js';
import { formatThousands } from './utils.js';

let currentUser = null;
let accounts = [];
let catsByType = { income: [], expense: [] };
let dataLoaded = false;

let qaType = 'expense';
let qaAccountId = '';
let qaCategoryId = null;
let qaExpr = '';

const SHEET_HTML = `
<div id="qa-backdrop" class="hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-[80]"></div>
<div id="qa-sheet" class="fixed left-0 right-0 bottom-0 z-[90] bg-white rounded-t-3xl shadow-2xl translate-y-full transition-transform duration-300 max-h-[92vh] overflow-y-auto" style="font-family:inherit">
  <div class="flex justify-center pt-3 pb-1"><div class="w-10 h-1 rounded-full bg-gray-200"></div></div>
  <div class="px-5 pb-6 pt-2 max-w-md mx-auto">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-bold text-[#1E1B4B]">Quick Add</h3>
      <button id="qa-close" class="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <!-- Type toggle -->
    <div class="flex gap-2 mb-4">
      <button type="button" data-qa-type="expense" class="qa-type-btn flex-1 px-4 py-2 rounded-full text-sm font-semibold transition-colors">Pengeluaran</button>
      <button type="button" data-qa-type="income" class="qa-type-btn flex-1 px-4 py-2 rounded-full text-sm font-semibold transition-colors">Pemasukan</button>
    </div>

    <!-- Amount display -->
    <div id="qa-amount" class="text-4xl font-bold text-center text-[#1E1B4B] border-b-2 border-[#DDD6FE] py-3 mb-4 overflow-x-auto whitespace-nowrap">0</div>

    <!-- Inline calculator -->
    <div class="grid grid-cols-4 gap-2 mb-4">
      <button type="button" class="qa-key bg-gray-50 rounded-xl py-3 font-semibold text-[#1E1B4B]" data-k="7">7</button>
      <button type="button" class="qa-key bg-gray-50 rounded-xl py-3 font-semibold text-[#1E1B4B]" data-k="8">8</button>
      <button type="button" class="qa-key bg-gray-50 rounded-xl py-3 font-semibold text-[#1E1B4B]" data-k="9">9</button>
      <button type="button" class="qa-key bg-[#EDE9FE] text-[#8B5CF6] rounded-xl py-3 font-semibold" data-k="÷">÷</button>
      <button type="button" class="qa-key bg-gray-50 rounded-xl py-3 font-semibold text-[#1E1B4B]" data-k="4">4</button>
      <button type="button" class="qa-key bg-gray-50 rounded-xl py-3 font-semibold text-[#1E1B4B]" data-k="5">5</button>
      <button type="button" class="qa-key bg-gray-50 rounded-xl py-3 font-semibold text-[#1E1B4B]" data-k="6">6</button>
      <button type="button" class="qa-key bg-[#EDE9FE] text-[#8B5CF6] rounded-xl py-3 font-semibold" data-k="×">×</button>
      <button type="button" class="qa-key bg-gray-50 rounded-xl py-3 font-semibold text-[#1E1B4B]" data-k="1">1</button>
      <button type="button" class="qa-key bg-gray-50 rounded-xl py-3 font-semibold text-[#1E1B4B]" data-k="2">2</button>
      <button type="button" class="qa-key bg-gray-50 rounded-xl py-3 font-semibold text-[#1E1B4B]" data-k="3">3</button>
      <button type="button" class="qa-key bg-[#EDE9FE] text-[#8B5CF6] rounded-xl py-3 font-semibold" data-k="-">−</button>
      <button type="button" class="qa-key bg-gray-100 text-gray-600 rounded-xl py-3 font-semibold" data-k="C">C</button>
      <button type="button" class="qa-key bg-gray-50 rounded-xl py-3 font-semibold text-[#1E1B4B]" data-k="0">0</button>
      <button type="button" class="qa-key bg-gray-50 rounded-xl py-3 font-semibold text-[#1E1B4B]" data-k=".">.</button>
      <button type="button" class="qa-key bg-[#EDE9FE] text-[#8B5CF6] rounded-xl py-3 font-semibold" data-k="+">+</button>
    </div>

    <!-- Account -->
    <select id="qa-account" class="w-full rounded-xl border border-[#DDD6FE] px-4 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]"></select>

    <!-- Category grid -->
    <div id="qa-cats" class="flex gap-2 overflow-x-auto scrollbar-hide pb-1 mb-3"></div>

    <!-- Description -->
    <input type="text" id="qa-desc" placeholder="Deskripsi singkat (opsional)" class="w-full rounded-xl border border-[#DDD6FE] px-4 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#8B5CF6]">

    <p id="qa-error" class="hidden text-sm text-red-500 mb-2"></p>
    <button type="button" id="qa-save" class="w-full bg-[#8B5CF6] hover:bg-lavender-dark text-white font-bold rounded-2xl py-3.5 transition-colors">Simpan</button>
  </div>
</div>`;

function evalExpr(s) {
  const expr = String(s).replace(/×/g, '*').replace(/÷/g, '/');
  const tokens = expr.match(/(\d+\.?\d*|\.\d+)|[+\-*/]/g);
  if (!tokens || !tokens.length) return 0;
  const first = parseFloat(tokens[0]);
  if (isNaN(first)) return 0;
  const values = [first];
  const ops = [];
  for (let k = 1; k < tokens.length; k += 2) {
    const op = tokens[k];
    const num = parseFloat(tokens[k + 1]);
    if (isNaN(num)) break;
    if (op === '*') values[values.length - 1] *= num;
    else if (op === '/') values[values.length - 1] = num === 0 ? 0 : values[values.length - 1] / num;
    else { values.push(num); ops.push(op); }
  }
  let result = values[0];
  for (let k = 0; k < ops.length; k++) result = ops[k] === '+' ? result + values[k + 1] : result - values[k + 1];
  return result;
}

function renderAmount() {
  document.getElementById('qa-amount').textContent = qaExpr || '0';
}

function renderTypeButtons() {
  document.querySelectorAll('.qa-type-btn').forEach((btn) => {
    const active = btn.dataset.qaType === qaType;
    btn.className = `qa-type-btn flex-1 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${active ? 'bg-[#8B5CF6] text-white' : 'bg-gray-100 text-gray-500'}`;
  });
}

function renderCats() {
  const cats = (catsByType[qaType] || []).slice(0, 8);
  const wrap = document.getElementById('qa-cats');
  if (cats.length && !cats.some((c) => c.id === qaCategoryId)) qaCategoryId = null;
  wrap.innerHTML = cats.map((c) => {
    const cc = getCategoryColorClasses(c.color || 'slate');
    const active = c.id === qaCategoryId;
    return `<button type="button" data-cat="${c.id}" class="qa-cat flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-colors ${active ? 'border-[#8B5CF6] bg-lavender-light/30' : 'border-transparent'}">
      <span class="w-11 h-11 rounded-full flex items-center justify-center ${cc.bg}"><i data-lucide="${c.icon || 'circle'}" class="w-5 h-5 ${cc.icon}"></i></span>
      <span class="text-[10px] text-gray-600 max-w-[56px] truncate">${c.name}</span>
    </button>`;
  }).join('') || '<p class="text-xs text-gray-400 py-3">Belum ada kategori.</p>';

  wrap.querySelectorAll('.qa-cat').forEach((btn) => {
    btn.addEventListener('click', () => { qaCategoryId = btn.dataset.cat; renderCats(); });
  });
  if (window.lucide) lucide.createIcons();
}

async function ensureData() {
  if (dataLoaded) return;
  const { data: { user } } = await supabase.auth.getUser();
  currentUser = user;
  if (!currentUser) return;
  try {
    [accounts, catsByType.income, catsByType.expense] = await Promise.all([
      fetchAccounts(currentUser.id),
      fetchCategories('income', currentUser.id),
      fetchCategories('expense', currentUser.id),
    ]);
    dataLoaded = true;
  } catch (err) {
    console.log('[quick-add] gagal memuat data:', err.message);
  }
  document.getElementById('qa-account').innerHTML =
    accounts.map((a) => `<option value="${a.id}">${a.name}</option>`).join('');
  qaAccountId = accounts[0]?.id || '';
}

async function openSheet() {
  await ensureData();
  qaType = 'expense'; qaExpr = ''; qaCategoryId = null;
  document.getElementById('qa-desc').value = '';
  document.getElementById('qa-error').classList.add('hidden');
  renderTypeButtons();
  renderAmount();
  renderCats();
  const backdrop = document.getElementById('qa-backdrop');
  const sheet = document.getElementById('qa-sheet');
  backdrop.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => { sheet.classList.remove('translate-y-full'); });
}

function closeSheet() {
  const backdrop = document.getElementById('qa-backdrop');
  const sheet = document.getElementById('qa-sheet');
  sheet.classList.add('translate-y-full');
  document.body.style.overflow = '';
  setTimeout(() => backdrop.classList.add('hidden'), 300);
}

async function saveQuickAdd() {
  const errEl = document.getElementById('qa-error');
  errEl.classList.add('hidden');
  const amount = Math.max(0, Math.round(evalExpr(qaExpr)));
  const accountId = document.getElementById('qa-account').value;

  if (!accountId) { errEl.textContent = 'Pilih akun terlebih dahulu.'; errEl.classList.remove('hidden'); return; }
  if (!amount || amount <= 0) { errEl.textContent = 'Jumlah harus lebih dari 0.'; errEl.classList.remove('hidden'); return; }
  if (!qaCategoryId) { errEl.textContent = 'Pilih kategori terlebih dahulu.'; errEl.classList.remove('hidden'); return; }

  const saveBtn = document.getElementById('qa-save');
  saveBtn.disabled = true; saveBtn.textContent = 'Memuat...';

  const today = new Date().toISOString().slice(0, 10);
  try {
    await createTransaction({
      user_id: currentUser.id,
      account_id: accountId,
      category_id: qaCategoryId,
      subcategory_id: null,
      tags: null,
      to_account_id: null,
      type: qaType,
      amount,
      description: document.getElementById('qa-desc').value.trim() || null,
      date: today,
    });
    closeSheet();
    showToast('Transaksi berhasil disimpan.');
    setTimeout(() => window.location.reload(), 600);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
    saveBtn.disabled = false; saveBtn.textContent = 'Simpan';
  }
}

function wireSheet() {
  document.getElementById('qa-close').addEventListener('click', closeSheet);
  document.getElementById('qa-backdrop').addEventListener('click', closeSheet);
  document.getElementById('qa-save').addEventListener('click', saveQuickAdd);

  document.querySelectorAll('.qa-type-btn').forEach((btn) => {
    btn.addEventListener('click', () => { qaType = btn.dataset.qaType; renderTypeButtons(); renderCats(); });
  });
  document.getElementById('qa-account').addEventListener('change', (e) => { qaAccountId = e.target.value; });

  document.querySelectorAll('.qa-key').forEach((btn) => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.k;
      if (k === 'C') { qaExpr = ''; renderAmount(); return; }
      const last = qaExpr.slice(-1);
      const isOp = (c) => '+-×÷'.includes(c);
      if (isOp(k)) {
        if (qaExpr === '') return;
        if (isOp(last)) qaExpr = qaExpr.slice(0, -1);
      }
      qaExpr += k;
      renderAmount();
    });
  });
}

export function initQuickAdd() {
  const addBtn = document.querySelector('.pkn-add-btn');
  if (!addBtn || document.getElementById('qa-sheet')) return;

  // Inject sheet
  const holder = document.createElement('div');
  holder.innerHTML = SHEET_HTML;
  while (holder.firstChild) document.body.appendChild(holder.firstChild);
  wireSheet();

  // Long-press → quick add; tap singkat → add.html (form lengkap)
  addBtn.removeAttribute('onclick');
  addBtn.onclick = null;
  let pressTimer = null, longPressed = false;
  const startPress = () => { longPressed = false; pressTimer = setTimeout(() => { longPressed = true; openSheet(); }, 500); };
  const cancelPress = () => { if (pressTimer) clearTimeout(pressTimer); pressTimer = null; };

  addBtn.addEventListener('touchstart', startPress, { passive: true });
  addBtn.addEventListener('touchend', cancelPress);
  addBtn.addEventListener('touchmove', cancelPress, { passive: true });
  addBtn.addEventListener('mousedown', startPress);
  addBtn.addEventListener('mouseup', cancelPress);
  addBtn.addEventListener('mouseleave', cancelPress);
  addBtn.addEventListener('click', (e) => {
    if (longPressed) { e.preventDefault(); e.stopPropagation(); longPressed = false; return; }
    window.location.href = 'add.html';
  });
}
