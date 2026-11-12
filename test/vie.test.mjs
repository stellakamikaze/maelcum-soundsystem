#!/usr/bin/env node
// Prova la catena segnale -> membrana fuori dal browser: stessa aritmetica di src/audio/vie.ts.
// Uso: node --no-warnings test/vie.test.mjs [--veleno] (esce 1 se un caso fallisce)
// --veleno: al posto della forma d'onda vera usa un seno inventato per l'inviluppo, com'era prima.
// I casi sulla forma d'onda devono fallire.

import { livello, misura, scossa, segui, spostamento, statoVuoto } from "../src/audio/vie.ts";

const VELENO = process.argv.includes("--veleno");
const FS = 48000;
const DT = 1 / 60;
const N = Math.round(FS * DT);
const casi = [];
const caso = (nome, ok, nota = "") => {
  casi.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${nome}  ${nota}`);
};

// Fa passare un segnale nella catena e torna, per ogni frame, il livello e la posizione del cono.
function corsa(segnale, secondi, via = 0, calma = false) {
  const s = statoVuoto();
  const out = [];
  const x = new Float32Array(N);
  for (let f = 0; f < secondi / DT; f++) {
    for (let k = 0; k < N; k++) x[k] = segnale((f * N + k) / FS);
    const l = misura(x, N);
    segui(s, l, via, DT);
    const pos = VELENO ? 0.55 * s.veloce + 0.45 * s.veloce * Math.sin(f * DT * Math.PI * 2 * 9) : spostamento(s, via, calma);
    out.push({ pos, punta: l.punta, veloce: s.veloce });
  }
  return out;
}
const media = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function pearson(x, y) {
  const mx = media(x), my = media(y);
  let a = 0, b = 0, c = 0;
  x.forEach((v, i) => { a += (v - mx) * (y[i] - my); b += (v - mx) ** 2; c += (y[i] - my) ** 2; });
  return a / Math.sqrt(b * c || 1e-30);
}

const m = misura(Float32Array.from([0, 0.5, -0.8, 0.1]), 3);
caso("misura guarda solo gli ultimi n campioni e tiene il segno", m.punta === Float32Array.from([-0.8])[0] && m.rms > 0.5, `punta ${m.punta.toFixed(2)}`);
const lungo = misura(Float32Array.from([1, 1, 0, 0]), 2, 4);
caso("punta e RMS hanno finestre separate", lungo.punta === 0 && Math.abs(lungo.rms - Math.SQRT1_2) < 1e-6, `rms ${lungo.rms.toFixed(3)}`);
caso("la scala è 0 nel silenzio", livello(0, 0) === 0);
caso("la scala è 1 a fondo corsa", livello(Math.pow(10, -25 / 20), 0) === 1);

const muto = corsa(() => 0, 1);
caso("silenzio: la membrana resta a riposo", muto.every((f) => f.pos === 0));

// Un'onda quadra a 7 Hz: frame interi con lo stesso segno, come un basso lento visto a 60 fps.
const quadra = corsa((t) => (Math.sin(t * Math.PI * 2 * 7) >= 0 ? 0.06 : -0.06), 3, 2);
const r = pearson(quadra.map((f) => f.punta), quadra.map((f) => f.pos));
caso("la membrana segue il segno del segnale", r > 0.9, `Pearson ${r.toFixed(3)}`);
const sopra = media(quadra.slice(30).filter((f) => f.punta > 0).map((f) => f.pos));
const sotto = media(quadra.slice(30).filter((f) => f.punta < 0).map((f) => f.pos));
caso("la membrana rientra quando il segnale è negativo", sopra - sotto > 0.15, `posizione media ${sopra.toFixed(2)} contro ${sotto.toFixed(2)}`);

// Un colpo e poi silenzio: la membrana torna a riposo, non continua a oscillare da sola.
const colpo = corsa((t) => (t < 0.2 ? 0.05 * Math.sin(t * Math.PI * 2 * 50) : 0), 2);
caso("dopo il colpo la membrana si ferma", Math.abs(colpo.at(-1).pos) < 0.01, `pos finale ${colpo.at(-1).pos.toFixed(4)}`);

// Riduzione del movimento: niente vibrazione, ma il livello resta leggibile.
const calmo = corsa((t) => 0.05 * Math.sin(t * Math.PI * 2 * 50), 3, 0, true);
const salti = calmo.slice(120).map((f, i, a) => (i ? Math.abs(f.pos - a[i - 1].pos) : 0));
if (!VELENO) {
  caso("riduzione: il cono non vibra", Math.max(...salti) < 0.005, `salto massimo ${Math.max(...salti).toFixed(5)}`);
  caso("riduzione: il cono segue il livello", calmo.at(-1).pos > 0.2, `pos ${calmo.at(-1).pos.toFixed(3)}`);
  const s = statoVuoto();
  s.forma = 1;
  caso("riduzione: il legno non trema", scossa(s, s, true) === 0 && scossa(s, s, false) === 1);
}

const falliti = casi.filter((c) => !c).length;
console.log(`${casi.length - falliti}/${casi.length} PASS`);
process.exit(falliti ? 1 : 0);
