#!/usr/bin/env node
// Traduce i dispositivi gen~ del prototipo di Filippo (maelcum_mixer/proto-max/MC-*.genexpr)
// in AudioWorkletProcessor. Il codice DSP passa quasi alla lettera: cambiano solo le
// dichiarazioni (Param, History, Data), ingressi e uscite.
// Uso: node scripts/gen2worklet.mjs [cartella proto-max] [cartella di uscita]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const QUI = path.dirname(fileURLToPath(import.meta.url));
const SORGENTE = process.argv[2] || path.resolve(QUI, "../../maelcum_mixer/proto-max");
const USCITA = process.argv[3] || path.resolve(QUI, "../src/dsp/generated");

// Uscite gen~ -> uscite del nodo: coppie stereo audio, poi meter (picco per blocco via porta).
const STEREO5 = [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]];
export const DISPOSITIVI = {
  "MC-CHANNEL": { audio: [[1, 2]], meter: [] },
  "MC-CHANNEL-S": { audio: [[1, 2]], meter: [] },
  "MC-SEND": { audio: STEREO5, meter: [] },
  "MC-FILTRO": { audio: [[1, 2]], meter: [] },
  "MC-FILTRO-S": { audio: [[1, 2]], meter: [] },
  "MC-5WAY": { audio: [[1, 2]], meter: [] },
  "MC-5WAY-S": { audio: [[1, 2]], meter: [] },
  "MC-RET": { audio: STEREO5, meter: [11, 12] },
  "MC-MIC": { audio: STEREO5, meter: [11] },
  "MC-MASTER": { audio: [[1, 2]], meter: [3, 4, 5, 6] },
};

const BUILTIN = new Set([
  "min", "max", "abs", "pow", "exp", "log", "tan", "tanh", "sqrt", "noise", "peek", "poke",
  "pi", "twopi", "e", "samplerate", "if", "return",
]);
// Nomi che in JavaScript hanno un altro significato: se il codice gen~ li usa, il traduttore si ferma.
const RISERVATI = new Set([
  "in", "do", "for", "var", "let", "new", "int", "this", "case", "class", "const", "delete",
  "function", "switch", "typeof", "void", "with", "yield", "default", "export", "import", "super",
  "null", "true", "false", "NaN", "Infinity", "undefined", "eval", "arguments", "Math", "else",
  "while", "break", "continue", "try", "catch", "throw", "await", "async", "static", "enum",
]);

const ID = /\b[A-Za-z_]\w*\b/g;
const ASSEGNA = /^([A-Za-z_]\w*)\s*=(?!=)/;

function togliCommenti(testo) {
  return testo.split("\n").map((r) => r.replace(/\/\/.*$/, "")).join("\n");
}

function identificatori(codice) {
  return new Set(codice.match(ID) || []);
}

