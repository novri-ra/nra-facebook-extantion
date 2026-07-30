// popup/popup.js
// Logic UI sidebar retro terminal (DreamLab Redesign)

const elBtnScan = document.getElementById('btn-scan');
const elBtnExec = document.getElementById('btn-execute');
const elBtnKill = document.getElementById('btn-kill');
const elChkAll = document.getElementById('chk-all');
const elChkDryRun = document.getElementById('chk-dry-run');
const elActionType = document.getElementById('action_type');
const elList = document.getElementById('friend-list');
const elLog = document.getElementById('status-log');
const elBtnClose = document.getElementById('btn-close');

// Analytics DOM
const elStatTotal = document.getElementById('stat-total');
const elStatProc = document.getElementById('stat-processed');
const elStatSucc = document.getElementById('stat-success');
const elStatEta = document.getElementById('stat-eta');

let friendsData = [];
let startTime = 0;

// ---- HELPERS ----
function log(msg, type = 'info') {
  const text = elLog.innerHTML;
  const lines = text.split('\n').filter(Boolean);
  
  let formattedMsg = msg;
  // Apply span class based on message content or type for DreamLab colored logs
  if (msg.includes('[ERR!]') || msg.includes('FATAL ERROR')) {
    formattedMsg = `<span class="log-error">${msg}</span>`;
  } else if (msg.includes('[WARN]') || msg.includes('[SKIP]') || msg.includes('Retry')) {
    formattedMsg = `<span class="log-skip">${msg}</span>`;
  } else if (msg.includes('[DRY RUN]')) {
    formattedMsg = `<span style="color: var(--accent-yellow);">${msg}</span>`;
  } else if (msg.includes('[OK]')) {
    formattedMsg = `<span style="color: var(--fg-color); font-weight: bold;">${msg}</span>`;
  } else {
    // Teks biasa dibiarkan var(--fg-highlight) (abu-abu terang)
  }

  // Tambah log BARU DI BAWAH (Append bottom)
  lines.push(formattedMsg);
  elLog.innerHTML = lines.join('\n');
  
  // Auto-scroll terminal ke bawah
  elLog.scrollTop = elLog.scrollHeight;
}

async function sendToActiveTab(msg) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || tab.url.startsWith("chrome://") || !tab.url.includes('facebook.com')) {
    log('> [ERR!] Open fb.com/friends first');
    return null;
  }
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tab.id, msg, (res) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(res);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

// ---- RENDER LIST ----
function renderList(friends) {
  friendsData = friends;
  elList.innerHTML = '';

  if (friends.length === 0) {
    elList.innerHTML = '<div style="text-align:center;color:var(--fg-dim);padding-top:20px">&gt; No target data.</div>';
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
    elList.appendChild(row);
  });

  updateCounter();
}

function updateCounter() {
  const total = friendsData.length;
  const selected = document.querySelectorAll('.nra-chk-target:checked').length;
  elStatTotal.innerText = selected;
  elChkAll.checked = selected === total && total > 0;
}

// ---- POSTMESSAGE LISTENER (IFRAME) ----
window.addEventListener('message', (event) => {
  if (!event.origin.includes('facebook.com') || !event.data) return;

  if (event.data.action === 'SCAN_PROGRESS') {
    const targetInfo = event.data.targetTotal > 0 ? ` of ${event.data.targetTotal}` : '';
    const progressMsg = `<span style="color: var(--accent-blue);">> Auto-scrolling... Found ${event.data.count}${targetInfo} targets.</span>`;
    
    // Update TOTAL TARGET stat in real-time
    elStatTotal.innerText = event.data.count;

    const currentLog = elLog.innerHTML;
    if (currentLog.includes('> Auto-scrolling...')) {
      elLog.innerHTML = currentLog.replace(/<span[^>]*>> Auto-scrolling\.\.\. Found \d+(?: of \d+)? targets\.<\/span>/, progressMsg);
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
    elBtnScan.disabled = false;
    elBtnScan.innerText = 'SCAN';
  }
});

// ---- EVENT LISTENERS ----
elBtnClose.addEventListener('click', () => {
  sendToActiveTab({ action: 'TOGGLE_SIDEBAR' });
});

elBtnScan.addEventListener('click', () => {
  log('> Init Auto-Scroll & DOM Extraction...');
  elBtnScan.disabled = true;
  elBtnScan.innerText = 'SCANNING...';
  window.parent.postMessage({ action: 'REQUEST_SCAN' }, '*');
});

elChkAll.addEventListener('change', (e) => {
  document.querySelectorAll('.nra-chk-target').forEach(chk => {
    chk.checked = e.target.checked;
  });
  updateCounter();
});

elBtnExec.addEventListener('click', async () => {
  const checked = document.querySelectorAll('.nra-chk-target:checked');
  if (checked.length === 0) {
    log('> [WARN] No target selected');
    return;
  }

  const queue = Array.from(checked).map(chk => {
    return friendsData.find(x => x.id === chk.id);
  }).filter(Boolean);

  const dryRun = elChkDryRun.checked;
  const actionType = elActionType.value;
  log(`> Sending ${queue.length} targets [${actionType.toUpperCase()}] ${dryRun ? '(DRY RUN)' : ''}`);

  elBtnScan.disabled = true;
  elBtnExec.disabled = true;
  elChkDryRun.disabled = true;
  elActionType.disabled = true;
  elBtnExec.innerText = 'RUNNING...';

  elStatProc.innerText = '0';
  elStatSucc.innerText = '0%';
  elStatEta.innerText = 'Calc...';
  startTime = Date.now();

  await sendToActiveTab({ action: 'EXECUTE', queue, dryRun, actionType });
});

elBtnKill.addEventListener('click', async () => {
  log('> SENDING KILL SIGNAL...');
  await sendToActiveTab({ action: 'KILL' });

  elBtnScan.disabled = false;
  elBtnExec.disabled = false;
  elChkDryRun.disabled = false;
  elActionType.disabled = false;
  elBtnExec.innerText = 'EXECUTE';
});

// Listener untuk UI log dari executor
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'LOG') {
    log(msg.text);
  }

  if (msg.action === 'PROGRESS') {
    const proc = msg.current;
    const total = msg.total;
    const succ = msg.results.success;

    elStatProc.innerText = proc;

    const rate = proc > 0 ? Math.round((succ / proc) * 100) : 0;
    elStatSucc.innerText = `${rate}%`;

    if (proc > 0) {
      const elapsed = Date.now() - startTime;
      const avgTime = elapsed / proc;
      const left = total - proc;
      const etaMs = left * avgTime;
      const etaSec = Math.round(etaMs / 1000);
      const m = Math.floor(etaSec / 60);
      const s = etaSec % 60;
      elStatEta.innerText = `${m}m ${s}s`;
    }
  }

  if (msg.action === 'EXEC_DONE') {
    log(`> DONE. OK:${msg.results.success} FAIL:${msg.results.failed}`);
    elStatEta.innerText = '0m 0s';
    elBtnScan.disabled = false;
    elBtnExec.disabled = false;
    elChkDryRun.disabled = false;
    elActionType.disabled = false;
    elBtnExec.innerText = 'EXECUTE';
  }
});
