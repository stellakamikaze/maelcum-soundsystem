// Le 5 vie dello stack, misurate sull'uscita vera del mixer. Ogni via ha il suo AnalyserNode dietro
// un incrocio a 24 dB/ott sulle frequenze del 5-way di Filippo (80 / 170 / 1,2k / 6k Hz). È una presa
// d'ascolto: i filtri stanno su un ramo che non torna alle casse, il suono resta quello del codice gen~.
//
//   worklet d'uscita --+--> casse
//                      +--> incrocio via 0 --> AnalyserNode 0 --> misura() --> segui() --> membrane
//                      +--> ...
//                      +--> incrocio via 4 --> AnalyserNode 4
//
// Silenzio: rms 0, punta 0, inviluppi che tornano a 0, membrane a riposo. Nessuna oscillazione
// nasce qui dentro: il moto è solo il campione più forte dell'ultimo tratto di segnale.

export const INCROCI = [80, 170, 1200, 6000];
export const NOMI_VIE = ["SUB", "KICK", "MID", "HIGH", "SUPER"];

// Livello RMS di ogni via, in dBFS, a cui la membrana arriva a fine corsa. Misurati su Midnight
// Stars coi comandi di default (tools/prova-suono.mjs li stampa): il 95° percentile, arrotondato.
export const FONDO_CORSA_DB = [-25, -25, -25, -29, -32];
export const GAMMA_DB = 18; // il brano si muove di 10-20 dB per via: la scala li usa quasi tutti
// Campioni su cui si misura l'RMS di ogni via: a 48 kHz, 2048 sono due periodi a 50 Hz.
export const FINESTRE_RMS = [2048, 1024, 512, 512, 512];

export interface Lettura {
  rms: number;
  punta: number; // il campione più forte del tratto, col suo segno
}

export interface StatoVia {
  veloce: number; // inviluppo che segue i colpi, 0..1
  lento: number; // inviluppo di circa 0,4 s, 0..1
  forma: number; // forma d'onda vera, -1..1
}

export const statoVuoto = (): StatoVia => ({ veloce: 0, lento: 0, forma: 0 });

// La punta guarda gli ultimi n campioni, cioè il tratto dall'ultimo frame. L'RMS guarda gli ultimi
// nLivello: su una via bassa la finestra deve contenere un periodo intero, o il livello dipende dalla fase.
export function misura(x: Float32Array, n: number, nLivello = n): Lettura {
  const daPunta = Math.max(0, x.length - n);
  const daLivello = Math.max(0, x.length - nLivello);
  let q = 0;
  let punta = 0;
  for (let k = Math.min(daPunta, daLivello); k < x.length; k++) {
    const v = x[k];
    if (k >= daLivello) q += v * v;
    if (k >= daPunta && Math.abs(v) > Math.abs(punta)) punta = v;
  }
  return { rms: Math.sqrt(q / Math.max(1, x.length - daLivello)), punta };
}

const fra = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

// rms -> 0..1 sulla scala della via: 0 a GAMMA_DB sotto il fondo corsa.
export function livello(rms: number, via: number): number {
  const db = 20 * Math.log10(Math.max(rms, 1e-9));
  return fra((db - FONDO_CORSA_DB[via] + GAMMA_DB) / GAMMA_DB, 0, 1);
}

// Inviluppi a tempo vero: valgono uguale a 60 fps e a pochi fps.
const passo = (dt: number, tau: number): number => 1 - Math.exp(-dt / tau);

export function segui(s: StatoVia, l: Lettura, via: number, dt: number): void {
  const liv = livello(l.rms, via);
  s.veloce += (liv - s.veloce) * passo(dt, liv > s.veloce ? 0.016 : 0.08);
  s.lento += (liv - s.lento) * passo(dt, 0.4);
  // Una punta vale circa il doppio dell'RMS: a fondo corsa la forma arriva a ±1.
  const rif = 2 * Math.pow(10, FONDO_CORSA_DB[via] / 20);
  s.forma = liv > 0 ? fra(l.punta / rif, -1, 1) : 0;
}

// Posizione della membrana in frazioni di corsa. Con la riduzione del movimento resta solo
// l'inviluppo lento, a un terzo della corsa: il cono respira col livello e non vibra.
// La forma d'onda dà il tremito vero, col suo segno; il resto della corsa è l'inviluppo. Sulle vie
// basse pesa meno: a 60 fps un basso a 50 Hz crea aliasing, una pulsazione che dipende dalla nota
// e non dal livello, e sul SUB coprirebbe la dinamica.
export const PESO_FORMA = [0.12, 0.2, 0.3, 0.3, 0.3];
export function spostamento(s: StatoVia, via: number, calma: boolean): number {
  const w = PESO_FORMA[via];
  return calma ? s.lento / 3 : (1 - w) * s.veloce + w * s.forma;
}

// La spinta dei bassi sul legno delle casse: stessa forma d'onda, niente moto con la riduzione.
export function scossa(sub: StatoVia, kick: StatoVia, calma: boolean): number {
  return calma ? 0 : 0.7 * sub.forma + 0.3 * kick.forma;
}

export interface Vie {
  analisi: AnalyserNode[];
  leggi(dt: number): Lettura[];
}

export function creaVie(ctx: BaseAudioContext, sorgente: AudioNode): Vie {
  const filtro = (type: BiquadFilterType, hz: number): BiquadFilterNode => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    f.Q.value = Math.SQRT1_2;
    return f;
  };
  const analisi = NOMI_VIE.map((_, via) => {
    const catena: AudioNode[] = [sorgente];
    const sotto = INCROCI[via - 1];
    const sopra = INCROCI[via];
    if (sotto) catena.push(filtro("highpass", sotto), filtro("highpass", sotto));
    if (sopra) catena.push(filtro("lowpass", sopra), filtro("lowpass", sopra));
    const a = ctx.createAnalyser();
    a.fftSize = 2048;
    a.smoothingTimeConstant = 0;
    catena.push(a);
    catena.reduce((da, a2) => da.connect(a2));
    return a;
  });
  const campioni = new Float32Array(2048);
  return {
    analisi,
    leggi(dt) {
      const n = fra(Math.round(dt * ctx.sampleRate), 256, campioni.length);
      return analisi.map((a, via) => {
        a.getFloatTimeDomainData(campioni);
        return misura(campioni, n, FINESTRE_RMS[via]);
      });
    },
  };
}
