// Misura il costo puro di process() per dispositivo (multipli del tempo reale).
import fs from "node:fs";
const FS = 48000, B = 128;
const nomi = process.argv.slice(2).filter((a) => !a.startsWith("--"));
for (const n of nomi.length ? nomi : ["mc-channel", "mc-send", "mc-filtro", "mc-5way", "mc-5way-s", "mc-ret", "mc-master"]) {
  const s = fs.readFileSync(`src/dsp/generated/${n}.js`, "utf8").replace(/^export /m, "");
  let C; class A { constructor() { this.port = { postMessage() {} }; } }
  new Function("AudioWorkletProcessor", "registerProcessor", "sampleRate", s)(A, (_, c) => (C = c), FS);
  const p = new C();
  const o = Array.from({ length: 5 }, () => [new Float32Array(B), new Float32Array(B)]);
  const i = new Float32Array(B).map((_, k) => 0.25 * Math.sin(k / 3));
  for (let b = 0; b < 3000; b++) p.process([[i, i]], o);
  const nb = 3 * FS / B, t = performance.now();
  for (let b = 0; b < nb; b++) p.process([[i, i]], o);
  console.log(n.padEnd(12), (3000 / (performance.now() - t)).toFixed(1) + "x");
}
