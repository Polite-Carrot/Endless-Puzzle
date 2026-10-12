/* Daily Quiz reminders — local notifications scheduled on the phone itself.
 *
 * Only the native app can do this: it uses Capacitor's LocalNotifications
 * plugin, which iOS and Android deliver even when the game is closed. In a
 * plain browser there is no plugin, `available` is false, and Settings says
 * reminders come with the app.
 *
 * WHY A WEEK OF ONE-OFFS, NOT ONE REPEATING ALARM. A repeating alarm would
 * nag on days the quiz is already done, and it couldn't mention the streak.
 * So the next seven days are scheduled as separate notifications, skipping
 * today if it's played or the time has passed, and the whole set is redone
 * whenever the game opens, comes back on screen, finishes a daily, or the
 * setting changes. Someone who opens the game at least once a week always
 * has a week of reminders queued; someone who stops playing gets a week of
 * them and then silence, which is the polite way round. */
window.Reminders = (function () {
  'use strict';

  const DAYS_AHEAD = 7;
  const FIRST_ID = 1001;           // ids 1001–1007, one per day ahead

  function plugin() {
    const cap = window.Capacitor;
    if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return null;
    return (cap.Plugins && cap.Plugins.LocalNotifications) || null;
  }

  const available = () => !!plugin();

  // Ask for permission. Resolves true if notifications are allowed.
  async function requestPermission() {
    const ln = plugin();
    if (!ln) return false;
    try {
      let status = await ln.checkPermissions();
      if (status.display === 'prompt' || status.display === 'prompt-with-rationale') {
        status = await ln.requestPermissions();
      }
      return status.display === 'granted';
    } catch (e) {
      return false;
    }
  }

  // The notifications that should be queued, given today's state. Pure, so
  // it can be checked without a phone: no plugin calls in here.
  //   now      — a Date
  //   hour     — 0–23, when to remind
  //   doneToday, streak — from the daily records
  function plan(now, hour, doneToday, streak) {
    const out = [];
    for (let k = 0; k < DAYS_AHEAD + 1 && out.length < DAYS_AHEAD; k++) {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, hour, 0, 0, 0);
      if (k === 0 && (doneToday || at <= now)) continue;
      // Only the first reminder can speak to the streak: by the one after,
      // it depends on days that haven't been played yet.
      const first = out.length === 0;
      // The streak is on the line in two cases: the reminder is today's and
      // today isn't played yet, or today is played and this is tomorrow's.
      // If today's reminder time has passed with today unplayed, the streak
      // ends at midnight, so tomorrow's reminder mustn't boast about it.
      const atStake = first && streak > 0 && (k === 0 || doneToday);
      out.push({
        id: FIRST_ID + out.length,
        at,
        title: atStake ? 'Keep your ' + streak + '-day streak going 🔥' : 'Your Daily Quiz is ready',
        body: atStake
          ? 'Today’s 5 questions are waiting — don’t let the streak slip.'
          : 'Five fresh questions, the same for everyone. How many can you get?',
      });
    }
    return out;
  }

  async function cancelAll() {
    const ln = plugin();
    if (!ln) return;
    const ids = [];
    for (let i = 0; i < DAYS_AHEAD; i++) ids.push({ id: FIRST_ID + i });
    try { await ln.cancel({ notifications: ids }); } catch (e) { /* none queued */ }
  }

  // Bring the queue in line with the setting and today's state.
  async function sync(settings, doneToday, streak) {
    const ln = plugin();
    if (!ln) return;
    await cancelAll();
    if (!settings.reminder) return;
    const status = await ln.checkPermissions().catch(() => ({ display: 'denied' }));
    if (status.display !== 'granted') return;
    const queue = plan(new Date(), settings.reminderHour, doneToday, streak);
    try {
      await ln.schedule({
        notifications: queue.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          // allowWhileIdle so Android's battery saver doesn't swallow it
          schedule: { at: n.at, allowWhileIdle: true },
        })),
      });
    } catch (e) { /* scheduling refused: nothing more to do */ }
  }

  return { available, requestPermission, plan, sync, cancelAll };
})();
