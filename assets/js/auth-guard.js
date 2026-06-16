// Poketto - Auth guard
// Diimpor di halaman yang butuh login (home, profile, add, charts, reports).
// Jika tidak ada session aktif -> redirect ke login.html.
// Jika ada session -> dispatch CustomEvent 'schatz:auth-ready' dengan detail { user }.
//
// Catatan: sengaja tidak memakai top-level await, supaya statement `import`
// di halaman pemanggil selesai duluan dan event listener-nya sempat terpasang
// sebelum event 'schatz:auth-ready' di-dispatch.

import { supabase } from './supabase-client.js';
import './notification-badge.js';
import './mobile-nav.js';

console.log('[auth-guard] Memeriksa session...');

supabase.auth.getSession().then(({ data, error }) => {
  if (error) {
    console.log('[auth-guard] Error saat getSession:', error.message);
    window.location.href = 'login.html';
    return;
  }

  if (!data.session) {
    console.log('[auth-guard] Tidak ada session aktif. Redirect ke login.html');
    window.location.href = 'login.html';
    return;
  }

  console.log('[auth-guard] Session ditemukan untuk:', data.session.user.email);
  console.log('[auth-guard] Dispatch event "schatz:auth-ready"');
  window.dispatchEvent(new CustomEvent('schatz:auth-ready', { detail: { user: data.session.user } }));
});
