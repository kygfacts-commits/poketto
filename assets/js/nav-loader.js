// Poketto — nav-loader.js
// Bertanggung jawab atas semua inisialisasi navigasi:
//   • fetch sidebar + mobile-nav komponen secara paralel
//   • inject ke #sidebar-container dan #mobile-nav-container
//   • set active state berdasarkan URL
//   • init drawer open/close + swipe gesture
//   • bind tombol Logout ke Supabase signOut
//   • reveal halaman (body.nav-loader-ready) setelah nav siap
//
// Diimpor sebagai ES module di setiap halaman terproteksi.

import { supabase } from './supabase-client.js';
import './notification-badge.js';

// ── Path base (halaman ada di /pages/, komponen di /components/) ──────────────
const IN_PAGES = window.location.pathname.includes('/pages/');
const BASE     = IN_PAGES ? '../' : './';

// ── CSS untuk mobile nav dan drawer ───────────────────────────────────────────
const NAV_CSS = `
  #pkn-bottom-nav {
    display: none;
    position: fixed; bottom: 0; left: 0; right: 0;
    background: rgba(255,255,255,0.96);
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    border-top: 1px solid #EDE9FE;
    align-items: center; justify-content: space-around;
    padding: 8px; z-index: 40;
  }
  @media (max-width: 767px) { #pkn-bottom-nav { display: flex; } }

  .pkn-slot {
    display: flex; flex-direction: column; align-items: center;
    gap: 2px; padding: 4px 12px; border-radius: 10px;
    border: none; background: none; cursor: pointer;
    color: #9CA3AF; font-family: inherit; transition: color .15s;
  }
  .pkn-slot.pkn-active { color: #7C3AED; }
  .pkn-slot-label { font-size: 10px; font-weight: 600; line-height: 1; }

  .pkn-add-btn {
    display: flex; align-items: center; justify-content: center;
    width: 56px; height: 56px; margin-top: -24px;
    border-radius: 9999px; background: #A78BFA; color: white;
    border: none; cursor: pointer;
    box-shadow: 0 8px 24px rgba(167,139,250,.45);
    transition: background .15s, transform .1s; flex-shrink: 0;
  }
  .pkn-add-btn.pkn-active { background: #7C3AED; }
  .pkn-add-btn:active { transform: scale(.94); }

  #pkn-backdrop {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,0); z-index: 60; transition: background .3s;
  }
  #pkn-backdrop.pkn-open { background: rgba(0,0,0,.45); }

  #pkn-drawer {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: #fff; border-radius: 20px 20px 0 0; z-index: 70;
    box-shadow: 0 -8px 40px rgba(0,0,0,.12);
    transform: translateY(100%);
    transition: transform .3s cubic-bezier(.32,.72,0,1);
  }
  #pkn-drawer.pkn-open { transform: translateY(0); }

  .pkn-drawer-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; }

  .pkn-drawer-item {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 12px 8px; border-radius: 14px; background: #F8F7FF;
    border: none; cursor: pointer; font-family: inherit;
    transition: background .12s, transform .1s;
  }
  .pkn-drawer-item:active { transform: scale(.95); background: #EDE9FE; }

  .pkn-drawer-icon {
    width: 44px; height: 44px; border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    position: relative; flex-shrink: 0;
  }
  .pkn-drawer-label { font-size: 11px; font-weight: 600; color: #1E1B4B; line-height: 1; }
`;

// ── Active state config ────────────────────────────────────────────────────────
const FILENAME = window.location.pathname.split('/').pop() || 'home.html';
// account-detail maps to accounts as active nav item
const ACTIVE_FILE  = FILENAME === 'account-detail.html' ? 'accounts.html' : FILENAME;
// mobile slot: pages that belong to the "Lainnya" drawer group
const DRAWER_PAGES = new Set(['accounts.html','goals.html','bills.html','portfolio.html',
                               'charts.html','reports.html','profile.html','account-detail.html']);
const ACTIVE_SLOT  =
  ACTIVE_FILE === 'home.html'         ? 'home'         :
  ACTIVE_FILE === 'transactions.html' ? 'transactions' :
  ACTIVE_FILE === 'budget.html'       ? 'budget'       :
  ACTIVE_FILE === 'add.html'          ? 'add'          :
  DRAWER_PAGES.has(ACTIVE_FILE)       ? 'other'        : '';

