/// <reference lib="webworker" />
// Un Worker del motore. Tre ruoli, ognuno su un suo thread:
//   deck i  : lettore della traccia -> MC-CHANNEL -> MC-SEND -> MC-FILTRO   (anelli: main_i, send_i)
//   five    : somma dei 4 canali (DJ BUS) -> MC-5WAY                          (anello: five)
//   fx      : MC-MIC, bus FX 1-4 con reroute, pedali, MC-RET x4, fader dei ritorni,
//             somma master -> MC-MASTER -> protezione                         (anello: uscita)
// I processori sono il codice gen~ di Filippo tradotto da scripts/gen2worklet.mjs.

import { Anello, battito, type SpecAnello } from "./ring";
import { creaPedali, type Pedale } from "./pedali";
import type { MessaggioMotore, SpecMotore } from "./protocollo";

const B = 128;

interface ProcessoreGen {
  P: Record<string, number>;
  set(nome: string, v: number): void;
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
  port: { onmessage: ((ev: { data: unknown }) => void) | null; postMessage(m: unknown): void };
}
type Costruttore = new () => ProcessoreGen;

const registro = new Map<string, Costruttore>();
const ultimoMeter = new WeakMap<ProcessoreGen, number[]>();

async function caricaProcessori(fs: number, nomi: string[]): Promise<void> {
  const g = globalThis as unknown as Record<string, unknown>;
  g.sampleRate = fs;
  g.registerProcessor = (nome: string, C: Costruttore) => registro.set(nome, C);
  g.AudioWorkletProcessor = class {
    port: ProcessoreGen["port"];
    constructor() {
      const self = this as unknown as ProcessoreGen;
      this.port = { onmessage: null, postMessage: (m: unknown) => {
        const d = m as { meter?: number[] };
        if (d.meter) ultimoMeter.set(self, d.meter);
      } };
    }
  };
  const moduli: Record<string, () => Promise<unknown>> = {
    "mc-channel": () => import("../dsp/generated/mc-channel.js"),
    "mc-send": () => import("../dsp/generated/mc-send.js"),
    "mc-filtro": () => import("../dsp/generated/mc-filtro.js"),
    "mc-5way": () => import("../dsp/generated/mc-5way.js"),
    "mc-5way-s": () => import("../dsp/generated/mc-5way-s.js"),
    "mc-ret": () => import("../dsp/generated/mc-ret.js"),
    "mc-mic": () => import("../dsp/generated/mc-mic.js"),
    "mc-master": () => import("../dsp/generated/mc-master.js"),
  };
  for (const n of nomi) await moduli[n]();
}

// Un Param che il processore non ha (es. CROSSOVER sulla versione -S) si ignora.
function imposta(p: ProcessoreGen, nome: string, v: number): void {
  if (nome in p.P) p.set(nome, v);
}

function nuovo(nome: string): ProcessoreGen {
  const C = registro.get(nome);
  if (!C) throw new Error(`processore ${nome} non registrato`);
  return new C();
}

const stereo = (): Float32Array[] => [new Float32Array(B), new Float32Array(B)];
const picco = (a: Float32Array): number => {
  let m = 0;
  for (let k = 0; k < a.length; k++) {
    const v = Math.abs(a[k]);
    if (v > m) m = v;
  }
  return m;
};

let ctl: Int32Array;
const post = (m: unknown): void => (self as DedicatedWorkerGlobalScope).postMessage(m);

// Ciclo comune: lavora finché può, poi dorme sul battito senza bloccare il thread,
// così i messaggi (tracce, comandi) arrivano fra un giro e l'altro.
type AttesaAsincrona = (a: Int32Array, i: number, v: number, t: number) => { async: boolean; value: Promise<string> | string };
const waitAsync = (Atomics as unknown as { waitAsync?: AttesaAsincrona }).waitAsync;
const pausa = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function ciclo(passo: () => boolean): Promise<void> {
  for (;;) {
    const visto = Atomics.load(ctl, 0);
    let fatti = 0;
    while (passo()) {
      battito(ctl);
      if (++fatti > 64) break;
    }
    if (fatti > 64) {
      await pausa(0);
      continue;
    }
    if (waitAsync) {
      const r = waitAsync(ctl, 0, visto, 20);
      if (r.async) await r.value;
    } else {
      await pausa(1);
    }
  }
}

