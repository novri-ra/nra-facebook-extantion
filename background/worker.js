// background/worker.js

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'nra_cooldown') {
    console.log('[NRA Worker] Cooldown selesai. Eksekusi bisa dilanjutkan.');
  }
});

// Listener untuk action icon click
chrome.action.onClicked.addListener((tab) => {
  if (tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("edge://") && tab.url.includes("facebook.com")) {
    chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_SIDEBAR' }, (response) => {
      if (chrome.runtime.lastError) {
        // Silent fail
      }
    });
  }
});