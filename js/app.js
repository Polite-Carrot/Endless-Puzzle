/* Endless Quiz — screens, and one question screen shared by three modes.
 *
 * The Climb: four tracks — Easy, Normal, Hard, Extra Hard — each its own run
 * of levels (js/levels.js), picked from tabs on the level screen. A level is
 * a ladder of 20 rungs that gets harder as it goes. Every fourth rung (4, 8, 12, 16) is a safety net — a
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
 * Coins are scarce on purpose: a climbed level or a good Daily Quiz pays
 * about one lifeline (see PAY). They're spent on lifelines — 50/50, Ask the
 * audience, Swap and Second chance. Each one's price doubles every time it is
 * used in a game and each can be used once per question — so they're a
 * rescue, not a habit. No lifelines in the Daily Quiz, so everyone's score
 * there means the same thing. */
(function () {
  'use strict';

  const VERSION = '0.5';
  // Must match version.json and the ?v= on index.html's links. Bump all three together.
  const BUILD = 27;
  const RUNGS = 20;
  const CHECKPOINTS = [4, 8, 12, 16];
  // Lifelines: starting price, and what each costs after n uses this game
  const LIFELINES = {
    fifty: { name: '50/50', base: 25 },
    audience: { name: 'Ask the audience', base: 20 },
    skip: { name: 'Swap', base: 30 },     // shown as "Swap"; 'skip' inside, as saved climbs use it
    retry: { name: 'Second chance', base: 40 },
  };
  const LIFE_KEYS = Object.keys(LIFELINES);
  // What playing pays. Kept low so one win buys about one lifeline.
  //   Climb: paid once, at the top of a level. The first climb of a level pays
  //          by difficulty; climbing it again pays a little, more if it earns
  //          more stars.
  //   Daily: per right answer, so a perfect day is one lifeline.
  //   Quick Play: per right answer, by difficulty (DIFFICULTIES[d].coins) —
  //          nothing for an answer a lifeline helped with.
  const PAY = {
    climbFirst: { easy: 25, normal: 30, hard: 35, xhard: 40 },
    climbBetter: 10,
    climbAgain: 5,
    daily: 5,
  };
  const noUses = () => ({ fifty: 0, audience: 0, skip: 0, retry: 0 });
  // How often the audience's favourite is the right answer, by difficulty
  const AUDIENCE_RIGHT = { easy: 1, normal: 0.9, hard: 0.75, xhard: 0.6 };
  const RECENT_MAX = 30;
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
    lifelines: $('lifelines'),
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
    track: null,         // climb: 'easy' | 'normal' | 'hard' | 'xhard'
    level: 0,
    rung: 1,
    shown: {},           // climb: rung -> times it has been asked this climb
    falls: 0,
    streak: 0,           // climb: right answers in a row
    uses: noUses(),      // lifelines used this game; sets their prices
    now: {},             // lifelines used on this question: { fifty: true, … }
    retryArmed: false,   // Second chance bought, waiting for a wrong answer
    helped: false,       // this question was helped (pays nothing in Quick Play)
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

  function buzz(kind) {
    if (saved.settings.vibrate) Native.haptic(kind);
  }

  let toastTimer = 0;
  function toast(text) {
    els.toast.textContent = text;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { els.toast.hidden = true; }, 1800);
  }

  /* ───────── first-time tips ─────────
     A new player gets a welcome on the home screen, then a few tips the first
     time they see a question — each one dims the screen except the thing
     it's about. saved.tips remembers which have been seen; How to play can
     clear it to see them again. */

  const TIPS = {
    answers: {
      target: () => els.answers,
      text: () => 'Tap the answer you think is right.' + (run.mode === 'climb'
        ? ' Each right answer takes you up a rung — reach rung 20 to climb the level.'
        : run.mode === 'daily' ? ' Five questions, one go, and everyone gets the same ones today.' : ''),
    },
    ladder: {
      target: () => els.ladder,
      text: () => 'This is your ladder. The gold rungs are safety nets: get a question wrong and you only fall back to the last net you passed.',
    },
    lifelines: {
      target: () => els.lifelines,
      text: () => 'Stuck? Lifelines help — but they cost coins, and each gets dearer every time you use it. Coins are hard won: a climbed level pays about one.',
    },
  };
  const TIPS_FOR = { climb: ['answers', 'ladder', 'lifelines'], quick: ['answers', 'lifelines'], daily: ['answers'] };
  let coachQueue = [];
  let coachKey = null;
  let coachTotal = 0;

  const coaching = () => !!coachKey;

  function coach(keys) {
    if (coachKey) return;
    coachQueue = keys.filter((k) => !saved.tips[k]);
    coachTotal = coachQueue.length;
    coachNext();
  }

  function coachNext() {
    if (coachKey) { saved.tips[coachKey] = true; persist(); }
    coachKey = coachQueue.shift() || null;
    $('coach').hidden = !coachKey;
    if (!coachKey) return;
    const done = coachTotal - coachQueue.length;
    $('coach-text').textContent = TIPS[coachKey].text();
    $('coach-step').textContent = coachTotal > 1 ? done + ' of ' + coachTotal : '';
    $('coach-next').textContent = coachQueue.length ? 'Next' : 'Got it';
    TIPS[coachKey].target().scrollIntoView({ block: 'center' });
    requestAnimationFrame(placeCoach);
    $('coach-next').focus({ preventScroll: true });
  }

  function placeCoach() {
    if (!coachKey) return;
    const r = TIPS[coachKey].target().getBoundingClientRect();
    const pad = 8;
    const hole = $('coach-hole').style;
    hole.top = (r.top - pad) + 'px';
    hole.left = (r.left - pad) + 'px';
    hole.width = (r.width + pad * 2) + 'px';
    hole.height = (r.height + pad * 2) + 'px';
    // the bubble goes on whichever side has more room
    const bubble = $('coach-bubble').style;
    if (innerHeight - r.bottom >= r.top) { bubble.top = (r.bottom + pad + 14) + 'px'; bubble.bottom = ''; }
    else { bubble.bottom = (innerHeight - r.top + pad + 14) + 'px'; bubble.top = ''; }
  }

  $('coach').addEventListener('click', (e) => {
    if (e.target.closest('.coach__bubble') && e.target !== $('coach-next')) return;
    coachNext();
  });
  addEventListener('resize', placeCoach);
  document.querySelector('.app').addEventListener('scroll', placeCoach, { passive: true });

  // The welcome, once, on the home screen — after the phone's saved copy has
  // had its chance to come back, so a returning player never sees it.
  let restored = false;
  function maybeWelcome() {
    const dialog = $('welcome');
    if (!restored || !$('screen-home').classList.contains('is-active')) return;
    if (!saved.tips.welcome && !dialog.open) dialog.showModal();
  }

  $('welcome').addEventListener('close', () => {
    saved.tips.welcome = true;
    persist();
    if ($('welcome').returnValue === 'climb') startClimb('easy', 1);
  });

  $('tips-again').addEventListener('click', () => {
    saved.tips = {};
    persist();
    goTo('home');
  });

  function lastCheckpoint(rung) {
    let safe = 0;
    CHECKPOINTS.forEach((c) => { if (rung > c) safe = c; });
    return safe;
  }

  const price = (k) => LIFELINES[k].base * Math.pow(2, run.uses[k] || 0);

  // The Climb has four tracks, each its own run of levels (js/levels.js).
  // Stars are saved per track and level, as 'normal-4'.
  const TRACKS = DIFF_ORDER.filter((t) => LEVELS[t] && LEVELS[t].length);
  const trackLength = (t) => LEVELS[t].length;
  const totalLevels = () => TRACKS.reduce((n, t) => n + trackLength(t), 0);
  const starsAt = (t, n) => saved.levels[t + '-' + n] || 0;
  function levelsClimbed(t) {
    return Object.keys(saved.levels).filter((k) => !t || k.startsWith(t + '-')).length;
  }
  function nextLevel(t) {
    for (let n = 1; n <= trackLength(t); n++) if (!starsAt(t, n)) return n;
    return trackLength(t);
  }
  const going = (t, n) => !!saved.climb && saved.climb.track === t && saved.climb.level === n;
  const unlocked = (t, n) => n === 1 || !!starsAt(t, n - 1) || going(t, n);
  function currentTrack() {
    return TRACKS.includes(saved.track) ? saved.track : (saved.climb && saved.climb.track) || TRACKS[0];
  }
  const starsFor = (falls) => (falls === 0 ? 3 : falls <= 2 ? 2 : 1);

  /* ───────── screens ───────── */

  let ticker = 0;

  function goTo(name) {
    document.querySelectorAll('.screen').forEach((s) => {
      s.classList.toggle('is-active', s.id === 'screen-' + name);
    });
    document.querySelector('.app').scrollTo({ top: 0 });
    clearInterval(ticker);
    if (name === 'home') { drawHome(); maybeWelcome(); }
    if (name === 'levels') drawLevels();
    if (name === 'daily') { drawDaily(); ticker = setInterval(drawDaily, 30000); }
    if (name === 'quick') drawQuick();
    if (name === 'settings') drawSettings();
    if (name === 'howto') drawGuide();
    if (name === 'report') drawReport();
  }

  /* ───────── home ───────── */

  function drawHome() {
    $('home-coins').textContent = saved.coins;

    const climbed = levelsClimbed();
    const sub = $('home-climb-sub');
    if (saved.climb) sub.textContent = QUICK_NAMES[saved.climb.track] + ' level ' + saved.climb.level + ' · rung ' + saved.climb.rung + ' of ' + RUNGS;
    else if (climbed) sub.textContent = climbed + ' of ' + totalLevels() + ' levels climbed';
    else sub.textContent = TRACKS.length + ' difficulties · ' + totalLevels() + ' levels';

    // the ladder icon's five rungs fill as the levels are climbed
    const lit = Math.ceil(climbed / totalLevels() * 5);
    document.querySelectorAll('.choice__ladder i').forEach((r, i) => {
      r.classList.toggle('is-on', i < lit);
      r.classList.toggle('is-top', i === 4 && climbed >= totalLevels());
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
    const track = currentTrack();

    // the difficulty tabs along the top, each with its progress
    $('level-tabs').replaceChildren(...TRACKS.map((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(t === track));
      b.style.setProperty('--diff', DIFF_COLOURS[t]);
      b.innerHTML = '<b></b><small></small>';
      b.children[0].textContent = QUICK_NAMES[t];
      b.children[1].textContent = levelsClimbed(t) + '/' + trackLength(t);
      b.addEventListener('click', () => {
        if (t === saved.track) return;
        saved.track = t;
        persist();
        Sound.tap();
        drawLevels();
      });
      return b;
    }));

    const climbed = levelsClimbed(track);
    const stars = Object.entries(saved.levels).filter(([k]) => k.startsWith(track + '-')).reduce((a, [, s]) => a + s, 0);
    $('levels-note').textContent = climbed
      ? climbed + ' of ' + trackLength(track) + ' climbed · ' + stars + ' ★'
      : trackLength(track) + ' levels to climb';
    const next = nextLevel(track);
    const inProgress = saved.climb && saved.climb.track === track ? saved.climb.level : 0;
    const grid = $('level-grid');
    grid.style.setProperty('--diff', DIFF_COLOURS[track]);
    grid.replaceChildren(...LEVELS[track].map((_, i) => {
      const n = i + 1;
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tile';
      b.disabled = !unlocked(track, n);
      if (n === inProgress) b.classList.add('is-going');
      else if (n === next && !inProgress) b.classList.add('is-next');
      const got = starsAt(track, n);
      b.innerHTML = '<span class="tile__no"></span><span class="tile__stars"></span>';
      b.children[0].textContent = n;
      b.children[1].innerHTML = '★'.repeat(got) + '<span class="off">' + '★'.repeat(3 - got) + '</span>';
      b.setAttribute('aria-label', QUICK_NAMES[track] + ' level ' + n + (b.disabled ? ', locked' : got ? ', ' + got + ' stars' : ''));
      b.addEventListener('click', () => startClimb(track, n));
      li.appendChild(b);
      return li;
    }));
    // bring the level to play next into view
    const focus = grid.children[(inProgress || next) - 1];
    if (focus) requestAnimationFrame(() => focus.scrollIntoView({ block: 'center' }));
  }

  /* ───────── starting a game ───────── */

  function resetRun(mode) {
    Object.assign(run, {
      mode, queue: [], index: 0, marks: [], earned: 0, uses: noUses(),
      now: {}, retryArmed: false, helped: false, answered: false, finished: false, item: null,
    });
  }

  function startClimb(track, level) {
    const c = saved.climb;
    saved.track = track;
    // carrying on where you left off
    if (c && c.track === track && c.level === level) {
      if (run.mode === 'climb' && run.track === track && run.level === level && run.item && !run.answered && !run.finished) {
        goTo('quiz');
        return;
      }
      resetRun('climb');
      Object.assign(run, { track, level, rung: c.rung, shown: c.shown || {}, falls: c.falls || 0,
        uses: Object.assign(noUses(), c.uses || { fifty: c.fiftyUses || 0 }), earned: c.earned || 0, streak: 0 });
    } else {
      resetRun('climb');
      Object.assign(run, { track, level, rung: 1, shown: {}, falls: 0, streak: 0 });
      saveClimb();
    }
    goTo('quiz');
    show();
  }

  function saveClimb() {
    saved.climb = { track: run.track, level: run.level, rung: run.rung, shown: run.shown, falls: run.falls, uses: run.uses, earned: run.earned };
    persist();
  }

  // The question for this rung, this time: main, then backup, then a stand-in.
  function climbQuestion() {
    const levelRefs = LEVELS[run.track][run.level - 1];
    const [main, backup] = levelRefs[run.rung - 1];
    const times = run.shown[run.rung] || 0;
    if (times === 0) return Bank.get(main);
    if (times === 1) return Bank.get(backup);
    const diff = Bank.get(main).difficulty;
    const own = new Set(levelRefs.flat());
    const ownFacts = new Set([...own].map((ref) => Bank.get(ref).fact));
    const pool = Bank.statics.filter((q) => q.difficulty === diff && !ownFacts.has(q.fact));
    const rand = Bank.rng(Bank.hash(run.track + ':' + run.level + ':' + run.rung + ':' + times));
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
    // one question per fact: never both "capital of Italy?" and "Rome is the capital of…?"
    const facts = new Set();
    const distinct = written.filter((q) => !facts.has(q.fact) && facts.add(q.fact));
    let items = shuffle(distinct.slice(0, count - made.length).concat(made), rand);
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
    drawLifelines();
  }

  function drawLifelines() {
    els.lifelines.hidden = run.mode === 'daily';
    els.lifelines.querySelectorAll('[data-life]').forEach((b) => {
      const k = b.dataset.life;
      const used = !!run.now[k];
      b.querySelector('.lifeline__cost span').textContent = price(k);
      b.classList.toggle('is-used', used);
      b.classList.toggle('is-armed', k === 'retry' && run.retryArmed);
      // Swap makes no sense once a lifeline has already been spent on this
      // question, and the others none after Swap — keep it one thing at a time.
      b.disabled = run.answered || used || saved.coins < price(k) ||
        (k === 'skip' && (run.now.fifty || run.now.audience || run.retryArmed));
    });
  }

  function noteFor() {
    if (run.mode === 'daily') return 'No lifelines in the daily — just you!';
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
      order = shuffle(item.answers, Bank.rng(Bank.hash(item.id + ':' + run.track + ':' + run.level)));
      els.title.textContent = 'Rung ' + run.rung;
      els.sub.textContent = QUICK_NAMES[run.track] + ' · level ' + run.level;
    } else {
      ({ item, order } = run.queue[run.index]);
      els.title.textContent = (run.index + 1) + ' of ' + run.queue.length;
      els.sub.textContent = MODE_NAMES[run.mode];
    }
    els.ladder.hidden = run.mode !== 'climb';
    els.progress.hidden = run.mode === 'climb';
    if (run.mode === 'climb') drawLadder(); else drawProgress();
    els.note.textContent = noteFor();
    render(item, order);
    els.result.hidden = true;
    els.result.classList.remove('is-right', 'is-wrong');
    $('screen-quiz').classList.remove('is-answered');
    document.querySelector('.app').scrollTo({ top: 0 });
    coach(TIPS_FOR[run.mode]);
  }

  // Put a question on screen with its answers in the given order.
  function render(item, order) {
    const cat = CATEGORIES[item.category];
    run.item = item;
    run.order = order;
    run.answered = false;
    run.now = {};
    run.retryArmed = false;
    run.helped = false;
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
  }

  /* ───────── lifelines ───────── */

  function useLifeline(k) {
    const cost = price(k);
    if (run.mode === 'daily' || run.answered || run.now[k] || saved.coins < cost) return;
    if (k === 'skip' && (run.now.fifty || run.now.audience || run.retryArmed)) return;
    if (k === 'skip' && !skipTo()) { toast('No other question to swap in'); return; }
    saved.coins -= cost;
    run.uses[k] += 1;
    if (run.mode === 'climb') saveClimb(); else persist();
    replay(els.coins.closest('.stat'), 'is-spend');
    buzz('tap');

    if (k === 'skip') {
      const swap = skipTo();
      const order = shuffle(swap.answers);
      if (run.mode !== 'climb') run.queue[run.index] = { item: swap, order };
      Sound.fifty();
      render(swap, order);
      run.now.skip = true;     // one swap per question
      drawStats();
      toast('Swapped — here’s another');
      return;
    }

    run.now[k] = true;
    if (k === 'fifty') fiftyFifty();
    if (k === 'audience') askAudience();
    if (k === 'retry') { run.retryArmed = true; toast('Second chance ready — if you’re wrong, you can pick again'); }
    if (k !== 'retry') run.helped = true;
    Sound.fifty();
    drawStats();   // the coin count and every lifeline's state
  }

  function fiftyFifty() {
    const correct = run.item.answers[0];
    const wrong = shuffle([...els.answers.querySelectorAll('.answer:not(.is-gone):not(.is-wrong)')]
      .filter((b) => b.dataset.answer !== correct)).slice(0, 2);
    wrong.forEach((b) => { b.disabled = true; b.classList.add('is-gone'); b.querySelector('.answer__poll')?.remove(); });
  }

  // A pretend studio audience. Seeded by the question, so asking twice about
  // the same question gets the same vote. How often the crowd's favourite is
  // right depends on difficulty: always on Easy, about 60% on Extra Hard.
  function askAudience() {
    const correct = run.item.answers[0];
    const buttons = [...els.answers.querySelectorAll('.answer:not(.is-gone):not(.is-wrong)')];
    const rand = Bank.rng(Bank.hash('audience:' + run.item.id));
    const rightLeads = rand() < AUDIENCE_RIGHT[run.item.difficulty];
    const wrongs = buttons.filter((b) => b.dataset.answer !== correct);
    const favourite = rightLeads || !wrongs.length ? correct : wrongs[Math.floor(rand() * wrongs.length)].dataset.answer;
    // the favourite gets the biggest share; the rest split what's left
    const top = { easy: [55, 80], normal: [45, 65], hard: [36, 52], xhard: [32, 45] }[run.item.difficulty];
    const lead = buttons.length === 1 ? 100 : Math.round(top[0] + rand() * (top[1] - top[0]));
    const others = buttons.filter((b) => b.dataset.answer !== favourite);
    const weights = others.map(() => 0.4 + rand());
    const sum = weights.reduce((a, b) => a + b, 0);
    const shares = new Map([[favourite, lead]]);
    let left = 100 - lead;
    others.forEach((b, i) => {
      // never let a runner-up match the favourite
      const v = i === others.length - 1 ? left : Math.min(lead - 1, Math.round((100 - lead) * weights[i] / sum));
      shares.set(b.dataset.answer, v);
      left -= v;
    });
    buttons.forEach((b) => {
      const pct = shares.get(b.dataset.answer) || 0;
      const bar = document.createElement('span');
      bar.className = 'answer__poll';
      bar.style.setProperty('--pct', pct + '%');
      bar.innerHTML = '<i></i><b></b>';
      bar.querySelector('b').textContent = pct + '%';
      b.appendChild(bar);
    });
  }

  // Another question of the same difficulty that hasn't been asked in this
  // game — for the Climb, nothing from this level; for Quick Play, nothing
  // already in the deal and from the same categories.
  function skipTo() {
    const diff = run.item.difficulty;
    const avoid = new Set([run.item.fact]);
    let pool;
    if (run.mode === 'climb') {
      LEVELS[run.track][run.level - 1].flat().forEach((ref) => avoid.add(Bank.get(ref).fact));
      pool = Bank.statics.filter((q) => q.difficulty === diff && !avoid.has(q.fact));
    } else {
      run.queue.forEach((x) => avoid.add(x.item.fact));
      pool = Bank.statics.filter((q) => q.difficulty === diff && run.quick.cats.includes(q.category) && !avoid.has(q.fact));
      if (!pool.length && run.quick.cats.includes('maths')) {
        const kinds = Bank.generatorsFor(diff);
        return Bank.generate(kinds[(run.uses.skip + run.index) % kinds.length], Math.floor(Math.random() * 1e9));
      }
    }
    if (!pool.length) return null;
    const rand = Bank.rng(Bank.hash('skip:' + run.item.id + ':' + run.uses.skip));
    return pool[Math.floor(rand() * pool.length)];
  }

  function pay(n) {
    if (!n) return;
    saved.coins += n;
    run.earned += n;
    replay(els.coins.closest('.stat'), 'is-bump');
  }

  function choose(btn) {
    if (run.answered) return;
    const item = run.item;
    const correct = item.answers[0];
    const right = btn.dataset.answer === correct;

    // Second chance: a wrong answer is struck out and you pick again.
    if (!right && run.retryArmed) {
      run.retryArmed = false;
      run.helped = true;
      btn.disabled = true;
      btn.classList.add('is-wrong', 'is-struck');
      btn.querySelector('.answer__key').textContent = '✕';
      btn.querySelector('.answer__poll')?.remove();
      Sound.wrong();
      buzz('wrong');
      toast('Not that one — pick again');
      drawLifelines();
      return;
    }

    run.answered = true;
    run.retryArmed = false;
    remember(item);
    els.answers.querySelectorAll('.answer').forEach((b) => {
      b.disabled = true;
      // a tick and a cross as well as green and red, for colour-blind players
      if (b.dataset.answer === correct) { b.classList.add('is-right'); b.querySelector('.answer__key').textContent = '✓'; }
      else if (b === btn) { b.classList.add('is-wrong'); b.querySelector('.answer__key').textContent = '✕'; }
      else if (!b.classList.contains('is-gone') && !b.classList.contains('is-struck')) b.classList.add('is-dim');
    });

    let earned = 0;
    if (right && run.mode !== 'climb') {
      earned = run.mode === 'daily' ? PAY.daily : run.helped ? 0 : DIFFICULTIES[item.difficulty].coins;
      pay(earned);
    }

    // "it’s the penguin", not "it’s The penguin"
    const named = correct.replace(/^(The|A|An) /, (w) => w.toLowerCase());
    let title = right ? (earned ? 'Correct! +' + earned : 'Correct!') : 'Not quite — it’s ' + named;
    let extra = '';
    let sound = right ? 'right' : 'wrong';
    let last = false;

    if (run.mode === 'climb') {
      if (right) {
        run.streak += 1;
        if (run.rung === RUNGS) {
          run.finished = true;
          last = true;
          title = QUICK_NAMES[run.track] + ' level ' + run.level + ' climbed!';
          sound = 'win';
          const stars = starsFor(run.falls);
          const key = run.track + '-' + run.level;
          const before = saved.levels[key] || 0;
          saved.levels[key] = Math.max(before, stars);
          run.earned = 0;   // a climb pays only here, at the top
          pay(!before ? PAY.climbFirst[run.track] : stars > before ? PAY.climbBetter : PAY.climbAgain);
          title += ' +' + run.earned;
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
        if (Daily.isDone(rec)) syncReminders();   // today's reminder isn't needed now
      }
      last = run.marks.length === run.queue.length;
      drawProgress();
      persist();
    }

    Sound[sound]();
    buzz(right ? 'right' : 'wrong');
    if (!right) replay(els.two.closest('.stat'), 'is-bump');
    drawStats();

    els.result.classList.add(right ? 'is-right' : 'is-wrong');
    els.mark.textContent = right ? '✓' : '✕';
    els.resultTitle.textContent = title;
    els.why.textContent = [saved.settings.explain ? item.why : '', extra].filter(Boolean).join(' ');
    els.why.hidden = !els.why.textContent;
    els.next.innerHTML = last ? 'Results &rsaquo;' : 'Next &rsaquo;';
    // The verdict takes the lifelines' place, between the question and the
    // answers, so it never covers the answer just picked.
    $('screen-quiz').classList.add('is-answered');
    els.result.hidden = false;
    els.next.focus({ preventScroll: true });
    // If it all doesn't fit, scroll as far as showing the answers needs,
    // but never so far that the verdict goes off the top.
    const app = document.querySelector('.app');
    const over = els.answers.getBoundingClientRect().bottom - app.getBoundingClientRect().bottom + 12;
    const room = els.result.getBoundingClientRect().top - app.getBoundingClientRect().top - 8;
    if (over > 0) app.scrollBy({ top: Math.min(over, room), behavior: 'smooth' });
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

  /* ───────── report a question ───────── */

  // Remember what was asked, so a mistake can be reported later from Settings.
  function remember(item) {
    saved.recent = [{ id: item.id, mode: run.mode, at: Date.now() }]
      .concat((saved.recent || []).filter((r) => r.id !== item.id))
      .slice(0, RECENT_MAX);
  }

  // Leave empty to use the share sheet / clipboard. Set an address and
  // reports open an email to it instead.
  const REPORT_EMAIL = '';
  let reporting = null;

  function drawReport() {
    const recent = (saved.recent || []).map((r) => Object.assign({ item: Bank.get(r.id) }, r)).filter((r) => r.item);
    $('recent-empty').hidden = recent.length > 0;
    $('recent').replaceChildren(...recent.map((r) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'recent__item';
      b.innerHTML = '<span class="recent__q"></span><span class="recent__a"></span>';
      b.children[0].textContent = r.item.q;
      b.children[1].textContent = 'Answer: ' + r.item.answers[0] + ' · ' + MODE_NAMES[r.mode];
      b.addEventListener('click', () => openReport(r.item));
      li.appendChild(b);
      return li;
    }));
  }

  function openReport(item) {
    reporting = item;
    $('report-q').textContent = '“' + item.q + '” — marked answer: ' + item.answers[0];
    $('report-note').value = '';
    $('report-form').reset();
    $('report-dialog').showModal();
  }

  $('report-dialog').addEventListener('close', async () => {
    if ($('report-dialog').returnValue !== 'send' || !reporting) return;
    const reason = (new FormData($('report-form')).get('reason')) || 'Something else';
    const note = $('report-note').value.trim();
    const q = reporting;
    const text = [
      'Endless Quiz — question report',
      'Question: ' + q.q,
      'Marked answer: ' + q.answers[0],
      'Other answers: ' + q.answers.slice(1).join(' / '),
      'Problem: ' + reason,
      note ? 'Note: ' + note : '',
      'Ref: ' + q.id + ' · build ' + BUILD,
    ].filter(Boolean).join('\n');
    reporting = null;
    if (REPORT_EMAIL) {
      location.href = 'mailto:' + REPORT_EMAIL + '?subject=' + encodeURIComponent('Question report: ' + q.id) + '&body=' + encodeURIComponent(text);
      return;
    }
    const how = await Native.share(text);
    if (how === 'copied') toast('Report copied — paste it into an email to us');
    else if (how === 'shared') toast('Thanks — we’ll check it');
    else if (how === 'failed') toast('Couldn’t send from here');
  });

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

    $('fin-mode').textContent = climb ? QUICK_NAMES[run.track] + ' · level ' + run.level : MODE_NAMES[run.mode];
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
    if (run.earned && !saved.tips.earned) {
      $('fin-note').textContent = ($('fin-note').textContent + ' Spend coins on lifelines — that’s enough for about one.').trim();
      saved.tips.earned = true;
      persist();
    }
    $('fin-share').hidden = climb;
    $('fin-share').textContent = daily ? 'Share result' : 'Challenge a friend';
    $('fin-again').hidden = !(run.mode === 'quick' || (climb && starsFor(run.falls) < 3));
    $('fin-again').textContent = climb ? 'Try for ★★★' : 'Deal another';
    // only one loud button: Next level when there is one
    $('fin-again').classList.toggle('btn--primary', !climb);
    $('fin-again').classList.toggle('btn--ghost', climb);
    $('fin-next').hidden = !(climb && run.level < trackLength(run.track));
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
      s.style.left = (i / (QUICK_DIFFS.length - 1) * 100) + '%';
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
    // a browser on iPhone or iPad can't buzz; the app can
    $('set-vibrate-row').hidden = !Native.canHaptic();
    drawReminder();

    const rows = [
      ['Coins', saved.coins],
      ['Levels', levelsClimbed() + '/' + totalLevels()],
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
      if (key === 'vibrate' && e.target.checked) buzz('right');
    });
  });

  /* ───────── daily reminder ───────── */

  const hourLabel = (h) => (h % 12 || 12) + (h < 12 ? 'am' : 'pm');

  function drawReminder() {
    const native = Reminders.available();
    const on = native && saved.settings.reminder;
    $('set-reminder').checked = on;
    $('set-reminder').disabled = !native;
    $('reminder-row').classList.toggle('is-unavailable', !native);
    $('reminder-note').textContent = native
      ? 'A nudge when the Daily Quiz is ready'
      : 'Comes with the iPhone and Android app';
    $('reminder-time-row').hidden = !on;
    const select = $('reminder-hour');
    if (!select.options.length) {
      for (let h = 7; h <= 22; h++) select.add(new Option(hourLabel(h), h));
    }
    select.value = saved.settings.reminderHour;
  }

  // Redo the week of reminders from the current state. Cheap, and safe to
  // call often: it clears the queue and schedules it again.
  function syncReminders() {
    Reminders.sync(saved.settings, Daily.isDone(saved.daily[Daily.today()]), Daily.streak(saved.daily));
  }

  $('set-reminder').addEventListener('change', async (e) => {
    if (e.target.checked) {
      const allowed = await Reminders.requestPermission();
      if (!allowed) {
        e.target.checked = false;
        toast('Turn on notifications for Endless Quiz in your phone’s settings');
        return;
      }
    }
    saved.settings.reminder = e.target.checked;
    persist();
    drawReminder();
    syncReminders();
    if (e.target.checked) toast('Reminder set for ' + hourLabel(saved.settings.reminderHour));
  });
  $('reminder-hour').addEventListener('change', (e) => {
    saved.settings.reminderHour = Number(e.target.value);
    persist();
    syncReminders();
    toast('Reminder moved to ' + hourLabel(saved.settings.reminderHour));
  });

  $('reset').addEventListener('click', () => els.confirm.showModal());
  els.confirm.addEventListener('close', () => {
    if (els.confirm.returnValue !== 'reset') return;
    saved = Store.reset();
    Reminders.cancelAll();
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
  $('fin-again').addEventListener('click', () => (run.mode === 'climb' ? startClimb(run.track, run.level) : startQuick()));
  $('fin-next').addEventListener('click', () => startClimb(run.track, run.level + 1));
  $('fin-levels').addEventListener('click', () => goTo('levels'));
  $('fin-home').addEventListener('click', () => goTo('home'));
  els.lifelines.querySelectorAll('[data-life]').forEach((b) => b.addEventListener('click', () => useLifeline(b.dataset.life)));
  $('go-report').addEventListener('click', () => goTo('report'));
  $('report-back').addEventListener('click', () => goTo('settings'));
  els.next.addEventListener('click', next);

  // Keyboard: 1–4 or A–D to answer, Enter / Space for next. Lifelines:
  // H 50/50, P ask the audience (poll), S swap, R second chance.
  document.addEventListener('keydown', (e) => {
    if (coaching()) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); coachNext(); }
      return;
    }
    if (!$('screen-quiz').classList.contains('is-active') || els.confirm.open || $('report-dialog').open) return;
    const k = e.key.toUpperCase();
    const pick = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : KEYS.indexOf(k);
    if (!run.answered && pick >= 0) {
      const btn = els.answers.querySelectorAll('.answer')[pick];
      if (btn && !btn.disabled) btn.click();
    } else if (!run.answered && 'HPSR'.includes(k) && k.length === 1) {
      useLifeline({ H: 'fifty', P: 'audience', S: 'skip', R: 'retry' }[k]);
    } else if (run.answered && (e.key === 'Enter' || e.key === ' ') && document.activeElement !== els.next) {
      e.preventDefault();
      els.next.click();
    }
  });

  /* ───────── an app, not a page ─────────
     The stylesheet already stops text being selected. These close the
     other doors: the long-press / right-click menu, copying (in case a
     selection sneaks through), and dragging pictures out. The seed box
     still works normally, since it's the one place people type. */
  const typing = (e) => e.target.closest && e.target.closest('input, textarea');
  document.addEventListener('contextmenu', (e) => { if (!typing(e)) e.preventDefault(); });
  ['copy', 'cut'].forEach((type) => document.addEventListener(type, (e) => { if (!typing(e)) e.preventDefault(); }));
  document.addEventListener('dragstart', (e) => e.preventDefault());
  document.addEventListener('selectstart', (e) => { if (!typing(e)) e.preventDefault(); });

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
    if (document.visibilityState !== 'visible') return;
    checkForUpdate();
    Native.capTextSize();
    syncReminders();   // a new day may have started while the app was away
  });

  applySettings();
  Native.capTextSize();
  drawHome();
  checkForUpdate();
  // In the app, the phone keeps its own copy of progress. If the web copy was
  // cleared or is older, swap the phone's in before anything else happens.
  Store.restore().then((changed) => {
    if (changed) { saved = Store.load(); applySettings(); drawHome(); }
    restored = true;
    maybeWelcome();
    syncReminders();
  });
})();
