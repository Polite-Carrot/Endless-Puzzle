/* Checks every question the bank can make: four different answers, the
 * right one never repeated among the wrong ones, a known category and
 * difficulty, an explanation, and no two questions sharing an id or the
 * same question text with the same answer. Generators are run over many
 * seeds. Run: node tools/check-bank.js */
'use strict';
const path = require('path');
globalThis.window = globalThis;
require(path.join(__dirname, '../js/questions.js'));
require(path.join(__dirname, '../js/bank.js'));
const { statics, generate, GENERATORS } = globalThis.Bank;

const problems = [];
function check(q, where) {
  if (!q) return problems.push(where + ': missing');
  if (!CATEGORIES[q.category]) problems.push(q.id + ': unknown category ' + q.category);
  if (!DIFFICULTIES[q.difficulty]) problems.push(q.id + ': unknown difficulty ' + q.difficulty);
  if (q.answers.length !== 4) problems.push(q.id + ': ' + q.answers.length + ' answers');
  if (new Set(q.answers.map((a) => String(a).toLowerCase())).size !== q.answers.length) problems.push(q.id + ': repeated answer ' + JSON.stringify(q.answers));
  if (q.answers.some((a) => a === '' || a == null || /NaN|undefined|-\d/.test(String(a)))) problems.push(q.id + ': bad answer ' + JSON.stringify(q.answers));
  if (!q.q || !q.why) problems.push(q.id + ': no question or explanation');
}

const ids = new Set(), pairs = new Set();
statics.forEach((q) => {
  check(q, q.id);
  if (ids.has(q.id)) problems.push('duplicate id ' + q.id);
  ids.add(q.id);
  const key = q.q + ' → ' + q.answers[0];
  if (pairs.has(key)) problems.push('duplicate question ' + key);
  pairs.add(key);
});

const SEEDS = 2000;
const genCounts = {};
Object.keys(GENERATORS).forEach((kind) => {
  const texts = new Set();
  for (let s = 1; s <= SEEDS; s++) {
    const q = generate(kind, s);
    check(q, kind + ':' + s);
    if (generate(kind, s).q !== q.q) problems.push(kind + ':' + s + ' is not repeatable');
    texts.add(q.q);
  }
  genCounts[kind] = GENERATORS[kind].difficulty + ', ' + texts.size + ' different in ' + SEEDS + ' seeds';
});

const by = {};
statics.forEach((q) => { by[q.difficulty] = by[q.difficulty] || {}; by[q.difficulty][q.category] = (by[q.difficulty][q.category] || 0) + 1; });
console.log('Written and table questions:', statics.length);
Object.keys(DIFFICULTIES).forEach((d) => {
  const row = by[d] || {};
  console.log('  ' + d.padEnd(7), String(Object.values(row).reduce((a, b) => a + b, 0)).padStart(4), JSON.stringify(row));
});
console.log('Generators:');
Object.entries(genCounts).forEach(([k, v]) => console.log('  ' + k.padEnd(9), v));
if (problems.length) { console.log('\nPROBLEMS (' + problems.length + '):\n' + problems.slice(0, 40).join('\n')); process.exit(1); }
console.log('\nAll good.');
