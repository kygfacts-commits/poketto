/* Poketto — Service Worker
 *
 * DESAIN UNTUK APP FINANSIAL: data (saldo, transaksi) TIDAK BOLEH terasa basi.
 *   • Request ke Supabase (*.supabase.co) → NETWORK-ONLY, TIDAK PERNAH di-cache.
 *   • Cross-origin lain (CDN/font) → network passthrough, tidak di-cache.
 *   • Navigasi HTML → NETWORK-FIRST (shell selalu fresh pasca-deploy) + fallback cache.
 *   • Asset statis same-origin (CSS/JS/icon) → CACHE-FIRST + fallback network.
 *
 * VERSIONING & ANTI-NYANGKUT:
 *   • Nama cache mengandung VERSION. Saat 'activate', cache versi lama dihapus.
 *   • skipWaiting() + clients.claim() → versi baru langsung aktif tanpa reinstall.
 *
 *   ┌─────────────────────────────────────────────────────────────────────────┐
 *   │ PENTING: setiap deploy yang MENGUBAH file statis (HTML/CSS/JS/icon),     │
 *   │ NAIKKAN VERSION di bawah ini. Itu yang memicu pembersihan cache lama     │
 *   │ sehingga user PWA tidak nyangkut di aset versi lama.                     │
 *   └─────────────────────────────────────────────────────────────────────────┘
 */
const VERSION = 'v1.2.1';
const CACHE = `poketto-${VERSION}`;

// Shell inti yang diprecache saat install. Semua best-effort (lihat allSettled di install):
// satu entri gagal TIDAK membatalkan instalasi SW.
const PRECACHE = [
  '/index.html',
  '/pages/home.html',
  '/pages/login.html',
  '/assets/css/tailwind.css',
  '/assets/css/style.css',
  '/assets/js/theme.js',
  '/assets/js/pwa-register.js',
  '/assets/js/offline-state.js',
  '/assets/js/supabase-client.js',
  '/assets/js/auth-guard.js',
  '/assets/js/nav-loader.js',
  '/assets/js/toast.js',
  '/assets/js/utils.js',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/manifest.json',
  // Library Supabase = KODE statis dari CDN (bukan data user). URL ini PERSIS yang
  // di-import assets/js/supabase-client.js. Di-precache agar entry-point pasti ada
  // offline. Sub-chunk /npm/@supabase/*-js@x/+esm yang di-import-nya tertangkap
  // otomatis oleh cdnCacheFirst() saat pemakaian online pertama (lihat fetch handler).
  // CATATAN: lintas-origin → tetap best-effort; bila CDN sedang down saat install,
  // instalasi SW JANGAN gagal (lihat penjelasan di handler install).
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',
];

// ── Install: precache shell (toleran — satu file gagal tak membatalkan install) ──
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const results = await Promise.allSettled(PRECACHE.map((u) => cache.add(u)));
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.warn('[sw] precache gagal:', PRECACHE[i], r.reason?.message || r.reason);
    });
    await self.skipWaiting(); // versi baru tidak menunggu tab lama ditutup
  })());
});

// ── Activate: buang cache versi lama lalu ambil alih kontrol semua tab ──────────
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('poketto-') && k !== CACHE).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Opsional: halaman bisa kirim 'SKIP_WAITING' untuk memaksa SW menunggu jadi aktif.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ── Fetch: routing strategi ─────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Jangan pernah ganggu operasi tulis (POST/PATCH/DELETE ke Supabase, dll).
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // (1) API Supabase (DATA user) → NETWORK-ONLY, TIDAK PERNAH di-cache. Diletakkan paling
  //     atas & dicek via hostname agar tak mungkin tercampur dengan logika cache lain —
  //     inilah yang menjamin saldo/transaksi selalu segar. JANGAN ubah.
  if (url.hostname.endsWith('supabase.co')) return;

  // (2) Library JS Supabase dari CDN jsDelivr = KODE statis (bukan data) → CACHE-FIRST.
  //     Mencakup entry @supabase/supabase-js@2/+esm DAN semua sub-chunk /npm/...+esm yang
  //     di-import-nya (functions/postgrest/realtime/storage/auth-js). cache-first → setelah
  //     sekali dimuat online, seluruh graph library tersedia offline. Siklus update-nya ikut
  //     VERSION (cache lama dibuang saat 'activate'), persis seperti aset statis same-origin.
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(cdnCacheFirst(req));
    return;
  }

  // (3) Cross-origin lain (Tailwind CDN, Google Fonts, dll) → passthrough TANPA cache.
  if (url.origin !== self.location.origin) return;

  // (4) Navigasi halaman → NETWORK-FIRST (shell fresh), fallback ke cache saat offline.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  // (5) Asset statis same-origin → CACHE-FIRST.
  event.respondWith(cacheFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    // Fallback shell terakhir agar app tetap "kebuka" walau offline.
    return (await cache.match('/pages/home.html'))
      || (await cache.match('/index.html'))
      || new Response('Offline — Poketto belum bisa dimuat tanpa koneksi.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
  }
}

// Cache-first khusus CDN lintas-origin (jsDelivr). Beda dari cacheFirst same-origin:
//   • match pakai ignoreVary — jsDelivr kirim 'Vary: Accept-Encoding' yang bisa bikin
//     cache miss palsu; library-nya tak bervariasi per-user jadi aman diabaikan.
//   • cache response sukses APAPUN (type 'cors', bukan 'basic') — jsDelivr mengirim CORS
//     (access-control-allow-origin: *) jadi respons bisa dibaca & disimpan.
async function cdnCacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req, { ignoreVary: true });
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    // Benar-benar offline & belum pernah ter-cache → error jaringan (import akan gagal).
    return Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    // Hanya cache response same-origin yang sukses (type 'basic').
    if (fresh && fresh.ok && fresh.type === 'basic') cache.put(req, fresh.clone());
    return fresh;
  } catch {
    return cached || new Response('', { status: 504 });
  }
}
