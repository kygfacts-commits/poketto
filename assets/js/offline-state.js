// Poketto — offline-state.js
// Deteksi status koneksi + UI offline yang konsisten, TERPUSAT untuk semua halaman.
//
// KENAPA DI SINI: di-import oleh theme.js (satu-satunya modul yang dimuat di SEMUA
// halaman) — persis pola pwa-register.js. Jadi cukup 1 file + 1 baris import, tanpa
// menempel logika ke 18+ file HTML satu-satu (anti-drift, anti-duplikasi).
//
// LATAR MASALAH: service worker meng-cache app shell tapi data Supabase sengaja
// network-only (demi akurasi data finansial). Akibatnya saat offline, shell terbuka
// tapi area konten kosong putih → terlihat seperti app rusak. Modul ini mengisi
// kekosongan itu dengan penjelasan yang jelas + jalan keluar (Coba lagi).
//
// STRATEGI (dipisah berdasarkan KAPAN offline terdeteksi):
//   1) Offline sejak halaman dimuat (cold load)  → data tidak akan datang →
//      FULL-STATE menutupi area konten (mengganti kekosongan putih).
//   2) Online lalu putus di tengah sesi           → data lama masih valid di layar →
//      BANNER mengambang (non-destruktif) + tombol Muat ulang.
//
// ANTI-FLICKER: UI HANYA dirender saat navigator.onLine === false. Pada pembukaan
// online normal nilainya true → tidak ada yang ter-mount → tidak ada kedip/race.

// Tangkap status saat modul dievaluasi: true bila halaman memang dibuka dalam keadaan
// offline (skenario #1). Dipakai untuk memutuskan full-state vs banner, dan untuk
// auto-reload saat koneksi pulih.
const BOOTED_OFFLINE = !navigator.onLine;

let overlayShown = false; // full-state cold-load sedang tampil
let bannerShown  = false; // banner mid-session sedang tampil

// ── Util: jalankan saat <body> siap (module di <head> = deferred, biasanya sudah siap) ──
function whenBodyReady(fn) {
  if (document.body) { fn(); return; }
  document.addEventListener('DOMContentLoaded', fn, { once: true });
}

// ── Style sekali pakai (inset overlay responsif terhadap sidebar + bottom-nav) ──────
function ensureStyle() {
  if (document.getElementById('pkn-offline-style')) return;
  const style = document.createElement('style');
  style.id = 'pkn-offline-style';
  style.textContent = [
    // Overlay menutupi AREA KONTEN saja — bukan navigasi.
    // Mobile: sisakan ruang bawah untuk bottom-nav (z-40). Desktop: geser kanan sidebar (w-64).
    '#pkn-offline-overlay{position:fixed;top:0;left:0;right:0;bottom:5rem;',
    'background:#F8F7FF;z-index:45;display:flex;align-items:center;justify-content:center;',
    'padding:1.5rem;font-family:inherit;opacity:0;transition:opacity .25s ease}',
    '#pkn-offline-overlay.pkn-in{opacity:1}',
    '@media(min-width:768px){#pkn-offline-overlay{left:16rem;bottom:0}}',
  ].join('');
  (document.head || document.documentElement).appendChild(style);
}

// Ikon wifi-off (lucide) sebagai inline SVG — tidak bergantung pada lucide.createIcons()
// yang baru dipanggil di akhir halaman & tak menjangkau elemen yang disuntik dinamis.
const WIFI_OFF_SVG = (size = 28) => `
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>
    <path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/>
    <path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/>
    <path d="m2 2 20 20"/>
  </svg>`;

