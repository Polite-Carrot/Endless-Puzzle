/* Builds the 100 Climb levels into js/levels.js.
 *
 *   node tools/build-levels.js
 *
 * A level is 20 rungs, easiest at the bottom. Each rung holds two question
 * references — the main question and a backup — so a player who falls back
 * to a safety net meets a fresh question on the way up rather than one they
 * have just seen answered.
 *
 * WHY BAKE THEM. Levels are written out in full, as references, rather than
 * worked out when the game loads. The bank will keep growing, and if levels
 * were dealt live, adding one question would reshuffle every level after it
 * — including ones people have stars on. Baked, a level stays the level it
 * was. Rebuild only when you mean to change the levels.
 *
 * THE MIX. Difficulty shifts across the 100 levels by interpolating between
 * a few anchor levels (below), so level 1 is mostly easy with a little normal
 * and one hard rung at the top, and level 100 is mostly hard and extra hard.
 *
 * VARIETY. Written and table questions are dealt least-recently-used first,
 * so a repeat is as far from its last appearance as the bank allows, and
 * within a level categories are spread so it never reads as "all capitals".
 * Generated maths fills about a fifth of the rungs; it never runs out. */
'use strict';

const fs = require('fs');
const path = require('path');
globalThis.window = globalThis;
require(path.join(__dirname, '../js/questions.js'));
require(path.join(__dirname, '../js/bank.js'));
const { statics, generate, generatorsFor, rng } = globalThis.Bank;

const LEVELS = 100;
const RUNGS = 20;
const DIFFS = ['easy', 'normal', 'hard', 'xhard'];

// [level, easy, normal, hard, extra hard] — rungs of each, summing to 20
const ANCHORS = [
  [1, 14, 5, 1, 0],
  [25, 6, 9, 4, 1],
  [50, 2, 7, 8, 3],
  [75, 0, 4, 10, 6],
  [100, 0, 1, 9, 10],
];

// How many rungs of each difficulty level L gets: interpolate, then round
// by largest remainder so the four always add up to exactly 20.
function mixFor(L) {
  let i = 0;
  while (i < ANCHORS.length - 2 && L > ANCHORS[i + 1][0]) i++;
  const [a, b] = [ANCHORS[i], ANCHORS[i + 1]];
  const t = (L - a[0]) / (b[0] - a[0]);
  const raw = [1, 2, 3, 4].map((k) => a[k] + (b[k] - a[k]) * t);
  const counts = raw.map(Math.floor);
  const order = raw.map((v, k) => [v - Math.floor(v), k]).sort((x, y) => y[0] - x[0]);
  for (let n = RUNGS - counts.reduce((s, c) => s + c, 0), j = 0; n > 0; n--, j++) counts[order[j][1]]++;
  return counts;
}

const lastUsed = new Map();   // id -> level it last appeared in
const uses = new Map();       // id -> times used
const pool = {};
DIFFS.forEach((d) => { pool[d] = statics.filter((q) => q.difficulty === d); });

function takeStatic(diff, L, inLevel, catCount, rand) {
  const candidates = pool[diff].filter((q) => !inLevel.has(q.id));
  // least recently used first; then the category this level has least of;
  // then a seeded coin toss so ties don't always fall the same way
  candidates.sort((x, y) =>
    (lastUsed.get(x.id) || 0) - (lastUsed.get(y.id) || 0) ||
    (catCount[x.category] || 0) - (catCount[y.category] || 0) ||
    0);
  const oldest = lastUsed.get(candidates[0].id) || 0;
  const leastCat = Math.min(...candidates.filter((q) => (lastUsed.get(q.id) || 0) === oldest).map((q) => catCount[q.category] || 0));
  const best = candidates.filter((q) => (lastUsed.get(q.id) || 0) === oldest && (catCount[q.category] || 0) === leastCat);
  const q = best[Math.floor(rand() * best.length)];
  inLevel.add(q.id);
  lastUsed.set(q.id, L);
  uses.set(q.id, (uses.get(q.id) || 0) + 1);
  catCount[q.category] = (catCount[q.category] || 0) + 1;
  return q.id;
}