// ---------------- deck ----------------
function avviaDeck(spec: SpecMotore, i: number): void {
  const main = new Anello(spec.anelli[`main${i}`]);
  const send = new Anello(spec.anelli[`send${i}`]);
  const ch = nuovo("mc-channel");
  const sn = nuovo("mc-send");
  const fl = nuovo("mc-filtro");
  const dev: Record<string, ProcessoreGen> = { channel: ch, send: sn, filtro: fl };
  let L: Float32Array = new Float32Array(0);
  let R: Float32Array = new Float32Array(0);
  let pos = 0;
  let suona = false;
  let partenza = -1; // frame dell'anello da cui partire (deck allineati al campione)
  let fermata: number | null = null; // frame dell'anello a cui fermarsi, con la stessa regola
  let trim = 1;
  const inp = stereo();
  const oCh = stereo();
  const oSn = [stereo(), stereo(), stereo(), stereo(), stereo()];
  const oFl = stereo();
  const sendPiatti: Float32Array[] = [];
  for (let b = 1; b < 5; b++) sendPiatti.push(oSn[b][0], oSn[b][1]);
  let pk = 0;
  let blocchi = 0;

  self.onmessage = (ev: MessageEvent<MessaggioMotore>) => {
    const m = ev.data;
    if (m.tipo === "param" && dev[m.dev]) imposta(dev[m.dev], m.p, m.v);
    else if (m.tipo === "traccia") {
      L = m.L;
      R = m.R;
      trim = m.trim;
      pos = 0;
    } else if (m.tipo === "play") {
      if (m.on) {
        suona = true;
        partenza = m.daFrame;
        fermata = null;
      } else fermata = m.daFrame;
      if (m.riavvolgi) pos = 0;
    }
  };

  void ciclo(() => {
    if (main.disponibili() >= spec.obiettivo || send.spazio() < B) return false;
    const scritti = main.scritti();
    for (let k = 0; k < B; k++) {
      if (fermata !== null && ((scritti + k - fermata) | 0) >= 0) {
        suona = false;
        partenza = -1;
        fermata = null;
      }
      const attivo = suona && L.length > 0 && (partenza < 0 || ((scritti + k - partenza) | 0) >= 0);
      if (attivo) {
        inp[0][k] = L[pos] * trim;
        inp[1][k] = R[pos] * trim;
        pos++;
        if (pos >= L.length) pos = 0;
      } else {
        inp[0][k] = 0;
        inp[1][k] = 0;
      }
    }
    ch.process([inp], [oCh]);
    sn.process([oCh], oSn);
    fl.process([oSn[0]], [oFl]);
    main.scrivi(oFl, B);
    send.scrivi(sendPiatti, B);
    pk = Math.max(pk, picco(oCh[0]), picco(oCh[1]));
    if (++blocchi >= 12) {
      post({ tipo: "meter", ruolo: "deck", i, v: pk, pos, durata: L.length, suona });
      pk = 0;
      blocchi = 0;
    }
    return true;
  });
}

