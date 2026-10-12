/* Builds the Climb's levels into js/levels.js.
 *
 *   node tools/build-levels.js                 deal any levels that don't exist yet
 *   node tools/build-levels.js --rebuild-all   deal every level again from scratch
 *
 * THE TRACKS. The Climb has four tracks — Easy, Normal, Hard and Extra Hard —
 * each with its own run of levels, picked from tabs on the level screen.
 * A level is 20 rungs, easiest at the bottom. Each rung holds two question
 * references — the main question and a backup — so a player who falls back
 * to a safety net meets a fresh question on the way up.
 *
 * ADDING LEVELS. Raise `levels` on a track below and run this. Levels that
 * already exist are read back out of js/levels.js and kept exactly as they
 * are — only the new ones are dealt — so nobody's stars end up on a level
 * that has changed under them. --rebuild-all is for when you mean to
 * reshuffle everything (before launch, say).
 *
 * THE MIX. Each track says how many rungs of each difficulty a level gets,
 * at a few level numbers; levels in between blend, and levels past the
 * last anchor keep its mix. Anchors are level numbers, not fractions of the
 * track, so lengthening a track never changes the mix of levels already in it.
 *
 * VARIETY. Written and table questions are dealt least-recently-used first
 * across all four tracks, so a repeat is as far from its last appearance as
 * the bank allows; within a level, categories are spread and no fact is
 * asked twice (a capital asked both ways round is one fact). Generated maths
 * fills about one slot in eight; it never runs out. */
'use strict';

const fs = require('fs');
const path = require('path');
globalThis.window = globalThis;
require(path.join(__dirname, '../js/questions.js'));
require(path.join(__dirname, '../js/bank.js'));
const { statics, get, generate, generatorsFor, rng } = globalThis.Bank;

const RUNGS = 20;
const DIFFS = ['easy', 'normal', 'hard', 'xhard'];

// anchors: [level, easy, normal, hard, extra hard] — rungs of each, summing to 20
const TRACKS = [
  { key: 'easy', levels: 25, anchors: [[1, 18, 2, 0, 0], [25, 12, 7, 1, 0]] },
  { key: 'normal', levels: 25, anchors: [[1, 6, 12, 2, 0], [25, 2, 12, 5, 1]] },
  { key: 'hard', levels: 25, anchors: [[1, 0, 6, 12, 2], [25, 0, 2, 12, 6]] },
  { key: 'xhard', levels: 25, anchors: [[1, 0, 0, 8, 12], [25, 0, 0, 2, 18]] },
];

const OUT = path.join(__dirname, '../js/levels.js');
const rebuildAll = process.argv.includes('--rebuild-all');

// How many rungs of each difficulty level L of a track gets: interpolate
// between anchors, hold the last one beyond it, then round by largest
// remainder so the four always add up to exactly 20.
function mixFor(track, L) {
  const A = track.anchors;
  let raw;
  if (L >= A[A.length - 1][0]) raw = A[A.length - 1].slice(1);
  else {
    let i = 0;
    while (L > A[i + 1][0]) i++;
    const t = (L - A[i][0]) / (A[i + 1][0] - A[i][0]);
    raw = [1, 2, 3, 4].map((k) => A[i][k] + (A[i + 1][k] - A[i][k]) * t);
  }
  const counts = raw.map(Math.floor);
  const order = raw.map((v, k) => [v - Math.floor(v), k]).sort((x, y) => y[0] - x[0]);
  for (let n = RUNGS - counts.reduce((s, c) => s + c, 0), j = 0; n > 0; n--, j++) counts[order[j][1]]++;
  return counts;
}

/* ───────── what already exists ───────── */

let existing = {};
if (!rebuildAll && fs.existsSync(OUT)) {
  const box = {};
  new Function('window', fs.readFileSync(OUT, 'utf8'))(box);
  // The old single-list format can't be kept: it had no tracks.
  if (box.LEVELS && !Array.isArray(box.LEVELS)) existing = box.LEVELS;
}
// a kept level must still make sense against today's bank
Object.entries(existing).forEach(([key, list]) => list.forEach((lv, i) => lv.forEach((pair, r) => pair.forEach((ref) => {
  if (!get(ref)) throw new Error(key + ' level ' + (i + 1) + ' rung ' + (r + 1) + ': ' + ref + ' is no longer in the bank. Put it back, or --rebuild-all.');
}))));

/* ───────── dealing ───────── */

// Keyed by fact, not id: a capital asked one way round counts as used for
// the other way round too. "Time" is a counter that ticks once per level,
// with the tracks interleaved (Easy 1, Normal 1, Hard 1, Extra Hard 1,
// Easy 2, …) since people play them side by side.
const lastUsed = new Map();   // fact -> time it last appeared
const uses = new Map();       // fact -> times used
const pool = {};
DIFFS.forEach((d) => { pool[d] = statics.filter((q) => q.difficulty === d); });

function note(ref, time) {
  if (ref.startsWith('g:')) return;
  const fact = get(ref).fact;
  lastUsed.set(fact, time);
  uses.set(fact, (uses.get(fact) || 0) + 1);
}

