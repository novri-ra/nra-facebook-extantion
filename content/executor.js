/**
 * content/executor.js
 * Loop eksekusi batch unfollow/unfriend secara terisolasi.
 * Merupakan entry-point bagi perintah dari popup (iframe) -> runtime.
 */

// --- CONFIG ---
const EXEC_CONFIG = {
  maxRetries: 2,
  retryDelayMs: [1500, 3000],
  clickDelayMs: [2000, 4000],
  nextTargetMs: [3000, 7000],
  menuWaitMs: 2000,
};

const STATUS = {
  SUCCESS: 'success',
  SKIPPED: 'skipped',
  FAILED: 'failed',
};

let _killSignal = { killed: false };

// --- HELPERS ---

/** Kirim pesan log ke antarmuka popup. */
function logToUI(message, level = 'info') {
  const prefix = {
    info:  '> ',
    warn:  '> [WARN] ',
    error: '> [ERR!] ',
    ok:    '> [OK] ',
  }[level] || '> ';

  chrome.runtime.sendMessage({
    action: 'LOG',
    text: prefix + message,
    level,
    timestamp: Date.now()
  }).catch(() => {});
}

/** Tutup menu melayang (popover) FB menggunakan ESC. */
function dismissMenu() {
  try {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  } catch (e) {
    document.body.click();
  }
}

/** 
 * Klik aman dengan memastikan visibilitas viewport tanpa memunculkan error pada layar. 
 * @param {Element|null} el 
 * @returns {boolean}
 */
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

// --- DOM ACTIONS ---

/** 
 * Pilih opsi dari menu popover berdasar text keyword.
 * @param {string} actionType - 'unfollow' atau 'unfriend'
 * @returns {Element|null}
 */
function findMenuAction(actionType) {
  const menuItems = document.querySelectorAll('div[role="menuitem"]');
  if (!menuItems.length) return null;

  const targetKeywords = actionType === 'unfriend'
    ? ['unfriend', 'hapus pertemanan', 'batalkan pertemanan']
    : ['unfollow', 'batal mengikuti', 'berhenti mengikuti', 'berhenti ikuti'];

  for (const item of menuItems) {
    const text = (item.innerText || item.textContent || '').toLowerCase().trim();
    if (targetKeywords.some(kw => text.includes(kw))) {
      return item;
    }
  }
  return null;
}

/** 
 * Tangani dialog konfirmasi khusus untuk proses unfriend.
 */
async function handleUnfriendConfirmation() {
  const confirmDialog = document.querySelector('div[role="dialog"]');
  if (!confirmDialog) return;

  await randomDelay(1000, 2000);
  const confirmBtn = confirmDialog.querySelector('div[aria-label="Confirm"][role="button"], div[aria-label="Konfirmasi"][role="button"]');
  if (confirmBtn) {
    safeClick(confirmBtn);
    await randomDelay(800, 1500);
  } else {
    // Fallback ambil tombol paling akhir dalam form dialog
    const dialogBtns = confirmDialog.querySelectorAll('div[role="button"]');
    if (dialogBtns.length > 0) {
      safeClick(dialogBtns[dialogBtns.length - 1]);
      await randomDelay(800, 1500);
    }
  }
}

/**
 * Eksekusi satu tugas target.
 * @param {Object} target
 * @param {boolean} dryRun
 * @param {string} actionType
 */
async function processOneTarget(target, dryRun, actionType) {
  const { id, name } = target;

  const row = document.querySelector(`[data-nra-id="${id}"]`);
  if (!row || !row.isConnected) {
    return { status: STATUS.SKIPPED, name, error: 'DOM row scrolled out of viewport' };
  }

  if (dryRun) {
    logToUI(`[DRY RUN] Simulating ${actionType.toUpperCase()} for: ${name}`, 'warn');
    await randomDelay(...EXEC_CONFIG.clickDelayMs);
    return { status: STATUS.SUCCESS, name };
  }

  const moreBtn = row.querySelector('[data-nra-btn]');
  if (!safeClick(moreBtn)) {
    return { status: STATUS.SKIPPED, name, error: 'More button not found' };
  }

  await randomDelay(800, 1500);

  const actionItem = findMenuAction(actionType);
  if (!actionItem) {
    dismissMenu();
    return { status: STATUS.SKIPPED, name, error: 'Option unavailable (Already performed)' };
  }

  if (!safeClick(actionItem)) {
    dismissMenu();
    return { status: STATUS.SKIPPED, name, error: `${actionType.toUpperCase()} click failed` };
  }

  await randomDelay(800, 1500);
  if (actionType === 'unfriend') {
    await handleUnfriendConfirmation();
  }

  return { status: STATUS.SUCCESS, name };
}

