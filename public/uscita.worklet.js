// Ultimo anello del motore: legge l'uscita stereo calcolata dai Worker e la suona;
// scrive l'ingresso del microfono nell'anello del mic. Stessa disposizione di src/engine/ring.ts.
class Anello {
  constructor(spec) {
    this.canali = spec.canali;
    this.capacita = spec.capacita;
    this.maschera = spec.capacita - 1;
    this.testa = new Int32Array(spec.sab, 0, 2);
    this.dati = new Float32Array(spec.sab, 8, spec.canali * spec.capacita);
  }
  disponibili() { return (Atomics.load(this.testa, 0) - Atomics.load(this.testa, 1)) | 0; }
  spazio() { return this.capacita - this.disponibili(); }
}

class Uscita extends AudioWorkletProcessor {
  constructor(opzioni) {
    const { uscita, mic, ctl } = opzioni.processorOptions;
    super();
    this.uscita = new Anello(uscita);
    this.mic = new Anello(mic);
    this.ctl = new Int32Array(ctl);
    this.buchi = 0;
    this.blocchi = 0;
    this.riserva = 1e9; // il punto più basso dell'anello nel secondo
  }
  process(inputs, outputs) {
    const out = outputs[0];
    const n = out[0].length;
    const u = this.uscita;
    const pronti = u.disponibili();
    if (pronti < this.riserva) this.riserva = pronti;
    if (pronti >= n) {
      const r = Atomics.load(u.testa, 1);
      for (let c = 0; c < 2; c++) {
        const base = c * u.capacita;
        const o = out[c];
        if (!o) continue;
        for (let k = 0; k < n; k++) o[k] = u.dati[base + ((r + k) & u.maschera)];
      }
      Atomics.store(u.testa, 1, (r + n) | 0);
    } else {
      this.buchi++;
    }
    const inp = inputs[0] && inputs[0][0];
    const m = this.mic;
    if (inp && m.spazio() >= n) {
      const w = Atomics.load(m.testa, 0);
      for (let k = 0; k < n; k++) m.dati[(w + k) & m.maschera] = inp[k];
      Atomics.store(m.testa, 0, (w + n) | 0);
    }
    Atomics.add(this.ctl, 0, 1);
    Atomics.notify(this.ctl, 0);
    if (++this.blocchi >= 375) {
      this.port.postMessage({ buchi: this.buchi, riserva: this.riserva });
      this.buchi = 0;
      this.riserva = 1e9;
      this.blocchi = 0;
    }
    return true;
  }
}
registerProcessor("maelcum-uscita", Uscita);
