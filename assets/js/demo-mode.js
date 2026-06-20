// Poketto — demo-mode.js
// Mode Demo read-only: login otomatis ke akun demo berisi data dummy, lalu
// blokir SEMUA aksi create/update/delete di setiap halaman.
//
//   • loginAsDemo()  — login otomatis ke akun demo, set flag sessionStorage.
//   • isDemoMode()   — cek apakah sesi saat ini adalah mode demo.
//   • blockIfDemo()  — guard yang dipasang di awal setiap handler submit/delete.
//
// Catatan: kredensial demo bersifat read-only secara konvensi (data tidak akan
// tersimpan karena setiap mutasi diblokir di sisi klien sebelum request dikirim).

import { supabase } from './supabase-client.js';
import { showToast } from './toast.js';

const DEMO_FLAG = 'poketto-demo-mode';

// ⚠️ GANTI password ini dengan password user demo yang kamu buat di Supabase.
const DEMO_EMAIL = 'demo@poketto.app';
const DEMO_PASSWORD = 'd3m0POKETT0-';

export async function loginAsDemo() {
  const { error } = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (error) {
    showToast('Demo sedang tidak tersedia, silakan daftar gratis', 'error');
    return false;
  }
  // Flag agar semua halaman tahu ini mode demo (read-only).
  sessionStorage.setItem(DEMO_FLAG, 'true');
  return true;
}

export function isDemoMode() {
  return sessionStorage.getItem(DEMO_FLAG) === 'true';
}

// Bersihkan flag demo (dipakai saat klik "Daftar Gratis" di banner / logout).
export function clearDemoMode() {
  sessionStorage.removeItem(DEMO_FLAG);
}

// Guard utama. Panggil di AWAL setiap handler submit/delete:
//   if (blockIfDemo('Menyimpan data')) return;
// Mengembalikan true (blocked) bila mode demo, false bila boleh lanjut.
export function blockIfDemo(actionName = 'aksi ini') {
  if (isDemoMode()) {
    showToast(`${actionName} dinonaktifkan di mode Demo. Daftar gratis untuk mulai pakai!`, 'info');
    return true; // blocked
  }
  return false; // not blocked, lanjutkan aksi normal
}
