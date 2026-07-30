// utils/state.js
// Ponytail: Keep it simple. Storage lokal.

const storageGet = async (key) => {
  return new Promise(resolve => {
    chrome.storage.local.get([key], (res) => resolve(res[key]));
  });
};

const storageSet = async (key, value) => {
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
};

if (typeof window !== 'undefined') {
  window.storageGet = storageGet;
  window.storageSet = storageSet;
}