// Riddim di prova SINTETICO, scritto qui: one drop a 75 bpm in la minore, 8 battute.
// Quattro stem, uno per deck: batteria, basso, skank d'organo, melodica.
// Serve a suonare subito; si sostituisce trascinando un file su un deck.

export const BPM = 75;
const BATTUTE = 8;
const BEAT = 60 / BPM;
export const DURATA = BATTUTE * 4 * BEAT;
export const NOMI_STEM = ["Batteria", "Basso", "Skank", "Melodica"];

const hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

function inviluppo(g: GainNode, t: number, a: number, d: number, picco: number): void {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(picco, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function rumore(ctx: BaseAudioContext): AudioBuffer {
  const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = b.getChannelData(0);
  let s = 12345;
  for (let k = 0; k < d.length; k++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    d[k] = (s / 0x3fffffff) - 1;
  }
  return b;
}

function batteria(ctx: OfflineAudioContext): void {
  const n = rumore(ctx);
  for (let bar = 0; bar < BATTUTE; bar++) {
    const t0 = bar * 4 * BEAT;
    // one drop: cassa e rim sul terzo battito
    const t3 = t0 + 2 * BEAT;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(110, t3);
    o.frequency.exponentialRampToValueAtTime(42, t3 + 0.18);
    inviluppo(g, t3, 0.003, 0.5, 0.9);
    o.connect(g).connect(ctx.destination);
    o.start(t3);
    o.stop(t3 + 0.6);
    const rim = ctx.createBufferSource();
    rim.buffer = n;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1900;
    bp.Q.value = 6;
    const gr = ctx.createGain();
    inviluppo(gr, t3, 0.001, 0.07, 0.9);
    rim.connect(bp).connect(gr).connect(ctx.destination);
    rim.start(t3, 0.3, 0.1);
    // charleston in terzine swing, aperto a fine battuta
    for (let q = 0; q < 8; q++) {
      const t = t0 + q * (BEAT / 2) + (q % 2 ? BEAT * 0.08 : 0);
      const h = ctx.createBufferSource();
      h.buffer = n;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 7000;
      const gh = ctx.createGain();
      const aperto = q === 7 && bar % 2 === 1;
      inviluppo(gh, t, 0.001, aperto ? 0.25 : 0.04, q % 2 ? 0.25 : 0.35);
      h.connect(hp).connect(gh).connect(ctx.destination);
      h.start(t, (q * 0.07) % 0.8, 0.3);
    }
  }
}

function basso(ctx: OfflineAudioContext): void {
  // [battito, durata in battiti, nota midi]; due battute che si ripetono
  const frase: [number, number, number][] = [
    [0, 0.75, 45], [1, 0.5, 45], [1.5, 0.5, 48], [2.5, 0.5, 52], [3, 0.75, 50],
    [4, 0.75, 45], [5, 0.5, 43], [5.5, 0.5, 45], [6.5, 0.5, 40], [7, 0.75, 43],
  ];
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 380;
  lp.Q.value = 0.9;
  lp.connect(ctx.destination);
  for (let rip = 0; rip < BATTUTE / 2; rip++) {
    for (const [b, d, nota] of frase) {
      const t = (rip * 8 + b) * BEAT;
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = hz(nota - 12);
      const s = ctx.createOscillator();
      s.frequency.value = hz(nota - 12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.7, t + 0.012);
      g.gain.setValueAtTime(0.6, t + d * BEAT - 0.04);
      g.gain.linearRampToValueAtTime(0, t + d * BEAT);
      o.connect(g);
      s.connect(g);
      g.connect(lp);
      o.start(t);
      s.start(t);
      o.stop(t + d * BEAT + 0.01);
      s.stop(t + d * BEAT + 0.01);
    }
  }
}

function skank(ctx: OfflineAudioContext): void {
  // organo "bubble" sul secondo e quarto battito; Am, Am, Dm, Em
  const accordi = [[57, 60, 64], [57, 60, 64], [62, 65, 69], [64, 67, 71]];
  for (let bar = 0; bar < BATTUTE; bar++) {
    const acc = accordi[bar % 4];
    for (const beat of [1, 3]) {
      const t = (bar * 4 + beat) * BEAT;
      const g = ctx.createGain();
      inviluppo(g, t, 0.004, 0.16, 0.22);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1400;
      bp.Q.value = 0.8;
      g.connect(bp).connect(ctx.destination);
      for (const nota of acc) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = hz(nota);
        o.connect(g);
        o.start(t);
        o.stop(t + 0.2);
      }
    }
  }
}

function melodica(ctx: OfflineAudioContext): void {
  // frase di quattro battute, poi quattro di silenzio: lo spazio per l'eco
  const frase: [number, number, number][] = [
    [0.5, 1, 76], [1.5, 0.5, 74], [2, 1.5, 72], [4.5, 0.5, 69], [5, 1, 72], [6, 2, 71],
    [8.5, 1, 76], [9.5, 0.5, 79], [10, 1.5, 77], [12, 0.5, 76], [12.5, 0.5, 74], [13, 3, 72],
  ];
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2400;
  lp.connect(ctx.destination);
  for (const [b, d, nota] of frase) {
    const t = b * BEAT;
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = hz(nota);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const gv = ctx.createGain();
    gv.gain.value = 3;
    vib.connect(gv).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.05);
    g.gain.setValueAtTime(0.16, t + d * BEAT - 0.06);
    g.gain.linearRampToValueAtTime(0, t + d * BEAT);
    o.connect(g).connect(lp);
    o.start(t);
    vib.start(t);
    o.stop(t + d * BEAT + 0.02);
    vib.stop(t + d * BEAT + 0.02);
  }
}

export async function creaRiddim(fs: number): Promise<AudioBuffer[]> {
  const voci = [batteria, basso, skank, melodica];
  return Promise.all(
    voci.map((v) => {
      const ctx = new OfflineAudioContext(2, Math.round(DURATA * fs), fs);
      v(ctx);
      return ctx.startRendering();
    }),
  );
}
