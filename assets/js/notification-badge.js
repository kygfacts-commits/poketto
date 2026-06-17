// Poketto - Bills notification badge
// updateBillsBadge() dipanggil dari nav-loader.js setelah nav ter-inject dan
// setiap kali drawer "Lainnya" dibuka. Query tagihan aktif yang jatuh tempo
// dalam 7 hari ke depan, lalu render badge merah di icon Tagihan.

import { supabase } from './supabase-client.js';

export async function updateBillsBadge() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const today = new Date();
    const future = new Date(today);
    future.setDate(future.getDate() + 7);
    // Format YYYY-MM-DD — sesuai tipe date di kolom next_due_date
    const futureDateStr = future.toISOString().slice(0, 10);

    const { count, error } = await supabase
      .from('scheduled_bills')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true)
      .not('next_due_date', 'is', null)
      .lte('next_due_date', futureDateStr);

    if (error) return;

    renderBadges(count > 0 ? (count > 9 ? '9+' : String(count)) : null);
  } catch {
    // Badge non-kritis — gagal diam-diam
  }
}

function renderBadges(label) {
  // Tangkap semua anchor ke bills.html (sidebar) + tombol drawer (data-bills-link)
  const links = document.querySelectorAll(
    'a[href="bills.html"], a[href="../pages/bills.html"], a[href*="/bills.html"], [data-bills-link]'
  );

  links.forEach(link => {
    let badge = link.querySelector('[data-bills-badge]');

    // Tidak ada tagihan jatuh tempo → hapus badge bila ada
    if (label === null) {
      if (badge) badge.remove();
      return;
    }

    // Sudah ada badge → cukup perbarui angka
    if (badge) {
      badge.textContent = label;
      return;
    }

    // Pada saat ini Lucide sudah replace <i> → <svg> (script sync berjalan sebelum modules)
    const iconEl = link.firstElementChild;
    if (!iconEl) return;

    // Bungkus icon dalam span relative agar badge bisa diposisikan absolute
    let wrapper = iconEl;
    if (!iconEl.classList.contains('relative')) {
      wrapper = document.createElement('span');
      wrapper.className = 'relative inline-flex flex-shrink-0';
      link.insertBefore(wrapper, iconEl);
      wrapper.appendChild(iconEl);
    }

    // Badge merah
    badge = document.createElement('span');
    badge.setAttribute('data-bills-badge', '1');
    badge.className =
      'absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold leading-none';
    badge.textContent = label;
    wrapper.appendChild(badge);
  });
}