// Divide il file in funzioni utente, dichiarazioni e corpo principale.
export function analizza(testo, nome = "?") {
  const righe = togliCommenti(testo).split("\n");
  const funzioni = [];
  const params = [];
  const history = [];
  const data = [];
  const corpo = [];
  let i = 0;
  while (i < righe.length) {
    const r = righe[i].trim();
    i++;
    if (!r) continue;
    const f = r.match(/^([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{$/);
    if (f && f[1] !== "if") {
      const args = f[2].split(",").map((s) => s.trim()).filter(Boolean);
      const dentro = [];
      let liv = 1;
      while (i < righe.length) {
        const q = righe[i].trim();
        i++;
        liv += (q.match(/\{/g) || []).length - (q.match(/\}/g) || []).length;
        if (liv === 0) break;
        if (q) dentro.push(q);
      }
      funzioni.push({ nome: f[1], args, righe: dentro });
      continue;
    }
    let m;
    if ((m = r.match(/^Param\s+(\w+)\s*\(\s*([-\d.e]+)\s*,\s*min\s*=\s*([-\d.e]+)\s*,\s*max\s*=\s*([-\d.e]+)\s*\)\s*;$/))) {
      params.push({ nome: m[1], def: +m[2], min: +m[3], max: +m[4] });
    } else if ((m = r.match(/^History\s+(\w+)\s*\(\s*([-\d.e]+)\s*\)\s*;$/))) {
      history.push({ nome: m[1], init: +m[2] });
    } else if ((m = r.match(/^Data\s+(\w+)\s*\(\s*(\d+)\s*\)\s*;$/))) {
      data.push({ nome: m[1], n: +m[2] });
    } else if (/^(Param|History|Data|Buffer|Delay)\b/.test(r)) {
      throw new Error(`${nome}: dichiarazione non riconosciuta: ${r}`);
    } else {
      corpo.push(r);
    }
  }
  return { funzioni, params, history, data, corpo };
}

function assegnati(righe) {
  const out = new Set();
  for (const r of righe) {
    const m = r.match(ASSEGNA);
    if (m) out.add(m[1]);
  }
  return out;
}

function controllaNomi(nome, dove, nomi) {
  for (const n of nomi) {
    if (RISERVATI.has(n)) throw new Error(`${nome}: "${n}" in ${dove} è una parola riservata di JavaScript`);
  }
}

export function traduci(testo, nome, cfg) {
  const a = analizza(testo, nome);
  const nomiFunzioni = new Set(a.funzioni.map((f) => f.nome));
  const nomiParam = new Set(a.params.map((p) => p.nome));
  const nomiHistory = new Set(a.history.map((h) => h.nome));
  const nomiData = new Set(a.data.map((d) => d.nome));
  const outUsate = new Set();
  for (const r of a.corpo) for (const m of r.matchAll(/\bout(\d+)\b/g)) outUsate.add(+m[1]);
  const outAttese = new Set([...cfg.audio.flat(), ...cfg.meter]);
  for (const o of outUsate) if (!outAttese.has(o)) throw new Error(`${nome}: out${o} non mappata`);

  // funzioni utente
  const js = [];
  for (const f of a.funzioni) {
    const locali = [...assegnati(f.righe)].filter((v) => !f.args.includes(v));
    controllaNomi(nome, `funzione ${f.nome}`, [...locali, ...f.args]);
    const noti = new Set([...BUILTIN, ...nomiFunzioni, ...f.args, ...locali]);
    for (const id of identificatori(f.righe.join("\n"))) {
      if (!noti.has(id)) throw new Error(`${nome}: funzione ${f.nome} usa "${id}" non definito`);
    }
    js.push(`function ${f.nome}(${f.args.join(", ")}) {`);
    if (locali.length) js.push(`\tlet ${locali.map((v) => `${v} = 0`).join(", ")};`);
    for (const r of f.righe) js.push("\t" + r);
    js.push("}");
  }

  // corpo principale
  const assegnatiCorpo = assegnati(a.corpo);
  for (const p of nomiParam) if (assegnatiCorpo.has(p)) throw new Error(`${nome}: il corpo assegna il Param ${p}`);
  const locali = [...assegnatiCorpo].filter((v) => !nomiHistory.has(v) && !/^out\d+$/.test(v));
  controllaNomi(nome, "corpo", locali);
  for (const v of locali) if (nomiFunzioni.has(v)) throw new Error(`${nome}: il locale ${v} copre una funzione`);
  const noti = new Set([...BUILTIN, ...nomiFunzioni, ...nomiParam, ...nomiHistory, ...nomiData, ...locali, "in1", "in2"]);
  for (const o of outUsate) noti.add(`out${o}`);
  for (const id of identificatori(a.corpo.join("\n"))) {
    if (!noti.has(id)) throw new Error(`${nome}: il corpo usa "${id}" non definito`);
  }

  const outs = [...outUsate].sort((x, y) => x - y);
  const procName = nome.toLowerCase();
  const paramsJson = JSON.stringify(Object.fromEntries(a.params.map((p) => [p.nome, { def: p.def, min: p.min, max: p.max }])));
  const historyJson = JSON.stringify(Object.fromEntries(a.history.map((h) => [h.nome, h.init])));
  const L = [];
  L.push(`// GENERATO da scripts/gen2worklet.mjs a partire da maelcum_mixer/proto-max/${nome}.genexpr: non modificare.`);
  L.push(`// Il codice DSP è quello di Filippo, riga per riga; cambiano solo dichiarazioni e ingressi/uscite.`);
  L.push(`const pi = Math.PI, twopi = 2 * Math.PI, e = Math.E;`);
  L.push(`const min = Math.min, max = Math.max, abs = Math.abs, pow = Math.pow, exp = Math.exp;`);
  L.push(`const log = Math.log, tan = Math.tan, tanh = Math.tanh, sqrt = Math.sqrt;`);
  L.push(`const samplerate = sampleRate;`);
  L.push(`function noise() { return Math.random() * 2 - 1; }`);
  L.push(`function peek(m, i) { return m[i]; }`);
  L.push(`function poke(m, v, i) { m[i] = v; }`);
  L.push(...js);
  L.push(`export const PARAMS = ${paramsJson};`);
  L.push(`const HISTORY = ${historyJson};`);
  L.push(`const N_METER = ${cfg.meter.length};`);
  L.push(`class Processore extends AudioWorkletProcessor {`);
  L.push(`\tconstructor() {`);
  L.push(`\t\tsuper();`);
  L.push(`\t\tthis.P = {};`);
  L.push(`\t\tfor (const k in PARAMS) this.P[k] = PARAMS[k].def;`);
  L.push(`\t\tthis.H = Object.assign({}, HISTORY);`);
  L.push(`\t\tthis.D = { ${a.data.map((d) => `${d.nome}: new Float64Array(${d.n})`).join(", ")} };`);
  L.push(`\t\tthis.M = new Float64Array(N_METER);`);
  L.push(`\t\tthis.blocchi = 0;`);
  L.push(`\t\tthis.port.onmessage = (ev) => { const d = ev.data; if (d && d.p in PARAMS) this.set(d.p, d.v); };`);
  L.push(`\t}`);
  L.push(`\tset(n, v) { const q = PARAMS[n]; this.P[n] = Math.min(q.max, Math.max(q.min, +v)); }`);
  L.push(`\tprocess(inputs, outputs) {`);
  L.push(`\t\tconst inp = inputs[0] || [];`);
  L.push(`\t\tconst iL = inp[0], iR = inp[1] || inp[0];`);
  cfg.audio.forEach(([l, r], k) => {
    L.push(`\t\tconst o${l} = outputs[${k}] ? outputs[${k}][0] : undefined, o${r} = outputs[${k}] ? outputs[${k}][1] : undefined;`);
  });
  L.push(`\t\tconst n = outputs[0] && outputs[0][0] ? outputs[0][0].length : 128;`);
  if (a.params.length) L.push(`\t\tconst { ${a.params.map((p) => p.nome).join(", ")} } = this.P;`);
  if (a.history.length) L.push(`\t\tlet { ${a.history.map((h) => h.nome).join(", ")} } = this.H;`);
  if (a.data.length) L.push(`\t\tconst { ${a.data.map((d) => d.nome).join(", ")} } = this.D;`);
  L.push(`\t\tconst M = this.M;`);
  L.push(`\t\tfor (let __k = 0; __k < n; __k++) {`);
  L.push(`\t\t\tconst in1 = iL ? iL[__k] : 0, in2 = iR ? iR[__k] : 0;`);
  L.push(`\t\t\tlet ${[...outs.map((o) => `out${o}`), ...locali].map((v) => `${v} = 0`).join(", ")};`);
  for (const r of a.corpo) L.push("\t\t\t" + r);
  for (const [l, r] of cfg.audio) {
    if (outUsate.has(l)) L.push(`\t\t\tif (o${l}) o${l}[__k] = out${l};`);
    if (outUsate.has(r)) L.push(`\t\t\tif (o${r}) o${r}[__k] = out${r};`);
  }
  cfg.meter.forEach((o, k) => {
    if (outUsate.has(o)) L.push(`\t\t\tif (out${o} > M[${k}]) M[${k}] = out${o};`);
  });
  L.push(`\t\t}`);
  if (a.history.length) L.push(`\t\tObject.assign(this.H, { ${a.history.map((h) => h.nome).join(", ")} });`);
  L.push(`\t\tif (N_METER && ++this.blocchi >= 8) {`);
  L.push(`\t\t\tthis.port.postMessage({ meter: Array.from(M) });`);
  L.push(`\t\t\tM.fill(0);`);
  L.push(`\t\t\tthis.blocchi = 0;`);
  L.push(`\t\t}`);
  L.push(`\t\treturn true;`);
  L.push(`\t}`);
  L.push(`}`);
  L.push(`registerProcessor("${procName}", Processore);`);
  return {
    codice: L.join("\n") + "\n",
    info: {
      nome,
      processore: procName,
      params: a.params,
      uscite: cfg.audio.length,
      meter: cfg.meter.length,
    },
  };
}

function main() {
  fs.mkdirSync(USCITA, { recursive: true });
  const indice = {};
  for (const [nome, cfg] of Object.entries(DISPOSITIVI)) {
    const file = path.join(SORGENTE, `${nome}.genexpr`);
    const testo = fs.readFileSync(file, "utf8");
    const { codice, info } = traduci(testo, nome, cfg);
    const dest = path.join(USCITA, `${nome.toLowerCase()}.js`);
    fs.writeFileSync(dest, codice);
    fs.writeFileSync(dest.replace(/\.js$/, ".d.ts"), "// GENERATO da scripts/gen2worklet.mjs.\nexport declare const PARAMS: Record<string, { def: number; min: number; max: number }>;\n");
    indice[nome] = info;
    console.log(`${nome}: ${info.params.length} param, ${info.uscite} uscite stereo, ${info.meter} meter -> ${path.relative(process.cwd(), dest)}`);
  }
  fs.writeFileSync(path.join(USCITA, "indice.json"), JSON.stringify(indice, null, 1) + "\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
