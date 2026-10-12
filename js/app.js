/* Endless Quiz — the Climb.
 *
 * A run is a 20-rung ladder that gets harder as it goes. Rungs 4, 7 and 12
 * are safety nets: a wrong answer drops you back to the last one you passed, so
 * a mistake costs progress but never the whole run.
 *
 * Coins are earned by answering and spent on the 50/50. Its price doubles
 * each time it is used in a run, it can be used once per question, and a
 * question answered with it pays half — so it is a rescue, not a habit.
 *
 * Prototype: only a handful of sample questions, and nothing is saved. */
(function () {
  'use strict';

  const RUNGS = 20;
  const CHECKPOINTS = [4, 7, 12];
  const START_COINS = 100;
  const FIFTY_BASE = 25;
  const KEYS = ['A', 'B', 'C', 'D'];
  const KEY_COLOURS = ['var(--a)', 'var(--b)', 'var(--c)', 'var(--d)'];
  const DIFF_COLOURS = { easy: 'var(--easy)', normal: 'var(--normal)', hard: 'var(--hard)', xhard: 'var(--xhard)' };

  const $ = (id) => document.getElementById(id);
  const els = {
    title: $('q-title'), sub: $('q-sub'),
    coins: $('stat-coins'), streak: $('stat-streak'),
    ladder: $('ladder'), note: $('ladder-note'),
    fifty: $('fifty'), fiftyCost: $('fifty-cost'),
    cat: $('q-cat'), catIcon: $('q-cat-icon'), catName: $('q-cat-name'),
    diff: $('q-diff'), text: $('q-text'), answers: $('answers'),
    result: $('result'), mark: $('result-mark'), resultTitle: $('result-title'),
    why: $('result-why'), next: $('next'),
  };

  const state = {
    rung: 1,            // the rung being attempted, 1..RUNGS
    coins: START_COINS,
    streak: 0,
    fiftyUses: 0,       // this run; sets the price
    usedFifty: false,   // this question
    answered: false,
    finished: false,
    item: null,
    seen: new Set(),
  };

  function difficultyFor(rung) {
    if (rung <= 4) return 'easy';
    if (rung <= 9) return 'normal';
    if (rung <= 15) return 'hard';
    return 'xhard';
  }

  function lastCheckpoint(rung) {
    let safe = 0;
    CHECKPOINTS.forEach((c) => { if (rung > c) safe = c; });
    return safe;
  }

  function fiftyPrice() { return FIFTY_BASE * Math.pow(2, state.fiftyUses); }

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // A question at the rung's difficulty, preferring ones not yet seen.
  function pickQuestion(diff) {
    const pool = QUESTIONS.filter((q) => q.difficulty === diff);
    let fresh = pool.filter((q) => !state.seen.has(q.id));
    if (!fresh.length) {
      pool.forEach((q) => state.seen.delete(q.id));
      fresh = pool.filter((q) => q.id !== (state.item && state.item.id));
      if (!fresh.length) fresh = pool;
    }
    const q = fresh[Math.floor(Math.random() * fresh.length)];
    state.seen.add(q.id);
    return q;
  }

  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function drawLadder(fallFrom) {
    const pips = [];
    for (let r = 1; r <= RUNGS; r++) {
      const pip = document.createElement('i');
      pip.className = 'rung';
      if (CHECKPOINTS.includes(r) || r === RUNGS) {
        pip.classList.add('is-check');
        pip.textContent = r === RUNGS ? '★' : r;
      }
      if (r < state.rung || (state.finished && r === RUNGS)) pip.classList.add('is-done');
      else if (r === state.rung && !state.finished) pip.classList.add('is-now');
      if (fallFrom && r > state.rung && r <= fallFrom) pip.classList.add('is-fall');
      pips.push(pip);
    }
    els.ladder.replaceChildren(...pips);
    els.ladder.setAttribute('aria-label', 'Rung ' + state.rung + ' of ' + RUNGS);
  }

  function drawStats() {
    els.coins.textContent = state.coins;
    els.streak.textContent = state.streak;
    const price = fiftyPrice();
    els.fiftyCost.textContent = price;
    els.fifty.disabled = state.answered || state.usedFifty || state.coins < price;
    els.fifty.classList.toggle('is-used', state.usedFifty);
    els.fifty.querySelector('.lifeline__name').textContent = state.usedFifty ? '50/50 used' : '50/50';
  }

  function noteFor(rung) {
    const next = CHECKPOINTS.find((c) => c >= rung);
    if (next === rung) return 'Safety net rung — get it right to lock it in';
    if (next) return 'Safety net at ' + next + ' · ' + (next - rung) + ' to go';
    return 'No more nets · ' + (RUNGS - rung + 1) + ' to the top';
  }

  function show() {
    const diff = difficultyFor(state.rung);
    const item = pickQuestion(diff);
    const cat = CATEGORIES[item.category];

    state.item = item;
    state.answered = false;
    state.usedFifty = false;

    els.title.textContent = 'Rung ' + state.rung;
    els.note.textContent = noteFor(state.rung);
    drawLadder();
    drawStats();

    els.cat.style.setProperty('--cat', cat.colour);
    els.catIcon.textContent = cat.icon;
    els.catName.textContent = cat.name;
    els.diff.textContent = DIFFICULTIES[diff].name;
    els.diff.style.setProperty('--diff', DIFF_COLOURS[diff]);
    els.text.textContent = item.q;

    els.answers.replaceChildren(...shuffle(item.answers).map((text, i) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'answer';
      btn.dataset.answer = text;
      btn.style.setProperty('--k', KEY_COLOURS[i]);
      btn.innerHTML = '<span class="answer__key"></span><span class="answer__text"></span>';
      btn.children[0].textContent = KEYS[i];
      btn.children[1].textContent = text;
      btn.addEventListener('click', () => choose(btn));
      li.appendChild(btn);
      return li;
    }));

    els.result.hidden = true;
    els.result.classList.remove('is-right', 'is-wrong');
    document.querySelector('.app').scrollTo({ top: 0 });
  }

  function useFifty() {
    const price = fiftyPrice();
    if (state.answered || state.usedFifty || state.coins < price) return;
    state.coins -= price;
    state.fiftyUses += 1;
    state.usedFifty = true;

    const correct = state.item.answers[0];
    const wrong = shuffle([...els.answers.querySelectorAll('.answer')]
      .filter((b) => b.dataset.answer !== correct)).slice(0, 2);
    wrong.forEach((b) => { b.disabled = true; b.classList.add('is-gone'); });

    drawStats();
    replay(els.coins.closest('.stat'), 'is-spend');
  }

  function choose(btn) {
    if (state.answered) return;
    state.answered = true;

    const item = state.item;
    const correct = item.answers[0];
    const right = btn.dataset.answer === correct;
    els.answers.querySelectorAll('.answer').forEach((b) => {
      b.disabled = true;
      if (b.dataset.answer === correct) b.classList.add('is-right');
      else if (b === btn) b.classList.add('is-wrong');
      else if (!b.classList.contains('is-gone')) b.classList.add('is-dim');
    });

    let title;
    let detail = item.why;
    if (right) {
      const full = DIFFICULTIES[item.difficulty].coins;
      const earned = state.usedFifty ? Math.ceil(full / 2) : full;
      state.coins += earned;
      state.streak += 1;
      replay(els.coins.closest('.stat'), 'is-bump');
      title = 'Correct! +' + earned;
      if (state.rung === RUNGS) {
        state.finished = true;
        title = 'You reached the top!';
        detail = item.why + ' That’s all ' + RUNGS + ' rungs.';
      } else {
        if (CHECKPOINTS.includes(state.rung)) detail = 'Safety net reached — you can’t fall below rung ' + state.rung + ' now. ' + item.why;
        state.rung += 1;
      }
      drawLadder();
    } else {
      const from = state.rung;
      const safe = lastCheckpoint(from);
      state.streak = 0;
      state.rung = safe + 1;
      title = 'Not quite — it’s ' + correct;
      detail = item.why + (safe
        ? ' You fall back to your safety net at rung ' + safe + '.'
        : ' Back to the bottom of the ladder.');
      drawLadder(from);
    }
    els.streak.textContent = state.streak;
    replay(els.streak.closest('.stat'), 'is-bump');
    drawStats();

    els.result.classList.add(right ? 'is-right' : 'is-wrong');
    els.mark.textContent = right ? '✓' : '✕';
    els.resultTitle.textContent = title;
    els.why.textContent = detail;
    els.next.innerHTML = state.finished ? 'Climb again &rsaquo;' : 'Next question &rsaquo;';
    els.result.hidden = false;
    els.next.focus({ preventScroll: true });
    // On a short screen the card would sit over the answer just picked;
    // scrolling to its natural place keeps both in view.
    const app = document.querySelector('.app');
    app.scrollTo({ top: app.scrollHeight, behavior: 'smooth' });
  }

  els.fifty.addEventListener('click', useFifty);

  els.next.addEventListener('click', () => {
    if (state.finished) {
      state.finished = false;
      state.rung = 1;
      state.fiftyUses = 0;
    }
    show();
  });

  // Keyboard: 1–4 or A–D to answer, H for the 50/50, Enter / Space for next.
  document.addEventListener('keydown', (e) => {
    const k = e.key.toUpperCase();
    const pick = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : KEYS.indexOf(k);
    if (!state.answered && pick >= 0) {
      const btn = els.answers.querySelectorAll('.answer')[pick];
      if (btn && !btn.disabled) btn.click();
    } else if (!state.answered && k === 'H') {
      useFifty();
    } else if (state.answered && (e.key === 'Enter' || e.key === ' ') && document.activeElement !== els.next) {
      e.preventDefault();
      els.next.click();
    }
  });

  show();
})();
