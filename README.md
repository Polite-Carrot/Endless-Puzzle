# Endless Quiz

A quiz game in the same visual style as Color Match & Merge: bright sky,
thick ink outlines, hard drop shadows.

**Status: early build.** 100 Climb levels across four difficulty tracks, the Daily Quiz, Quick Play with
categories and seeds, settings and the guide all work. The bank holds 767
written and fact-table questions plus endless generated maths — at least 20
for every category at every difficulty.

Open `index.html` in a browser. No build step or server is needed.

Played online at https://polite-carrot.github.io/Endless-Puzzle/ via GitHub Pages.

**Every release, bump the build number in three places together:** the `?v=`
on the links in `index.html`, `BUILD` in `js/app.js`, and `version.json`
(currently 12).
GitHub Pages lets browsers keep files for ten minutes — the page itself
included — so a phone can keep running an old build. The `?v=` stops a new
page loading an old stylesheet; `version.json` (fetched uncached on start
and whenever the game comes back on screen) lets an old page notice a newer
build exists and reload itself onto it, between questions.

<p>
  <img src="screenshots/home.png" width="200" alt="Home">
  <img src="screenshots/levels-hard.png" width="200" alt="The Climb, Hard track">
  <img src="screenshots/climb-question.png" width="200" alt="A Climb question">
  <img src="screenshots/climb-done.png" width="200" alt="A level climbed">
</p>
<p>
  <img src="screenshots/quick-setup.png" width="200" alt="Quick Play setup">
  <img src="screenshots/quick-question.png" width="200" alt="A Quick Play question">
  <img src="screenshots/quick-results.png" width="200" alt="Results">
  <img src="screenshots/daily-done.png" width="200" alt="Daily Quiz">
</p>
<p>
  <img src="screenshots/settings.png" width="200" alt="Settings">
  <img src="screenshots/howto.png" width="200" alt="How to play">
</p>

## Quick Play

Laid out like the jar game's Random Puzzle: a **difficulty slider** (Mixed,
Easy, Normal, Hard, Extra Hard), **category chips** to pick what you're
quizzed on, a **− / +** count from 5 to 30, and a **seed**.

Every deal comes from a seed — typed, or picked at random when the box is
blank. The same seed with the same settings deals the same questions with
the answers in the same places, so **Challenge a friend** on the results
card shares the seed and settings along with your score.

If the chosen difficulty and categories can't fill the quiz, the screen says
how many you'll get. With Maths ticked that never happens — maths is
generated, so it tops up any gap.

## Daily Quiz

Five questions a day — easy, easy, normal, hard, extra hard — the same for
everyone. **The date is the seed** (12 Oct 2026 deals from `20261012`), so
nothing is downloaded: two people opening the same day get the same
questions with the answers in the same places. A new quiz arrives at the
player's own midnight.

- **One go.** Each answer is saved the moment it is given, so leaving
  part-way and coming back carries on rather than re-rolls. The day's
  question ids are saved when it's started, so growing the bank mid-day
  can't swap a half-played quiz for another.
- **No 50/50**, so every score is comparable.
- **Streak** counts back from today. Today not being played yet doesn't
  break it until midnight passes.
- **Share** copies a spoiler-free grid: `🟩🟩🟥🟩🟩 4/5`.

## The Climb

**Four tracks — Easy, Normal, Hard and Extra Hard** — picked from tabs along
the top of the level screen. Each track is its own run of levels with its own
stars and progress; finish a level to unlock the next one in that track.
Every track starts with **25 levels** (100 in all), and growing one is a
one-number change — see **Adding levels** below.

Each level is a ladder of **20 rungs**, easiest at the bottom. Each track
shifts its mix from level 1 to its last level:

| Track      | Level 1 (easy/normal/hard/xhard) | Level 25 |
|------------|----------------------------------|----------|
| Easy       | 18 / 2 / 0 / 0                   | 12 / 7 / 1 / 0 |
| Normal     | 6 / 12 / 2 / 0                   | 2 / 12 / 5 / 1 |
| Hard       | 0 / 6 / 12 / 2                   | 0 / 2 / 12 / 6 |
| Extra Hard | 0 / 0 / 8 / 12                   | 0 / 0 / 2 / 18 |

**Safety nets** at rungs 4, 8, 12 and 16: a wrong answer drops you to the
last net you passed. **Every rung has a backup question**, so the way back
up after a fall asks something new: a rung's first showing asks its main
question, the second its backup, and after that a stand-in of the same
difficulty from the bank.

**Stars:** no falls ★★★, one or two ★★, more ★. Replaying keeps your best.
A climb in progress is saved — track, level, rung, falls and all. Stars are
saved per track and level, as `normal-4`.

### Adding levels

1. Open `tools/build-levels.js`.
2. Raise `levels` on the track you want to grow — say Easy from 25 to 50.
3. Run `node tools/build-levels.js`.

**Levels that already exist are kept exactly as they are** — they're read
back out of `js/levels.js` and only the new ones are dealt — so nobody's
stars end up on a level that has changed under them. The builder refuses to
run if a kept level points at a question that has since left the bank.

A track's mix is set by **anchors at level numbers**, not fractions of the
track, so lengthening a track never changes the levels already in it. Levels
past the last anchor keep its mix; to make level 50 harder than level 25,
add an anchor for it, e.g. `[50, 6, 11, 3, 0]` on Easy.

