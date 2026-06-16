// Poketto - Mobile bottom nav + "Lainnya" drawer injector
// Di-import dari auth-guard.js → aktif otomatis di semua halaman terproteksi.
// Menggantikan bottom nav lama yang di-hardcode di setiap HTML.

// ── Active page dari URL ───────────────────────────────────────────────────────
const _p = window.location.pathname;
const ACTIVE =
  _p.endsWith('home.html')         ? 'home'         :
  _p.endsWith('transactions.html') ? 'transactions' :
  _p.endsWith('budget.html')       ? 'budget'       :
  _p.endsWith('add.html')          ? 'add'          : 'other';

// ── Inline SVG icons ───────────────────────────────────────────────────────────
const SVG = {
  home: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  list: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  plus: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  pie:  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 118 2.83"/><path d="M22 12A10 10 0 0012 2v10z"/></svg>`,
  menu: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
  // Drawer items
  wallet:    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V22H4a2 2 0 01-2-2V6a2 2 0 012-2h16v4"/><path d="M22 12v8"/><circle cx="16" cy="12" r="2"/></svg>`,
  target:    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  bell:      `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>`,
  trending:  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>`,
  lineChart: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  fileText:  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  user:      `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
};

// ── Drawer menu items ──────────────────────────────────────────────────────────
const DRAWER_ITEMS = [
  { label: 'Akun',      href: 'accounts.html',  icon: SVG.wallet,    bg: '#EDE9FE', fg: '#7C3AED' },
  { label: 'Goals',     href: 'goals.html',     icon: SVG.target,    bg: '#FED7AA', fg: '#C2410C' },
  { label: 'Tagihan',   href: 'bills.html',     icon: SVG.bell,      bg: '#A7F3D0', fg: '#059669', billsLink: true },
  { label: 'Portfolio', href: 'portfolio.html', icon: SVG.trending,  bg: '#BAE6FD', fg: '#0284C7' },
  { label: 'Charts',    href: 'charts.html',    icon: SVG.lineChart, bg: '#FEF3C7', fg: '#D97706' },
  { label: 'Reports',   href: 'reports.html',   icon: SVG.fileText,  bg: '#F3E8FF', fg: '#9333EA' },
  { label: 'Profil',    href: 'profile.html',   icon: SVG.user,      bg: '#FCE7F3', fg: '#DB2777' },
];

// ── Inject global styles ───────────────────────────────────────────────────────
function injectStyles() {
  const s = document.createElement('style');
  s.id = 'poketto-mobile-nav-styles';
  s.textContent = `
    /* Bottom nav */
    #pkn-bottom-nav {
      display: none;
      position: fixed; bottom: 0; left: 0; right: 0;
      background: rgba(255,255,255,0.96);
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      border-top: 1px solid #EDE9FE;
      align-items: center; justify-content: space-around;
      padding: 8px 8px; z-index: 40;
    }
    @media (max-width: 767px) { #pkn-bottom-nav { display: flex; } }

    .pkn-slot {
      display: flex; flex-direction: column; align-items: center;
      gap: 2px; padding: 4px 12px; border-radius: 10px;
      border: none; background: none; cursor: pointer;
      color: #9CA3AF; transition: color .15s;
      font-family: inherit;
    }
    .pkn-slot.active { color: #7C3AED; }
    .pkn-slot-label { font-size: 10px; font-weight: 600; line-height: 1; }

    .pkn-add-btn {
      display: flex; align-items: center; justify-content: center;
      width: 56px; height: 56px; margin-top: -24px;
      border-radius: 9999px;
      background: #A78BFA; color: white;
      border: none; cursor: pointer;
      box-shadow: 0 8px 24px rgba(167,139,250,0.45);
      transition: background .15s, transform .1s;
    }
    .pkn-add-btn.active { background: #7C3AED; }
    .pkn-add-btn:active { transform: scale(0.94); }

    /* Drawer backdrop */
    #pkn-backdrop {
      display: none; position: fixed; inset: 0;
      background: rgba(0,0,0,0); z-index: 60;
      transition: background .3s;
    }
    #pkn-backdrop.open { background: rgba(0,0,0,0.45); }

    /* Drawer panel */
    #pkn-drawer {
      position: fixed; bottom: 0; left: 0; right: 0;
      background: #fff;
      border-radius: 20px 20px 0 0;
      z-index: 70;
      box-shadow: 0 -8px 40px rgba(0,0,0,0.12);
      transform: translateY(100%);
      transition: transform .3s cubic-bezier(0.32,0.72,0,1);
    }
    #pkn-drawer.open { transform: translateY(0); }

    /* Drawer item cards */
    .pkn-drawer-item {
      display: flex; flex-direction: column; align-items: center;
      gap: 8px; padding: 12px 8px; border-radius: 14px;
      background: #F8F7FF;
      border: none; cursor: pointer;
      font-family: inherit;
      transition: background .12s, transform .1s;
    }
    .pkn-drawer-item:active { transform: scale(0.95); background: #EDE9FE; }
    .pkn-drawer-icon {
      width: 44px; height: 44px; border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
      position: relative;
    }
    .pkn-drawer-label {
      font-size: 11px; font-weight: 600;
      color: #1E1B4B; line-height: 1;
    }
    .pkn-drawer-grid {
      display: grid; grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
  `;
  document.head.appendChild(s);
}

