/* Progress and settings, kept in the browser's own storage.
 *
 * Storage can be refused — a private window, or a browser set to block site
 * data — sometimes by throwing and sometimes by quietly keeping nothing. So
 * the store is tested with a round trip before it is trusted, and falls back
 * to memory (progress lasts until the page closes) rather than breaking. */
window.Store = (function () {
  'use strict';

  const KEY = 'endless-quiz:v1';

  const DEFAULTS = {
    coins: 100,
    levels: {},              // Climb level number -> stars earned (1–3)
    climb: null,             // the climb in progress: { level, rung, shown, falls, fiftyUses, earned }
    daily: {},               // 'YYYY-MM-DD' -> { ids, marks: '1101', coins }
    quickBest: {},           // 'hard-10-all' -> best number right
    quickPrefs: { count: 10, difficulty: 'mixed', cats: null },   // cats null = all
    settings: { sound: true, vibrate: true, explain: true },
  };

  function probe() {
    try {
      const k = KEY + ':probe';
      localStorage.setItem(k, '1');
      const ok = localStorage.getItem(k) === '1';
      localStorage.removeItem(k);
      return ok;
    } catch (e) {
      return false;
    }
  }

  const persistent = probe();

  function fresh() { return JSON.parse(JSON.stringify(DEFAULTS)); }

  function load() {
    const data = fresh();
    if (!persistent) return data;
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved && typeof saved === 'object') {
        Object.assign(data, saved);
        data.settings = Object.assign(fresh().settings, saved.settings);
        data.quickPrefs = Object.assign(fresh().quickPrefs, saved.quickPrefs);
        // a climb saved before levels existed can't be resumed
        if (data.climb && !data.climb.level) data.climb = null;
      }
    } catch (e) { /* unreadable: start fresh rather than crash */ }
    return data;
  }

  function save(data) {
    if (!persistent) return;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* full or blocked */ }
  }

  function reset() {
    if (persistent) { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
    return fresh();
  }

  return { load, save, reset, persistent };
})();
