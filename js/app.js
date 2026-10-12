/* Endless Quiz — screens, and one question screen shared by three modes.
 *
 * The Climb: 100 levels (js/levels.js), each a ladder of 20 rungs that gets
 * harder as it goes. Every fourth rung (4, 8, 12, 16) is a safety net — a
 * wrong answer drops you back to the last one you passed. Each rung carries
 * a backup question, so the way back up after a fall is fresh: the first
 * time a rung is shown it asks its main question, the second time its
 * backup, and after that a stand-in of the same difficulty from the bank.
 * Stars: no falls ★★★, one or two ★★, more ★.
 *
 * Daily Quiz: five questions a day, the same for everyone (see daily.js).
 * One go: each answer is saved the moment it is given, so leaving and coming
 * back resumes rather than re-rolls. No 50/50.
 *
 * Quick Play: pick a difficulty, categories and how many, then deal. Every
 * deal comes from a seed, so the same seed and settings deal the same quiz
 * — answers in the same places — for anyone.
 *
 * Coins are earned by answering and spent on the 50/50. Its price doubles
 * each time it is used in a game, it can be used once per question, and a
 * question answered with it pays half — so it is a rescue, not a habit. */
(function () {
  'use strict';

  const VERSION = '0.5';
  // Must match version.json and the ?v= on index.html's links. Bump all three together.
  const BUILD = 9;
  const RUNGS = 20;
  const CHECKPOINTS = [4, 8, 12, 16];
  const FIFTY_BASE = 25;
  const KEYS = ['A', 'B', 'C', 'D'];
  const KEY_COLOURS = ['var(--a)', 'var(--b)', 'var(--c)', 'var(--d)'];
  const DIFF_COLOURS = { easy: 'var(--easy)', normal: 'var(--normal)', hard: 'var(--hard)', xhard: 'var(--xhard)' };
  const DIFF_ORDER = ['easy', 'normal', 'hard', 'xhard'];
  const QUICK_DIFFS = ['mixed', 'easy', 'normal', 'hard', 'xhard'];
  const QUICK_NAMES = { mixed: 'Mixed', easy: 'Easy', normal: 'Normal', hard: 'Hard', xhard: 'Extra Hard' };
  const QUICK_BLURBS = {
    mixed: 'A bit of everything, easiest first — like a short climb.',
    easy: 'Warm-ups: times tables, animals, colours and capitals you’ll know.',
    normal: 'A step up: world capitals, elements, history and trickier sums.',
    hard: 'For quiz fans: harder capitals, chemical symbols and mental maths.',
    xhard: 'Brain-melters: Latin symbols, far-off capitals, primes and Roman years.',
  };
  const QUICK_COUNTS = [5, 10, 15, 20, 25, 30];
  const MODE_NAMES = { climb: 'The Climb', daily: 'Daily Quiz', quick: 'Quick Play' };
  const SHARE_URL = 'https://polite-carrot.github.io/Endless-Puzzle/';
  const ALL_CATS = Object.keys(CATEGORIES);

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
    level: 0,            // climb
    rung: 1,
    shown: {},           // climb: rung -> times it has been asked this climb
    falls: 0,
    streak: 0,           // climb: right answers in a row
    fiftyUses: 0,        // this game; sets the price
    usedFifty: false,    // this question
    answered: false,
    finished: false,
    item: null,
    order: [],
    quick: null,         // the settings and seed this quick game was dealt from
    dailyKey: null,
  };

  function persist() { Store.save(saved); }

  function applySettings() {
    Sound.setEnabled(saved.settings.sound);
  }

  /* ───────── helpers ───────── */

  function shuffle(list, rand) {
    rand = rand || Math.random;
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
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

  function lastCheckpoint(rung) {
    let safe = 0;
    CHECKPOINTS.forEach((c) => { if (rung > c) safe = c; });
    return safe;
  }

  function fiftyPrice() { return FIFTY_BASE * Math.pow(2, run.fiftyUses); }

  function levelsClimbed() { return Object.keys(saved.levels).length; }
  function nextLevel() {
    for (let n = 1; n <= LEVELS.length; n++) if (!saved.levels[n]) return n;
    return LEVELS.length;
  }
  const unlocked = (n) => n === 1 || !!saved.levels[n - 1] || (saved.climb && saved.climb.level === n);
  const starsFor = (falls) => (falls === 0 ? 3 : falls <= 2 ? 2 : 1);

  /* ───────── screens ───────── */

  let ticker = 0;

  function goTo(name) {
    document.querySelectorAll('.screen').forEach((s) => {
      s.classList.toggle('is-active', s.id === 'screen-' + name);
    });
    document.querySelector('.app').scrollTo({ top: 0 });
    clearInterval(ticker);
    if (name === 'home') drawHome();
    if (name === 'levels') drawLevels();
    if (name === 'daily') { drawDaily(); ticker = setInterval(drawDaily, 30000); }
    if (name === 'quick') drawQuick();
    if (name === 'settings') drawSettings();
    if (name === 'howto') drawGuide();
  }

  /* ───────── home ───────── */

  function drawHome() {
    $('home-coins').textContent = saved.coins;

    const climbed = levelsClimbed();
    const sub = $('home-climb-sub');
    if (saved.climb) sub.textContent = 'Level ' + saved.climb.level + ' · rung ' + saved.climb.rung + ' of ' + RUNGS;
    else if (climbed) sub.textContent = climbed + ' of ' + LEVELS.length + ' levels climbed';
    else sub.textContent = LEVELS.length + ' levels, from easy to brain-melting';

    // the ladder icon's five rungs fill as the levels are climbed
    const lit = Math.ceil(climbed / LEVELS.length * 5);
    document.querySelectorAll('.choice__ladder i').forEach((r, i) => {
      r.classList.toggle('is-on', i < lit);
      r.classList.toggle('is-top', i === 4 && climbed >= LEVELS.length);
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

  /* ───────── climb levels ───────── */

  function drawLevels() {
    const climbed = levelsClimbed();
    const stars = Object.values(saved.levels).reduce((a, b) => a + b, 0);
    $('levels-note').textContent = climbed
      ? climbed + ' of ' + LEVELS.length + ' climbed · ' + stars + ' ★'
      : 'Start at the bottom';
    const next = nextLevel();
    const going = saved.climb && saved.climb.level;
    const grid = $('level-grid');
    grid.replaceChildren(...LEVELS.map((_, i) => {
      const n = i + 1;
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tile';
      b.disabled = !unlocked(n);
      if (n === going) b.classList.add('is-going');
      else if (n === next && !going) b.classList.add('is-next');
      const got = saved.levels[n] || 0;
      b.innerHTML = '<span class="tile__no"></span><span class="tile__stars"></span>';
      b.children[0].textContent = n;
      b.children[1].innerHTML = '★'.repeat(got) + '<span class="off">' + '★'.repeat(3 - got) + '</span>';
      b.setAttribute('aria-label', 'Level ' + n + (b.disabled ? ', locked' : got ? ', ' + got + ' stars' : ''));
      b.addEventListener('click', () => startClimb(n));
      li.appendChild(b);
      return li;
    }));
    // bring the level to play next into view
    const focus = grid.children[(going || next) - 1];
    if (focus) requestAnimationFrame(() => focus.scrollIntoView({ block: 'center' }));
  }

  /* ───────── starting a game ───────── */

  function resetRun(mode) {
    Object.assign(run, {
      mode, queue: [], index: 0, marks: [], earned: 0, fiftyUses: 0,
      usedFifty: false, answered: false, finished: false, item: null,
    });
  }

  function startClimb(level) {
    const c = saved.climb;
    // carrying on where you left off
    if (c && c.level === level) {
      if (run.mode === 'climb' && run.level === level && run.item && !run.answered && !run.finished) {
        goTo('quiz');
        return;
      }
      resetRun('climb');
      Object.assign(run, { level, rung: c.rung, shown: c.shown || {}, falls: c.falls || 0, fiftyUses: c.fiftyUses || 0, earned: c.earned || 0, streak: 0 });
    } else {
      resetRun('climb');
      Object.assign(run, { level, rung: 1, shown: {}, falls: 0, streak: 0 });
      saveClimb();
    }
    goTo('quiz');
    show();
  }

  function saveClimb() {
    saved.climb = { level: run.level, rung: run.rung, shown: run.shown, falls: run.falls, fiftyUses: run.fiftyUses, earned: run.earned };
    persist();
  }

  // The question for this rung, this time: main, then backup, then a stand-in.
  function climbQuestion() {
    const [main, backup] = LEVELS[run.level - 1][run.rung - 1];
    const times = run.shown[run.rung] || 0;
    if (times === 0) return Bank.get(main);
    if (times === 1) return Bank.get(backup);
    const diff = Bank.get(main).difficulty;
    const own = new Set(LEVELS[run.level - 1].flat());
    const pool = Bank.statics.filter((q) => q.difficulty === diff && !own.has(q.id));
    const rand = Bank.rng(Bank.hash(run.level + ':' + run.rung + ':' + times));
    return pool[Math.floor(rand() * pool.length)];
  }

  function startDaily() {
    const key = Daily.today();
    const rec = saved.daily[key];
    if (Daily.isDone(rec)) { goTo('daily'); return; }
    resetRun('daily');
    const ids = (rec && rec.ids) || Daily.idsFor(key, Bank.statics);
    saved.daily[key] = { ids, marks: rec ? rec.marks : '', coins: rec ? rec.coins || 0 : 0 };
    persist();
    run.dailyKey = key;
    run.queue = Daily.questionsFor(key, Bank.statics, Bank.get, ids);
    run.marks = rec ? rec.marks.split('').map((m) => m === '1') : [];
    run.index = run.marks.length;
    run.earned = rec ? rec.coins || 0 : 0;
    goTo('quiz');
    show();
  }

  /* ───────── quick play: dealing from a seed ───────── */

  function quickCats() { return saved.quickPrefs.cats || ALL_CATS; }

  // Everything a deal could draw from, before the seed chooses.
  function quickPool(difficulty, cats) {
    const diffs = difficulty === 'mixed' ? DIFF_ORDER : [difficulty];
    return Bank.statics.filter((q) => diffs.includes(q.difficulty) && cats.includes(q.category));
  }

  function deal(seed, difficulty, count, cats) {
    const rand = Bank.rng(Bank.hash('quick:' + seed + ':' + difficulty + ':' + count + ':' + cats.join(',')));
    const written = shuffle(quickPool(difficulty, cats), rand);
    const made = [];
    if (cats.includes('maths')) {
      // Maths can be generated, so it never runs short: give it its fair
      // share of the quiz, and let it fill any gap the written ones leave.
      const diffs = difficulty === 'mixed' ? DIFF_ORDER : [difficulty];
      const share = Math.min(count, Math.max(Math.round(count / cats.length), count - written.length));
      for (let i = 0; made.length < share && i < share * 5; i++) {
        const kinds = Bank.generatorsFor(diffs[Math.floor(rand() * diffs.length)]);
        const q = Bank.generate(kinds[Math.floor(rand() * kinds.length)], Math.floor(rand() * 1e9));
        if (!made.some((m) => m.q === q.q)) made.push(q);
      }
    }
    let items = shuffle(written.slice(0, count - made.length).concat(made), rand);
    items = items.slice(0, count);
    // mixed games run easiest first, like a short climb
    if (difficulty === 'mixed') items.sort((a, b) => DIFF_ORDER.indexOf(a.difficulty) - DIFF_ORDER.indexOf(b.difficulty));
    return items.map((item) => ({ item, order: shuffle(item.answers, rand) }));
  }

  function startQuick(seed) {
    const { count, difficulty } = saved.quickPrefs;
    const cats = quickCats();
    if (seed == null) {
      const typed = $('seed-input').value.trim();
      seed = /^\d{1,9}$/.test(typed) ? Number(typed) : Math.floor(Math.random() * 1e6);
    }
    resetRun('quick');
    run.queue = deal(seed, difficulty, count, cats);
    run.quick = { seed, count: run.queue.length, difficulty, cats };
    goTo('quiz');
    show();
  }

  /* ───────── the question screen ───────── */

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
      els.twoLabel.textContent = run.falls === 1 ? 'fall' : 'falls';
      els.two.textContent = run.falls;
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
      item = climbQuestion();
      run.shown[run.rung] = (run.shown[run.rung] || 0) + 1;
      saveClimb();
      // the same layout every time this question appears on this rung
      order = shuffle(item.answers, Bank.rng(Bank.hash(item.id + ':' + run.level)));
      els.title.textContent = 'Rung ' + run.rung;
      els.sub.textContent = 'Level ' + run.level;
    } else {
      ({ item, order } = run.queue[run.index]);
      els.title.textContent = (run.index + 1) + ' of ' + run.queue.length;
      els.sub.textContent = MODE_NAMES[run.mode];
    }
    const cat = CATEGORIES[item.category];

    run.item = item;
    run.order = order;
    run.answered = false;
    run.usedFifty = false;

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
    if (run.mode === 'climb') saveClimb(); else persist();

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
      run.earned += earned;
      replay(els.coins.closest('.stat'), 'is-bump');
    }

    let title = right ? 'Correct! +' + earned : 'Not quite — it’s ' + correct;
    let extra = '';
    let sound = right ? 'right' : 'wrong';
    let last = false;

    if (run.mode === 'climb') {
      if (right) {
        run.streak += 1;
        if (run.rung === RUNGS) {
          run.finished = true;
          last = true;
          title = 'Level ' + run.level + ' climbed!';
          sound = 'win';
          const stars = starsFor(run.falls);
          saved.levels[run.level] = Math.max(saved.levels[run.level] || 0, stars);
          saved.climb = null;
        } else {
          if (CHECKPOINTS.includes(run.rung)) extra = 'Safety net reached — you can’t fall below rung ' + run.rung + ' now.';
          run.rung += 1;
        }
        drawLadder();
      } else {
        const from = run.rung;
        const safe = lastCheckpoint(from);
        run.streak = 0;
        run.falls += 1;
        run.rung = safe + 1;
        extra = (safe ? 'You fall back to your safety net at rung ' + safe + '.' : 'Back to the bottom of the ladder.') +
          ' You’ll get a different question this time.';
        if (from > run.rung) sound = 'fall';
        drawLadder(from);
      }
      if (!run.finished) saveClimb(); else persist();
    } else {
      run.marks.push(right);
      if (run.mode === 'daily') {
        const rec = saved.daily[run.dailyKey];
        rec.marks = run.marks.map((m) => (m ? '1' : '0')).join('');
        rec.coins = run.earned;
      }
      last = run.marks.length === run.queue.length;
      drawProgress();
      persist();
    }

    Sound[sound]();
    if (!right) buzz(120);
    if (!right) replay(els.two.closest('.stat'), 'is-bump');
    drawStats();

    els.result.classList.add(right ? 'is-right' : 'is-wrong');
    els.mark.textContent = right ? '✓' : '✕';
    els.resultTitle.textContent = title;
    els.why.textContent = [saved.settings.explain ? item.why : '', extra].filter(Boolean).join(' ');
    els.why.hidden = !els.why.textContent;
    els.next.innerHTML = last ? 'See results &rsaquo;' : 'Next question &rsaquo;';
    els.result.hidden = false;
    els.next.focus({ preventScroll: true });
    // On a short screen the card would sit over the answer just picked;
    // scrolling to its natural place keeps both in view.
    const app = document.querySelector('.app');
    app.scrollTo({ top: app.scrollHeight, behavior: 'smooth' });
  }

  function next() {
    if (run.mode === 'climb') {
      if (run.finished) finish(); else show();
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
    const climb = run.mode === 'climb';
    const daily = run.mode === 'daily';
    const right = run.marks.filter(Boolean).length;
    const total = run.marks.length;

    $('fin-mode').textContent = climb ? 'Level ' + run.level : MODE_NAMES[run.mode];
    $('fin-score').hidden = climb;
    $('fin-stars').hidden = !climb;
    $('fin-marks').hidden = climb;
    $('fin-coins').textContent = '+' + run.earned;

    if (climb) {
      const stars = starsFor(run.falls);
      $('fin-stars').querySelectorAll('i').forEach((s, i) => s.classList.toggle('is-on', i < stars));
      $('fin-line').textContent = run.falls === 0 ? 'Not a single slip!' : run.falls <= 2 ? 'Great climb!' : 'You made it to the top!';
      $('fin-extra').textContent = run.falls;
      $('fin-extra-label').textContent = run.falls === 1 ? 'fall' : 'falls';
      $('fin-note').textContent = stars < 3 ? 'Climb it again without falling for ★★★.' : '';
    } else {
      $('fin-right').textContent = right;
      $('fin-total').textContent = total;
      $('fin-line').textContent = finishLine(right, total);
      drawMarks($('fin-marks'), run.marks);
      if (daily) {
        $('fin-extra').textContent = Daily.streak(saved.daily);
        $('fin-extra-label').textContent = 'day streak';
        $('fin-note').textContent = 'Next quiz in ' + Daily.untilTomorrow() + '.';
      } else {
        const q = run.quick;
        const key = q.difficulty + '-' + q.count + '-' + (q.cats.length === ALL_CATS.length ? 'all' : q.cats.join('.'));
        const before = saved.quickBest[key];
        saved.quickBest[key] = Math.max(before || 0, right);
        persist();
        $('fin-extra').textContent = saved.quickBest[key];
        $('fin-extra-label').textContent = 'best';
        $('fin-note').textContent = 'Seed ' + q.seed + ' — share it and a friend gets the same quiz.' +
          (before != null && right > before ? ' New best!' : '');
      }
    }
    $('fin-share').hidden = climb;
    $('fin-share').textContent = daily ? 'Share result' : 'Challenge a friend';
    $('fin-again').hidden = !(run.mode === 'quick' || (climb && starsFor(run.falls) < 3));
    $('fin-again').textContent = climb ? 'Try for ★★★' : 'Deal another';
    // only one loud button: Next level when there is one
    $('fin-again').classList.toggle('btn--primary', !climb);
    $('fin-again').classList.toggle('btn--ghost', climb);
    $('fin-next').hidden = !(climb && run.level < LEVELS.length);
    $('fin-levels').hidden = !climb;
    const stars = climb ? starsFor(run.falls) : 0;
    Sound[(climb ? stars === 3 : right === total) ? 'win' : 'tap']();
    goTo('results');
  }

  function shareText(kind) {
    if (kind === 'quick') {
      const q = run.quick;
      const right = run.marks.filter(Boolean).length;
      const grid = run.marks.map((m) => (m ? '🟩' : '🟥')).join('');
      const cats = q.cats.length === ALL_CATS.length ? 'all categories' : q.cats.map((c) => CATEGORIES[c].name).join(', ');
      return 'Endless Quiz · Quick Play\n' + grid + ' ' + right + '/' + q.count + '\n' +
        QUICK_NAMES[q.difficulty] + ' · ' + q.count + ' questions · ' + cats + ' · seed ' + q.seed + '\n' + SHARE_URL;
    }
    const key = Daily.today();
    const rec = saved.daily[key];
    const date = Daily.dateOf(key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const grid = rec.marks.split('').map((m) => (m === '1' ? '🟩' : '🟥')).join('');
    return 'Endless Quiz · ' + date + '\n' + grid + ' ' + countRight(rec.marks) + '/' + rec.marks.length + '\n' + SHARE_URL;
  }

  async function share(kind) {
    if (kind === 'daily' && !Daily.isDone(saved.daily[Daily.today()])) return;
    const text = shareText(kind);
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
      else if (d.rec && d.rec.marks) li.classList.add('is-part');
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
      $('daily-play').textContent = rec && rec.marks ? 'Carry on (' + rec.marks.length + '/' + Daily.LENGTH + ')' : 'Play today’s quiz';
    }
  }

  /* ───────── quick play setup ───────── */

  function drawQuick() {
    const prefs = saved.quickPrefs;
    const slider = $('quick-diff');
    const idx = Math.max(0, QUICK_DIFFS.indexOf(prefs.difficulty));
    slider.value = idx;
    slider.setAttribute('aria-valuetext', QUICK_NAMES[prefs.difficulty]);
    $('quick-diff-name').textContent = QUICK_NAMES[prefs.difficulty];
    $('quick-ticks').replaceChildren(...QUICK_DIFFS.map((d, i) => {
      const s = document.createElement('span');
      s.textContent = QUICK_NAMES[d];
      s.classList.toggle('is-on', i === idx);
      s.addEventListener('click', () => { prefs.difficulty = d; persist(); Sound.tap(); drawQuick(); });
      return s;
    }));
    $('quick-blurb').textContent = QUICK_BLURBS[prefs.difficulty];

    const cats = quickCats();
    $('quick-cats').replaceChildren(...ALL_CATS.map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(cats.includes(c)));
      b.style.setProperty('--cat', CATEGORIES[c].colour);
      b.innerHTML = '<span class="cats__icon" aria-hidden="true"></span><span></span>';
      b.children[0].textContent = CATEGORIES[c].icon;
      b.children[1].textContent = CATEGORIES[c].name;
      b.addEventListener('click', () => toggleCat(c));
      return b;
    }));
    $('quick-all').textContent = cats.length === ALL_CATS.length ? 'Clear' : 'Select all';

    $('quick-count').textContent = prefs.count;
    $('count-down').disabled = prefs.count <= QUICK_COUNTS[0];
    $('count-up').disabled = prefs.count >= QUICK_COUNTS[QUICK_COUNTS.length - 1];

    // say so if the choices can't fill the quiz
    const have = quickPool(prefs.difficulty, cats).length;
    const infinite = cats.includes('maths');
    let note = '';
    if (!infinite && have < prefs.count) {
      note = 'Only ' + have + ' questions match those choices so far, so you’ll get ' + have + '. Add a category for more.';
    }
    const key = prefs.difficulty + '-' + Math.min(prefs.count, infinite ? prefs.count : have) + '-' +
      (cats.length === ALL_CATS.length ? 'all' : cats.join('.'));
    const best = saved.quickBest[key];
    if (best != null) note += (note ? ' ' : '') + 'Your best with these settings: ' + best + '.';
    $('quick-note').textContent = note;
    $('quick-play').disabled = !infinite && have === 0;
  }

  function toggleCat(c) {
    const cats = quickCats().slice();
    const i = cats.indexOf(c);
    if (i >= 0) {
      if (cats.length === 1) { toast('Keep at least one category'); return; }
      cats.splice(i, 1);
    } else {
      cats.push(c);
    }
    saved.quickPrefs.cats = cats.length === ALL_CATS.length ? null : ALL_CATS.filter((k) => cats.includes(k));
    persist();
    Sound.tap();
    drawQuick();
  }

  $('quick-diff').addEventListener('input', (e) => {
    saved.quickPrefs.difficulty = QUICK_DIFFS[Number(e.target.value)];
    persist();
    drawQuick();
  });
  $('quick-all').addEventListener('click', () => {
    // "Clear" leaves one category, since a quiz needs something to ask
    saved.quickPrefs.cats = quickCats().length === ALL_CATS.length ? ['general'] : null;
    persist();
    Sound.tap();
    drawQuick();
  });
  function stepCount(dir) {
    const i = QUICK_COUNTS.indexOf(saved.quickPrefs.count);
    const j = Math.max(0, Math.min(QUICK_COUNTS.length - 1, (i < 0 ? 1 : i) + dir));
    saved.quickPrefs.count = QUICK_COUNTS[j];
    persist();
    Sound.tap();
    drawQuick();
  }
  $('count-down').addEventListener('click', () => stepCount(-1));
  $('count-up').addEventListener('click', () => stepCount(1));

  /* ───────── settings ───────── */

  function drawSettings() {
    $('set-sound').checked = saved.settings.sound;
    $('set-vibrate').checked = saved.settings.vibrate;
    $('set-explain').checked = saved.settings.explain;
    // iPhone and iPad browsers cannot vibrate, so don't offer it there
    $('set-vibrate-row').hidden = !navigator.vibrate;

    const rows = [
      ['Coins', saved.coins],
      ['Levels', levelsClimbed() + '/' + LEVELS.length],
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
    $('version').textContent = 'Endless Quiz ' + VERSION + ' · ' + Bank.statics.length + ' questions + endless maths' +
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
    run.item = null;
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

  $('go-climb').addEventListener('click', () => goTo('levels'));
  $('go-daily').addEventListener('click', () => goTo('daily'));
  $('go-quick').addEventListener('click', () => goTo('quick'));
  $('go-settings').addEventListener('click', () => goTo('settings'));
  $('go-howto').addEventListener('click', () => goTo('howto'));
  document.querySelectorAll('[data-home]').forEach((b) => b.addEventListener('click', () => goTo('home')));

  $('back').addEventListener('click', () => {
    // a climb or daily left part-way is already saved
    goTo({ climb: 'levels', daily: 'daily', quick: 'quick' }[run.mode] || 'home');
  });
  $('daily-play').addEventListener('click', startDaily);
  $('daily-share').addEventListener('click', () => share('daily'));
  $('quick-play').addEventListener('click', () => startQuick());
  $('fin-share').addEventListener('click', () => share(run.mode));
  $('fin-again').addEventListener('click', () => (run.mode === 'climb' ? startClimb(run.level) : startQuick()));
  $('fin-next').addEventListener('click', () => startClimb(run.level + 1));
  $('fin-levels').addEventListener('click', () => goTo('levels'));
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

  /* ───────── staying up to date ─────────
     GitHub Pages lets browsers keep the page itself for ten minutes, and a
     phone can hold on to it far longer. A stale page loads stale scripts,
     so the game asks for version.json — never cached — and if a newer build
     is out it reloads onto a fresh URL, which no cache can answer. The
     sessionStorage note stops it looping if the new build hasn't reached
     every server yet. */

  async function checkForUpdate() {
    if (location.protocol === 'file:') return;   // opened straight from disk: nothing to check
    try {
      const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const { build } = await res.json();
      if (!(build > BUILD)) return;
      const tried = 'endless-quiz:reload-' + build;
      if (sessionStorage.getItem(tried)) return;
      sessionStorage.setItem(tried, '1');
      // only between games, never in the middle of a question
      if ($('screen-quiz').classList.contains('is-active') && !run.answered) return;
      location.replace(location.pathname + '?build=' + build);
    } catch (e) { /* offline, or opened from a file: carry on */ }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });

  applySettings();
  drawHome();
  checkForUpdate();
})();