// ── Inject CSS early so it's ready before HTML is painted ─────────────────────
(function injectCSS() {
  if (document.getElementById('pkn-styles')) return;
  const s = document.createElement('style');
  s.id = 'pkn-styles';
  s.textContent = NAV_CSS;
  document.head.appendChild(s);
})();

// ── Expose drawer functions globally (called from component onclick attrs) ─────
window.pknOpenDrawer  = openDrawer;
window.pknCloseDrawer = closeDrawer;

// ── Main loader ────────────────────────────────────────────────────────────────
async function loadNav() {
  try {
    const [sidebarHTML, mobileHTML] = await Promise.all([
      fetchComponent('components/sidebar.html'),
      fetchComponent('components/mobile-nav.html'),
    ]);

    const sidebarEl  = document.getElementById('sidebar-container');
    const mobileEl   = document.getElementById('mobile-nav-container');

    if (sidebarEl)  sidebarEl.innerHTML  = sidebarHTML;
    if (mobileEl)   mobileEl.innerHTML   = mobileHTML;

    setActiveNav();
    initDrawerSwipe();
    await initLogout();
  } catch (err) {
    console.warn('[nav-loader] Nav load failed:', err.message);
  } finally {
    // Reveal page — prevents FOUC regardless of success/failure
    document.body.classList.add('nav-loader-ready');
  }
}

async function fetchComponent(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.text();
}

// ── Active nav highlight ───────────────────────────────────────────────────────
const SIDEBAR_INACTIVE = 'flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium text-[#6B7280] hover:bg-white/70 hover:text-[#1E1B4B] transition-colors';
const SIDEBAR_ACTIVE   = 'flex items-center gap-3 px-4 py-2.5 rounded-xl font-semibold bg-lavender-dark text-white shadow-sm';

function setActiveNav() {
  // Sidebar links
  document.querySelectorAll('[data-nav-link]').forEach(el => {
    if (el.getAttribute('data-nav-link') === ACTIVE_FILE) {
      el.className = SIDEBAR_ACTIVE;
    }
  });

  // Mobile bottom nav slots
  if (ACTIVE_SLOT) {
    const btn = document.querySelector(`[data-nav-slot="${ACTIVE_SLOT}"]`);
    if (btn) btn.classList.add('pkn-active');
    // "Lainnya" button gets active when a drawer-group page is open
    if (ACTIVE_SLOT === 'other') {
      document.getElementById('pkn-drawer-open')?.classList.add('pkn-active');
    }
  }
}

// ── Drawer open / close ────────────────────────────────────────────────────────
function openDrawer() {
  const backdrop = document.getElementById('pkn-backdrop');
  const drawer   = document.getElementById('pkn-drawer');
  if (!backdrop || !drawer) return;
  backdrop.style.display = 'block';
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => {
    backdrop.classList.add('pkn-open');
    drawer.classList.add('pkn-open');
  });
}

function closeDrawer() {
  const backdrop = document.getElementById('pkn-backdrop');
  const drawer   = document.getElementById('pkn-drawer');
  if (!backdrop || !drawer) return;
  backdrop.classList.remove('pkn-open');
  drawer.classList.remove('pkn-open');
  document.body.style.overflow = '';
  setTimeout(() => { backdrop.style.display = 'none'; }, 310);
}

// ── Swipe-down gesture on drawer ───────────────────────────────────────────────
function initDrawerSwipe() {
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
    drawer.style.transform  = `translateY(${delta}px)`;
  }, { passive: true });

  drawer.addEventListener('touchend', () => {
    drawer.style.transition = '';
    drawer.style.transform  = '';
    if (lastY - startY > 80) closeDrawer();
  });
}

// ── Logout ─────────────────────────────────────────────────────────────────────
async function initLogout() {
  const btn = document.getElementById('logout-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    await supabase.auth.signOut();
    window.location.href = IN_PAGES ? '../index.html' : 'index.html';
  });
}

// ── Fallback: reveal page after 4 s even if fetch hangs ───────────────────────
setTimeout(() => document.body.classList.add('nav-loader-ready'), 4000);

// ── Kick off ───────────────────────────────────────────────────────────────────
loadNav();
