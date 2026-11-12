// I quattro pedali dei bus FX. Non fanno parte del mixer di Filippo: in Live erano effetti
// di Live (montaggio.md, P3: eco al 100 % wet seguita da un Saturator). Qui sono scritti a mano,
// stereo, 100 % wet. Due manopole per pedale: a e b, da 0 a 100.

export interface Pedale {
  readonly nome: string;
  readonly manopole: [string, string];
  a: number;
  b: number;
  bpm?(v: number): void;
  elabora(inL: Float32Array, inR: Float32Array, outL: Float32Array, outR: Float32Array, n: number): void;
}

const BPM_PARTENZA = 120;

const sat = (x: number): number => Math.tanh(x * 0.9) / 0.9;

class Linea {
  private readonly buf: Float32Array;
  private w = 0;
  constructor(max: number) {
    this.buf = new Float32Array(max);
  }
  leggi(ritardo: number): number {
    // interpolazione lineare: il TEMPO si può girare mentre suona (effetto nastro)
    const n = this.buf.length;
    const p = this.w - ritardo;
    const i = Math.floor(p);
    const f = p - i;
    const a = this.buf[((i % n) + n) % n];
    const b = this.buf[(((i + 1) % n) + n) % n];
    return a + (b - a) * f;
  }
  scrivi(x: number): void {
    this.buf[this.w] = x;
    this.w = (this.w + 1) % this.buf.length;
  }
}

// Il ritardo più lungo: semiminima puntata a 60 bpm con il TEMPO al massimo.
const RITARDO_MAX = 3;

// Eco a nastro: ritardo che scivola verso il TEMPO, passa-banda nell'anello, saturazione.
class Eco implements Pedale {
  readonly manopole: [string, string] = ["TEMPO", "RIPETIZIONI"];
  a = 50;
  b = 45;
  private readonly lL: Linea;
  private readonly lR: Linea;
  private tempoBase: number;
  private rit: number;
  private lpL = 0;
  private lpR = 0;
  private hpL = 0;
  private hpR = 0;
  constructor(readonly nome: string, private readonly fs: number, private readonly pingpong: boolean, private readonly battiti: number) {
    this.lL = new Linea(Math.ceil(fs * RITARDO_MAX) + 2);
    this.lR = new Linea(Math.ceil(fs * RITARDO_MAX) + 2);
    this.tempoBase = (battiti * 60) / BPM_PARTENZA;
    this.rit = this.tempoSecondi() * fs;
  }
  bpm(v: number): void {
    this.tempoBase = (this.battiti * 60) / v;
  }
  private tempoSecondi(): number {
    // a 50 % il tempo base; da metà a 2 volte il tempo base
    return Math.min(RITARDO_MAX, this.tempoBase * Math.pow(2, (this.a - 50) / 50));
  }
  elabora(inL: Float32Array, inR: Float32Array, outL: Float32Array, outR: Float32Array, n: number): void {
    const meta = this.tempoSecondi() * this.fs;
    const fb = Math.min(1.08, (this.b / 100) * 1.1);
    const clp = 1 - Math.exp((-2 * Math.PI * 2600) / this.fs);
    const chp = 1 - Math.exp((-2 * Math.PI * 140) / this.fs);
    for (let k = 0; k < n; k++) {
      this.rit += (meta - this.rit) * 0.00012; // il nastro accelera e rallenta, non salta
      const yL = this.lL.leggi(this.rit);
      const yR = this.lR.leggi(this.rit);
      this.lpL += (yL - this.lpL) * clp;
      this.lpR += (yR - this.lpR) * clp;
      this.hpL += (this.lpL - this.hpL) * chp;
      this.hpR += (this.lpR - this.hpR) * chp;
      const rL = sat((this.lpL - this.hpL) * fb);
      const rR = sat((this.lpR - this.hpR) * fb);
      if (this.pingpong) {
        const m = 0.5 * (inL[k] + inR[k]);
        this.lL.scrivi(m + rR);
        this.lR.scrivi(rL);
      } else {
        this.lL.scrivi(inL[k] + rL);
        this.lR.scrivi(inR[k] + rR);
      }
      outL[k] = yL;
      outR[k] = yR;
    }
  }
}

