// Poketto - Bills notification badge
// Di-import dari auth-guard.js; listener terpasang sebelum event schatz:auth-ready di-dispatch.

import { supabase } from './supabase-client.js';

window.addEventListener('schatz:auth-ready', async ({ detail: { user } }) => {
  const today = new Date();
  const future = new Date(today);
  future.setDate(future.getDate() + 3);
  // Format YYYY-MM-DD — sesuai tipe date di kolom next_due_date
  const futureDateStr = future.toISOString().slice(0, 10);

  try {
    const { count, error } = await supabase
      .from('scheduled_bills')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true)
      .not('next_due_date', 'is', null)
      .lte('next_due_date', futureDateStr);

    if (error || !count || count === 0) return;

    injectBadges(count > 9 ? '9+' : String(count));
  } catch {
    // Badge non-kritis — gagal diam-diam
  }
});

function injectBadges(label) {
  // Tangkap semua anchor ke bills.html (sidebar) + tombol drawer (data-bills-link)
  const links = document.querySelectorAll(
    'a[href="bills.html"], a[href="../pages/bills.html"], a[href*="/bills.html"], [data-bills-link]'
  );

  links.forEach(link => {
    // Jangan inject dua kali
    if (link.querySelector('[data-bills-badge]')) return;

    // Pada saat ini Lucide sudah replace <i> → <svg> (script sync berjalan sebelum modules)
    const iconEl = link.firstElementChild;
    if (!iconEl) return;

    // Bungkus icon dalam span relative agar badge bisa diposisikan absolute
    const wrapper = document.createElement('span');
    wrapper.className = 'relative inline-flex flex-shrink-0';
    link.insertBefore(wrapper, iconEl);
    wrapper.appendChild(iconEl);

    // Badge merah
    const badge = document.createElement('span');
    badge.setAttribute('data-bills-badge', '1');
    badge.className =
      'absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold leading-none';
    badge.style.fontSize = '9px';
    badge.textContent = label;
    wrapper.appendChild(badge);
  });
}
