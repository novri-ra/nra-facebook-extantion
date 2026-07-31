/**
 * popup/popup.js
 * Antarmuka kontrol (UI) sidebar panel retro terminal.
 */

// --- DOM REFS ---
const el = {
  btnScan:   document.getElementById('btn-scan'),
  btnExec:   document.getElementById('btn-execute'),
  btnKill:   document.getElementById('btn-kill'),
  btnClose:  document.getElementById('btn-close'),
  chkAll:    document.getElementById('chk-all'),
  chkDryRun: document.getElementById('chk-dry-run'),
  actionType: document.getElementById('action_type'),
  list:      document.getElementById('friend-list'),
  log:       document.getElementById('status-log'),
  statTotal: document.getElementById('stat-total'),
  statProc:  document.getElementById('stat-processed'),
  statSucc:  document.getElementById('stat-success'),
  statEta:   document.getElementById('stat-eta'),
};

let friendsData = [];
let startTime = 0;

// --- HELPERS ---

/**
 * Tulis pesan ke konsol terminal UI dengan pewarnaan otomatis.
 * @param {string} msg - Pesan.
 */
function log(msg) {
  const lines = el.log.innerHTML.split('\n').filter(Boolean);
  let formatted = msg;

  if (msg.includes('[ERR!]') || msg.includes('FATAL ERROR')) {
    formatted = `<span class="log-error">${msg}</span>`;
  } else if (msg.includes('[WARN]') || msg.includes('[SKIP]') || msg.includes('Retry')) {
    formatted = `<span class="log-skip">${msg}</span>`;
  } else if (msg.includes('[DRY RUN]')) {
    formatted = `<span style="color: var(--accent-yellow);">${msg}</span>`;
  } else if (msg.includes('[OK]')) {
    formatted = `<span style="color: var(--fg-color); font-weight: bold;">${msg}</span>`;
  }

  lines.push(formatted);
  el.log.innerHTML = lines.join('\n');
  el.log.scrollTop = el.log.scrollHeight;
}

/**
 * Kirim pesan ke tab aktif Facebook.
 * @param {Object} msg - Objek pesan.
 * @returns {Promise<*>}
 */
async function sendToActiveTab(msg) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('facebook.com') || tab.url.startsWith('chrome://')) {
    log('> [ERR!] Open fb.com/friends first');
    return null;
  }
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, msg, (res) => {
      resolve(chrome.runtime.lastError ? null : res);
    });
  });
}

/** Atur status aktif/nonaktif seluruh tombol kontrol. */
function setControlsEnabled(enabled) {
  el.btnScan.disabled = !enabled;
  el.btnExec.disabled = !enabled;
  el.chkDryRun.disabled = !enabled;
  el.actionType.disabled = !enabled;
  el.btnExec.innerText = enabled ? 'EXECUTE' : 'RUNNING...';
}

/** Update angka statistik "Total Target" berdasar jumlah checkbox terseleksi. */
function updateCounter() {
  const total = friendsData.length;
  const selected = document.querySelectorAll('.nra-chk-target:checked').length;
  el.statTotal.innerText = selected;
  el.chkAll.checked = selected === total && total > 0;
}

// --- RENDER ---

/**
 * Render daftar target ke panel sidebar.
 * @param {Array} friends - Daftar target.
 */
function renderList(friends) {
  friendsData = friends;
  el.list.innerHTML = '';

  if (friends.length === 0) {
    el.list.innerHTML = '<div style="text-align:center;color:var(--fg-dim);padding-top:20px">&gt; No target data.</div>';
    updateCounter();
    return;
  }

  friends.forEach(f => {
    const row = document.createElement('div');
    row.className = 'nra-item';

    const lbl = document.createElement('label');
    lbl.className = 'nra-chk-wrapper';

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.id = f.id;
    chk.className = 'nra-chk-target';
    chk.checked = true;
    chk.addEventListener('change', updateCounter);

    const span = document.createElement('span');
    span.innerText = f.name;
    span.title = f.name;

    lbl.appendChild(chk);
    lbl.appendChild(span);
    row.appendChild(lbl);
    el.list.appendChild(row);
  });

  updateCounter();
}

