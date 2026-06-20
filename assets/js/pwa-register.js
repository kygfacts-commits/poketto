// Poketto — PWA bootstrap: registrasi service worker, favicon, & banner "Versi baru".
//
// KENAPA DI SINI: dimuat universal lewat satu baris `import './pwa-register.js'` di
// theme.js — satu-satunya modul yang hadir di SEMUA halaman (index + seluruh /pages).
// Tidak ada template <head> bersama (file HTML statis), dan app sudah memakai pola
// inject-via-JS (nav-loader.js). Jadi pendekatan ini memberi cakupan 100% dengan SATU
// edit ke file universal, alih-alih menempel <link> di 22 head yang rawan drift.

// ── 1) Favicon + apple-touch-icon (pakai icon 192 yang sudah ada; idempoten) ──
function injectIconLinks() {
  if (!document.head) return;
  const wanted = [
    { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/assets/icons/icon-192.png' },
    { rel: 'apple-touch-icon', href: '/assets/icons/icon-192.png' },
  ];
  for (const attrs of wanted) {
    // Jangan dobel kalau suatu halaman kelak menaruh <link> statisnya sendiri.
    if (document.head.querySelector(`link[rel="${attrs.rel}"]`)) continue;
    const link = document.createElement('link');
    for (const [k, v] of Object.entries(attrs)) link.setAttribute(k, v);
    document.head.appendChild(link);
  }
}
injectIconLinks();

// ── 2) Banner "Versi baru tersedia" ────────────────────────────────────────────
// Muncul HANYA saat ada SW baru yang sudah ter-install & menunggu (waiting) DAN sudah
// ada controller (artinya UPDATE, bukan first-install). Reload dilakukan SETELAH SW baru
// benar-benar aktif (event 'controllerchange'), bukan langsung — menghindari race.
let reloading = false; // jaga-jaga agar reload tidak terjadi dua kali

function showUpdateBanner(reg) {
  // Singleton: jangan tumpuk banner kalau sudah tampil.
  if (document.getElementById('pkn-update-banner')) return;
  if (!document.body) return;

  const wrap = document.createElement('div');
  wrap.id = 'pkn-update-banner';
  wrap.setAttribute('role', 'status');
  wrap.setAttribute('aria-live', 'polite');
  // Posisi: mengambang di bawah, DI ATAS bottom-nav mobile (bottom-20) / dekat tepi di
  // desktop (md:bottom-6). z-[110]: di atas toast(100) & nav(40), di bawah demo-banner(120).
  // Wrapper pointer-events-none agar tap di luar kartu tidak terblokir; kartu sendiri auto.
  wrap.className = 'fixed inset-x-0 bottom-20 md:bottom-6 z-[110] px-4 flex justify-center pointer-events-none '
    + 'transition-all duration-300 ease-out opacity-0 translate-y-3';
  wrap.style.fontFamily = 'inherit'; // ikut font halaman (Outfit / Plus Jakarta Sans)

  wrap.innerHTML = `
    <div class="pointer-events-auto w-full max-w-sm bg-white rounded-2xl border border-[#EDE9FE] shadow-sm px-4 py-3 flex items-center gap-3">
      <span class="flex-shrink-0 w-9 h-9 rounded-full bg-[#EDE9FE] text-[#8B5CF6] flex items-center justify-center">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/>
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>
        </svg>
      </span>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-[#1E1B4B] leading-tight">Versi baru tersedia</p>
        <p class="text-xs text-gray-400 leading-tight mt-0.5">Muat ulang untuk memakai versi terbaru.</p>
      </div>
      <button type="button" id="pkn-update-reload"
        class="flex-shrink-0 bg-[#8B5CF6] hover:bg-lavender-dark text-white text-sm font-semibold rounded-xl px-3.5 py-2 whitespace-nowrap transition-colors"
        style="font-family:inherit">Muat ulang</button>
      <button type="button" id="pkn-update-dismiss" aria-label="Tutup"
        class="flex-shrink-0 w-7 h-7 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>`;

  document.body.appendChild(wrap);

  // Animasi muncul halus: lepas state awal di frame berikutnya → slide-up + fade-in.
  requestAnimationFrame(() => {
    wrap.classList.remove('opacity-0', 'translate-y-3');
    wrap.classList.add('opacity-100', 'translate-y-0');
  });

  const hide = (then) => {
    wrap.classList.add('opacity-0', 'translate-y-3');
    wrap.classList.remove('opacity-100', 'translate-y-0');
    setTimeout(() => { wrap.remove(); if (then) then(); }, 300);
  };

  // Dismiss: tutup saja. SW yang waiting TETAP ada → banner muncul lagi di kunjungan
  // berikutnya selama update belum diterapkan.
  wrap.querySelector('#pkn-update-dismiss').addEventListener('click', () => hide());

  // Muat ulang: minta SW waiting skipWaiting, lalu reload SETELAH SW baru mengambil alih.
  wrap.querySelector('#pkn-update-reload').addEventListener('click', () => {
    const waiting = reg.waiting;
    if (!waiting) { window.location.reload(); return; } // fallback bila race
    // Pasang listener reload HANYA saat user memilih update (bukan global) → first-install
    // claim tidak ikut memicu reload.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
    waiting.postMessage('SKIP_WAITING');
    // Beri feedback kecil di tombol; reload akan terjadi via controllerchange.
    const btn = wrap.querySelector('#pkn-update-reload');
    btn.textContent = 'Memperbarui…';
    btn.disabled = true;
    btn.classList.add('opacity-70', 'cursor-wait');
  });
}

// ── 3) Registrasi service worker + wiring deteksi update ────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // updateViaCache:'none' → file sw.js selalu di-revalidate browser, jadi deploy baru
    // tidak "tersangkut" di SW lama.
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        // Case A: SW baru sudah waiting dari kunjungan lalu (user belum menerapkan update).
        //         Syarat controller != null memastikan ini UPDATE, bukan first-install.
        if (reg.waiting && navigator.serviceWorker.controller) {
          showUpdateBanner(reg);
        }

        // Case B: update terdeteksi selama sesi berjalan.
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            // 'installed' + ADA controller = UPDATE. Tanpa controller = first-install → diam.
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner(reg);
            }
          });
        });
      })
      .catch((err) => console.warn('[pwa] Registrasi service worker gagal:', err.message));
  });
}