// Molla: dispersione con una catena di allpass (il "boing"), anello di ritardo corto con perdite.
class Molla implements Pedale {
  readonly manopole: [string, string] = ["CODA", "TONO"];
  a = 55;
  b = 50;
  private readonly ap: Float32Array[];
  private readonly lin: Linea[];
  private lp = [0, 0];
  constructor(readonly nome: string, private readonly fs: number) {
    this.ap = [new Float32Array(24 * 2), new Float32Array(24 * 2)];
    this.lin = [new Linea(Math.ceil(fs * 0.2)), new Linea(Math.ceil(fs * 0.2))];
  }
  elabora(inL: Float32Array, inR: Float32Array, outL: Float32Array, outR: Float32Array, n: number): void {
    const coda = 0.55 + 0.42 * (this.a / 100);
    const c = 1 - Math.exp((-2 * Math.PI * (900 + 5000 * (this.b / 100))) / this.fs);
    const g = 0.62;
    const ritardi = [0.0337 * this.fs, 0.0411 * this.fs];
    for (let ch = 0; ch < 2; ch++) {
      const inp = ch === 0 ? inL : inR;
      const out = ch === 0 ? outL : outR;
      const s = this.ap[ch];
      const lin = this.lin[ch];
      for (let k = 0; k < n; k++) {
        let x = inp[k] + lin.leggi(ritardi[ch]) * coda;
        for (let j = 0; j < 24; j++) {
          // allpass del primo ordine: y = -g x + x1 + g y1
          const y = -g * x + s[2 * j] + g * s[2 * j + 1];
          s[2 * j] = x;
          s[2 * j + 1] = y;
          x = y;
        }
        this.lp[ch] += (x - this.lp[ch]) * c;
        lin.scrivi(sat(this.lp[ch]));
        out[k] = this.lp[ch];
      }
    }
  }
}

// Riverbero lungo: Freeverb (8 comb con passa-basso + 4 allpass per lato).
class Riverbero implements Pedale {
  readonly manopole: [string, string] = ["CODA", "TONO"];
  a = 60;
  b = 45;
  private readonly comb: { buf: Float32Array; i: number; f: number }[][];
  private readonly all: { buf: Float32Array; i: number }[][];
  constructor(readonly nome: string, fs: number) {
    const k = fs / 44100;
    const cl = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
    const al = [556, 441, 341, 225];
    this.comb = [0, 23].map((sp) => cl.map((l) => ({ buf: new Float32Array(Math.round((l + sp) * k)), i: 0, f: 0 })));
    this.all = [0, 23].map((sp) => al.map((l) => ({ buf: new Float32Array(Math.round((l + sp) * k)), i: 0 })));
  }
  elabora(inL: Float32Array, inR: Float32Array, outL: Float32Array, outR: Float32Array, n: number): void {
    const room = 0.7 + 0.28 * (this.a / 100);
    const damp = 0.15 + 0.6 * (1 - this.b / 100);
    for (let ch = 0; ch < 2; ch++) {
      const out = ch === 0 ? outL : outR;
      const cs = this.comb[ch];
      const as = this.all[ch];
      for (let k = 0; k < n; k++) {
        const x = (inL[k] + inR[k]) * 0.015;
        let y = 0;
        for (const c of cs) {
          const o = c.buf[c.i];
          c.f = o * (1 - damp) + c.f * damp;
          c.buf[c.i] = x + c.f * room;
          c.i = (c.i + 1) % c.buf.length;
          y += o;
        }
        for (const a of as) {
          const b = a.buf[a.i];
          a.buf[a.i] = y + b * 0.5;
          a.i = (a.i + 1) % a.buf.length;
          y = b - y;
        }
        out[k] = y;
      }
    }
  }
}

export function creaPedali(fs: number): Pedale[] {
  // Nastro sulla semiminima puntata, ping-pong sulla semiminima: il BPM vero arriva con la
  // traccia, la manopola TEMPO lo sposta.
  return [
    new Eco("ECO A NASTRO", fs, false, 1.5),
    new Eco("ECO PING-PONG", fs, true, 1),
    new Molla("MOLLA", fs),
    new Riverbero("RIVERBERO", fs),
  ];
}
