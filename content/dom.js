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
    // Memprioritaskan penggunaan Scraper terpisah jika tersedia
    let friends = [];
    if (window.NraScraper && typeof window.NraScraper.extractFriendsFromDOM === 'function') {
      friends = window.NraScraper.extractFriendsFromDOM();
    } else {
      // Fallback ke scraper bawaan dom.js
      friends = scanFriendsRobust();
    }
    
    iframe.contentWindow.postMessage({ 
      action: 'SCAN_COMPLETE', 
      friends 
    }, targetOrigin);
  }, 500);
}

// --- SCRAPER BARU (ROBUST) ---
// Return format array object untuk dikirim ke background/popup
function scanFriendsRobust() {
  // Cari semua tombol "More" / "Lainnya"
  const moreBtns = document.querySelectorAll('[aria-label="More"][role="button"], [aria-label="Lainnya"][role="button"]');
  const result = [];
  const seenNames = new Set();
  let index = 0;
  moreBtns.forEach(btn => {
    // [PERBAIKAN] FB terkadang menaruh tombol "More" di dalam div yang tidak punya "ignore-dynamic"
    // Gunakan 'div[role="listitem"]' atau mundur ke atas sebagai kontainer baris yang valid
    let row = btn.closest('div[role="listitem"]');
    if (!row) {
      // Fallback: Cari parent dengan 'data-visualcompletion="ignore-dynamic"'
      row = btn.closest('div[data-visualcompletion="ignore-dynamic"]');
    }

    if (row) {
      // Cari elemen link profil yang memiliki aria-label (A atau elemen clickable lain)
      const profileLink = row.querySelector('a[aria-label], [role="link"][aria-label]');
      const rawLabel = profileLink ? profileLink.getAttribute('aria-label') : null;
      const friendName = rawLabel ? rawLabel.trim() : "Unknown Friend";


      if (friendName !== "Unknown Friend") {
        // Filter duplikasi (kadang tombol "More" ter-render dobel di DOM shadow/hidden)
        if (!seenNames.has(friendName)) {
          seenNames.add(friendName);
          
          const targetId = `nra-target-${index}`;
          row.setAttribute('data-nra-id', targetId);
          btn.setAttribute('data-nra-btn', targetId);
          
          result.push({
            id: targetId,
            name: friendName
          });
          index++;
        }
      }
    }
  });

  return result;
}

// Fungsi Scraper lama dihapus (scanFriends)


// Listener pindah ke master_listener.js untuk hindari race condition
