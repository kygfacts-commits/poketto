# Poketto — Testing Suite

Suite test **terisolasi** dari aplikasi utama. Berjalan via **Node.js + Vitest**
(bukan browser), langsung menembak Supabase API sehingga bisa membuktikan keamanan
di **level database (RLS)** — bukan sekadar guard di frontend.

> ⚠️ **JANGAN PERNAH commit file `tests/.env`.** Isinya berisi `SERVICE_ROLE_KEY`
> (bypass RLS, akses penuh ke DB) dan password test. File ini sudah di-`.gitignore`.
> Yang boleh & aman di-commit hanyalah `tests/.env.example` (template kosong).

---

## Kenapa `package.json` ada di `/tests`, bukan di root?

Aplikasi utama adalah situs **statis** (HTML + Tailwind CDN) tanpa build step dan
**tanpa Node tooling** sama sekali — itu memang desainnya, dan Vercel men-deploy-nya
sebagai static. Menaruh `package.json` di root berisiko membuat Vercel mengira ada
build Node, dan mencampur dependency test ke dalam app. Maka seluruh tooling test
dikurung di `/tests` (termasuk `node_modules/tests`), benar-benar terpisah dan tidak
memengaruhi deployment app.

---

## Setup

```bash
cd tests
cp .env.example .env        # lalu isi nilainya (lihat bawah)
npm install
```

Isi `tests/.env`:

| Var | Keterangan |
|-----|------------|
| `SUPABASE_URL` | Sudah terisi default (project udqepcfsezblqablubfm). |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable/anon key (Settings → API). Dipakai client yang **tunduk RLS**. |
| `SUPABASE_SERVICE_ROLE_KEY` | **RAHASIA.** Service role key. Hanya untuk seed/cleanup data test. |
| `TEST_USER_A_EMAIL/PASSWORD/UID` | Akun test biasa (buat 1 user via Dashboard → Authentication). UID dari tabel users. |
| `DEMO_USER_EMAIL/UID` | Sudah terisi (akun demo). |
| `DEMO_USER_PASSWORD` | **Opsional.** Kosongkan → blok test demo di-skip. Isi → blok demo ikut jalan. |

---

## Menjalankan test

```bash
cd tests
npm test            # jalankan sekali (vitest run)
npm run test:watch  # mode watch
npm run test:batch1 # hanya folder batch1
```

---

## Apa yang dites di Batch 1 (`batch1/auth-rls-demo.test.js`)

**AUTH**
- Login `TEST_USER_A` berhasil + session valid (UID cocok).
- Login password salah → error jelas (tidak crash).
- Login email tak terdaftar → error jelas.
- `getSession()` setelah login mengembalikan UID yang benar.

**RLS — Cross-user isolation** (untuk tabel: `accounts`, `categories`,
`transactions`, `budgets`, `goals`, `scheduled_bills`, `portfolio_holdings`,
`liabilities`):
- Sebagai User A: `SELECT` sukses & **tidak** memunculkan row milik user lain (DEMO).
- `UPDATE`/`DELETE` row milik DEMO → ditolak rapi (**0 row**, bukan error 500); diverifikasi row DEMO masih utuh.
- `INSERT` spoof `user_id = DEMO` → ditolak RLS (`WITH CHECK`).

**DEMO MODE read-only** (di-skip jika `DEMO_USER_PASSWORD` kosong):
- Login sebagai demo, lalu `INSERT`/`UPDATE`/`DELETE` di tiap tabel → harus ditolak
  di **level DB** (RLS `block_demo_*`), membuktikan keamanan tidak bergantung pada
  `blockIfDemo()` di frontend (test ini bypass UI).

**Cleanup:** semua data dummy yang dibuat (via `adminClient`) dihapus di `afterAll`,
termasuk jaring pengaman berbasis penanda `TEST_RLS_*` dan row yang bocor jika RLS gagal.
Cleanup tetap jalan walau ada test yang gagal.

---

## Catatan nama tabel (penting)

Beberapa nama tabel berbeda dari penamaan umum di UI:

| Istilah UI | Nama tabel asli |
|-----------|-----------------|
| Bills / Tagihan | `scheduled_bills` |
| Portfolio | `portfolio_holdings` (+ `portfolio_transactions`) |

Sisanya sama: `accounts`, `transactions`, `budgets`, `goals`, `liabilities`,
`categories` (+ `subcategories`, `profiles`).

---

## Prasyarat di Supabase agar test LULUS

Test ini akan **gagal** (memang tujuannya) bila RLS belum benar. Pastikan:
1. RLS **enabled** di semua tabel data.
2. Policy `SELECT/INSERT/UPDATE/DELETE` membatasi `auth.uid() = user_id`
   (untuk `profiles`: `auth.uid() = id`).
3. Untuk blok demo: policy **`RESTRICTIVE`** `block_demo_*` yang menolak tulis ketika
   `auth.uid() = '<DEMO_UID>'`.
