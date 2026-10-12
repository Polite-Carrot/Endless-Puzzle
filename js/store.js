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
    levels: {},              // Climb 'track-level' (e.g. 'normal-4') -> stars earned (1–3)
    track: 'easy',           // the Climb tab last looked at
    climb: null,             // the climb in progress: { track, level, rung, shown, falls, fiftyUses, earned }
    daily: {},               // 'YYYY-MM-DD' -> { ids, marks: '1101', coins }
    quickBest: {},           // 'hard-10-all' -> best number right
    quickPrefs: { count: 10, difficulty: 'mixed', cats: null },   // cats null = all
    settings: { sound: true, vibrate: true, explain: true, reminder: false, reminderHour: 18 },
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
        // A climb or stars saved before the Climb had tracks belong to levels
        // that no longer exist, so they can't be carried over.
        if (data.climb && !data.climb.track) data.climb = null;
        Object.keys(data.levels).forEach((k) => { if (!k.includes('-')) delete data.levels[k]; });
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
