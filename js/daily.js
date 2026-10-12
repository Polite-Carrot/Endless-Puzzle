/* The Daily Quiz: five questions a day, the same for everybody.
 *
 * Nothing is fetched. The date is the seed — 12 Oct 2026 is 20261012 — so
 * two people opening the same day run the same deal and get the same
 * questions in the same order, with the answers in the same places. That is
 * what makes a shared result comparable. Uses the player's local date, so a
 * new quiz arrives at their own midnight. */
window.Daily = (function () {
  'use strict';

  // One per slot, easiest first: a gentle start and a hard finish.
  const SLOTS = ['easy', 'easy', 'normal', 'hard', 'xhard'];

  function pad(n) { return String(n).padStart(2, '0'); }

  function keyFor(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function today() { return keyFor(new Date()); }

  function dateOf(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(key, n) {
    const d = dateOf(key);
    d.setDate(d.getDate() + n);
    return keyFor(d);
  }

  // mulberry32: small, fast, and the same everywhere
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled(list, rand) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Today's question ids, one per slot. Picked from the bank sorted by id,
  // so the order questions sit in the files doesn't matter.
  function idsFor(key, bank) {
    const rand = rng(Number(key.replace(/-/g, '')));
    const used = new Set();
    return SLOTS.map((diff) => {
      const pool = bank
        .filter((q) => q.difficulty === diff && !used.has(q.fact || q.id))
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      const item = pool[Math.floor(rand() * pool.length)];
      used.add(item.fact || item.id);
      return item.id;
    });
  }

  // [{ item, order }] — order is the answers in the places they are shown,
  // seeded by the day and the question so everyone sees the same layout.
  // Pass the ids saved when the day was started: if the bank has grown since,
  // the quiz someone is half-way through stays the same quiz.
  function questionsFor(key, bank, get, ids) {
    return (ids || idsFor(key, bank)).map((id) => {
      const item = get(id);
      let h = 0;
      for (const ch of key + id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
      return { item, order: shuffled(item.answers, rng(h)) };
    });
  }

  function isDone(rec) { return !!rec && rec.marks.length >= SLOTS.length; }

  // Days in a row, counting back from today. Today not being played yet
  // does not break it — the streak is still alive until midnight.
  function streak(records) {
    let day = today();
    if (!isDone(records[day])) day = addDays(day, -1);
    let n = 0;
    while (isDone(records[day])) { n++; day = addDays(day, -1); }
    return n;
  }

  // The last seven days, oldest first, ending today.
  function week(records) {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const key = addDays(today(), -i);
      out.push({ key, date: dateOf(key), rec: records[key] || null });
    }
    return out;
  }

  function untilTomorrow() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const mins = Math.max(1, Math.ceil((next - now) / 60000));
    const h = Math.floor(mins / 60);
    return h ? h + 'h ' + (mins % 60) + 'm' : mins + 'm';
  }

  return { LENGTH: SLOTS.length, today, dateOf, idsFor, questionsFor, isDone, streak, week, untilTomorrow };
})();
