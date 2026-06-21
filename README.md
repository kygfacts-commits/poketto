# Poketto

Aplikasi keuangan pribadi — PWA static (HTML + vanilla JS + Supabase). Tidak ada
framework build; satu-satunya langkah build adalah **CSS Tailwind**.

## Styling: Tailwind di-build lokal (bukan CDN)

CSS Tailwind **tidak** lagi via `cdn.tailwindcss.com`. Ia di-compile dari
`assets/css/tailwind-input.css` ke **`assets/css/tailwind.css`** (file inilah yang
di-link semua halaman & diprecache service worker).

```bash
npm install          # sekali, pasang tailwindcss + wiring git hook (lihat di bawah)
npm run build:css    # rebuild assets/css/tailwind.css (minified)
npm run watch:css    # rebuild otomatis saat ngoding
```

Konfigurasi (warna pastel lavender/peach/sky/mint, font Outfit, daftar `content`)
ada di `tailwind.config.js`. **Penting:** `content` wajib mencakup `assets/js/**/*.js`
karena banyak nama class lengkap tinggal di file JS (mis. `CATEGORY_COLOR_CLASSES`).

> ⚠️ Kalau menambah/mengubah class Tailwind di HTML/JS **tanpa rebuild**, `tailwind.css`
> jadi **basi** (class baru tidak ter-generate → tampilan rusak diam-diam). Git hook
> di bawah mencegah ini secara otomatis.

## Git pre-commit hook (anti-CSS-basi)

Ada hook di **`.githooks/pre-commit`** (versioned di repo) yang setiap `git commit`:

1. Cek apakah ada file relevan ter-stage (`index.html`, `pages/**`, `components/**`,
   `assets/js/**`, `tailwind.config.js`, `tailwind-input.css`). Kalau tidak ada → **skip** (commit cepat).
2. Kalau ada → jalankan `npm run build:css`, lalu `git add assets/css/tailwind.css`
   supaya CSS fresh ikut ke commit yang **sama**.
3. Kalau build **gagal** → commit **dibatalkan** (exit 1) dengan pesan error.

Hook diaktifkan via `core.hooksPath` yang di-set otomatis oleh script `prepare`
saat `npm install` (jadi tidak butuh husky / dependency tambahan). Aktivasi manual:

```bash
git config core.hooksPath .githooks
```

### Catatan untuk sesi Claude Code / dev lain

- `git commit` terasa **lebih lambat**? Wajar — hook sedang rebuild CSS.
- File `assets/css/tailwind.css` **berubah sendiri** saat commit? Itu hasil rebuild
  yang sengaja di-`git add` hook. Bukan bug.
- Bypass darurat (hindari): `git commit --no-verify`.