function takeStatic(diff, time, inLevel, texts, catCount, rand) {
  const candidates = pool[diff].filter((q) => !inLevel.has(q.fact));
  const age = (q) => lastUsed.get(q.fact) || 0;
  const oldest = Math.min(...candidates.map(age));
  const stale = candidates.filter((q) => age(q) === oldest);
  const leastCat = Math.min(...stale.map((q) => catCount[q.category] || 0));
  const best = stale.filter((q) => (catCount[q.category] || 0) === leastCat);
  const q = best[Math.floor(rand() * best.length)];
  inLevel.add(q.fact);
  texts.add(q.q);
  note(q.id, time);
  catCount[q.category] = (catCount[q.category] || 0) + 1;
  return q.id;
}

function takeGenerated(diff, seedBase, slot, inLevel, texts, rand) {
  const kinds = generatorsFor(diff);
  for (let tries = 0; tries < 50; tries++) {
    const kind = kinds[Math.floor(rand() * kinds.length)];
    const q = generate(kind, seedBase + slot * 10 + tries);
    if (texts.has(q.q)) continue;
    texts.add(q.q);
    inLevel.add(q.id);
    return q.id;
  }
  throw new Error('could not generate a fresh ' + diff + ' question');
}

function dealLevel(track, t, L, time) {
  const rand = rng((t + 1) * 1000003 + L * 7919);
  const counts = mixFor(track, L);
  const diffs = [];
  counts.forEach((n, k) => { for (let i = 0; i < n; i++) diffs.push(DIFFS[k]); });
  // About one slot in eight is generated maths. Main and backup are chosen
  // separately, so a rung can pair a written question with a generated one.
  const generatedSlots = new Set();
  for (let slot = 0; slot < RUNGS * 2; slot++) if (rand() < 0.2) generatedSlots.add(slot);
  const inLevel = new Set();
  const texts = new Set();
  const catCount = { maths: 0 };
  const seedBase = (t + 1) * 10000000 + L * 1000;
  return diffs.map((diff, r) => [0, 1].map((b) => {
    const slot = r * 2 + b;
    if (generatedSlots.has(slot) && catCount.maths < 6) {
      catCount.maths++;
      return takeGenerated(diff, seedBase, slot, inLevel, texts, rand);
    }
    return takeStatic(diff, time, inLevel, texts, catCount, rand);
  }));
}

const levels = {};
TRACKS.forEach((tr) => { levels[tr.key] = []; });
const kept = {};
const longest = Math.max(...TRACKS.map((tr) => tr.levels));
let time = 0;
for (let L = 1; L <= longest; L++) {
  TRACKS.forEach((tr, t) => {
    if (L > tr.levels) return;
    time++;
    const old = (existing[tr.key] || [])[L - 1];
    if (old) {
      old.forEach((pair) => pair.forEach((ref) => note(ref, time)));
      levels[tr.key].push(old);
      kept[tr.key] = (kept[tr.key] || 0) + 1;
    } else {
      levels[tr.key].push(dealLevel(tr, t, L, time));
    }
  });
}

/* ───────── report ───────── */

const NAMES = { easy: 'Easy', normal: 'Normal', hard: 'Hard', xhard: 'Extra Hard' };
console.log('Track        levels  kept  new   mix at level 1 → last (easy/normal/hard/xhard)');
TRACKS.forEach((tr) => {
  const k = kept[tr.key] || 0;
  console.log('  ' + NAMES[tr.key].padEnd(11), String(tr.levels).padStart(5), String(k).padStart(5), String(tr.levels - k).padStart(4),
    '  ' + mixFor(tr, 1).join('/') + ' → ' + mixFor(tr, tr.levels).join('/'));
});
let refs = 0, generated = 0;
Object.values(levels).forEach((list) => list.forEach((lv) => lv.forEach((pair) => pair.forEach((ref) => { refs++; if (ref.startsWith('g:')) generated++; }))));
console.log('Question slots (main + backup):', refs, '· generated maths', generated, '(' + Math.round(generated / refs * 100) + '%)');
console.log('Distinct written/table facts used:', uses.size, '· average uses', ([...uses.values()].reduce((a, b) => a + b, 0) / uses.size).toFixed(2));
// how soon a fact comes round again within the same track
TRACKS.forEach((tr) => {
  const seen = new Map(); const gaps = [];
  levels[tr.key].forEach((lv, i) => lv.forEach((pair) => pair.forEach((ref) => {
    if (ref.startsWith('g:')) return;
    const f = get(ref).fact;
    if (seen.has(f)) gaps.push(i - seen.get(f));
    seen.set(f, i);
  })));
  gaps.sort((a, b) => a - b);
  console.log('  ' + NAMES[tr.key].padEnd(11), gaps.length
    ? 'a fact comes back after at least ' + gaps[0] + ' levels of this track, typically ' + gaps[Math.floor(gaps.length / 2)]
    : 'no fact repeats within this track');
});

/* ───────── write ───────── */

const body = TRACKS.map((tr) => '  ' + tr.key + ': [\n' + levels[tr.key].map((lv, i) =>
  '    [ // ' + NAMES[tr.key] + ' ' + (i + 1) + '\n' +
  lv.map((pair) => '      [' + pair.map((r) => JSON.stringify(r)).join(', ') + ']').join(',\n') + '\n    ]').join(',\n') + '\n  ]').join(',\n');
const out = '/* GENERATED by tools/build-levels.js — do not edit by hand.\n' +
  ' * The Climb: four tracks of levels, 20 rungs each, easiest first, each rung\n' +
  ' * a [main, backup] pair of question references (see js/bank.js). */\n' +
  'window.LEVELS = {\n' + body + '\n};\n';
fs.writeFileSync(OUT, out);
console.log('Wrote js/levels.js (' + Math.round(out.length / 1024) + ' KB)');
