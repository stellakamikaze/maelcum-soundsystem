#!/usr/bin/env node
// Prova i tempi delle eco fuori dal browser: un impulso entra, si misura quando esce.
// Uso: node --experimental-transform-types --no-warnings test/pedali.test.mjs (esce 1 se un caso fallisce)

import { creaPedali } from "../src/engine/pedali.ts";

const FS = 48000;
const B = 128;

// Secondi fra l'impulso e la prima uscita dell'eco, dopo un tratto di silenzio che assesta il nastro.
function ritardo(indice, bpm, manopola) {
  const eco = creaPedali(FS)[indice];
  eco.bpm?.(bpm);
  eco.a = manopola;
  const inL = new Float32Array(B);
  const inR = new Float32Array(B);
  const outL = new Float32Array(B);
  const outR = new Float32Array(B);
  for (let k = 0; k < (FS * 4) / B; k++) eco.elabora(inL, inR, outL, outR, B);
  inL[0] = inR[0] = 1;
  let meglio = 0;
  let quando = -1;
  for (let k = 0; k < (FS * 4) / B; k++) {
    eco.elabora(inL, inR, outL, outR, B);
    inL[0] = inR[0] = 0;
    for (let j = 0; j < B; j++) {
      if (Math.abs(outL[j]) > meglio + 0.01) {
        meglio = Math.abs(outL[j]);
        quando = (k * B + j) / FS;
      }
    }
  }
  return quando;
}

const NASTRO = 0;
const PINGPONG = 1;
const casi = [
  ["nastro a 130,8 bpm: semiminima puntata", NASTRO, 130.8, 50, 1.5 * 60 / 130.8],
  ["ping-pong a 130,8 bpm: semiminima", PINGPONG, 130.8, 50, 60 / 130.8],
  ["nastro sul riddim a 75 bpm", NASTRO, 75, 50, 1.2],
  ["ping-pong sul riddim a 75 bpm", PINGPONG, 75, 50, 0.8],
  ["nastro a 75 bpm col TEMPO al massimo", NASTRO, 75, 100, 2.4],
  ["nastro a 60 bpm col TEMPO al massimo", NASTRO, 60, 100, 3],
];

let falliti = 0;
for (const [nome, indice, bpm, manopola, atteso] of casi) {
  const misura = ritardo(indice, bpm, manopola);
  const ok = Math.abs(misura - atteso) < 0.001;
  if (!ok) falliti++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${nome}  (atteso ${atteso.toFixed(3)} s, misurato ${misura.toFixed(3)} s)`);
}
console.log(`\n${casi.length - falliti}/${casi.length} PASS`);
process.exit(falliti ? 1 : 0);