// ── Skenario #1: FULL-STATE (cold load offline) ─────────────────────────────────────
function showOverlay() {
  if (overlayShown || document.getElementById('pkn-offline-overlay')) return;
  // Hanya tampilkan di halaman aplikasi (punya <main>). Halaman auth (login/register)
  // tanpa <main> akan jatuh ke banner.
  if (!document.querySelector('main')) { showBanner(); return; }
  overlayShown = true;
  ensureStyle();

  const el = document.createElement('div');
  el.id = 'pkn-offline-overlay';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `
    <div class="w-full max-w-sm bg-white rounded-2xl border border-[#EDE9FE] shadow-sm px-6 py-8 text-center">
      <span class="inline-flex w-16 h-16 rounded-2xl bg-[#EDE9FE] text-[#8B5CF6] items-center justify-center mb-4">
        ${WIFI_OFF_SVG(30)}
      </span>
      <h2 class="text-lg font-semibold text-[#1E1B4B] leading-tight">Tidak ada koneksi internet</h2>
      <p class="text-sm text-gray-400 mt-1.5 leading-snug">Sambungkan ke internet untuk melihat data Anda.</p>
      <button type="button" id="pkn-offline-retry"
        class="mt-5 inline-flex items-center justify-center gap-2 bg-[#8B5CF6] hover:bg-lavender-dark text-white text-sm font-semibold rounded-xl px-5 py-2.5 transition-colors"
        style="font-family:inherit">
        ${refreshIcon(16)}<span>Coba lagi</span>
      </button>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('pkn-in'));
  el.querySelector('#pkn-offline-retry').addEventListener('click', () => location.reload());
}

function removeOverlay() {
  const el = document.getElementById('pkn-offline-overlay');
  if (el) { el.classList.remove('pkn-in'); setTimeout(() => el.remove(), 250); }
  overlayShown = false;
}

// ── Skenario #2: BANNER mengambang (offline mid-session) ────────────────────────────
// Visual mengikuti pola banner update PWA: kartu mengambang di bawah, di atas bottom-nav.
function showBanner() {
  if (bannerShown || document.getElementById('pkn-offline-banner')) return;
  if (!document.body) return;
  bannerShown = true;

  const wrap = document.createElement('div');
  wrap.id = 'pkn-offline-banner';
  wrap.setAttribute('role', 'status');
  wrap.setAttribute('aria-live', 'polite');
  // z-[105]: di atas toast(100), di bawah banner update(110) & demo(120).
  wrap.className = 'fixed inset-x-0 bottom-20 md:bottom-6 z-[105] px-4 flex justify-center pointer-events-none '
    + 'transition-all duration-300 ease-out opacity-0 translate-y-3';
  wrap.style.fontFamily = 'inherit';
  wrap.innerHTML = bannerOfflineMarkup();
  document.body.appendChild(wrap);
  requestAnimationFrame(() => {
    wrap.classList.remove('opacity-0', 'translate-y-3');
    wrap.classList.add('opacity-100', 'translate-y-0');
  });
  bindBannerButtons(wrap);
}

function removeBanner() {
  const wrap = document.getElementById('pkn-offline-banner');
  if (!wrap) { bannerShown = false; return; }
  wrap.classList.add('opacity-0', 'translate-y-3');
  wrap.classList.remove('opacity-100', 'translate-y-0');
  setTimeout(() => wrap.remove(), 300);
  bannerShown = false;
}

// Saat koneksi pulih di tengah sesi: ubah isi banner jadi ajakan muat ulang (TANPA
// auto-reload — melindungi input form yang mungkin sedang diisi, mis. add.html).
function morphBannerOnline() {
  const wrap = document.getElementById('pkn-offline-banner');
  if (!wrap) return;
  wrap.innerHTML = bannerOnlineMarkup();
  bindBannerButtons(wrap);
}

function bannerOfflineMarkup() {
  return `
    <div class="pointer-events-auto w-full max-w-sm bg-white rounded-2xl border border-[#EDE9FE] shadow-sm px-4 py-3 flex items-center gap-3">
      <span class="flex-shrink-0 w-9 h-9 rounded-full bg-[#EDE9FE] text-[#8B5CF6] flex items-center justify-center">${WIFI_OFF_SVG(18)}</span>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-[#1E1B4B] leading-tight">Tidak ada koneksi internet</p>
        <p class="text-xs text-gray-400 leading-tight mt-0.5">Data mungkin tidak terbarui.</p>
      </div>
      <button type="button" id="pkn-offline-retry"
        class="flex-shrink-0 bg-[#8B5CF6] hover:bg-lavender-dark text-white text-sm font-semibold rounded-xl px-3.5 py-2 whitespace-nowrap transition-colors"
        style="font-family:inherit">Coba lagi</button>
    </div>`;
}

function bannerOnlineMarkup() {
  return `
    <div class="pointer-events-auto w-full max-w-sm bg-white rounded-2xl border border-[#EDE9FE] shadow-sm px-4 py-3 flex items-center gap-3">
      <span class="flex-shrink-0 w-9 h-9 rounded-full bg-mint-light text-emerald-600 flex items-center justify-center">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
      </span>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-[#1E1B4B] leading-tight">Kembali online</p>
        <p class="text-xs text-gray-400 leading-tight mt-0.5">Muat ulang untuk memperbarui data.</p>
      </div>
      <button type="button" id="pkn-offline-reload"
        class="flex-shrink-0 bg-[#8B5CF6] hover:bg-lavender-dark text-white text-sm font-semibold rounded-xl px-3.5 py-2 whitespace-nowrap transition-colors"
        style="font-family:inherit">Muat ulang</button>
    </div>`;
}

function bindBannerButtons(wrap) {
  wrap.querySelector('#pkn-offline-retry')?.addEventListener('click', () => location.reload());
  wrap.querySelector('#pkn-offline-reload')?.addEventListener('click', () => location.reload());
}

function refreshIcon(size = 16) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>`;
}

// ── Wiring event koneksi ────────────────────────────────────────────────────────────
window.addEventListener('offline', () => {
  // Putus di tengah sesi → banner non-destruktif (jangan hapus data yang sudah tampil).
  // Jika full-state cold-load sudah tampil, biarkan apa adanya.
  if (!overlayShown) whenBodyReady(showBanner);
});

window.addEventListener('online', () => {
  if (overlayShown) {
    // Cold-load: layar memang kosong → langsung reload untuk mengambil data.
    location.reload();
    return;
  }
  if (bannerShown) morphBannerOnline();
});

// ── Kondisi awal ────────────────────────────────────────────────────────────────────
// Hanya bertindak bila MEMANG offline saat load → tidak ada flicker pada pembukaan online.
if (BOOTED_OFFLINE) whenBodyReady(showOverlay);
