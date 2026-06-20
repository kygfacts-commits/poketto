/* Poketto - Tema warna aplikasi (terikat ke akun, bukan browser)
 *
 * Tema disimpan di kolom profiles.theme_preference (per akun), BUKAN localStorage.
 * Dimuat sebagai ES module: <script type="module" src="assets/js/theme.js"></script>
 *
 * Mekanisme:
 *   • Saat module load → langsung apply tema default 'lavender' (mencegah broken style)
 *   • Pada halaman terproteksi → listener 'schatz:auth-ready' otomatis memanggil
 *     applyUserTheme(user.id) sehingga tema akun diterapkan secepatnya.
 *   • Landing page (index.html) tidak punya auth-guard → tetap lavender selamanya.
 *
 * CSS variable --poketto-primary meng-override semua warna primer (#8B5CF6 / lavender-dark).
 */

import { supabase } from './supabase-client.js';
// PWA bootstrap (registrasi service worker + favicon). theme.js dipilih sebagai host
// karena ia satu-satunya modul yang dimuat di SEMUA halaman → cakupan universal, 1 edit.
import './pwa-register.js';

const THEMES = {
  lavender: '#8B5CF6',
  ocean: '#0EA5E9',
  rose: '#F43F5E',
  forest: '#10B981',
  amber: '#F59E0B',
};
const DEFAULT_THEME = 'lavender';

function ensureStyle() {
  if (document.getElementById('poketto-theme-style')) return;
  const style = document.createElement('style');
  style.id = 'poketto-theme-style';
  // Semua usage warna primer Poketto diarahkan ke CSS variable (dengan fallback lavender).
  style.textContent = [
    '.bg-\\[\\#8B5CF6\\],.bg-lavender-dark,.bg-lavender,.hover\\:bg-\\[\\#8B5CF6\\]:hover,.hover\\:bg-lavender-dark:hover',
    '{background-color:var(--poketto-primary,#8B5CF6)!important}',
    '.text-\\[\\#8B5CF6\\],.text-lavender-dark,.hover\\:text-lavender-dark:hover',
    '{color:var(--poketto-primary,#8B5CF6)!important}',
    '.border-\\[\\#8B5CF6\\],.border-lavender-dark{border-color:var(--poketto-primary,#8B5CF6)!important}',
    '.focus\\:ring-\\[\\#8B5CF6\\]:focus{--tw-ring-color:var(--poketto-primary,#8B5CF6)!important}',
    '.focus\\:border-\\[\\#8B5CF6\\]:focus{border-color:var(--poketto-primary,#8B5CF6)!important}',
  ].join('');
  (document.head || document.documentElement).appendChild(style);
}

// Terapkan warna ke CSS variable + meta theme-color. Tidak menyentuh storage apapun.
function applyThemeColor(name) {
  if (!THEMES[name]) name = DEFAULT_THEME;
  document.documentElement.style.setProperty('--poketto-primary', THEMES[name]);
  ensureStyle();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEMES[name]);
}

// Selalu lavender. Dipakai landing page + fallback saat belum login / error.
export function applyDefaultTheme() {
  applyThemeColor(DEFAULT_THEME);
}

// Ambil tema akun dari DB lalu terapkan. Jika tidak ada user/error → lavender default.
export async function applyUserTheme(userId) {
  if (!userId) {
    applyDefaultTheme();
    return;
  }
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('theme_preference')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    applyThemeColor(data?.theme_preference || DEFAULT_THEME);
  } catch (e) {
    console.warn('[theme] gagal memuat tema akun, pakai default:', e.message);
    applyDefaultTheme();
  }
}

// Simpan tema ke akun (profiles.theme_preference) lalu terapkan ulang.
export async function saveUserTheme(userId, themeName) {
  if (!userId) return;
  const name = THEMES[themeName] ? themeName : DEFAULT_THEME;
  const { error } = await supabase
    .from('profiles')
    .update({ theme_preference: name })
    .eq('id', userId);
  if (error) throw error;
  await applyUserTheme(userId);
}

export const POKETTO_THEMES = THEMES;

// ── Side effects on load ────────────────────────────────────────────────────
// 1) Terapkan default lavender segera agar styling dasar langsung benar (anti broken-style).
applyDefaultTheme();

// 2) Pada halaman terproteksi, auth-guard mem-broadcast 'schatz:auth-ready'.
//    Terapkan tema akun secepatnya — satu listener pusat untuk SEMUA halaman.
window.addEventListener('schatz:auth-ready', (e) => {
  const userId = e?.detail?.user?.id;
  if (userId) applyUserTheme(userId);
});
