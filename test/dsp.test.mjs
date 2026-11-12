#!/usr/bin/env node
// Suona i processori tradotti fuori dal browser e confronta i guadagni con i valori
// dichiarati nei documenti di Filippo (proto-max/montaggio.md, RISULTATI-P*.md).
// Uso: node test/dsp.test.mjs [cartella dei processori]   (esce 1 se un caso fallisce)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const QUI = path.dirname(fileURLToPath(import.meta.url));
const CARTELLA = process.argv.slice(2).find((a) => !a.startsWith("--")) || path.resolve(QUI, "../src/dsp/generated");
const FS = 48000;
const BLOCCO = 128;
// Silenzio iniziale: alcuni History partono diversi dal default del Param (MC-5WAY: s_growl 50
// con growl 0, s_gv 50 con gv 0) e il codice di Filippo si assesta in ~20 ms. Nell'app i nodi
// girano nel silenzio prima della musica, quindi la prova fa lo stesso.
const RISCALDA = 12000;

// --veleno: toglie dal codice tradotto il salvataggio degli stati History a fine blocco.
// Le manopole lisciate restano ferme al valore iniziale e i casi di GAIN e FADER devono fallire.
const VELENO = process.argv.includes("--veleno");

function carica(nome) {
  let src = fs.readFileSync(path.join(CARTELLA, `${nome}.js`), "utf8").replace(/^export /m, "");
  if (VELENO) src = src.replace(/^\t\tObject\.assign\(this\.H.*$/m, "");
  let Classe = null;
  class AudioWorkletProcessor {
    constructor() {
      this.port = { onmessage: null, postMessage: (m) => { this.ultimoMessaggio = m; } };
    }
  }
  new Function("AudioWorkletProcessor", "registerProcessor", "sampleRate", src)(
    AudioWorkletProcessor,
    (_n, C) => { Classe = C; },
    FS,
  );
  return () => new Classe();
}

// Suona un segnale stereo (funzione del campione) per `secondi`; misura il picco di
// ogni uscita nell'ultimo quarto. `ogniBlocco(p, b)` cambia i comandi durante la corsa.
function suona(proc, segnale, secondi, nUscite = 1, ogniBlocco = null) {
  const nb = Math.ceil((secondi * FS + RISCALDA) / BLOCCO);
  const outs = Array.from({ length: nUscite }, () => [new Float32Array(BLOCCO), new Float32Array(BLOCCO)]);
  const inL = new Float32Array(BLOCCO), inR = new Float32Array(BLOCCO);
  const picchi = Array.from({ length: nUscite }, () => [0, 0]);
  let salto = 0, prec = 0, nan = false;
  const traccia = new Float32Array(nb * BLOCCO);
  const t0 = performance.now();
  for (let b = 0; b < nb; b++) {
    if (ogniBlocco) ogniBlocco(proc, b);
    for (let k = 0; k < BLOCCO; k++) {
      const n = b * BLOCCO + k - RISCALDA;
      const [l, r] = n < 0 ? [0, 0] : segnale(n);
      inL[k] = l;
      inR[k] = r;
    }
    proc.process([[inL, inR]], outs);
    for (let u = 0; u < nUscite; u++) {
      for (let c = 0; c < 2; c++) {
        const o = outs[u][c];
        for (let k = 0; k < BLOCCO; k++) {
          const v = o[k];
          if (!Number.isFinite(v)) nan = true;
          if (b > nb * 0.75 && Math.abs(v) > picchi[u][c]) picchi[u][c] = Math.abs(v);
          if (u === 0 && c === 0) traccia[b * BLOCCO + k] = v;
          if (u === 0 && c === 0 && b * BLOCCO > RISCALDA + FS / 4) {
            salto = Math.max(salto, Math.abs(v - prec));
            prec = v;
          }
        }
      }
    }
  }
  const ms = performance.now() - t0;
  return { picchi, nan, salto, traccia, tempoReale: (secondi * 1000) / ms };
}

// Click = un salto fra due campioni molto più grande dei salti vicini (64 campioni per lato).
// Un'oscillazione acuta e forte salta tanto a ogni campione: non è un click.
function clic(x, da) {
  let peggiore = 0;
  const d = new Float32Array(x.length);
  for (let k = 1; k < x.length; k++) d[k] = Math.abs(x[k] - x[k - 1]);
  for (let k = da + 64; k < x.length - 64; k++) {
    if (d[k] < 0.02) continue;
    let somma = 0;
    for (let j = k - 64; j < k + 64; j++) if (j !== k) somma += d[j];
    const rapporto = d[k] / (somma / 127 + 1e-9);
    if (rapporto > peggiore) peggiore = rapporto;
  }
  return peggiore;
}

const AMP = 0.25; // 0 dBu = -12 dBFS di picco
const seno = (f, a = AMP) => (n) => {
  const v = a * Math.sin((2 * Math.PI * f * n) / FS);
  return [v, v];
};
const db = (x) => 20 * Math.log10(Math.max(x, 1e-12));

const casi = [];
function caso(nome, fn) { casi.push({ nome, fn }); }
function vicino(misura, atteso, tol, cosa) {
  const ok = Math.abs(misura - atteso) <= tol;
  return { ok, msg: `${cosa}: ${misura.toFixed(2)} dB (atteso ${atteso} ± ${tol})` };
}
function sotto(misura, soglia, cosa) {
  return { ok: misura <= soglia, msg: `${cosa}: ${misura.toFixed(1)} dB (atteso ≤ ${soglia})` };
}

const crea = {};
for (const n of ["mc-channel", "mc-channel-s", "mc-send", "mc-filtro", "mc-filtro-s", "mc-5way", "mc-5way-s", "mc-ret", "mc-mic", "mc-master"]) {
  crea[n] = carica(n);
}
const set = (p, o) => { for (const [k, v] of Object.entries(o)) p.set(k, v); return p; };

for (const n of ["mc-channel", "mc-channel-s"]) {
  caso(`${n}: comandi di default = unity a 1 kHz`, () => {
    const r = suona(crea[n](), seno(1000), 1);
    return vicino(db(r.picchi[0][0] / AMP), 0, 0.1, "L");
  });
  caso(`${n}: GAIN 25 % = -50 dB (montaggio §2)`, () => {
    const r = suona(set(crea[n](), { gain: 25 }), seno(1000), 1);
    return vicino(db(r.picchi[0][0] / AMP), -50, 0.3, "L");
  });
  caso(`${n}: GAIN 100 % = +10 dB`, () => {
    const r = suona(set(crea[n](), { gain: 100 }), seno(1000), 1);
    return vicino(db(r.picchi[0][0] / AMP), 10, 0.3, "L");
  });
  caso(`${n}: FADER 50 % = -12 dB`, () => {
    const r = suona(set(crea[n](), { fader: 50 }), seno(1000), 1);
    return vicino(db(r.picchi[0][0] / AMP), -12, 0.2, "L");
  });
  // A 50 Hz la banda LOW-MID (LR4 a 150 Hz) lascia passare ~-38 dB: il silenzio della LOW
  // si misura più in basso, a 30 Hz.
  caso(`${n}: LOW a fondo corsa spegne i 30 Hz`, () => {
    const r = suona(set(crea[n](), { low: 0 }), seno(30), 1.5);
    return sotto(db(r.picchi[0][0] / AMP), -50, "L a 30 Hz");
  });
}

caso("mc-send: l'audio del canale passa intatto, mandate chiuse", () => {
  const r = suona(set(crea["mc-send"](), { as1: 1 }), seno(1000), 0.5, 5);
  const a = vicino(db(r.picchi[0][0] / AMP), 0, 0.01, "main");
  const b = sotto(db(r.picchi[1][0] / AMP), -100, "bus1 con LEVEL 0");
  return { ok: a.ok && b.ok, msg: `${a.msg}; ${b.msg}` };
});
caso("mc-send: LEVEL e ASSIGN aprono il bus 1, non il 2", () => {
  const r = suona(set(crea["mc-send"](), { as1: 1, level: 100 }), seno(1000), 0.5, 5);
  const a = db(r.picchi[1][0] / AMP), b = db(r.picchi[2][0] / AMP);
  return { ok: a > -12 && b < -100, msg: `bus1 ${a.toFixed(1)} dB, bus2 ${b.toFixed(1)} dB` };
});

for (const n of ["mc-filtro", "mc-filtro-s"]) {
  caso(`${n}: MODO OFF = unity`, () => {
    const r = suona(crea[n](), seno(1000), 1);
    return vicino(db(r.picchi[0][0] / AMP), 0, 0.2, "L");
  });
  caso(`${n}: LPF chiuso taglia 5 kHz`, () => {
    const r = suona(set(crea[n](), { modo: 2, freq_lp: 20 }), seno(5000), 1);
    return sotto(db(r.picchi[0][0] / AMP), -30, "L a 5 kHz");
  });
}

for (const n of ["mc-5way", "mc-5way-s"]) {
  caso(`${n}: trasparente a comandi di default`, () => {
    const r = suona(crea[n](), seno(1000), 1);
    return vicino(db(r.picchi[0][0] / AMP), 0, 0.2, "L");
  });
  // Il KILL toglie la via SUB; la via KICK (LR4 a 80-90 Hz) a 40 Hz passa ancora a ~-25 dB.
  caso(`${n}: KILL SUB toglie i 20 Hz`, () => {
    const r = suona(set(crea[n](), { k_sub: 1 }), seno(20), 2);
    return sotto(db(r.picchi[0][0] / AMP), -45, "L a 20 Hz");
  });
}

caso("mc-master: MASTER 80 % = 0 dB", () => {
  const r = suona(crea["mc-master"](), seno(1000), 0.5);
  return vicino(db(r.picchi[0][0] / AMP), 0, 0.05, "L");
});
caso("mc-master: il meter manda messaggi", () => {
  const p = crea["mc-master"]();
  suona(p, seno(1000), 0.2);
  const m = p.ultimoMessaggio && p.ultimoMessaggio.meter;
  return { ok: Array.isArray(m) && m.length === 4 && m[0] > 0, msg: `meter ${JSON.stringify(m)}` };
});
caso("mc-ret: GAIN 50 % non cambia il livello", () => {
  const r = suona(crea["mc-ret"](), seno(1000), 0.5, 5);
  return vicino(db(r.picchi[0][0] / AMP), 0, 0.3, "L");
});
caso("mc-mic: MUTE spegne", () => {
  const r = suona(set(crea["mc-mic"](), { gain: 50, mute: 1 }), seno(1000, 0.01), 0.5, 5);
  return sotto(db(r.picchi[0][0] / 0.01), -80, "mic con MUTE");
});

// Tutti i comandi al massimo: niente NaN, niente infiniti.
for (const n of Object.keys(crea)) {
  caso(`${n}: comandi al massimo, nessun NaN`, () => {
    const p = crea[n]();
    const { PARAMS } = p.constructor;
    for (const k of Object.keys(p.P)) p.set(k, 1e9);
    const r = suona(p, seno(100, 0.9), 1, 5);
    return { ok: !r.nan, msg: r.nan ? "NaN o infinito in uscita" : "ok" };
  });
}

// Manopole che corrono a ogni blocco (il guasto aperto del prototipo in Live, todo 76):
// nessun campione deve saltare molto più dei suoi vicini.
for (const [n, comandi] of [
  ["mc-filtro", ["freq_lp", "res_lp", "drive_lp"]],
  ["mc-5way", ["g_1", "p_1", "w_1", "growl", "nastro"]],
  ["mc-channel", ["gain", "low", "high", "fader"]],
]) {
  caso(`${n}: comandi in movimento continuo, nessun salto`, () => {
    const p = crea[n]();
    if (n === "mc-filtro") p.set("modo", 2);
    const r = suona(p, seno(200), 2, 1, (q, b) => {
      for (const c of comandi) q.set(c, 50 + 50 * Math.sin(b / 40 + c.length));
    });
    const c = clic(r.traccia, RISCALDA + FS / 2);
    return { ok: !r.nan && c < 6, msg: `click peggiore ${c.toFixed(2)} volte i salti vicini (soglia 6)` };
  });
}

// Costo di calcolo: quante volte il tempo reale regge ogni dispositivo.
const costo = {};
for (const n of Object.keys(crea)) costo[n] = suona(crea[n](), seno(1000), 2, 5).tempoReale;

let falliti = 0;
for (const c of casi) {
  let r;
  try { r = c.fn(); } catch (e) { r = { ok: false, msg: `eccezione: ${e.message}` }; }
  if (!r.ok) falliti++;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${c.nome}  (${r.msg})`);
}
console.log("\nCosto (multipli del tempo reale, più alto = più leggero):");
for (const [n, x] of Object.entries(costo)) console.log(`  ${n.padEnd(14)} ${x.toFixed(1)}x`);
console.log(`\n${casi.length - falliti}/${casi.length} PASS`);
fs.writeFileSync(path.resolve(QUI, "esito.json"), JSON.stringify({ totale: casi.length, falliti, costo }, null, 1));
process.exit(falliti ? 1 : 0);
