// content/executor.js
// Loop eksekusi unfollow dengan error handling per-target.
// Prinsip: TIDAK PERNAH CRASH. Skip & log jika DOM berubah.

// ---- CONFIG ----
const EXEC_CONFIG = {
  maxRetries: 2,           // retry per target sebelum skip
  retryDelayMs: [1500, 3000],
  clickDelayMs: [2000, 4000],  // jeda antar klik menu
  nextTargetMs: [3000, 7000],  // jeda antar target (anti-spam)
  menuWaitMs: 2000,            // tunggu popup menu muncul
};

// ---- STATUS ENUM ----
const STATUS = {
  SUCCESS: 'success',
  SKIPPED: 'skipped',
  FAILED: 'failed',
};

// ---- UI LOGGER ----
// Kirim log ke sidebar iframe via postMessage / chrome.runtime
function logToUI(message, level = 'info') {
  const prefix = {
    info:  '> ',
    warn:  '> [WARN] ',
    error: '> [ERR!] ',
    ok:    '> [OK] ',
  }[level] || '> ';

  // Kirim ke popup/sidebar via runtime message
  chrome.runtime.sendMessage({
    action: 'LOG',
    text: prefix + message,
    level,
    timestamp: Date.now()
  }, () => {
    if (chrome.runtime.lastError) {
      // Abaikan jika popup tertutup
    }
  });
}

