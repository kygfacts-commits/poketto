/** @type {import('tailwindcss').Config} */
module.exports = {
  // WAJIB termasuk assets/js: banyak nama class lengkap tinggal di file JS
  // (ACCOUNT_COLOR_CLASSES, TOAST_STYLES, CATEGORY_COLOR_CLASSES, dll).
  content: [
    './index.html',
    './pages/**/*.html',
    './components/**/*.html',
    './assets/js/**/*.js',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Distandarkan ke Outfit untuk SEMUA halaman.
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        lavender: { light: '#EDE9FE', DEFAULT: '#A78BFA', dark: '#8B5CF6', darker: '#7C3AED' },
        peach: { light: '#FED7AA', DEFAULT: '#FB923C' },
        sky: { light: '#BAE6FD', DEFAULT: '#38BDF8' },
        // mint.dark dipakai goals.html (border-mint-dark/20).
        mint: { light: '#A7F3D0', DEFAULT: '#34D399', dark: '#059669' },
      },
    },
  },
  plugins: [],
};
