/* Little blips made with oscillators, so nothing has to be downloaded.
 *
 * As in the jar game, the audio device is only held open while something is
 * sounding: a running AudioContext keeps the output stream open, which hums
 * on a lot of hardware. It is suspended after a quiet spell and never opened
 * at all while sound is switched off. */
window.Sound = (function () {
  'use strict';

  let ctx = null;
  let idle = 0;
  let enabled = true;

  function context() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    clearTimeout(idle);
    idle = setTimeout(() => { if (ctx) ctx.suspend(); }, 1500);
    return ctx;
  }

  // notes: [frequency, start offset s, length s]
  function play(notes, type, volume) {
    if (!enabled) return;
    const ac = context();
    if (!ac) return;
    const now = ac.currentTime;
    notes.forEach(([freq, at, len]) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + at);
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(volume, now + at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + len);
      osc.connect(gain).connect(ac.destination);
      osc.start(now + at);
      osc.stop(now + at + len + 0.02);
    });
  }

  return {
    setEnabled(on) { enabled = on; if (!on && ctx) ctx.suspend(); },
    tap()   { play([[660, 0, 0.06]], 'triangle', 0.12); },
    right() { play([[660, 0, 0.12], [990, 0.09, 0.2]], 'triangle', 0.2); },
    wrong() { play([[220, 0, 0.16], [165, 0.12, 0.26]], 'square', 0.07); },
    fifty() { play([[520, 0, 0.08], [390, 0.06, 0.12]], 'triangle', 0.14); },
    fall()  { play([[523, 0, 0.1], [392, 0.08, 0.1], [262, 0.16, 0.24]], 'triangle', 0.15); },
    win()   { play([[523, 0, 0.14], [659, 0.12, 0.14], [784, 0.24, 0.14], [1047, 0.36, 0.4]], 'triangle', 0.2); },
  };
})();
