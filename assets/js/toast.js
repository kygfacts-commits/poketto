// Poketto - Toast notifikasi sederhana
// showToast: tampilkan toast langsung di halaman saat ini.
// queueToast/flushQueuedToast: simpan toast di sessionStorage agar tetap muncul
// setelah redirect ke halaman lain (misal add.html -> home.html).

const STORAGE_KEY = 'poketto:toast';

const TOAST_STYLES = {
  success: 'bg-mint-light text-emerald-700 border border-emerald-100',
  error: 'bg-red-50 text-red-600 border border-red-100',
  info: 'bg-[#EDE9FE] text-[#7C3AED] border border-[#DDD6FE]',
};

function getToastContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed bottom-20 md:bottom-6 inset-x-0 md:inset-x-auto md:right-6 flex flex-col items-center md:items-end gap-2 px-4 z-[100]';
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message, type = 'success') {
  const container = getToastContainer();

  const toast = document.createElement('div');
  toast.className = `w-full md:w-auto max-w-sm px-4 py-3 rounded-xl shadow-md text-sm font-medium transition-opacity duration-300 ${TOAST_STYLES[type] || TOAST_STYLES.success}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// Toast khusus perayaan: lebih besar, icon party-popper, bg mint, auto-dismiss 4 detik.
export function showCelebrateToast(message, duration = 4000) {
  const container = getToastContainer();

  const toast = document.createElement('div');
  toast.className = 'w-full md:w-auto max-w-sm flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-lg text-sm font-semibold bg-mint text-white transition-opacity duration-300';
  toast.innerHTML = `<i data-lucide="party-popper" class="w-5 h-5 flex-shrink-0"></i><span>${message}</span>`;
  container.appendChild(toast);
  if (window.lucide) window.lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export function queueToast(message, type = 'success') {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ message, type }));
}

export function flushQueuedToast() {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  sessionStorage.removeItem(STORAGE_KEY);

  try {
    const { message, type } = JSON.parse(raw);
    showToast(message, type);
  } catch (err) {
    console.log('[toast] Gagal membaca toast tersimpan:', err.message);
  }
}
