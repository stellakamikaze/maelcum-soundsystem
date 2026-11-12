// Anello audio su SharedArrayBuffer: un solo scrittore e un solo lettore, canali separati.
// Intestazione Int32: [0] frame scritti, [1] frame letti (contatori che crescono e si
// avvolgono); dati Float32: canale c occupa [c * capacita, (c + 1) * capacita).
// La copia di public/uscita.worklet.js usa la stessa disposizione.

export interface SpecAnello {
  sab: SharedArrayBuffer;
  canali: number;
  capacita: number; // potenza di 2
}

export function creaAnello(canali: number, capacita: number): SpecAnello {
  if (capacita & (capacita - 1)) throw new Error("capacità non potenza di 2");
  const sab = new SharedArrayBuffer(8 + canali * capacita * 4);
  return { sab, canali, capacita };
}

export class Anello {
  readonly canali: number;
  readonly capacita: number;
  private readonly testa: Int32Array;
  private readonly dati: Float32Array;
  private readonly maschera: number;

  constructor(spec: SpecAnello) {
    this.canali = spec.canali;
    this.capacita = spec.capacita;
    this.maschera = spec.capacita - 1;
    this.testa = new Int32Array(spec.sab, 0, 2);
    this.dati = new Float32Array(spec.sab, 8, spec.canali * spec.capacita);
  }

  disponibili(): number {
    return (Atomics.load(this.testa, 0) - Atomics.load(this.testa, 1)) | 0;
  }

  spazio(): number {
    return this.capacita - this.disponibili();
  }

  scritti(): number {
    return Atomics.load(this.testa, 0);
  }

  scrivi(sorgenti: ArrayLike<Float32Array | undefined>, n: number): void {
    const w = Atomics.load(this.testa, 0);
    for (let c = 0; c < this.canali; c++) {
      const s = sorgenti[c];
      const base = c * this.capacita;
      for (let k = 0; k < n; k++) this.dati[base + ((w + k) & this.maschera)] = s ? s[k] : 0;
    }
    Atomics.store(this.testa, 0, (w + n) | 0);
  }

  leggi(destinazioni: ArrayLike<Float32Array>, n: number): void {
    const r = Atomics.load(this.testa, 1);
    for (let c = 0; c < this.canali; c++) {
      const d = destinazioni[c];
      const base = c * this.capacita;
      for (let k = 0; k < n; k++) d[k] = this.dati[base + ((r + k) & this.maschera)];
    }
    Atomics.store(this.testa, 1, (r + n) | 0);
  }
}

// Battito condiviso: chi legge o scrive un anello incrementa e sveglia gli altri.
export function battito(ctl: Int32Array): void {
  Atomics.add(ctl, 0, 1);
  Atomics.notify(ctl, 0);
}
