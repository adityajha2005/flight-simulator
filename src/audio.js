export function createAudio() {
  let ctx = null;
  let engine = null;
  let engineGain = null;
  let filter = null;
  let windGain = null;
  let stallTimer = 0;

  function ensure() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();

      engine = ctx.createOscillator();
      engine.type = "sawtooth";
      engine.frequency.value = 70;

      filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 320;
      filter.Q.value = 0.7;

      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engine.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engine.start();

      const seconds = 2;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;

      const wind = ctx.createBufferSource();
      wind.buffer = buffer;
      wind.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = "bandpass";
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      wind.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      wind.start();
    }

    if (ctx.state === "suspended") ctx.resume();
  }

  function update(throttle, speed, braking, dt) {
    if (!ctx) return;
    const freq = 62 + throttle * 78 + Math.min(speed, 120) * 0.18;
    engine.frequency.setTargetAtTime(freq, ctx.currentTime, 0.08);
    filter.frequency.setTargetAtTime(240 + throttle * 1100, ctx.currentTime, 0.08);
    const volume = 0.008 + throttle * 0.04 + (braking ? 0.006 : 0);
    engineGain.gain.setTargetAtTime(volume, ctx.currentTime, 0.08);
    const wind = Math.min(0.035, Math.max(0, speed - 20) * 0.00022);
    windGain.gain.setTargetAtTime(wind, ctx.currentTime, 0.15);
    stallTimer = Math.max(0, stallTimer - dt);
  }

  function blip(freq, duration, type = "sine", volume = 0.04) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  return {
    ensure,
    update,
    blip,
    stall(dt) {
      if (!ctx || stallTimer > 0) return;
      stallTimer = 0.42;
      blip(280, 0.12, "square", 0.025);
    },
    crash() {
      blip(70, 0.45, "sawtooth", 0.07);
      blip(42, 0.55, "triangle", 0.05);
    },
    success() {
      blip(523, 0.12, "sine", 0.045);
      setTimeout(() => blip(659, 0.14, "sine", 0.045), 120);
      setTimeout(() => blip(784, 0.24, "sine", 0.04), 250);
    },
    gate() {
      blip(740, 0.07, "sine", 0.035);
      setTimeout(() => blip(980, 0.1, "sine", 0.03), 80);
    },
  };
}
