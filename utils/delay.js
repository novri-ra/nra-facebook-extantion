// utils/delay.js
// Anti-spam acak. Ponytail: One line is enough.

/**
 * Jeda asinkron dengan waktu acak
 * @param {number} min MS minimal
 * @param {number} max MS maksimal
 */
const randomDelay = (min = 2000, max = 5000) => {
  const ms = Math.floor(Math.random() * (max - min + 1) + min);
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Global context untuk content script, abaikan export error
if (typeof window !== 'undefined') window.randomDelay = randomDelay;
