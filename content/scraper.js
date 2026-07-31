/**
 * content/scraper.js
 * Modul ekstraksi DOM untuk daftar pertemanan Facebook.
 * Dipanggil oleh dom.js via window.NraScraper global.
 */

const Scraper = {

  /** Selector tombol aksi ("More" / "Lainnya") per baris teman. */
  MORE_BTN_SELECTOR: '[aria-label="More"][role="button"], [aria-label="Lainnya"][role="button"]',

  /**
   * Cari container baris teman terdekat dari sebuah elemen.
   * Facebook menggunakan div[role="listitem"] atau div[data-visualcompletion].
   * @param {Element} el - Elemen awal pencarian (biasanya tombol More).
   * @returns {Element|null}
   */
  findFriendRow(el) {
    return el.closest('div[role="listitem"]')
      || el.closest('div[data-visualcompletion="ignore-dynamic"]');
  },

  /**
   * Ekstrak link profil pertama yang memiliki teks dari sebuah container.
   * Fallback dari aria-label ke innerText untuk kompatibilitas DOM FB terbaru.
   * @param {Element} container - Baris teman.
   * @returns {{ name: string, url: string, label: string|null }|null}
   */
  extractProfile(container) {
    const links = container.querySelectorAll('a[role="link"], a[href]');
    const profileLink = Array.from(links).find(el =>
      (el.innerText || el.textContent || '').trim().length > 0
    );
    if (!profileLink) return null;

    const ariaLabel = profileLink.getAttribute('aria-label');
    const name = (ariaLabel || profileLink.innerText || profileLink.textContent || '').trim();
    if (!name) return null;

    return {
      name,
      url: profileLink.href || '',
      label: ariaLabel,
    };
  },

  /**
   * Ekstrak seluruh item teman dari halaman yang sudah di-scroll.
   * Menandai setiap baris DOM dengan data-nra-id agar executor bisa mengaksesnya.
   * @returns {Array<{ id: string, name: string, url: string, label: string|null }>}
   */
  extractFriendsFromDOM() {
    const moreBtns = document.querySelectorAll(this.MORE_BTN_SELECTOR);
    const result = [];
    const seen = new Set();
    let index = 0;

    moreBtns.forEach((btn) => {
      const row = this.findFriendRow(btn);
      if (!row) return;

      const profile = this.extractProfile(row);
      if (!profile) return;

      // Deduplikasi berdasarkan nama dan URL
      if (seen.has(profile.name) || seen.has(profile.url)) return;
      seen.add(profile.name);
      seen.add(profile.url);

      const targetId = `nra-target-scrape-${index}`;
      row.setAttribute('data-nra-id', targetId);
      btn.setAttribute('data-nra-btn', targetId);

      result.push({
        id: targetId,
        name: profile.name,
        url: profile.url,
        label: profile.label,
      });

      index++;
    });

    return result;
  },
};

// Expose ke global window agar bisa diakses oleh dom.js dan executor.js
if (typeof window !== 'undefined') {
  window.NraScraper = Scraper;
}
