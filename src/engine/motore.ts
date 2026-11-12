// Il motore lato pagina: crea gli anelli condivisi, i sei Worker (4 deck, 5-way, FX+master)
// e il worklet d'uscita; inoltra i comandi; raccoglie i meter.
//
//   deck0..3 --main_i--> five --five--> fx --uscita--> worklet --> casse + 5 vie (AnalyserNode)
//        \----send_i (4 bus stereo)------>/  ^
//                                  mic ------/ (dal worklet, se il microfono è acceso)

import { creaAnello, type SpecAnello } from "./ring";
import { creaVie, type Vie } from "../audio/vie";
import type { Dispositivo, MessaggioDalMotore, MessaggioMotore, Ruolo, SpecMotore } from "./protocollo";

export interface StatoDeck {
  livello: number;
  pos: number;
  durata: number;
  suona: boolean;
}

export interface StatoMeter {
  deck: StatoDeck[];
  five: number;
  ritorni: number[];
  clipRitorni: number[];
  master: number[];
  led: number;
  protezione: number;
  buchi: number;
  riserva: number; // il punto più basso dell'anello d'uscita nell'ultimo secondo, in frame
}

export class Motore {
  readonly ctx: AudioContext;
  vie: Vie | null = null;
  readonly meter: StatoMeter = {
    deck: [0, 1, 2, 3].map(() => ({ livello: 0, pos: 0, durata: 0, suona: false })),
    five: 0,
    ritorni: [0, 0, 0, 0],
    clipRitorni: [0, 0, 0, 0],
    master: [0, 0, 0, 0],
    led: 0,
    protezione: 1,
    buchi: 0,
    riserva: 0,
  };
  private readonly worker = new Map<string, Worker>();
  private anelli: Record<string, SpecAnello> = {};
  private nodo: AudioWorkletNode | null = null;
  private micSorgente: MediaStreamAudioSourceNode | null = null;

  // Frame tenuti pronti nell'anello d'uscita. 1024 (21 ms) sul computer; il telefono ne chiede di più:
  // lì i Worker si fermano a tratti, e una riserva lunga copre la pausa al prezzo di un ritardo sui comandi.
  private readonly riserva: number;

  private constructor(ctx: AudioContext, riserva: number) {
    this.ctx = ctx;
    this.riserva = riserva;
  }

  static async crea(riserva = 1024): Promise<Motore> {
    if (!crossOriginIsolated) throw new Error("La pagina non è isolata (COOP/COEP): SharedArrayBuffer non disponibile.");
    const ctx = new AudioContext({ latencyHint: "interactive" });
    const m = new Motore(ctx, Math.max(1024, Math.min(48000, Math.round(riserva))));
    await m.avvia();
    return m;
  }

