// sounds.js — Web Audio API sound effects for Capitalism.io
// Pure JS synthesis, no external files. Gracefully degrades if Web Audio unavailable.

const Sounds = (() => {
  let _ctx = null;
  let enabled = true;

  function ctx() {
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    if (!_ctx) {
      try {
        _ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        return null;
      }
    }
    if (_ctx.state === 'suspended') {
      _ctx.resume().catch(() => {});
    }
    return _ctx;
  }

  function toggle() {
    enabled = !enabled;
    return enabled;
  }

  // ---- Helper: play a note via oscillator ----
  function _playNote(frequency, type, startTime, duration, gainPeak, ac) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(frequency, startTime);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }

  // ---- Helper: white noise burst ----
  function _playNoise(startTime, duration, gainPeak, ac) {
    const bufferSize = Math.floor(ac.sampleRate * duration);
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    const source = ac.createBufferSource();
    source.buffer = buffer;

    // Band-pass filter to make it sound like dice rattling
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 0.8;

    const gain = ac.createGain();
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);

    gain.gain.setValueAtTime(gainPeak, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    source.start(startTime);
    source.stop(startTime + duration + 0.05);
  }

  // ---- Dice roll: short noise burst ----
  function dice() {
    if (!enabled) return;
    const ac = ctx();
    if (!ac) return;
    const now = ac.currentTime;
    _playNoise(now, 0.12, 0.4, ac);
    _playNoise(now + 0.08, 0.1, 0.3, ac);
    _playNoise(now + 0.16, 0.1, 0.25, ac);
  }

  // ---- Buy property: ascending 3-note ding (C-E-G) ----
  function buy() {
    if (!enabled) return;
    const ac = ctx();
    if (!ac) return;
    const now = ac.currentTime;
    _playNote(523.25, 'sine', now,        0.35, 0.22, ac); // C5
    _playNote(659.25, 'sine', now + 0.14, 0.35, 0.22, ac); // E5
    _playNote(783.99, 'sine', now + 0.28, 0.5,  0.28, ac); // G5
    // slight triangle overtone for richness
    _playNote(523.25, 'triangle', now,        0.2, 0.06, ac);
    _playNote(783.99, 'triangle', now + 0.28, 0.4, 0.08, ac);
  }

  // ---- Rent paid: descending 2-note (G-C) ----
  function rent() {
    if (!enabled) return;
    const ac = ctx();
    if (!ac) return;
    const now = ac.currentTime;
    _playNote(392.00, 'sine', now,        0.3, 0.18, ac); // G4
    _playNote(261.63, 'sine', now + 0.18, 0.45, 0.2, ac); // C4
  }

  // ---- GO bonus: bright single ding ----
  function goBonus() {
    if (!enabled) return;
    const ac = ctx();
    if (!ac) return;
    const now = ac.currentTime;
    _playNote(880,    'sine',     now,        0.5, 0.3,  ac); // A5
    _playNote(1108.7, 'sine',     now + 0.12, 0.4, 0.2,  ac); // C#6
    _playNote(880,    'triangle', now,        0.4, 0.08, ac);
  }

  // ---- Bankrupt: descending sad tones ----
  function bankrupt() {
    if (!enabled) return;
    const ac = ctx();
    if (!ac) return;
    const now = ac.currentTime;
    _playNote(392.00, 'sawtooth', now,        0.4, 0.15, ac); // G4
    _playNote(349.23, 'sawtooth', now + 0.2,  0.4, 0.15, ac); // F4
    _playNote(311.13, 'sawtooth', now + 0.4,  0.4, 0.15, ac); // Eb4
    _playNote(261.63, 'sawtooth', now + 0.65, 0.8, 0.18, ac); // C4
  }

  // ---- Card drawn: paper shuffle sound ----
  function card() {
    if (!enabled) return;
    const ac = ctx();
    if (!ac) return;
    const now = ac.currentTime;
    // Quick high noise burst + short bright note
    _playNoise(now, 0.06, 0.25, ac);
    _playNote(1046.5, 'sine', now + 0.04, 0.2, 0.12, ac); // C6
  }

  // Public API
  return {
    dice,
    buy,
    rent,
    goBonus,
    bankrupt,
    card,
    toggle,
    get enabled() { return enabled; },
  };
})();
