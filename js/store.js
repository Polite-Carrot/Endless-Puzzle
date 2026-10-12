/* Progress and settings.
 *
 * TWO COPIES IN THE APP. The working copy lives in the web view's
 * localStorage, because the game reads it synchronously at start-up. But iOS
 * treats web storage inside an app as a cache it may clear when the phone is
 * short of space — which would wipe someone's stars and streak. So in the
 * native app every save is also written to Capacitor's Preferences (the
 * phone's own UserDefaults / SharedPreferences), which the system doesn't
 * clear. On start-up restore() compares the two by their save time and, if
 * the phone's copy is newer or the web copy has gone, puts it back.
 *
 * IN A BROWSER there is only localStorage. It can be refused — a private
 * window, or a browser set to block site data — sometimes by throwing and
 * sometimes by quietly keeping nothing. So it's tested with a round trip
 * before it's trusted, and the game falls back to memory (progress lasts
 * until the page closes) rather than breaking. */
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
    recent: [],              // last questions answered, newest first: [{ id, mode, at }]
    savedAt: 0,              // when this copy was written, to tell two copies apart
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

  const local = probe();
  const prefs = () => (window.Native && window.Native.prefs) || null;
  const persistent = local || !!prefs();

  function fresh() { return JSON.parse(JSON.stringify(DEFAULTS)); }

  // Where the phone's copy goes if the web view refuses localStorage outright.
  let memory = null;

  function read() {
    if (!local) return memory;
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function load() {
    const data = fresh();
    try {
      const saved = JSON.parse(read() || 'null');
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
    data.savedAt = Date.now();
    const text = JSON.stringify(data);
    if (local) { try { localStorage.setItem(KEY, text); } catch (e) { /* full or blocked */ } }
    const P = prefs();
    if (P) P.set({ key: KEY, value: text }).catch(() => {});
  }

  // In the app: bring back the phone's copy if it's newer than the web copy
  // (or the web copy was cleared), and make sure the phone has a copy at all.
  // Resolves true if it changed what load() will now return.
  async function restore() {
    const P = prefs();
    if (!P) return false;
    let phone = null;
    try { phone = (await P.get({ key: KEY })).value; } catch (e) { return false; }
    const web = read();
    const at = (text) => { try { return JSON.parse(text).savedAt || 0; } catch (e) { return -1; } };
    if (phone && (!web || at(phone) > at(web))) {
      if (local) { try { localStorage.setItem(KEY, phone); } catch (e) { /* ignore */ } }
      else memory = phone;
      return true;
    }
    if (web && (!phone || at(web) > at(phone))) P.set({ key: KEY, value: web }).catch(() => {});
    return false;
  }

  function reset() {
    if (local) { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
    const P = prefs();
    if (P) P.remove({ key: KEY }).catch(() => {});
    return fresh();
  }

  return { load, save, reset, restore, persistent };
})();