// ---- ELEMENT FINDER (SAFE) ----
// Cari elemen dengan polling pendek agar tidak memberatkan memori FB
function waitForElement(parent, selector, timeoutMs = EXEC_CONFIG.menuWaitMs) {
  return new Promise(resolve => {
    let elapsed = 0;
    const interval = 200;
    const timer = setInterval(() => {
      const el = parent.querySelector(selector);
      if (el) {
        clearInterval(timer);
        return resolve(el);
      }
      elapsed += interval;
      if (elapsed >= timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, interval);
  });
}

// ---- SAFE CLICK ----
// Klik elemen, return true/false. Tidak throw.
function safeClick(el) {
  try {
    if (!el || !el.isConnected) return false;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.click();
    return true;
  } catch (e) {
    return false;
  }
}

// ---- SINGLE TARGET UNFOLLOW ----
// Coba unfollow 1 orang. Return { status, name, error? }
async function unfollowOne(target, dryRun = false, actionType = 'unfollow') {
  const { id, name } = target;

  // 1) Cari baris teman berdasar data-attribute yang ditandai saat scan
  const row = document.querySelector(`[data-nra-id="${id}"]`);
  if (!row || !row.isConnected) {
    return { status: STATUS.SKIPPED, name, error: 'DOM row missing / scrolled out of viewport' };
  }

  // Jika Dry Run: cukup jeda, log, dan pura-pura berhasil
  if (dryRun) {
    logToUI(`[DRY RUN] Simulating ${actionType.toUpperCase()} for: ${name}`, 'warn');
    await randomDelay(...EXEC_CONFIG.clickDelayMs);
    return { status: STATUS.SUCCESS, name };
  }

  // 2) Cari & klik tombol "More" (titik tiga)
  const moreBtn = row.querySelector('[data-nra-btn]');
  if (!safeClick(moreBtn)) {
    return { status: STATUS.SKIPPED, name, error: 'More button not found' };
  }

  // Jeda: tunggu menu popover FB di-render ke DOM
  await randomDelay(800, 1500);

  // 3) Ambil semua menu item dari popover yang muncul
  const menuItems = document.querySelectorAll('div[role="menuitem"]');
  if (!menuItems.length) {
    dismissMenu();
    return { status: STATUS.SKIPPED, name, error: 'Popover menu missing or empty' };
  }

  // 4) Iterasi menu item, cari yang mengandung teks (multi-bahasa)
  const unfollowKeywords = ['unfollow', 'batal mengikuti', 'berhenti mengikuti', 'berhenti ikuti'];
  const unfriendKeywords = ['unfriend', 'hapus pertemanan'];
  const targetKeywords = actionType === 'unfriend' ? unfriendKeywords : unfollowKeywords;
  
  let targetItem = null;

  for (const item of menuItems) {
    const text = (item.innerText || item.textContent || '').toLowerCase().trim();
    if (targetKeywords.some(kw => text.includes(kw))) {
      targetItem = item;
      break;
    }
  }

  // 5) Klik item jika ditemukan
  if (targetItem) {
    if (!safeClick(targetItem)) {
      dismissMenu();
      return { status: STATUS.SKIPPED, name, error: `${actionType.toUpperCase()} click failed` };
    }
    // Jeda setelah klik
    await randomDelay(800, 1500);

    // Kalo unfriend, FB biasanya ngeluarin konfirmasi popup modal (Dialog)
    // Kita cari tombol Konfirmasi-nya.
    if (actionType === 'unfriend') {
      const confirmDialog = document.querySelector('div[role="dialog"]');
      if (confirmDialog) {
        // Tombol Confirm biasanya berwarna biru, aria-label "Confirm" atau teks konfirmasi
        await randomDelay(1000, 2000);
        // FB kadang menaruh aria-label "Confirm" di role="button"
        const confirmBtn = confirmDialog.querySelector('div[aria-label="Confirm"][role="button"], div[aria-label="Konfirmasi"][role="button"]');
        if (confirmBtn) {
          safeClick(confirmBtn);
          await randomDelay(800, 1500);
        } else {
          // Jika tidak nemu berdasar label, klik tombol terakhir dari dialog (biasanya konfirmasi)
          const dialogBtns = confirmDialog.querySelectorAll('div[role="button"]');
          if (dialogBtns.length > 0) {
            safeClick(dialogBtns[dialogBtns.length - 1]);
            await randomDelay(800, 1500);
          }
        }
      }
    }

    return { status: STATUS.SUCCESS, name };
  }

  // 6) Item tidak ditemukan, tutup menu
  dismissMenu();
  await randomDelay(500, 800);
  return { status: STATUS.SKIPPED, name, error: `${actionType.toUpperCase()} Option unavailable` };
}

// ---- DISMISS MENU ----
// Tutup popover menu FB dengan Escape lalu fallback klik body
function dismissMenu() {
  try {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  } catch (e) {
    // Fallback: klik body
    document.body.click();
  }
}

// ---- MAIN LOOP ----
// Eksekusi batch unfollow. TIDAK PERNAH THROW ke caller.
// queue: array dari { id, name, url }
// killSignal: object { killed: false }
// dryRun: boolean, true = skip actual click
async function executeUnfollowLoop(queue, killSignal, dryRun = false, actionType = 'unfollow') {
  const results = { success: 0, skipped: 0, failed: 0, log: [] };

  logToUI(`Starting execution for ${queue.length} targets... ${dryRun ? '[MODE DRY RUN]' : ''}`);

  for (let i = 0; i < queue.length; i++) {
    // ---- KILL SWITCH CHECK ----
    if (killSignal.killed) {
      logToUI('KILL SWITCH TRIGGERED. Execution halted.', 'warn');
      break;
    }

    const target = queue[i];
    logToUI(`[${i + 1}/${queue.length}] ${target.name}...`);

    let result = null;
    let attempts = 0;

    // ---- RETRY LOOP PER TARGET ----
    while (attempts <= EXEC_CONFIG.maxRetries) {
      try {
        result = await unfollowOne(target, dryRun, actionType);

        if (result.status === STATUS.SUCCESS) break; // berhasil, lanjut target berikut
        
        // Cek jika error spesifik "Opsi tidak ada", artinya target sudah di-unfollow sebelumnya.
        // Hentikan retry agar tidak buang waktu.
        if (result.status === STATUS.SKIPPED && result.error && result.error.includes('Option')) {
          result.error = `Already ${actionType}ed / Option unavailable`;
          break;
        }

        // Gagal (tapi bukan karena opsi hilang), coba retry jika memungkinkan
        if (attempts < EXEC_CONFIG.maxRetries) {
          attempts++;
          logToUI(`Retry ${attempts}/${EXEC_CONFIG.maxRetries} for ${target.name}: ${result.error}`, 'warn');
          await randomDelay(...EXEC_CONFIG.retryDelayMs);
          continue;
        }

        break; // habis retry

      } catch (unexpectedError) {
        // ---- CATCH-ALL: Apapun yang tidak tertangkap ----
        // Ini safety net absolut. unfollowOne() harusnya tidak throw,
        // tapi jika FB inject script yang bikin error aneh, tangkap disini.
        result = {
          status: STATUS.FAILED,
          name: target.name,
          error: `Unexpected: ${unexpectedError.message || String(unexpectedError)}`
        };
        logToUI(`FATAL ERROR pada ${target.name}: ${result.error}`, 'error');
        break; // jangan retry error yang tidak dikenal
      }
    }

    // ---- CATAT HASIL ----
    if (result) {
      results.log.push(result);
      if (result.status === STATUS.SUCCESS) {
        results.success++;
        logToUI(`${target.name} - ${actionType.toUpperCase()}ED`, 'ok');
      } else {
        results[result.status]++;
        logToUI(`${target.name} - ${result.status.toUpperCase()}: ${result.error || ''}`, 'warn');
      }
    }

    // ---- PROGRESS KE POPUP ----
    chrome.runtime.sendMessage({
      action: 'PROGRESS',
      current: i + 1,
      total: queue.length,
      results: { ...results, log: undefined } // kirim summary, bukan full log
    }, () => {
      if (chrome.runtime.lastError) {}
    });

    // ---- JEDA ANTI-SPAM ANTAR TARGET ----
    if (i < queue.length - 1 && !killSignal.killed) {
      await randomDelay(...EXEC_CONFIG.nextTargetMs);
    }
  }

  // ---- SELESAI ----
  logToUI(`Completed. OK:${results.success} Skip:${results.skipped} Fail:${results.failed}`, 'info');
  chrome.runtime.sendMessage({ action: 'EXEC_DONE', results }, () => {
    if (chrome.runtime.lastError) {}
  });

  return results;
}

// ---- KILL SIGNAL (Global, dipakai oleh message listener) ----
let _killSignal = { killed: false };

// ---- MASTER MESSAGE LISTENER ----
// Gabungan dari dom.js dan executor.js untuk hindari race condition
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'TOGGLE_SIDEBAR') {
    if (typeof toggleSidebar === 'function') toggleSidebar();
    sendResponse({ status: 'ok' });
  } 

  if (msg.action === 'INJECT_UI') {
    // Fallback/alias
    if (typeof toggleSidebar === 'function') toggleSidebar();
    sendResponse({ status: 'ok' });
  } 

// Di dalam dom.js, scanFriends sudah dihapus jadi kita tak perlu memanggilnya
// Tapi kita pertahankan alias agar tidak error jika dipanggil via runtime message
  if (msg.action === 'SCAN_DOM') {
    // Logic lama: const friends = (typeof scanFriends === 'function') ? scanFriends() : [];
    // Sekarang dihandle via postMessage. Ini dikosongkan.
    sendResponse({ friends: [] });
  }

  if (msg.action === 'EXECUTE') {
    _killSignal = { killed: false };
    executeUnfollowLoop(msg.queue || [], _killSignal, msg.dryRun, msg.actionType);
    sendResponse({ status: 'started' });
  }

  if (msg.action === 'KILL') {
    _killSignal.killed = true;
    logToUI('KILL SWITCH received.', 'error');
    sendResponse({ status: 'killed' });
  }

  return true;
});