// --- MAIN BATCH LOOP ---

/** 
 * Jalankan proses batch seluruh target dalam antrian.
 * Menjamin status anti-spam, dan penanganan retry di tingkat tunggal target.
 */
async function executeBatchLoop(queue, killSignal, dryRun, actionType) {
  const results = { success: 0, skipped: 0, failed: 0 };
  logToUI(`Starting execution for ${queue.length} targets... ${dryRun ? '[MODE DRY RUN]' : ''}`);

  for (let i = 0; i < queue.length; i++) {
    if (killSignal.killed) {
      logToUI('KILL SWITCH TRIGGERED. Execution halted.', 'warn');
      break;
    }

    const target = queue[i];
    logToUI(`[${i + 1}/${queue.length}] ${target.name}...`);
    
    let result = null;
    let attempts = 0;

    // Retry loop untuk stabilitas UI Facebook yang kadang tertunda rendernya
    while (attempts <= EXEC_CONFIG.maxRetries) {
      try {
        result = await processOneTarget(target, dryRun, actionType);

        if (result.status === STATUS.SUCCESS) break;

        // Skip langsung jika tombol aksi tak tersedia
        if (result.status === STATUS.SKIPPED && result.error.includes('Option')) {
          break; 
        }

        if (attempts < EXEC_CONFIG.maxRetries) {
          attempts++;
          logToUI(`Retry ${attempts}/${EXEC_CONFIG.maxRetries} for ${target.name}: ${result.error}`, 'warn');
          await randomDelay(...EXEC_CONFIG.retryDelayMs);
          continue;
        }
        break;
      } catch (err) {
        result = { status: STATUS.FAILED, name: target.name, error: err.message };
        logToUI(`FATAL ERROR pada ${target.name}: ${result.error}`, 'error');
        break; // Kesalahan tak terduga tak perlu di-retry
      }
    }

    // Report
    if (result.status === STATUS.SUCCESS) {
      results.success++;
      logToUI(`${target.name} - ${actionType.toUpperCase()}ED`, 'ok');
    } else {
      results[result.status]++;
      logToUI(`${target.name} - ${result.status.toUpperCase()}: ${result.error || ''}`, 'warn');
    }

    chrome.runtime.sendMessage({ action: 'PROGRESS', current: i + 1, total: queue.length, results }).catch(() => {});

    if (i < queue.length - 1 && !killSignal.killed) {
      await randomDelay(...EXEC_CONFIG.nextTargetMs);
    }
  }

  logToUI(`Completed. OK:${results.success} Skip:${results.skipped} Fail:${results.failed}`, 'info');
  chrome.runtime.sendMessage({ action: 'EXEC_DONE', results }).catch(() => {});
}

// --- MSG LISTENER ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.action) {
    case 'TOGGLE_SIDEBAR':
    case 'INJECT_UI':
      if (typeof toggleSidebar === 'function') toggleSidebar();
      sendResponse({ status: 'ok' });
      break;
    case 'EXECUTE':
      _killSignal.killed = false;
      executeBatchLoop(msg.queue || [], _killSignal, msg.dryRun, msg.actionType);
      sendResponse({ status: 'started' });
      break;
    case 'KILL':
      _killSignal.killed = true;
      logToUI('KILL SWITCH received.', 'error');
      sendResponse({ status: 'killed' });
      break;
  }
  return true;
});
