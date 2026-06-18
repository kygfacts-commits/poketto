// Poketto — nav-loader.js
// Bertanggung jawab atas semua inisialisasi navigasi:
//   • fetch sidebar + mobile-nav komponen secara paralel
//   • inject ke #sidebar-container dan #mobile-nav-container
//   • set active state berdasarkan URL
//   • init drawer open/close + swipe gesture
//   • bind tombol Logout ke Supabase signOut
//   • reveal nav container via fade-in setelah nav siap
//
// Diimpor sebagai ES module di setiap halaman terproteksi.

import { supabase } from './supabase-client.js';
import { updateBillsBadge } from './notification-badge.js';
import { initQuickAdd } from './quick-add.js';

// ── Path base (halaman ada di /pages/, komponen di /components/) ──────────────
const IN_PAGES = window.location.pathname.includes('/pages/');
const BASE     = IN_PAGES ? '../' : './';

// ── Active state config ────────────────────────────────────────────────────────
const FILENAME = window.location.pathname.split('/').pop() || 'home.html';
// account-detail maps to accounts as active nav item
const ACTIVE_FILE  = FILENAME === 'account-detail.html' ? 'accounts.html' : FILENAME;
// mobile slot: pages that belong to the "Lainnya" drawer group
const DRAWER_PAGES = new Set(['accounts.html','goals.html','bills.html','portfolio.html',
                               'charts.html','reports.html','profile.html','account-detail.html',
                               'insights.html','categories.html','backup.html','liabilities.html']);
const ACTIVE_SLOT  =
  ACTIVE_FILE === 'home.html'         ? 'home'         :
  ACTIVE_FILE === 'transactions.html' ? 'transactions' :
  ACTIVE_FILE === 'budget.html'       ? 'budget'       :
  ACTIVE_FILE === 'add.html'          ? 'add'          :
  DRAWER_PAGES.has(ACTIVE_FILE)       ? 'other'        : '';

// ── Expose drawer functions globally (called from component onclick attrs) ─────
window.pknOpenDrawer  = openDrawer;
window.pknCloseDrawer = closeDrawer;

// ── Main loader ────────────────────────────────────────────────────────────────
async function loadNav() {
  const sidebarEl = document.getElementById('sidebar-container');
  const mobileEl  = document.getElementById('mobile-nav-container');
  try {
    const [sidebarHTML, mobileHTML] = await Promise.all([
      fetchComponent('components/sidebar.html'),
      fetchComponent('components/mobile-nav.html'),
    ]);

    if (sidebarEl) { sidebarEl.innerHTML = sidebarHTML; sidebarEl.classList.remove('opacity-0'); }
    if (mobileEl)  { mobileEl.innerHTML  = mobileHTML;  mobileEl.classList.remove('opacity-0'); }

    setActiveNav();
    initDrawerSwipe();
    initQuickAdd();
    await initLogout();

    // Badge notifikasi tagihan jatuh tempo (≤ 7 hari)
    updateBillsBadge();
  } catch (err) {
    console.warn('[nav-loader] Nav load failed:', err.message);
    sidebarEl?.classList.remove('opacity-0');
    mobileEl?.classList.remove('opacity-0');
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
  // Perbarui badge tagihan setiap kali drawer dibuka
  updateBillsBadge();
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

// ── Kick off ───────────────────────────────────────────────────────────────────
loadNav();