// ---------------- 5-way ----------------
function avviaFive(spec: SpecMotore): void {
  const mains = [0, 1, 2, 3].map((i) => new Anello(spec.anelli[`main${i}`]));
  const out = new Anello(spec.anelli.five);
  let fw = nuovo("mc-5way-s");
  const ultimi: Record<string, number> = {}; // tutti i comandi ricevuti, anche quelli della sola versione completa
  let completo = false;
  const somma = stereo();
  const tmp = stereo();
  const o = stereo();
  let pk = 0;
  let blocchi = 0;
  self.onmessage = (ev: MessageEvent<MessaggioMotore>) => {
    const m = ev.data;
    if (m.tipo === "param" && m.dev === "five") {
      imposta(fw, m.p, m.v);
      ultimi[m.p] = m.v;
    }
    else if (m.tipo === "versione5way" && m.completo !== completo) {
      fw = nuovo(m.completo ? "mc-5way" : "mc-5way-s");
      for (const k of Object.keys(ultimi)) imposta(fw, k, ultimi[k]);
      completo = m.completo;
    }
  };
  void ciclo(() => {
    if (out.disponibili() >= spec.obiettivo) return false;
    for (const a of mains) if (a.disponibili() < B) return false;
    somma[0].fill(0);
    somma[1].fill(0);
    for (const a of mains) {
      a.leggi(tmp, B);
      for (let k = 0; k < B; k++) {
        somma[0][k] += tmp[0][k];
        somma[1][k] += tmp[1][k];
      }
    }
    fw.process([somma], [o]);
    out.scrivi(o, B);
    pk = Math.max(pk, picco(o[0]), picco(o[1]));
    if (++blocchi >= 12) {
      post({ tipo: "meter", ruolo: "five", v: pk });
      pk = 0;
      blocchi = 0;
    }
    return true;
  });
}

