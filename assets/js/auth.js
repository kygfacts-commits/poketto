// Poketto - Auth helper functions
// Diimpor sebagai ES module dari pages/login.html, pages/register.html,
// dan halaman shell (home, profile, dll) untuk tombol logout.

import { supabase } from './supabase-client.js';

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error };

  window.location.href = 'home.html';
  return { data };
}

export async function register(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error };

  if (data.session) {
    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      currency_preference: 'IDR',
      language_preference: 'id',
    });
    if (profileError) return { error: profileError };

    window.location.href = 'home.html';
    return { data };
  }

  const message = encodeURIComponent('Pendaftaran berhasil. Cek email untuk konfirmasi akun, lalu login.');
  window.location.href = `login.html?message=${message}`;
  return { data };
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) return { error };

  window.location.href = '../index.html';
  return {};
}
