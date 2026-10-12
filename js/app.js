/* Endless Quiz — screens, and one question screen shared by three modes.
 *
 * The Climb: a 20-rung ladder that gets harder as it goes. Every fourth rung
 * (4, 8, 12, 16) is a safety net — a wrong answer drops you back to the last
 * one you passed, so a mistake costs progress but never the whole climb.
 *
 * Daily Quiz: five questions a day, the same for everyone (see daily.js).
 * One go: each answer is saved the moment it is given, so leaving and coming
 * back resumes rather than re-rolls. No 50/50.
 *
 * Quick Play: pick how many and how hard. No ladder, no falling.
 *
 * Coins are earned by answering and spent on the 50/50. Its price doubles
 * each time it is used in a game, it can be used once per question, and a
 * question answered with it pays half — so it is a rescue, not a habit. */
(function () {
  'use strict';

  const VERSION = '0.4';
  const RUNGS = 20;
  const CHECKPOINTS = [4, 8, 12, 16];
  const FIFTY_BASE = 25;
  const KEYS = ['A', 'B', 'C', 'D'];
  const KEY_COLOURS = ['var(--a)', 'var(--b)', 'var(--c)', 'var(--d)'];
  const DIFF_COLOURS = { easy: 'var(--easy)', normal: 'var(--normal)', hard: 'var(--hard)', xhard: 'var(--xhard)' };
  const DIFF_ORDER = ['easy', 'normal', 'hard', 'xhard'];
  const QUICK_COUNTS = [5, 10, 20];
  const MODE_NAMES = { climb: 'The Climb', daily: 'Daily Quiz', quick: 'Quick Play' };
  const SHARE_URL = 'https://polite-carrot.github.io/Endless-Puzzle/';

  const $ = (id) => document.getElementById(id);
  const els = {
    title: $('q-title'), sub: $('q-sub'),
    coins: $('stat-coins'), two: $('stat-two'), twoLabel: $('stat-two-label'),
    ladder: $('ladder'), progress: $('progress'), note: $('ladder-note'),
    fifty: $('fifty'), fiftyCost: $('fifty-cost'),
    cat: $('q-cat'), catIcon: $('q-cat-icon'), catName: $('q-cat-name'),
    diff: $('q-diff'), text: $('q-text'), answers: $('answers'),
    result: $('result'), mark: $('result-mark'), resultTitle: $('result-title'),
    why: $('result-why'), next: $('next'),
    toast: $('toast'), confirm: $('confirm'),
  };

  // Everything that outlives a page load.
  let saved = Store.load();

  // The game being played right now.
  const run = {
    mode: null,          // 'climb' | 'daily' | 'quick'
    queue: [],           // daily / quick: [{ item, order }]
    index: 0,
    marks: [],           // daily / quick: true / false per answer
    earned: 0,
    rung: 1,             // climb
    streak: 0,           // climb: right answers in a row
    fiftyUses: 0,        // this game; sets the price
    usedFifty: false,    // this question
    answered: false,
    finished: false,
    item: null,
    order: [],
    quick: null,         // { count, difficulty } this quick game was set up with
    dailyKey: null,
  };
  const seen = new Set(); // climb: question ids shown lately

  function persist() { Store.save(saved); }

  function applySettings() {
    Sound.setEnabled(saved.settings.sound);
  }

  /* ───────── helpers ───────── */

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function buzz(ms) {
    if (saved.settings.vibrate && navigator.vibrate) navigator.vibrate(ms);
  }

  let toastTimer = 0;
  function toast(text) {
    els.toast.textContent = text;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 1800);
  }

  function difficultyFor(rung) {
    if (rung <= 4) return 'easy';
    if (rung <= 8) return 'normal';
    if (rung <= 16) return 'hard';
    return 'xhard';
  }

  function lastCheckpoint(rung) {
    let safe = 0;
    CHECKPOINTS.forEach((c) => { if (rung > c) safe = c; });
    return safe;
  }

  function fiftyPrice() { return FIFTY_BASE * Math.pow(2, run.fiftyUses); }

  // A climb question at this difficulty, preferring ones not seen lately.
  function pickQuestion(diff) {
    const pool = QUESTIONS.filter((q) => q.difficulty === diff);
    let fresh = pool.filter((q) => !seen.has(q.id));
    if (!fresh.length) {
      pool.forEach((q) => seen.delete(q.id));
      fresh = pool.filter((q) => q.id !== (run.item && run.item.id));
      if (!fresh.length) fresh = pool;
    }
    const q = fresh[Math.floor(Math.random() * fresh.length)];
    seen.add(q.id);
    return q;
  }

  function quickPool(difficulty) {
    return difficulty === 'mixed' ? QUESTIONS : QUESTIONS.filter((q) => q.difficulty === difficulty);
  }

  /* ───────── screens ───────── */

  let ticker = 0;

  function goTo(name) {
    document.querySelectorAll('.screen').forEach((s) => {
      s.classList.toggle('is-active', s.id === 'screen-' + name);
    });
    document.querySelector('.app').scrollTo({ top: 0 });
    clearInterval(ticker);
    if (name === 'home') drawHome();
    if (name === 'daily') { drawDaily(); ticker = setInterval(drawDaily, 30000); }
    if (name === 'quick') drawQuick();
    if (name === 'settings') drawSettings();
    if (name === 'howto') drawGuide();
  }

  /* ───────── home ───────── */

  function drawHome() {
    $('home-coins').textContent = saved.coins;

    const sub = $('home-climb-sub');
    if (saved.climb) sub.textContent = 'Continue from rung ' + saved.climb.rung + ' of ' + RUNGS;
    else if (saved.best) sub.textContent = 'Best: rung ' + saved.best + ' of ' + RUNGS;
    else sub.textContent = RUNGS + ' rungs, a safety net every 4';

    // the ladder icon's five rungs fill with the best climb, a fifth each
    const lit = Math.round(saved.best / RUNGS * 5);
    document.querySelectorAll('.choice__ladder i').forEach((r, i) => {
      r.classList.toggle('is-on', i < lit);
      r.classList.toggle('is-top', i === 4 && saved.best >= RUNGS);
    });

    // the calendar icon's four squares are the last four days
    const days = Daily.week(saved.daily).slice(-4);
    document.querySelectorAll('.choice__cal-dot').forEach((dot, i) => {
      dot.classList.toggle('is-on', Daily.isDone(days[i].rec));
    });
    const today = saved.daily[Daily.today()];
    const streak = Daily.streak(saved.daily);
    let dailySub;
    if (Daily.isDone(today)) {
      dailySub = 'Today: ' + countRight(today.marks) + '/' + Daily.LENGTH + ' · come back tomorrow';
    } else if (today) {
      dailySub = 'Finish today’s quiz · ' + today.marks.length + '/' + Daily.LENGTH + ' answered';
    } else {
      dailySub = 'Today’s ' + Daily.LENGTH + ' questions are ready';
    }
    if (streak > 1) dailySub += ' · ' + streak + ' day streak';
    $('home-daily-sub').textContent = dailySub;

    $('save-warning').hidden = Store.persistent;
  }

  function countRight(marks) { return marks.split('').filter((m) => m === '1').length; }

  /* ───────── the question screen ───────── */

  function startClimb() {
    run.mode = 'climb';
    run.rung = saved.climb ? saved.climb.rung : 1;
    run.fiftyUses = saved.climb ? saved.climb.fiftyUses : 0;
    run.streak = 0;
    run.finished = false;
    run.item = null;
    saved.climb = { rung: run.rung, fiftyUses: run.fiftyUses };
    persist();
    goTo('quiz');
    show();
  }

  function startDaily() {
    const key = Daily.today();
    const rec = saved.daily[key];
    if (Daily.isDone(rec)) { goTo('daily'); return; }
    run.mode = 'daily';
    run.dailyKey = key;
    run.queue = Daily.questionsFor(key, QUESTIONS);
    run.marks = rec ? rec.marks.split('').map((m) => m === '1') : [];
    run.index = run.marks.length;
    run.earned = rec ? rec.coins || 0 : 0;
    run.fiftyUses = 0;
    run.finished = false;
    goTo('quiz');
    show();
  }

  function startQuick() {
    const { count, difficulty } = saved.quickPrefs;
    const pool = shuffle(quickPool(difficulty)).slice(0, count);
    // mixed games run easiest first, like a short climb
    if (difficulty === 'mixed') {
      pool.sort((a, b) => DIFF_ORDER.indexOf(a.difficulty) - DIFF_ORDER.indexOf(b.difficulty));
    }
    run.mode = 'quick';
    run.quick = { count: pool.length, difficulty };
    run.queue = pool.map((item) => ({ item, order: shuffle(item.answers) }));
    run.marks = [];
    run.index = 0;
    run.earned = 0;
    run.fiftyUses = 0;
    run.finished = false;
    goTo('quiz');
    show();
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
      if (r < run.rung || (run.finished && r === RUNGS)) pip.classList.add('is-done');
      else if (r === run.rung && !run.finished) pip.classList.add('is-now');
      if (fallFrom && r > run.rung && r <= fallFrom) pip.classList.add('is-fall');
      pips.push(pip);
    }
    els.ladder.replaceChildren(...pips);
    els.ladder.setAttribute('aria-label', 'Rung ' + run.rung + ' of ' + RUNGS);
  }

  function drawProgress() {
    const pips = run.queue.map((_, i) => {
      const pip = document.createElement('i');
      if (i < run.marks.length) pip.className = run.marks[i] ? 'is-right' : 'is-wrong';
      else if (i === run.index) pip.className = 'is-now';
      return pip;
    });
    els.progress.replaceChildren(...pips);
    els.progress.setAttribute('aria-label', 'Question ' + (run.index + 1) + ' of ' + run.queue.length);
  }

  function drawStats() {
    els.coins.textContent = saved.coins;
    if (run.mode === 'climb') {
      els.twoLabel.textContent = 'streak';
      els.two.textContent = run.streak;
    } else {
      els.twoLabel.textContent = 'right';
      els.two.textContent = run.marks.filter(Boolean).length;
    }
    const price = fiftyPrice();
    els.fiftyCost.textContent = price;
    els.fifty.hidden = run.mode === 'daily';
    els.fifty.disabled = run.answered || run.usedFifty || saved.coins < price;
    els.fifty.classList.toggle('is-used', run.usedFifty);
    els.fifty.querySelector('.lifeline__name').textContent = run.usedFifty ? '50/50 used' : '50/50';
  }

  function noteFor() {
    if (run.mode === 'daily') return 'No 50/50 in the daily — just you!';
    if (run.mode === 'quick') {
      const left = run.queue.length - run.index;
      return left === 1 ? 'Last question!' : left + ' questions to go';
    }
    const next = CHECKPOINTS.find((c) => c >= run.rung);
    if (next === run.rung) return 'Safety net rung — get it right to lock it in';
    if (next) return 'Safety net at ' + next + ' · ' + (next - run.rung) + ' to go';
    return 'No more nets · ' + (RUNGS - run.rung + 1) + ' to the top';
  }

  function show() {
    let item, order;
    if (run.mode === 'climb') {
      item = pickQuestion(difficultyFor(run.rung));
      order = shuffle(item.answers);
      els.title.textContent = 'Rung ' + run.rung;
    } else {
      ({ item, order } = run.queue[run.index]);
      els.title.textContent = (run.index + 1) + ' of ' + run.queue.length;
    }
    const cat = CATEGORIES[item.category];

    run.item = item;
    run.order = order;
    run.answered = false;
    run.usedFifty = false;

    els.sub.textContent = MODE_NAMES[run.mode];
    els.ladder.hidden = run.mode !== 'climb';
    els.progress.hidden = run.mode === 'climb';
    if (run.mode === 'climb') drawLadder(); else drawProgress();
    els.note.textContent = noteFor();
    drawStats();

    els.cat.style.setProperty('--cat', cat.colour);
    els.catIcon.textContent = cat.icon;
    els.catName.textContent = cat.name;
    els.diff.textContent = DIFFICULTIES[item.difficulty].name;
    els.diff.style.setProperty('--diff', DIFF_COLOURS[item.difficulty]);
    els.text.textContent = item.q;

    els.answers.replaceChildren(...order.map((text, i) => {
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
    if (run.mode === 'daily' || run.answered || run.usedFifty || saved.coins < price) return;
    saved.coins -= price;
    run.fiftyUses += 1;
    run.usedFifty = true;
    if (run.mode === 'climb') saved.climb.fiftyUses = run.fiftyUses;
    persist();

    const correct = run.item.answers[0];
    const wrong = shuffle([...els.answers.querySelectorAll('.answer')]
      .filter((b) => b.dataset.answer !== correct)).slice(0, 2);
    wrong.forEach((b) => { b.disabled = true; b.classList.add('is-gone'); });

    Sound.fifty();
    drawStats();
    replay(els.coins.closest('.stat'), 'is-spend');
  }

  function choose(btn) {
    if (run.answered) return;
    run.answered = true;

    const item = run.item;
    const correct = item.answers[0];
    const right = btn.dataset.answer === correct;
    els.answers.querySelectorAll('.answer').forEach((b) => {
      b.disabled = true;
      if (b.dataset.answer === correct) b.classList.add('is-right');
      else if (b === btn) b.classList.add('is-wrong');
      else if (!b.classList.contains('is-gone')) b.classList.add('is-dim');
    });

    let earned = 0;
    if (right) {
      const full = DIFFICULTIES[item.difficulty].coins;
      earned = run.usedFifty ? Math.ceil(full / 2) : full;
      saved.coins += earned;
      replay(els.coins.closest('.stat'), 'is-bump');
    }

    const explain = saved.settings.explain;
    let title = right ? 'Correct! +' + earned : 'Not quite — it’s ' + correct;
    let extra = '';
    let sound = right ? 'right' : 'wrong';

    if (run.mode === 'climb') {
      if (right) {
        run.streak += 1;
        saved.best = Math.max(saved.best, run.rung);
        if (run.rung === RUNGS) {
          run.finished = true;
          saved.climb = null;
          title = 'You reached the top!';
          extra = 'That’s all ' + RUNGS + ' rungs.';
          sound = 'win';
        } else {
          if (CHECKPOINTS.includes(run.rung)) extra = 'Safety net reached — you can’t fall below rung ' + run.rung + ' now.';
          run.rung += 1;
        }
        drawLadder();
      } else {
        const from = run.rung;
        const safe = lastCheckpoint(from);
        run.streak = 0;
        run.rung = safe + 1;
        extra = safe ? 'You fall back to your safety net at rung ' + safe + '.' : 'Back to the bottom of the ladder.';
        if (from > run.rung) sound = 'fall';
        drawLadder(from);
      }
      if (saved.climb) saved.climb.rung = run.rung;
    } else {
      run.marks.push(right);
      run.earned += earned;
      if (run.mode === 'daily') {
        saved.daily[run.dailyKey] = {
          marks: run.marks.map((m) => (m ? '1' : '0')).join(''),
          coins: run.earned,
        };
      }
      drawProgress();
    }
    persist();

    Sound[sound]();
    if (!right) buzz(120);
    if (!right || sound === 'win') replay(els.two.closest('.stat'), 'is-bump');
    drawStats();

    const last = run.mode !== 'climb' && run.marks.length === run.queue.length;
    els.result.classList.add(right ? 'is-right' : 'is-wrong');
    els.mark.textContent = right ? '✓' : '✕';
    els.resultTitle.textContent = title;
    els.why.textContent = [explain ? item.why : '', extra].filter(Boolean).join(' ');
    els.why.hidden = !els.why.textContent;
    els.next.innerHTML = run.finished ? 'Climb again &rsaquo;' : last ? 'See results &rsaquo;' : 'Next question &rsaquo;';
    els.result.hidden = false;
    els.next.focus({ preventScroll: true });
    // On a short screen the card would sit over the answer just picked;
    // scrolling to its natural place keeps both in view.
    const app = document.querySelector('.app');
    app.scrollTo({ top: app.scrollHeight, behavior: 'smooth' });
  }

  function next() {
    if (run.mode === 'climb') {
      if (run.finished) {
        run.finished = false;
        run.rung = 1;
        run.fiftyUses = 0;
        saved.climb = { rung: 1, fiftyUses: 0 };
        persist();
      }
      show();
      return;
    }
    run.index += 1;
    if (run.index >= run.queue.length) finish();
    else show();
  }

  /* ───────── results ───────── */

  function finishLine(right, total) {
    const r = right / total;
    if (r === 1) return 'Perfect score!';
    if (r >= 0.8) return 'Brilliant!';
    if (r >= 0.6) return 'Nicely done!';
    if (r >= 0.4) return 'Not bad at all.';
    return 'Tough one — try again!';
  }

  function drawMarks(list, marks) {
    list.replaceChildren(...marks.map((m) => {
      const li = document.createElement('li');
      li.className = m ? 'is-right' : 'is-wrong';
      return li;
    }));
  }

  function finish() {
    const right = run.marks.filter(Boolean).length;
    const total = run.marks.length;

    $('fin-mode').textContent = MODE_NAMES[run.mode];
    $('fin-right').textContent = right;
    $('fin-total').textContent = total;
    $('fin-line').textContent = finishLine(right, total);
    drawMarks($('fin-marks'), run.marks);
    $('fin-coins').textContent = '+' + run.earned;

    const daily = run.mode === 'daily';
    if (daily) {
      $('fin-extra').textContent = Daily.streak(saved.daily);
      $('fin-extra-label').textContent = 'day streak';
      $('fin-note').textContent = 'Next quiz in ' + Daily.untilTomorrow() + '.';
    } else {
      const key = run.quick.difficulty + '-' + run.quick.count;
      const before = saved.quickBest[key] || 0;
      saved.quickBest[key] = Math.max(before, right);
      persist();
      $('fin-extra').textContent = saved.quickBest[key];
      $('fin-extra-label').textContent = 'best';
      $('fin-note').textContent = right > before && before ? 'New best!' : '';
    }
    $('fin-share').hidden = !daily;
    $('fin-again').hidden = daily;
    $('fin-again').textContent = 'Play again';
    Sound[right === total ? 'win' : 'tap']();
    goTo('results');
  }

  function shareText(key, marks) {
    const date = Daily.dateOf(key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const grid = marks.split('').map((m) => (m === '1' ? '🟩' : '🟥')).join('');
    return 'Endless Quiz · ' + date + '\n' + grid + ' ' + countRight(marks) + '/' + marks.length + '\n' + SHARE_URL;
  }

  async function share() {
    const key = Daily.today();
    const rec = saved.daily[key];
    if (!Daily.isDone(rec)) return;
    const text = shareText(key, rec.marks);
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      toast('Copied — paste it anywhere');
    } catch (e) {
      if (e && e.name === 'AbortError') return;   // they closed the share sheet
      toast('Couldn’t share from this browser');
    }
  }

  /* ───────── daily screen ───────── */

  function drawDaily() {
    const key = Daily.today();
    $('daily-date').textContent = Daily.dateOf(key).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

    $('daily-week').replaceChildren(...Daily.week(saved.daily).map((d) => {
      const li = document.createElement('li');
      const small = document.createElement('small');
      const b = document.createElement('b');
      small.textContent = d.date.toLocaleDateString('en-GB', { weekday: 'narrow' });
      if (Daily.isDone(d.rec)) { li.classList.add('is-done'); b.textContent = countRight(d.rec.marks); }
      else if (d.rec) li.classList.add('is-part');
      if (d.key === key) li.classList.add('is-today');
      li.title = d.date.toLocaleDateString('en-GB');
      li.append(small, b);
      return li;
    }));

    const streak = Daily.streak(saved.daily);
    $('daily-streak').textContent = streak;
    document.querySelector('.flame').classList.toggle('is-out', !streak);

    const rec = saved.daily[key];
    const done = Daily.isDone(rec);
    $('daily-ready').hidden = done;
    $('daily-done').hidden = !done;
    if (done) {
      $('daily-score').textContent = countRight(rec.marks) + '/' + rec.marks.length;
      drawMarks($('daily-marks'), rec.marks.split('').map((m) => m === '1'));
      $('daily-next').textContent = Daily.untilTomorrow();
    } else {
      $('daily-play').textContent = rec ? 'Carry on (' + rec.marks.length + '/' + Daily.LENGTH + ')' : 'Play today’s quiz';
    }
  }

  /* ───────── quick play setup ───────── */

  function segButtons(box, options, current, onPick) {
    box.replaceChildren(...options.map((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(o.value === current));
      b.textContent = o.label;
      if (o.colour) { b.dataset.diff = o.value; b.style.setProperty('--diff', o.colour); }
      b.addEventListener('click', () => { Sound.tap(); onPick(o.value); });
      return b;
    }));
  }

  function drawQuick() {
    const prefs = saved.quickPrefs;
    segButtons($('quick-count'), QUICK_COUNTS.map((n) => ({ value: n, label: String(n) })), prefs.count, (v) => {
      prefs.count = v; persist(); drawQuick();
    });
    const diffs = [{ value: 'mixed', label: 'Mixed', colour: 'var(--accent)' }]
      .concat(DIFF_ORDER.map((d) => ({ value: d, label: DIFFICULTIES[d].name, colour: DIFF_COLOURS[d] })));
    segButtons($('quick-diff'), diffs, prefs.difficulty, (v) => {
      prefs.difficulty = v; persist(); drawQuick();
    });

    const have = quickPool(prefs.difficulty).length;
    const name = prefs.difficulty === 'mixed' ? '' : DIFFICULTIES[prefs.difficulty].name.toLowerCase() + ' ';
    $('quick-note').textContent = have < prefs.count
      ? 'There are only ' + have + ' ' + name + 'questions so far, so you’ll get ' + have + '.'
      : '';
    const n = Math.min(prefs.count, have);
    $('quick-play').textContent = 'Start · ' + n + ' question' + (n === 1 ? '' : 's');
    const best = saved.quickBest[prefs.difficulty + '-' + n];
    $('quick-best').textContent = best != null ? 'Your best here: ' + best + '/' + n : '';
  }

  /* ───────── settings ───────── */

  function drawSettings() {
    $('set-sound').checked = saved.settings.sound;
    $('set-vibrate').checked = saved.settings.vibrate;
    $('set-explain').checked = saved.settings.explain;
    // iPhone and iPad browsers cannot vibrate, so don't offer it there
    $('set-vibrate-row').hidden = !navigator.vibrate;

    const rows = [
      ['Coins', saved.coins],
      ['Best climb', saved.best ? saved.best + '/' + RUNGS : '—'],
      ['Daily streak', Daily.streak(saved.daily)],
    ];
    $('tally').replaceChildren(...rows.map(([label, value]) => {
      const div = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = value;
      div.append(dt, dd);
      return div;
    }));
    $('version').textContent = 'Endless Quiz ' + VERSION + ' · ' + QUESTIONS.length + ' questions' +
      (Store.persistent ? '' : ' · progress isn’t being saved in this browser');
  }

  [['set-sound', 'sound'], ['set-vibrate', 'vibrate'], ['set-explain', 'explain']].forEach(([id, key]) => {
    $(id).addEventListener('change', (e) => {
      saved.settings[key] = e.target.checked;
      persist();
      applySettings();
      if (key === 'sound' && e.target.checked) Sound.tap();
      if (key === 'vibrate' && e.target.checked) buzz(40);
    });
  });

  $('reset').addEventListener('click', () => els.confirm.showModal());
  els.confirm.addEventListener('close', () => {
    if (els.confirm.returnValue !== 'reset') return;
    saved = Store.reset();
    run.mode = null;
    seen.clear();
    applySettings();
    drawSettings();
    toast('Progress reset');
  });

  /* ───────── how to play ───────── */

  function drawGuide() {
    const box = $('guide-ladder');
    if (box.childElementCount) return;
    for (let r = 1; r <= RUNGS; r++) {
      const pip = document.createElement('i');
      pip.className = 'rung';
      if (CHECKPOINTS.includes(r) || r === RUNGS) {
        pip.classList.add('is-check');
        pip.textContent = r === RUNGS ? '★' : r;
      }
      if (r < 7) pip.classList.add('is-done');
      if (r === 7) pip.classList.add('is-now');
      box.appendChild(pip);
    }
  }

  /* ───────── wiring ───────── */

  $('go-climb').addEventListener('click', () => {
    // back from the menu mid-question: leave it exactly as it was
    if (run.mode === 'climb' && run.item && !run.answered && !run.finished) { goTo('quiz'); return; }
    startClimb();
  });
  $('go-daily').addEventListener('click', () => goTo('daily'));
  $('go-quick').addEventListener('click', () => goTo('quick'));
  $('go-settings').addEventListener('click', () => goTo('settings'));
  $('go-howto').addEventListener('click', () => goTo('howto'));
  document.querySelectorAll('[data-home]').forEach((b) => b.addEventListener('click', () => goTo('home')));

  $('back').addEventListener('click', () => {
    // a daily left part-way is already saved; come back to the daily screen
    goTo(run.mode === 'daily' ? 'daily' : run.mode === 'quick' ? 'quick' : 'home');
  });
  $('daily-play').addEventListener('click', startDaily);
  $('daily-share').addEventListener('click', share);
  $('quick-play').addEventListener('click', startQuick);
  $('fin-share').addEventListener('click', share);
  $('fin-again').addEventListener('click', startQuick);
  $('fin-home').addEventListener('click', () => goTo('home'));
  els.fifty.addEventListener('click', useFifty);
  els.next.addEventListener('click', next);

  // Keyboard: 1–4 or A–D to answer, H for the 50/50, Enter / Space for next.
  document.addEventListener('keydown', (e) => {
    if (!$('screen-quiz').classList.contains('is-active') || els.confirm.open) return;
    const k = e.key.toUpperCase();
    const pick = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : KEYS.indexOf(k);
    if (!run.answered && pick >= 0) {
      const btn = els.answers.querySelectorAll('.answer')[pick];
      if (btn && !btn.disabled) btn.click();
    } else if (!run.answered && k === 'H') {
      useFifty();
    } else if (run.answered && (e.key === 'Enter' || e.key === ' ') && document.activeElement !== els.next) {
      e.preventDefault();
      els.next.click();
    }
  });

  applySettings();
  drawHome();
})();