// --- POSTMESSAGE LISTENER (menerima dari host FB via iframe) ---

window.addEventListener('message', (event) => {
  if (!event.origin.includes('facebook.com') || !event.data) return;

  if (event.data.action === 'SCAN_PROGRESS') {
    const targetInfo = event.data.targetTotal > 0 ? ` of ${event.data.targetTotal}` : '';
    const progressMsg = `<span style="color: var(--accent-blue);">> Auto-scrolling... Found ${event.data.count}${targetInfo} targets.</span>`;
    el.statTotal.innerText = event.data.count;

    const currentLog = el.log.innerHTML;
    if (currentLog.includes('> Auto-scrolling...')) {
      el.log.innerHTML = currentLog.replace(/<span[^>]*>> Auto-scrolling\.\.\. Found \d+(?: of \d+)? targets\.<\/span>/, progressMsg);
    } else {
      log(progressMsg);
    }
  }

  if (event.data.action === 'SCAN_COMPLETE' || event.data.action === 'SCAN_RESULT') {
    const friends = event.data.friends || [];
    if (friends.length > 0) {
      log(`> Completed. Extracted: ${friends.length} targets.`);
      renderList(friends);
    } else {
      log('> [WARN] Target list not found.');
    }
    el.btnScan.disabled = false;
    el.btnScan.innerText = 'SCAN';
  }
});

// --- EVENT LISTENERS ---

el.btnClose.addEventListener('click', () => sendToActiveTab({ action: 'TOGGLE_SIDEBAR' }));

el.btnScan.addEventListener('click', () => {
  log('> Init Auto-Scroll & DOM Extraction...');
  el.btnScan.disabled = true;
  el.btnScan.innerText = 'SCANNING...';
  window.parent.postMessage({ action: 'REQUEST_SCAN' }, '*');
});

el.chkAll.addEventListener('change', (e) => {
  document.querySelectorAll('.nra-chk-target').forEach(chk => { chk.checked = e.target.checked; });
  updateCounter();
});

el.btnExec.addEventListener('click', async () => {
  const checked = document.querySelectorAll('.nra-chk-target:checked');
  if (checked.length === 0) { log('> [WARN] No target selected'); return; }

  const queue = Array.from(checked).map(chk => friendsData.find(x => x.id === chk.id)).filter(Boolean);
  const dryRun = el.chkDryRun.checked;
  const actionType = el.actionType.value;
  log(`> Sending ${queue.length} targets [${actionType.toUpperCase()}] ${dryRun ? '(DRY RUN)' : ''}`);

  setControlsEnabled(false);
  el.statProc.innerText = '0';
  el.statSucc.innerText = '0%';
  el.statEta.innerText = 'Calc...';
  startTime = Date.now();
  await sendToActiveTab({ action: 'EXECUTE', queue, dryRun, actionType });
});

el.btnKill.addEventListener('click', async () => {
  log('> SENDING KILL SIGNAL...');
  await sendToActiveTab({ action: 'KILL' });
  setControlsEnabled(true);
});

// --- CHROME RUNTIME LISTENER ---

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'LOG') {
    log(msg.text);
  }

  if (msg.action === 'PROGRESS') {
    el.statProc.innerText = msg.current;
    const rate = msg.current > 0 ? Math.round((msg.results.success / msg.current) * 100) : 0;
    el.statSucc.innerText = `${rate}%`;

    if (msg.current > 0) {
      const elapsed = Date.now() - startTime;
      const left = msg.total - msg.current;
      const etaSec = Math.round((left * elapsed / msg.current) / 1000);
      el.statEta.innerText = `${Math.floor(etaSec / 60)}m ${etaSec % 60}s`;
    }
  }

  if (msg.action === 'EXEC_DONE') {
    log(`> DONE. OK:${msg.results.success} FAIL:${msg.results.failed}`);
    el.statEta.innerText = '0m 0s';
    setControlsEnabled(true);
  }
});