// ── Inject bottom nav ──────────────────────────────────────────────────────────
function injectBottomNav() {
  // Remove old static nav
  const old = [...document.querySelectorAll('nav')].find(n =>
    n.classList.contains('fixed') && n.classList.contains('bottom-0')
  );
  if (old) old.remove();

  const nav = document.createElement('nav');
  nav.id = 'pkn-bottom-nav';
  nav.setAttribute('aria-label', 'Navigasi utama');

  nav.innerHTML = `
    <button class="pkn-slot ${ACTIVE === 'home' ? 'active' : ''}"
      onclick="window.location.href='home.html'" aria-label="Home">
      ${SVG.home}
      <span class="pkn-slot-label">Home</span>
    </button>
    <button class="pkn-slot ${ACTIVE === 'transactions' ? 'active' : ''}"
      onclick="window.location.href='transactions.html'" aria-label="Transaksi">
      ${SVG.list}
      <span class="pkn-slot-label">Transaksi</span>
    </button>
    <button class="pkn-add-btn ${ACTIVE === 'add' ? 'active' : ''}"
      onclick="window.location.href='add.html'" aria-label="Tambah transaksi">
      ${SVG.plus}
    </button>
    <button class="pkn-slot ${ACTIVE === 'budget' ? 'active' : ''}"
      onclick="window.location.href='budget.html'" aria-label="Budget">
      ${SVG.pie}
      <span class="pkn-slot-label">Budget</span>
    </button>
    <button class="pkn-slot ${ACTIVE === 'other' ? 'active' : ''}"
      id="pkn-drawer-open" aria-label="Menu lainnya">
      ${SVG.menu}
      <span class="pkn-slot-label">Lainnya</span>
    </button>
  `;

  document.body.appendChild(nav);
  document.getElementById('pkn-drawer-open').addEventListener('click', openDrawer);
}

// ── Inject drawer ──────────────────────────────────────────────────────────────
function injectDrawer() {
  const itemsHtml = DRAWER_ITEMS.map(item => `
    <button class="pkn-drawer-item"
      onclick="window.location.href='${item.href}'"
      ${item.billsLink ? 'data-bills-link="1"' : ''}
      aria-label="${item.label}">
      <span class="pkn-drawer-icon" style="background:${item.bg}; color:${item.fg}">
        ${item.icon}
      </span>
      <span class="pkn-drawer-label">${item.label}</span>
    </button>
  `).join('');

  const wrap = document.createElement('div');
  wrap.id = 'pkn-drawer-wrap';
  wrap.innerHTML = `
    <div id="pkn-backdrop" role="presentation" onclick="window.pknCloseDrawer()"></div>
    <div id="pkn-drawer" role="dialog" aria-modal="true" aria-label="Menu lainnya">
      <div style="display:flex;justify-content:center;padding:12px 0 4px">
        <div style="width:40px;height:4px;border-radius:9999px;background:#E5E7EB"></div>
      </div>
      <div style="padding:4px 20px 28px">
        <p style="font-size:12px;font-weight:600;color:#6B7280;margin-bottom:14px">Menu Lainnya</p>
        <div class="pkn-drawer-grid">${itemsHtml}</div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  setupSwipe();
}

// ── Drawer open / close ────────────────────────────────────────────────────────
function openDrawer() {
  const backdrop = document.getElementById('pkn-backdrop');
  const drawer   = document.getElementById('pkn-drawer');
  if (!backdrop || !drawer) return;
  backdrop.style.display = 'block';
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => {
    backdrop.classList.add('open');
    drawer.classList.add('open');
  });
}

function closeDrawer() {
  const backdrop = document.getElementById('pkn-backdrop');
  const drawer   = document.getElementById('pkn-drawer');
  if (!backdrop || !drawer) return;
  backdrop.classList.remove('open');
  drawer.classList.remove('open');
  document.body.style.overflow = '';
  setTimeout(() => { backdrop.style.display = 'none'; }, 300);
}

// Expose to global scope for inline onclick
window.pknCloseDrawer = closeDrawer;

// ── Swipe-down to close ────────────────────────────────────────────────────────
function setupSwipe() {
  const drawer = document.getElementById('pkn-drawer');
  if (!drawer) return;
  let startY = 0, lastY = 0;

  drawer.addEventListener('touchstart', e => {
    startY = lastY = e.touches[0].clientY;
  }, { passive: true });

  drawer.addEventListener('touchmove', e => {
    lastY = e.touches[0].clientY;
    const delta = Math.max(0, lastY - startY);
    drawer.style.transition = 'none';
    drawer.style.transform = `translateY(${delta}px)`;
  }, { passive: true });

  drawer.addEventListener('touchend', () => {
    drawer.style.transition = '';
    drawer.style.transform  = '';
    if (lastY - startY > 80) closeDrawer();
  });
}

// ── Run synchronously (DOM already parsed when module evaluates) ───────────────
injectStyles();
injectBottomNav();
injectDrawer();
