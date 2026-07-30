// content/scraper.js
// Modul ekstraksi DOM spesifik untuk daftar pertemanan Facebook
// Di-include pada worker.js / dom.js / manifest (sebagai dependency modular).

const Scraper = {
  /**
   * Mengekstrak seluruh item teman di halaman yang sudah ter-scroll.
   * @returns {Array} array dari objek profile {id, name, elementUrl, label}
   */
  extractFriendsFromDOM: () => {
    // Cari semua tombol "More" / "Lainnya" yang merepresentasikan 1 item target profil
    const moreBtns = document.querySelectorAll('[aria-label="More"][role="button"], [aria-label="Lainnya"][role="button"]');
    const result = [];
    const seenNames = new Set();
    let index = 0;

    moreBtns.forEach((btn) => {
      // [PERBAIKAN] Menggunakan selector DOM FB terbaru
      let row = btn.closest('div[role="listitem"]');
      if (!row) {
        row = btn.closest('div[data-visualcompletion="ignore-dynamic"]');
      }

      if (row) {
        // Ekstraksi data profil dari elemen dengan aria-label profil
        const profileLink = row.querySelector('a[aria-label], [role="link"][aria-label]');
        if (!profileLink) return;

        const friendName = profileLink.getAttribute('aria-label').trim() || "Unknown";
        const profileUrl = profileLink.href || "";

        // Filter duplikasi data akibat DOM yang merender-ulang list yang sama secara shadow
        if (friendName !== "Unknown" && !seenNames.has(friendName)) {
          seenNames.add(friendName);
          
          const targetId = `nra-target-scrape-${index}`;
          // Tandai elemen DOM untuk dipakai executor di tahap selanjutnya
          row.setAttribute('data-nra-id', targetId);
          btn.setAttribute('data-nra-btn', targetId);
          
          result.push({
            id: targetId,
            name: friendName,
            url: profileUrl,
            label: profileLink.getAttribute('aria-label')
          });
          
          index++;
        }
      }
    });

    return result;
  }
};

// Pastikan object global tersedia (jika digunakan via content_script window)
if (typeof window !== 'undefined') {
  window.NraScraper = Scraper;
}
