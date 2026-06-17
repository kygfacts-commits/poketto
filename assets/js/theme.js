/* Poketto - Tema warna aplikasi
 * Dimuat sebagai script klasik pertama setelah Tailwind CDN di SEMUA halaman.
 * Membaca localStorage 'poketto-theme', menerapkan ke CSS variable --poketto-primary,
 * lalu meng-override semua elemen ber-class bg-[#8B5CF6] / text-[#8B5CF6] (dan turunan
 * lavender-dark) lewat CSS variable tersebut.
 */
(function () {
  var THEMES = {
    lavender: '#8B5CF6',
    ocean: '#0EA5E9',
    rose: '#F43F5E',
    forest: '#10B981',
    amber: '#F59E0B',
  };
  var STORAGE_KEY = 'poketto-theme';
  var DEFAULT_THEME = 'lavender';

  function getThemeName() {
    var name = null;
    try { name = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    return THEMES[name] ? name : DEFAULT_THEME;
  }

  function ensureStyle() {
    if (document.getElementById('poketto-theme-style')) return;
    var style = document.createElement('style');
    style.id = 'poketto-theme-style';
    // Semua usage warna primer Poketto diarahkan ke CSS variable.
    style.textContent = [
      '.bg-\\[\\#8B5CF6\\],.bg-lavender-dark,.bg-lavender,.hover\\:bg-\\[\\#8B5CF6\\]:hover,.hover\\:bg-lavender-dark:hover',
      '{background-color:var(--poketto-primary)!important}',
      '.text-\\[\\#8B5CF6\\],.text-lavender-dark,.hover\\:text-lavender-dark:hover',
      '{color:var(--poketto-primary)!important}',
      '.border-\\[\\#8B5CF6\\],.border-lavender-dark{border-color:var(--poketto-primary)!important}',
      '.focus\\:ring-\\[\\#8B5CF6\\]:focus{--tw-ring-color:var(--poketto-primary)!important}',
      '.focus\\:border-\\[\\#8B5CF6\\]:focus{border-color:var(--poketto-primary)!important}',
    ].join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function applyTheme(name) {
    if (!THEMES[name]) name = DEFAULT_THEME;
    try { localStorage.setItem(STORAGE_KEY, name); } catch (e) {}
    document.documentElement.style.setProperty('--poketto-primary', THEMES[name]);
    ensureStyle();
    // Sinkronkan meta theme-color (PWA) bila ada.
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEMES[name]);
  }

  // Expose untuk halaman (mis. profile.html) memanggil saat user memilih tema.
  window.POKETTO_THEMES = THEMES;
  window.getPokettoTheme = getThemeName;
  window.applyPokettoTheme = applyTheme;

  // Terapkan segera saat load.
  applyTheme(getThemeName());
})();
