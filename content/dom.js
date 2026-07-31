/**
 * content/dom.js
 * Injeksi UI Sidebar dan fungsi Auto-Scroll Halaman Facebook.
 */

// --- STATE ---
const CONFIG = {
  PANEL_WIDTH: 350,       // Lebar sidebar iframe
  SCROLL_DELAY_MS: 2000,  // Interval antar deteksi scroll
  MAX_STAGNANT: 4,        // Jumlah maksimal scroll buntu sebelum scan selesai
};

let _sidebarVisible = false;
let _scrollInterval = null;

// --- INJECTOR UI ---

/**
 * Buat dan pasang elemen iframe ke dalam body document.
 * @returns {HTMLIFrameElement}
 */
function createSidebarIframe() {
  const iframe = document.createElement('iframe');
  iframe.id = 'nra-fb-sidebar-iframe';
  iframe.src = chrome.runtime.getURL('popup/popup.html');
  iframe.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: ${CONFIG.PANEL_WIDTH}px;
    height: 100vh;
    border: none;
    border-left: 2px solid #38bdf8;
    z-index: 999999;
    box-shadow: -5px 0 15px rgba(0,0,0,0.5);
    transform: translateX(100%);
    transition: transform 0.3s ease-in-out;
  `;
  document.body.appendChild(iframe);
  return iframe;
}

/** Toggle kemunculan sidebar. */
function toggleSidebar() {
  let iframe = document.getElementById('nra-fb-sidebar-iframe');
  
  if (!iframe) {
    document.body.style.transition = 'margin-right 0.3s ease-in-out';
    iframe = createSidebarIframe();
    // Beri waktu sejenak agar frame ter-render ke DOM sebelum memicu transisi geser
    setTimeout(() => openSidebar(iframe), 50);
  } else {
    _sidebarVisible ? closeSidebar(iframe) : openSidebar(iframe);
  }
}

/** Tampilkan sidebar. */
function openSidebar(iframe) {
  _sidebarVisible = true;
  iframe.style.transform = 'translateX(0)';
  document.body.style.marginRight = `${CONFIG.PANEL_WIDTH}px`;
}

/** Sembunyikan sidebar. */
function closeSidebar(iframe) {
  _sidebarVisible = false;
  iframe.style.transform = 'translateX(100%)';
  document.body.style.marginRight = '0px';
}

// --- DOM UTILS ---

/**
 * Cari jumlah total target pertemanan yang tertulis di header (cth: "626 Teman").
 * @returns {number} Jumlah total target.
 */
function parseFriendCount() {
  const headings = [...document.querySelectorAll('a[role="link"]'), ...document.querySelectorAll('h2[dir="auto"]')];
  for (const el of headings) {
    const text = el.innerText.toLowerCase();
    if (text.includes('friends') || text.includes('teman')) {
      const match = text.match(/[\d,.]+/);
      if (match) return parseInt(match[0].replace(/[,.]/g, ''), 10);
    }
  }
  return 0;
}

/**
 * Temukan kontainer yang dapat digulir spesifik pada layout Facebook terbaru.
 * @returns {Element} Elemen yang mendukung scroll.
 */
function findScrollContainer() {
  const thumbEl = document.querySelector('div[data-thumb="1"]');
  if (thumbEl) {
    const container = thumbEl.closest('div[style*="overflow"]');
    if (container) return container;
  }
  return document.scrollingElement || document.body;
}

// --- SCANNING LISTENER & LOOP ---

// Menerima perintah SCAN dari popup iframe
window.addEventListener('message', (event) => {
  if (event.origin.startsWith('chrome-extension://') && event.data?.action === 'REQUEST_SCAN') {
    startAutoScrollAndScan(event.origin);
  }
});

/**
 * Kirim hasil temuan akhir ke frame popup.
 * @param {HTMLIFrameElement} iframe 
 * @param {string} targetOrigin 
 */
function finishScan(iframe, targetOrigin) {
  setTimeout(() => {
    const friends = window.NraScraper?.extractFriendsFromDOM?.() || [];
    iframe.contentWindow.postMessage({ action: 'SCAN_COMPLETE', friends }, targetOrigin);
  }, 500);
}

/**
 * Mulai interval auto-scroll yang memicu load malas (lazy-load) pada list teman FB.
 * @param {string} targetOrigin 
 */
function startAutoScrollAndScan(targetOrigin) {
  const iframe = document.getElementById('nra-fb-sidebar-iframe');
  if (!iframe || !iframe.contentWindow) return;

  if (_scrollInterval) clearInterval(_scrollInterval);

  const targetTotal = parseFriendCount();
  const scrollContainer = findScrollContainer();
  let lastHeight = scrollContainer.scrollHeight;
  let stagnantCycles = 0;

  _scrollInterval = setInterval(() => {
    // Paksa scroll hingga batas bawah viewport dan picu event
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
    scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));

    // Ambil jumlah pertemanan yang sudah ter-render sejauh ini
    const tempCount = window.NraScraper?.extractFriendsFromDOM?.().length || 
      document.querySelectorAll(window.NraScraper?.MORE_BTN_SELECTOR || '[aria-label="More"][role="button"]').length;

    // Lapor kemajuan ke popup
    iframe.contentWindow.postMessage({ 
      action: 'SCAN_PROGRESS', count: tempCount, targetTotal 
    }, targetOrigin);

    // Cek target maksimal tercapai
    if (targetTotal > 0 && tempCount >= targetTotal) {
      clearInterval(_scrollInterval);
      _scrollInterval = null;
      return finishScan(iframe, targetOrigin);
    }

    // Deteksi stagnansi tinggi halaman (apakah scroll mentok)
    const currentHeight = scrollContainer.scrollHeight;
    if (currentHeight === lastHeight) {
      stagnantCycles++;
    } else {
      stagnantCycles = 0; 
      lastHeight = currentHeight;
    }

    if (stagnantCycles >= CONFIG.MAX_STAGNANT) {
      clearInterval(_scrollInterval);
      _scrollInterval = null;
      finishScan(iframe, targetOrigin);
    }
  }, CONFIG.SCROLL_DELAY_MS);
}