  private async avvia(): Promise<void> {
    const fs = this.ctx.sampleRate;
    const ctl = new SharedArrayBuffer(4);
    const a: Record<string, SpecAnello> = {};
    for (let i = 0; i < 4; i++) {
      a[`main${i}`] = creaAnello(2, 2048);
      a[`send${i}`] = creaAnello(8, 2048);
    }
    a.five = creaAnello(2, 2048);
    a.mic = creaAnello(1, 2048);
    let capacita = 4096;
    while (capacita < this.riserva * 2) capacita *= 2;
    a.uscita = creaAnello(2, capacita);
    this.anelli = a;
    const spec: SpecMotore = { sampleRate: fs, ctl, anelli: a, obiettivo: 384, obiettivoUscita: this.riserva };

    const pronti: Promise<void>[] = [];
    const lancia = (chiave: string, ruolo: Ruolo, i?: number): void => {
      const w = new Worker(new URL("./motore.worker.ts", import.meta.url), { type: "module", name: chiave });
      pronti.push(
        new Promise((ok, ko) => {
          w.onerror = (e) => ko(new Error(`${chiave}: ${e.message}`));
          w.onmessage = (ev: MessageEvent<MessaggioDalMotore>) => {
            if (ev.data.tipo === "pronto") {
              w.onmessage = (e2: MessageEvent<MessaggioDalMotore>) => this.ricevi(e2.data);
              ok();
            }
          };
        }),
      );
      const msg: MessaggioMotore = { tipo: "avvia", ruolo, i, spec };
      w.postMessage(msg);
      this.worker.set(chiave, w);
    };
    for (let i = 0; i < 4; i++) lancia(`deck${i}`, "deck", i);
    lancia("five", "five");
    lancia("fx", "fx");
    await Promise.all(pronti);

    await this.ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}uscita.worklet.js`);
    this.nodo = new AudioWorkletNode(this.ctx, "maelcum-uscita", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 1,
      channelCountMode: "explicit",
      processorOptions: { uscita: a.uscita, mic: a.mic, ctl },
    });
    this.nodo.port.onmessage = (ev: MessageEvent<{ buchi: number; riserva: number }>) => {
      this.meter.buchi = ev.data.buchi;
      this.meter.riserva = ev.data.riserva;
    };
    this.nodo.connect(this.ctx.destination);
    this.vie = creaVie(this.ctx, this.nodo);
  }

  private ricevi(m: MessaggioDalMotore): void {
    if (m.tipo !== "meter") return;
    if (m.ruolo === "deck") {
      const d = this.meter.deck[m.i];
      d.livello = m.v;
      d.pos = m.pos;
      d.durata = m.durata;
      d.suona = m.suona;
    } else if (m.ruolo === "five") this.meter.five = m.v;
    else {
      this.meter.ritorni = m.ritorni;
      this.meter.clipRitorni = m.clipRitorni;
      this.meter.master = m.master;
      this.meter.led = m.led;
      this.meter.protezione = m.protezione;
    }
  }

  private manda(chiave: string, m: MessaggioMotore, trasferisci: Transferable[] = []): void {
    this.worker.get(chiave)?.postMessage(m, trasferisci);
  }

  // Un comando del pannello: instradato al Worker che ospita il dispositivo.
  param(dev: Dispositivo, p: string, v: number, i?: number): void {
    const m: MessaggioMotore = { tipo: "param", dev, p, v, i };
    if (dev === "channel" || dev === "send" || dev === "filtro") {
      if (i === undefined) for (let k = 0; k < 4; k++) this.manda(`deck${k}`, m);
      else this.manda(`deck${i}`, m);
    } else if (dev === "five") this.manda("five", m);
    else this.manda("fx", m);
  }

  versione5way(completo: boolean): void {
    this.manda("five", { tipo: "versione5way", completo });
  }

  // Le eco si tarano sul tempo della traccia base.
  tempoEco(bpm: number): void {
    this.manda("fx", { tipo: "bpm", bpm });
  }

  // La traccia arriva già al livello del mixer: picco a -12 dBFS = 0 dBu (montaggio.md).
  // Gli stem di un brano passano lo stesso picco (il più alto fra loro), così i fader a unity
  // rifanno il missaggio originale invece di portare ogni stem allo stesso livello.
  caricaTraccia(i: number, buf: AudioBuffer, piccoComune?: number): void {
    const L = new Float32Array(buf.getChannelData(0));
    const R = new Float32Array(buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0));
    const p = piccoComune ?? picco(buf);
    this.manda(`deck${i}`, { tipo: "traccia", L, R, trim: 0.25 / p }, [L.buffer, R.buffer]);
  }

  // Un deck torna vuoto: resta muto e il suo meter si spegne.
  svuotaDeck(i: number): void {
    const L = new Float32Array(0);
    const R = new Float32Array(0);
    this.manda(`deck${i}`, { tipo: "traccia", L, R, trim: 1 }, [L.buffer, R.buffer]);
  }

  // Avvia o ferma più deck insieme, allineati al campione: tutti sullo stesso frame del loro anello,
  // così dopo una pausa gli stem restano a fase.
  play(deck: number[], on: boolean, riavvolgi = false): void {
    if (on) void this.ctx.resume();
    const scritti = new Int32Array(this.anelli.main0.sab, 0, 1);
    const daFrame = (Atomics.load(scritti, 0) + 1024) | 0;
    for (const i of deck) this.manda(`deck${i}`, { tipo: "play", on, daFrame, riavvolgi });
  }

  async microfono(on: boolean): Promise<void> {
    if (!this.nodo) return;
    if (on && !this.micSorgente) {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      this.micSorgente = this.ctx.createMediaStreamSource(s);
      this.micSorgente.connect(this.nodo);
    } else if (!on && this.micSorgente) {
      this.micSorgente.mediaStream.getTracks().forEach((t) => t.stop());
      this.micSorgente.disconnect();
      this.micSorgente = null;
    }
  }
}

export function picco(buf: AudioBuffer): number {
  let p = 1e-9;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let k = 0; k < d.length; k++) p = Math.max(p, Math.abs(d[k]));
  }
  return p;
}
