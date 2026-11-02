// 声景系统：WebAudio 程序合成，零音频素材。
// 瓷鸣 = 高频正弦快衰减；窑火 = 滤波白噪声；江水/雨/夜风 = 不同滤波的噪声层；
// 鸟鸣/人声 = 随机短音簇；金缮 = 上升和弦。

const NOISE_SECONDS = 2;

function makeNoiseBuffer(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

// 听瓷辨器：敲击声依器物状态而异。完好者分音多、衰减长，清越如磬；
// 破碎者分音少、噪声重，声沙哑；修复后居中——这是「声、色、形」里先听的那一味。
const KNOCK_DEFS = {
  intact: { base: 1180, partials: [1, 2.76, 5.4], decay: 2.2, gain: .05, noiseGain: .05, noiseFreq: 2600 },
  repaired: { base: 940, partials: [1, 2.28, 4.1], decay: 1.4, gain: .048, noiseGain: .16, noiseFreq: 1700 },
  broken: { base: 430, partials: [1, 1.72], decay: .42, gain: .05, noiseGain: .55, noiseFreq: 900 }
};

const AMBIENT_DEFS = {
  kiln: { filter: 'lowpass', freq: 220, q: .6, gain: .05, lfo: null },
  noon: { filter: 'bandpass', freq: 480, q: .8, gain: .016, lfo: { rate: .07, depth: 160 } },
  water: { filter: 'bandpass', freq: 620, q: .9, gain: .03, lfo: { rate: .16, depth: 240 } },
  rain: { filter: 'highpass', freq: 900, q: .5, gain: .028, lfo: { rate: .3, depth: 300 } },
  workshop: { filter: 'bandpass', freq: 340, q: 1.1, gain: .022, lfo: { rate: .11, depth: 120 } },
  night: { filter: 'lowpass', freq: 130, q: .7, gain: .034, lfo: { rate: .05, depth: 60 } }
};

export function createAudio() {
  let ctx = null, master = null, noiseBuffer = null;
  let current = null; // {source, gain, lfo, extras[]}
  let birdsTimer = null, murmurTimer = null, enabled = false;

  function ensure() {
    if (ctx) return ctx;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
    noiseBuffer = makeNoiseBuffer(ctx);
    return ctx;
  }

  function note(freq = 880, duration = .7, volume = .03, type = 'triangle') {
    if (!enabled || !ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(volume, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + duration);
    o.connect(g).connect(master);
    o.start(); o.stop(ctx.currentTime + duration);
  }

  function stopCurrent() {
    if (!current) return;
    try { current.source.stop(); } catch { /* already stopped */ }
    current.lfo?.stop();
    for (const extra of current.extras) clearInterval(extra);
    current.extras = [];
    current = null;
  }

  function startAmbient(key) {
    if (!enabled || !ctx || !noiseBuffer || AMBIENT_DEFS[key] === current?.key) return;
    stopCurrent();
    const def = AMBIENT_DEFS[key] ?? AMBIENT_DEFS.noon;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer; source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = def.filter; filter.frequency.value = def.freq; filter.Q.value = def.q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(def.gain, ctx.currentTime + 1.6);
    let lfo = null;
    if (def.lfo) {
      lfo = ctx.createOscillator(), lfo.frequency.value = def.lfo.rate;
      const depth = ctx.createGain(); depth.gain.value = def.lfo.depth;
      lfo.connect(depth).connect(filter.frequency); lfo.start();
    }
    source.connect(filter).connect(gain).connect(master);
    source.start();
    current = { key, source, gain, lfo, extras: [] };
    // 点缀层：按地点挂随机短音（鸟鸣 / 人声 / 窑鸣）。
    if (key === 'rain' || key === 'water') {
      const timer = setInterval(() => Math.random() < .55 && chirp(), 4200);
      current.extras.push(timer);
    }
    if (key === 'workshop' || key === 'noon') {
      const timer = setInterval(() => Math.random() < .5 && murmur(), 3600);
      current.extras.push(timer);
    }
    if (key === 'night') {
      const timer = setInterval(() => Math.random() < .4 && note([523, 659, 784][Math.floor(Math.random() * 3)], 2.4, .012, 'sine'), 5200);
      current.extras.push(timer);
    }
    if (key === 'kiln') {
      const timer = setInterval(() => Math.random() < .35 && note([1318, 1568, 988][Math.floor(Math.random() * 3)], 1.6, .01, 'sine'), 6400);
      current.extras.push(timer);
    }
  }

  function chirp() {
    if (!enabled || !ctx) return;
    const base = 1800 + Math.random() * 1400;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      setTimeout(() => note(base + Math.random() * 300, .09, .012, 'sine'), i * 140);
    }
  }

  function murmur() {
    if (!enabled || !ctx) return;
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
      setTimeout(() => note(140 + Math.random() * 180, .12, .009, 'sawtooth'), i * (90 + Math.random() * 120));
    }
  }

  // 瓷鸣：高频正弦快速衰减，带一点上滑，像冷釉相触。
  function chime(base = 1047) {
    if (!enabled || !ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(base, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(base * 1.26, ctx.currentTime + .18);
    g.gain.setValueAtTime(.045, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.0008, ctx.currentTime + .5);
    o.connect(g).connect(master); o.start(); o.stop(ctx.currentTime + .5);
  }

  // 咔哒：极短瓷片碰撞声（吸附到位的"咔哒"）。程序合成、零素材；
  // 未启用 / 无 AudioContext 时静默降级，不新增音频文件。
  function tick() {
    if (!enabled || !ctx || !noiseBuffer) return;
    const now = ctx.currentTime;
    const burst = ctx.createBufferSource();
    burst.buffer = noiseBuffer;
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass'; bf.frequency.value = 3200 + Math.random() * 900; bf.Q.value = 2.2;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(.4, now);
    bg.gain.exponentialRampToValueAtTime(.0001, now + .045);
    burst.connect(bf).connect(bg).connect(master);
    burst.start(now); burst.stop(now + .06);
    note(1900 + Math.random() * 400, .07, .018, 'sine');
  }

  function chord() {
    [220, 277, 330, 440].forEach((f, i) => setTimeout(() => note(f, 1.8, .024, 'sine'), i * 95));
  }

  // 轻叩瓷身：先是一声短促的接触噪声，再是瓷体共振分音。
  function knock(state = 'intact') {
    if (!enabled || !ctx || !noiseBuffer) return;
    const def = KNOCK_DEFS[state] ?? KNOCK_DEFS.intact;
    const now = ctx.currentTime;
    const burst = ctx.createBufferSource();
    burst.buffer = noiseBuffer;
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass'; bf.frequency.value = def.noiseFreq; bf.Q.value = 1.1;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(def.noiseGain, now);
    bg.gain.exponentialRampToValueAtTime(.0001, now + .09);
    burst.connect(bf).connect(bg).connect(master);
    burst.start(now); burst.stop(now + .14);
    def.partials.forEach((p, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(def.base * p, now);
      const decay = def.decay / (1 + i * .38);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(def.gain / (1 + i * .75), now + .006);
      g.gain.exponentialRampToValueAtTime(.0001, now + decay);
      o.connect(g).connect(master);
      o.start(now); o.stop(now + decay + .05);
    });
  }

  function vibrate(ms = 30) { navigator.vibrate?.(ms); }

  return {
    async enable() {
      ensure();
      await ctx.resume();
      enabled = true;
      return true;
    },
    async disable() {
      enabled = false;
      stopCurrent();
      if (ctx) await ctx.suspend();
    },
    get enabled() { return enabled; },
    chime, chord, note, chirp, knock, tick,
    ambient(key) { if (enabled && ctx) startAmbient(key); },
    quiet() { stopCurrent(); },
    vibrate
  };
}