function takeGenerated(diff, L, slot, inLevel, texts, rand) {
  const kinds = generatorsFor(diff);
  for (let tries = 0; tries < 50; tries++) {
    const kind = kinds[Math.floor(rand() * kinds.length)];
    const seed = L * 10000 + slot * 10 + tries;
    const q = generate(kind, seed);
    if (texts.has(q.q)) continue;
    texts.add(q.q);
    inLevel.add(q.id);
    return q.id;
  }
  throw new Error('could not generate a fresh ' + diff + ' question for level ' + L);
}

const levels = [];
const mixes = [];
for (let L = 1; L <= LEVELS; L++) {
  const rand = rng(L * 7919);
  const counts = mixFor(L);
  mixes.push(counts);
  const diffs = [];
  counts.forEach((n, k) => { for (let i = 0; i < n; i++) diffs.push(DIFFS[k]); });

  // About one rung in five is generated maths, spread through the level.
  // Main and backup are chosen separately, so a rung can pair a written
  // question with a generated one.
  const generatedSlots = new Set();
  for (let slot = 0; slot < RUNGS * 2; slot++) if (rand() < 0.2) generatedSlots.add(slot);

  const inLevel = new Set();
  const texts = new Set();
  const catCount = { maths: 0 };
  const rungs = diffs.map((diff, r) => [0, 1].map((b) => {
    const slot = r * 2 + b;
    if (generatedSlots.has(slot) && catCount.maths < 6) {
      catCount.maths++;
      return takeGenerated(diff, L, slot, inLevel, texts, rand);
    }
    return takeStatic(diff, L, inLevel, catCount, rand);
  }));
  levels.push(rungs);
}

/* ───────── report ───────── */

const used = [...uses.values()];
const statUses = {};
DIFFS.forEach((d) => {
  const ids = pool[d].map((q) => q.id);
  const u = ids.map((id) => uses.get(id) || 0);
  statUses[d] = { bank: ids.length, used: u.filter(Boolean).length, mostUses: Math.max(...u) };
});
let refs = 0, generated = 0;
levels.forEach((lv) => lv.forEach((pair) => pair.forEach((ref) => { refs++; if (ref.startsWith('g:')) generated++; })));

console.log('Levels:', LEVELS, '· rungs', LEVELS * RUNGS, '· question slots (main + backup)', refs);
console.log('Generated maths:', generated, '(' + Math.round(generated / refs * 100) + '%)');
console.log('Mix at levels 1, 10, 25, 50, 75, 100 (easy/normal/hard/xhard):');
[1, 10, 25, 50, 75, 100].forEach((L) => console.log('  ' + String(L).padStart(3), mixes[L - 1].join(' / ')));
console.log('Written/table questions, per difficulty:');
Object.entries(statUses).forEach(([d, s]) => console.log('  ' + d.padEnd(7), 'bank', String(s.bank).padStart(3), '· used', String(s.used).padStart(3), '· most uses of one question', s.mostUses));
// how close together a written question comes round again
const seenAt = new Map();
let minGap = Infinity, gaps = [];
levels.forEach((lv, i) => lv.forEach((pair) => pair.forEach((ref) => {
  if (ref.startsWith('g:')) return;
  if (seenAt.has(ref)) { const g = i + 1 - seenAt.get(ref); gaps.push(g); minGap = Math.min(minGap, g); }
  seenAt.set(ref, i + 1);
})));
gaps.sort((a, b) => a - b);
console.log('A written question comes back after: at least', minGap, 'levels · typically', gaps[Math.floor(gaps.length / 2)]);
console.log('Total distinct written/table questions used:', uses.size, '· average uses', (used.reduce((a, b) => a + b, 0) / used.length).toFixed(2));

/* ───────── write ───────── */

const lines = levels.map((lv, i) =>
  '  [ // ' + (i + 1) + ' · ' + mixes[i].join('/') + '\n' +
  lv.map((pair) => '    [' + pair.map((r) => JSON.stringify(r)).join(', ') + ']').join(',\n') + '\n  ]');
const out = '/* GENERATED by tools/build-levels.js — do not edit by hand.\n' +
  ' * The 100 Climb levels: 20 rungs each, easiest first, each rung a\n' +
  ' * [main, backup] pair of question references (see js/bank.js). */\n' +
  'window.LEVELS = [\n' + lines.join(',\n') + '\n];\n';
fs.writeFileSync(path.join(__dirname, '../js/levels.js'), out);
console.log('Wrote js/levels.js (' + Math.round(out.length / 1024) + ' KB)');
