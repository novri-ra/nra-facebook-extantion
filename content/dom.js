// facebook_dom.js
// Injector & Scraper minimalis untuk FB

const SELECTORS = {
  // Update ini jika FB ganti class. Biasanya div role=listitem atau div dengan data-visualcompletion
  friendRow: 'div[data-visualcompletion="ignore-dynamic"]:not([role="banner"]) div[role="listitem"]',
  nameEl: 'a[role="link"][dir="auto"]',
  moreBtn: 'div[aria-label="More"][role="button"], div[aria-label="Lainnya"][role="button"]' 
};

// --- KONSTANTA ---
const PANEL_WIDTH = 350; // px
let _sidebarVisible = false;

// --- INJECTOR ---
function toggleSidebar() {
  let iframe = document.getElementById('nra-fb-sidebar-iframe');
  
  if (!iframe) {
    // Siapkan transisi body FB agar konten "terdorong" halus
    document.body.style.transition = 'margin-right 0.3s ease-in-out';
    
    // Iframe Panel
    iframe = document.createElement('iframe');
    iframe.id = 'nra-fb-sidebar-iframe';
    iframe.src = chrome.runtime.getURL('popup/popup.html');
    iframe.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: ${PANEL_WIDTH}px;
      height: 100vh;
      border: none;
      border-left: 2px solid #00ff00;
      z-index: 999999;
      box-shadow: -5px 0 15px rgba(0,0,0,0.5);
      transform: translateX(100%);
      transition: transform 0.3s ease-in-out;
    `;
    document.body.appendChild(iframe);
    
    // Biarkan DOM render dulu sebelum translasi
    setTimeout(() => openSidebar(iframe), 50);
  } else {
    // Toggle state
    if (_sidebarVisible) {
      closeSidebar(iframe);
    } else {
      openSidebar(iframe);
    }
  }
}

function openSidebar(iframe) {
  _sidebarVisible = true;
  iframe.style.transform = 'translateX(0)';
  document.body.style.marginRight = PANEL_WIDTH + 'px';
}

function closeSidebar(iframe) {
  _sidebarVisible = false;
  iframe.style.transform = 'translateX(100%)';
  document.body.style.marginRight = '0px';
}

// --- POSTMESSAGE LISTENER (HOST) ---
// Komunikasi Iframe <-> Host Script untuk by-pass isolasi MV3
window.addEventListener('message', (event) => {
  // Hanya proses pesan dari popup ekstensi kita sendiri
  if (!event.origin.startsWith('chrome-extension://')) return;

  if (event.data && event.data.action === 'REQUEST_SCAN') {
    startAutoScrollAndScan(event.origin);
  }
});

let _scrollInterval = null;

function startAutoScrollAndScan(targetOrigin) {
  const iframe = document.getElementById('nra-fb-sidebar-iframe');
  if (!iframe || !iframe.contentWindow) return;

  if (_scrollInterval) clearInterval(_scrollInterval);

  // 1) Coba cari elemen total teman dari DOM (contoh: "626 friends" / "626 Teman")
  let targetTotal = 0;
  const headerLinks = document.querySelectorAll('a[role="link"]');
  for (const link of headerLinks) {
    const text = link.innerText.toLowerCase();
    if (text.includes('friends') || text.includes('teman')) {
      const match = text.match(/[\d,.]+/);
      if (match) {
        targetTotal = parseInt(match[0].replace(/[,.]/g, ''), 10);
        break;
      }
    }
  }

  // Fallback ke elemen heading kalau link tidak ketemu
  if (targetTotal === 0) {
    const headings = document.querySelectorAll('h2[dir="auto"]');
    for (const h2 of headings) {
      const text = h2.innerText.toLowerCase();
      if (text.includes('friends') || text.includes('teman')) {
        const match = text.match(/[\d,.]+/);
        if (match) {
          targetTotal = parseInt(match[0].replace(/[,.]/g, ''), 10);
          break;
        }
      }
    }
  }

  let lastHeight = 0;
  let stagnantCycles = 0;
  const MAX_STAGNANT = 4; // Berhenti jika tinggi tidak berubah 4 kali

  // Mencari container scroll khusus FB
  const findScrollContainer = () => {
    // Biasanya list teman FB berada di dalam div dengan scrollbar custom yg memiliki data-thumb="1"
    const thumbEl = document.querySelector('div[data-thumb="1"]');
    if (thumbEl) {
      // Parent dari custom scrollbar biasanya adalah container yang sesungguhnya scrollable
      const container = thumbEl.closest('div[style*="overflow"]');
      if (container) return container;
    }
    // Fallback: Jika tidak ketemu, cari elemen scrollable terdalam, atau body
    return document.scrollingElement || document.body;
  };

  const scrollContainer = findScrollContainer();
  lastHeight = scrollContainer.scrollHeight;

  _scrollInterval = setInterval(() => {
    // Atur scrollTop agar gulir ke paling bawah dari kontainer
    scrollContainer.scrollTop = scrollContainer.scrollHeight;
    
    // Pancing Facebook Lazy-loader untuk bereaksi dengan memicu event scroll manual
    scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));

    // Estimasi jumlah sementara
    const tempCount = document.querySelectorAll('[aria-label="More"][role="button"], [aria-label="Lainnya"][role="button"]').length;
    
    // Kirim pesan PROGRESS
    iframe.contentWindow.postMessage({ 
      action: 'SCAN_PROGRESS', 
      count: tempCount,
      targetTotal: targetTotal 
    }, targetOrigin);

    // Cek apakah sudah memenuhi target DOM
    if (targetTotal > 0 && tempCount >= targetTotal) {
      clearInterval(_scrollInterval);
      _scrollInterval = null;
      finishScan(iframe, targetOrigin);
      return;
    }

    const currentHeight = scrollContainer.scrollHeight;
    if (currentHeight === lastHeight) {
      stagnantCycles++;
    } else {
      stagnantCycles = 0; 
      lastHeight = currentHeight;
    }

    if (stagnantCycles >= MAX_STAGNANT) {
      // Scroll mentok
      clearInterval(_scrollInterval);
      _scrollInterval = null;
      finishScan(iframe, targetOrigin);
    }
  }, 2000); // 2 detik delay per user request
}

function finishScan(iframe, targetOrigin) {
  setTimeout(() => {
    // Gunakan modul eksternal Scraper (agar tidak ada duplikasi kode)
    const friends = (window.NraScraper && window.NraScraper.extractFriendsFromDOM) 
      ? window.NraScraper.extractFriendsFromDOM() 
      : []; 
      
    iframe.contentWindow.postMessage({ 
      action: 'SCAN_COMPLETE', 
      friends 
    }, targetOrigin);
  }, 500);
}
// Fungsi Scraper lama dihapus untuk mencegah race condition / konflik modul

// Listener pindah ke master_listener.js untuk hindari race condition
