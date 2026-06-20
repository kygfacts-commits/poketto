// Poketto tests — Supabase client helpers
//
// Menyediakan dua jenis client:
//   • adminClient  → SERVICE_ROLE key, BYPASS RLS. HANYA untuk setup/cleanup data
//                     test. JANGAN dipakai untuk meng-assert hasil test keamanan.
//   • anonClient   → PUBLISHABLE key, tunduk RLS penuh. INI yang dipakai untuk
//                     membuktikan apakah RLS benar-benar bekerja.
//
// Env di-load dari /tests/.env via dotenv. Jika ada env var inti yang kosong,
// kita throw error JELAS saat startup (bukan silent fail).

import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Selalu baca file /tests/.env (relatif terhadap file helper ini), bukan cwd.
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

// ── Validasi env inti (dibutuhkan untuk membuat client) ──────────────────────
const REQUIRED = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = REQUIRED.filter((k) => !process.env[k] || !process.env[k].trim());
if (missing.length) {
  throw new Error(
    `[tests] Env var berikut kosong/tidak ada di tests/.env: ${missing.join(', ')}.\n` +
    `→ Copy tests/.env.example menjadi tests/.env lalu isi nilainya. Lihat tests/README.md.`
  );
}

export const SUPABASE_URL = process.env.SUPABASE_URL;
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Opsi client untuk lingkungan Node/test:
//   • auth: jangan persist & jangan auto-refresh → tiap client punya sesi
//     terisolasi (penting untuk test multi-user).
//   • realtime.transport: supabase-js SELALU membuat RealtimeClient di dalam
//     createClient(), dan konstruktornya butuh implementasi WebSocket di Node
//     (Node 20 tanpa native WS → error). Tidak ada opsi resmi untuk benar-benar
//     mematikan instansiasi realtime, jadi kita berikan transport WS hanya ke
//     scope realtime (BUKAN polyfill global window/globalThis.WebSocket).
//     Batch 1 tidak pernah .channel()/.subscribe(), sehingga koneksi WS tidak
//     pernah benar-benar dibuka — ini hanya memenuhi syarat konstruktor.
const TEST_CLIENT_OPTS = {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocket },
};

// ── adminClient: bypass RLS (setup/cleanup SAJA) ─────────────────────────────
export const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, TEST_CLIENT_OPTS);

// ── anonClient: tunduk RLS (untuk assertion keamanan) ────────────────────────
export const anonClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, TEST_CLIENT_OPTS);

// Factory untuk membuat anon client BARU dengan sesi terisolasi sendiri
// (mis. satu untuk TEST_USER_A, satu untuk DEMO_USER, tanpa saling clobber).
export function createAnonClient() {
  return createClient(SUPABASE_URL, PUBLISHABLE_KEY, TEST_CLIENT_OPTS);
}

// Kumpulan nilai env non-inti yang dipakai test (boleh kosong; test yang
// memvalidasinya sendiri / men-skip bila perlu).
export const env = {
  TEST_USER_A_EMAIL: process.env.TEST_USER_A_EMAIL,
  TEST_USER_A_PASSWORD: process.env.TEST_USER_A_PASSWORD,
  TEST_USER_A_UID: process.env.TEST_USER_A_UID,
  DEMO_USER_EMAIL: process.env.DEMO_USER_EMAIL,
  DEMO_USER_UID: process.env.DEMO_USER_UID,
  DEMO_USER_PASSWORD: process.env.DEMO_USER_PASSWORD, // opsional
};