`node tools/build-levels.js --rebuild-all` deals every level again — for
when you mean to reshuffle everything, before launch say.

### Why levels are baked

Levels are written out in full, as question references, rather than dealt
when the game loads. The bank will keep growing, and if levels were dealt
live, adding one question would reshuffle every level after it. Baked, a
level stays the level it was.

The builder deals written questions **least recently used first** across
all four tracks, spreads categories within each level, and never asks the
same fact twice in a level. About one slot in eight is generated maths. Its
report, now:

- 4,000 question slots (100 levels × 20 rungs × main + backup); 526 generated
- 656 distinct written/table facts used, ~5 times each across all tracks
- within a track, a fact comes back after at least 4 levels (typically 5–9)

## Coins and the 50/50

- Correct answers pay coins: Easy 5, Normal 10, Hard 15, Extra Hard 25.
- The **50/50** removes two wrong answers and costs coins. Its price
  **doubles each time it is used in a game** (25, 50, 100…). It can be used
  once per question, and a question answered with it pays half.

## The question bank

Questions come from three places, all with the same shape:
`{ id, difficulty, category, q, answers: [correct, ...3 wrong], why }`.

| Source | Where | How many |
|--------|-------|---------:|
| Written by hand | `js/questions.js` | 413 |
| Fact tables — capitals, elements, planets, baby animals, animal groups, animal kinds, plurals, opposites, spellings, shapes, units and time | `js/bank.js` | 354 |
| Generators — 22 kinds of maths and Roman numerals | `js/bank.js` | endless |

**Fact tables** turn one checked row into one or two questions (Italy → Rome
asks both ways round). Wrong answers are written per row wherever a careless
pick could also be right: a group of geese is a gaggle but also a flock, so
"flock" is never offered. Reverse capital questions offer countries from the
same part of the world, so you can't rule them out by continent.

**One fact, one appearance.** "What is the capital of Italy?" and "Rome is the
capital of which country?" are two questions but one fact; every question
carries a `fact` key, and the level builder, the Daily and Quick Play never
put both halves in the same game. Generated maths that lands on a question
already written by hand rolls again, and every written question has its own
wording.

**Generators** work the answer out rather than having it written, so it
can't be wrong. A generated question is named by a reference like
`g:times12:48213` — the generator and a seed — and the same reference always
makes the same question. That is what lets a Climb level store a question
as a few characters.

    node tools/check-bank.js

checks every written and table question and 2,000 seeds of every generator:
four different answers, the right one never repeated among the wrong ones,
known category and difficulty, an explanation, no duplicates. Run it after
adding questions.

| Category  | Easy | Normal | Hard | Extra Hard |
|-----------|-----:|-------:|-----:|-----------:|
| Maths     | 7 + generated | 6 + generated | 6 + generated | 4 + generated |
| Space     | 21 | 22 | 22 | 21 |
| Science   | 21 | 22 | 22 | 23 |
| Geography | 22 | 22 | 37 | 32 |
| Nature    | 21 | 21 | 22 | 22 |
| History   | 21 | 22 | 22 | 22 |
| Words     | 22 | 21 | 22 | 22 |
| General   | 21 | 22 | 21 | 22 |

Those are distinct facts. **Every category has at least 20 at every
difficulty**, so a 20-question Quick Play game on a single category never
runs short — checked by dealing all 40 combinations (8 categories × 4
difficulties + Mixed) and confirming 20 different questions each time.

## Settings

Sound effects, vibration (only offered where the browser can vibrate —
iPhone and iPad browsers can't), and explanations after each answer. Also
shows your coins, Climb levels and daily streak, with a **Reset progress**
button behind a confirmation.

## Keeping progress

Coins, the climb in progress, stars per level, daily results, Quick Play
bests and settings live in the browser's own storage (`js/store.js`). Storage is
tested with a write-and-read-back before it is trusted; if the browser
refuses it (a private window, say) the game keeps playing from memory and
the home screen says plainly that progress won't be saved.

## Sound

Blips are made with oscillators, so nothing is downloaded. As in the jar
game, the audio device is suspended after a second and a half of quiet so
it can't hum, and is never opened while sound is off.

## Keyboard

`1`–`4` or `A`–`D` to answer · `H` for the 50/50 · `Enter` for the next question.

## Layout

```
index.html        every screen: home, climb levels, question, results, daily,
                  quick play, settings, how to play
styles.css        all styling (tokens shared with Color Match & Merge)
fonts.css         Baloo 2 + Nunito, inlined (copied from Color Match & Merge)
assets/           app icon: app-icon.png is the 1024px master; the others are
                  sized from it (home screen, manifest, favicon)
manifest.webmanifest  name and icons for installing to a home screen
version.json      the current build, checked on start to pick up updates
js/questions.js   categories, difficulties, the hand-written questions
js/bank.js        fact tables, generators, and the assembled bank  (no DOM)
js/levels.js      generated — the Climb's levels per track, as question references
js/store.js       saving progress, and whether it can be trusted
js/sound.js       oscillator blips
js/daily.js       the daily seed, streak and week   (no DOM)
js/app.js         screens and the shared question screen for all three modes
tools/check-bank.js    checks every question the bank can make
tools/build-levels.js  builds js/levels.js: keeps existing levels, deals new ones,
                       and reports on reuse
```

Questions are stored as `{ id, difficulty, category, q, answers, why }`, with
the correct answer first in `answers`. The app shuffles them when it shows a
question. Stick to facts that don't go out of date.
