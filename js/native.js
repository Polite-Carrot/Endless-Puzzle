/* The phone, when there is one.
 *
 * Inside the iOS / Android app, Capacitor puts native plugins on
 * window.Capacitor.Plugins. In a plain browser they aren't there, so every
 * helper here falls back to what the web can do, or quietly does nothing.
 *
 *   Native.haptic(kind)   'tap' | 'right' | 'wrong' — a real buzz via the
 *                          Haptics plugin (works on iPhone, which the web's
 *                          navigator.vibrate never has)
 *   Native.share(text)    the system share sheet (Share plugin; Android's
 *                          WebView has no navigator.share of its own)
 *   Native.prefs          the Preferences plugin — the phone's own key/value
 *                          storage, which iOS won't clear to free up space —
 *                          or null in a browser */
window.Native = (function () {
  'use strict';

  const cap = window.Capacitor;
  const isNative = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const plugin = (name) => (isNative && cap.Plugins && cap.Plugins[name]) || null;

  function haptic(kind) {
    const H = plugin('Haptics');
    try {
      if (H) {
        if (kind === 'right') H.notification({ type: 'SUCCESS' });
        else if (kind === 'wrong') H.notification({ type: 'ERROR' });
        else H.impact({ style: 'LIGHT' });
        return;
      }
      if (navigator.vibrate) navigator.vibrate(kind === 'wrong' ? 120 : kind === 'right' ? 30 : 12);
    } catch (e) { /* no buzz is fine */ }
  }

  // Can this device buzz at all?
  const canHaptic = () => !!plugin('Haptics') || !!navigator.vibrate;

  // Resolves 'shared', 'copied', 'cancelled' or 'failed'.
  async function share(text) {
    const S = plugin('Share');
    try {
      if (S) { await S.share({ text }); return 'shared'; }
      if (navigator.share) { await navigator.share({ text }); return 'shared'; }
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch (e) {
      const msg = String((e && (e.name || e.message)) || '');
      return /abort|cancel/i.test(msg) ? 'cancelled' : 'failed';
    }
  }

  // The phone's text-size setting (Dynamic Type on iPhone, Font size on
  // Android) would otherwise scale the game's text — on Android it does by
  // default — and a quiz laid out to fit one screen spills off it. Smaller
  // than standard is fine; bigger is capped at standard (1 = 100%). Called
  // at start-up and whenever the app comes back, as the setting may have
  // changed while it was away.
  async function capTextSize() {
    const T = plugin('TextZoom');
    if (!T) return;
    try {
      const { value } = await T.getPreferred();
      await T.set({ value: Math.min(value || 1, 1) });
    } catch (e) { /* leave it as it is */ }
  }

  return { isNative, haptic, canHaptic, share, capTextSize, prefs: plugin('Preferences') };
})();
