// Poketto — auth-guard.js
// Single responsibility: cek session Supabase.
//   • Tidak ada session  → redirect ke login.html
//   • Ada session        → dispatch 'schatz:auth-ready' dengan { user }
//
// Semua inisialisasi navigasi ada di nav-loader.js.
// Semua DOM manipulation navigasi ada di components/sidebar.html + components/mobile-nav.html.

import { supabase } from './supabase-client.js';

supabase.auth.getSession().then(({ data, error }) => {
  if (error) {
    console.warn('[auth-guard] getSession error:', error.message);
    window.location.href = 'login.html';
    return;
  }

  if (!data.session) {
    console.log('[auth-guard] Tidak ada session — redirect ke login.');
    window.location.href = 'login.html';
    return;
  }

  window.dispatchEvent(
    new CustomEvent('schatz:auth-ready', { detail: { user: data.session.user } })
  );
});

/** Ambil user yang sedang login (async). */
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