// ---------------- FX + master ----------------
function avviaFx(spec: SpecMotore, fs: number): void {
  const sends = [0, 1, 2, 3].map((i) => new Anello(spec.anelli[`send${i}`]));
  const five = new Anello(spec.anelli.five);
  const mic = new Anello(spec.anelli.mic);
  const uscita = new Anello(spec.anelli.uscita);
  const mc = nuovo("mc-mic");
  const rets = [0, 1, 2, 3].map(() => nuovo("mc-ret"));
  const ms = nuovo("mc-master");
  const pedali: Pedale[] = creaPedali(fs);
  const faderRit = [0, 0, 0, 0];
  const gRit = [0, 0, 0, 0];

  const sendBuf = [0, 1, 2, 3].map(() => Array.from({ length: 8 }, () => new Float32Array(B)));
  const fiveBuf = stereo();
  const micIn = [new Float32Array(B)];
  const oMic = [stereo(), stereo(), stereo(), stereo(), stereo()];
  const bus = [stereo(), stereo(), stereo(), stereo()];
  const ped = [stereo(), stereo(), stereo(), stereo()];
  const oRet = rets.map(() => [stereo(), stereo(), stereo(), stereo(), stereo()]);
  const reroutePrec = [stereo(), stereo(), stereo(), stereo()]; // un blocco di ritardo nell'anello
  const somma = stereo();
  const oMs = stereo();
  let prot = 1;
  let blocchi = 0;
  let pkRit = [0, 0, 0, 0];

  self.onmessage = (ev: MessageEvent<MessaggioMotore>) => {
    const m = ev.data;
    if (m.tipo === "param") {
      if (m.dev === "mic") imposta(mc, m.p, m.v);
      else if (m.dev === "master") imposta(ms, m.p, m.v);
      else if (m.dev === "ret" && m.i !== undefined) imposta(rets[m.i], m.p, m.v);
      else if (m.dev === "faderRitorno" && m.i !== undefined) faderRit[m.i] = m.v;
      else if (m.dev === "pedale" && m.i !== undefined) {
        if (m.p === "a") pedali[m.i].a = m.v;
        else pedali[m.i].b = m.v;
      }
    } else if (m.tipo === "bpm") {
      for (const p of pedali) p.bpm?.(m.bpm);
    }
  };

  void ciclo(() => {
    if (uscita.disponibili() >= spec.obiettivoUscita) return false;
    if (five.disponibili() < B) return false;
    for (const s of sends) if (s.disponibili() < B) return false;
    for (let i = 0; i < 4; i++) sends[i].leggi(sendBuf[i], B);
    five.leggi(fiveBuf, B);
    if (mic.disponibili() >= B) mic.leggi(micIn, B);
    else micIn[0].fill(0);

    mc.process([[micIn[0], micIn[0]]], oMic);

    // bus FX: mandate dei canali + mandate del mic + reroute dei ritorni (blocco precedente)
    for (let b = 0; b < 4; b++) {
      for (let c = 0; c < 2; c++) {
        const d = bus[b][c];
        const m = oMic[b + 1][c];
        const rr = reroutePrec[b][c];
        for (let k = 0; k < B; k++) {
          let v = m[k] + rr[k];
          for (let i = 0; i < 4; i++) v += sendBuf[i][2 * b + c][k];
          d[k] = v;
        }
      }
    }
    for (let b = 0; b < 4; b++) {
      reroutePrec[b][0].fill(0);
      reroutePrec[b][1].fill(0);
    }
    somma[0].set(fiveBuf[0]);
    somma[1].set(fiveBuf[1]);
    for (let r = 0; r < 4; r++) {
      pedali[r].elabora(bus[r][0], bus[r][1], ped[r][0], ped[r][1], B);
      rets[r].process([ped[r]], oRet[r]);
      // reroute del ritorno r verso il bus b: uscite 1..4 del processore
      for (let b = 0; b < 4; b++) {
        const src = oRet[r][b + 1];
        for (let k = 0; k < B; k++) {
          reroutePrec[b][0][k] += src[0][k];
          reroutePrec[b][1][k] += src[1][k];
        }
      }
      // fader del ritorno: stessa law del fader di canale (-12 dB a metà corsa), lisciata
      const tf = faderRit[r] / 100;
      const g = tf * tf;
      for (let k = 0; k < B; k++) {
        gRit[r] += (g - gRit[r]) * 0.002;
        somma[0][k] += oRet[r][0][0][k] * gRit[r];
        somma[1][k] += oRet[r][0][1][k] * gRit[r];
      }
    }
    for (let k = 0; k < B; k++) {
      somma[0][k] += oMic[0][0][k];
      somma[1][k] += oMic[0][1][k];
    }
    ms.process([somma], [oMs]);
    // Protezione per le orecchie (montaggio §P3.5, fuori dal design): limitatore di picco a -1 dBFS.
    for (let k = 0; k < B; k++) {
      const p = Math.max(Math.abs(oMs[0][k]), Math.abs(oMs[1][k]));
      const voluto = p * prot > 0.89 ? 0.89 / p : 1;
      prot = voluto < prot ? voluto : prot + (1 - prot) * 0.00005;
      oMs[0][k] *= prot;
      oMs[1][k] *= prot;
    }
    uscita.scrivi(oMs, B);

    for (let r = 0; r < 4; r++) pkRit[r] = Math.max(pkRit[r], ultimoMeter.get(rets[r])?.[0] ?? 0);
    if (++blocchi >= 12) {
      post({
        tipo: "meter",
        ruolo: "fx",
        ritorni: pkRit,
        clipRitorni: rets.map((p) => ultimoMeter.get(p)?.[1] ?? 0),
        master: ultimoMeter.get(ms) ?? [0, 0, 0, 0],
        led: ultimoMeter.get(mc)?.[0] ?? 0,
        protezione: prot,
      });
      pkRit = [0, 0, 0, 0];
      blocchi = 0;
    }
    return true;
  });
}

self.onmessage = async (ev: MessageEvent<MessaggioMotore>) => {
  const m = ev.data;
  if (m.tipo !== "avvia") return;
  ctl = new Int32Array(m.spec.ctl);
  const fs = m.spec.sampleRate;
  if (m.ruolo === "deck") await caricaProcessori(fs, ["mc-channel", "mc-send", "mc-filtro"]);
  else if (m.ruolo === "five") await caricaProcessori(fs, ["mc-5way-s", "mc-5way"]);
  else await caricaProcessori(fs, ["mc-mic", "mc-ret", "mc-master"]);
  post({ tipo: "pronto", ruolo: m.ruolo, i: m.i });
  if (m.ruolo === "deck") avviaDeck(m.spec, m.i ?? 0);
  else if (m.ruolo === "five") avviaFive(m.spec);
  else avviaFx(m.spec, fs);
};

export type { SpecAnello };
