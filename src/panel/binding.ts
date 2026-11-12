// Ogni comando del pannello (id = "MODULO|...|NOME" da layout.ts) -> Param del codice gen~
// di Filippo, oppure inerte quando il prototipo non ha quel dispositivo.

import type { Dispositivo } from "../engine/protocollo";

export type Forma = "continuo" | "interruttore" | "tre" | "kill";

export interface Legame {
  dev: Dispositivo | null; // null = comando inerte (non nel prototipo)
  i?: number;
  p: string;
  forma: Forma;
  def: number;
  formato?: (v: number) => string;
  // per "tre": valore del Param per leva su / centro / giù
  posizioni?: [number, number, number];
}

const dB = (g: number): string => (g <= 1e-5 ? "−∞ dB" : `${(20 * Math.log10(g) >= 0 ? "+" : "")}${(20 * Math.log10(g)).toFixed(1)} dB`);

// leggi lette dal codice gen~ di Filippo
const leggi = {
  gainCanale: (v: number) => {
    const t = v / 100;
    return t <= 0 ? 0 : Math.pow(10, Math.min(200 * t - 100, 20 * t - 10) / 20);
  },
  fader: (v: number) => (v / 100) ** 2,
  master: (v: number) => {
    const t = v / 100;
    return t >= 0.8 ? Math.pow(10, 1.5 * (t - 0.8)) : t >= 0.05 ? Math.pow(10, -4 * (0.8 - t)) : 0.02 * t;
  },
  banda: (v: number) => {
    const x = (2 * v) / 100;
    return v <= 0 ? 0 : Math.min(x, 1) + Math.max(x - 1, 0);
  },
  reroute: (v: number) => {
    const t = v / 100;
    const q = t < 0.2 ? -100 + 300 * t : t < 0.45 ? -40 + 80 * (t - 0.2) : t < 0.7 ? -20 + 40 * (t - 0.45) : t < 0.85 ? -10 + 40 * (t - 0.7) : t < 0.95 ? -4 + 30 * (t - 0.85) : -1 + 20 * (t - 0.95);
    return Math.pow(10, q / 20);
  },
};
const fmt = {
  gainCanale: (v: number) => dB(leggi.gainCanale(v)),
  fader: (v: number) => dB(leggi.fader(v)),
  master: (v: number) => dB(leggi.master(v)),
  banda: (v: number) => (v <= 0 ? "banda spenta" : dB(leggi.banda(v))),
  reroute: (v: number) => dB(leggi.reroute(v)),
};

const BANDE_CANALE: Record<string, string> = { HIGH: "high", "MID-HIGH": "midhigh", "LOW-MID": "lowmid", LOW: "low" };
const VIE = ["SUB", "KICK", "MID", "HIGH", "SUPER"];
const KILL = ["k_sub", "k_kick", "k_mid", "k_high", "k_super"];

export function legame(id: string): Legame {
  const parti = id.split("|");
  const [modulo] = parti;
  const nome = parti[parti.length - 1];
  const inerte: Legame = { dev: null, p: "", forma: "continuo", def: 50 };

  let m = modulo.match(/^CDJ (\d)$/);
  if (m) {
    const i = +m[1] - 1;
    if (nome === "GAIN") return { dev: "channel", i, p: "gain", forma: "continuo", def: 50, formato: fmt.gainCanale };
    if (nome in BANDE_CANALE) return { dev: "channel", i, p: BANDE_CANALE[nome], forma: "continuo", def: 50, formato: fmt.banda };
    if (nome === "FADER") return { dev: "channel", i, p: "fader", forma: "continuo", def: 78, formato: fmt.fader };
    if (nome === "FILTRO") return { dev: "filtro", i, p: "modo", forma: "tre", def: 1, posizioni: [0, 1, 2] };
    const fx = nome.match(/^FX(\d)$/);
    if (fx) return { dev: "send", i, p: `as${fx[1]}`, forma: "interruttore", def: 0 };
    return { ...inerte, forma: nome === "CUE" ? "interruttore" : nome === "LINE/PHONO" ? "tre" : "continuo", def: nome === "LINE/PHONO" ? 0 : 0, posizioni: [0, 0, 1] };
  }
  m = modulo.match(/^FX-SEND (\d)$/);
  if (m) {
    const i = +m[1] - 1;
    if (nome === "EQ HIGH") return { dev: "send", i, p: "high", forma: "continuo", def: 50 };
    if (nome === "EQ LOW") return { dev: "send", i, p: "low", forma: "continuo", def: 50 };
    if (nome === "LEVEL") return { dev: "send", i, p: "level", forma: "continuo", def: 64 };
  }
  if (modulo.startsWith("FILTRO")) {
    const sez = parti[1] === "HPF" ? "hp" : "lp";
    const p = { FREQ: "freq", RES: "res", DRIVE: "drive" }[nome];
    if (p) return { dev: "filtro", p: `${p}_${sez}`, forma: "continuo", def: p === "freq" && sez === "lp" ? 100 : 0 };
  }
  if (modulo.startsWith("FX —")) {
    const i = +parti[1].slice(4) - 1;
    if (nome === "GAIN") return { dev: "ret", i, p: "gain", forma: "continuo", def: 50 };
    if (nome === "EQ HIGH") return { dev: "ret", i, p: "high", forma: "continuo", def: 50 };
    if (nome === "EQ LOW") return { dev: "ret", i, p: "low", forma: "continuo", def: 50 };
    if (nome === "FADER") return { dev: "faderRitorno", i, p: "fader", forma: "continuo", def: 72, formato: fmt.fader };
    const b = nome === "SELF" ? i + 1 : +(nome.match(/FX(\d)/)?.[1] ?? 0);
    if (b) return { dev: "ret", i, p: `rr${b}`, forma: "continuo", def: 0, formato: fmt.reroute };
  }
  if (modulo === "MIC") {
    if (nome === "GAIN") return { dev: "mic", p: "gain", forma: "continuo", def: 0 };
    if (nome === "EQ HIGH") return { dev: "mic", p: "high", forma: "continuo", def: 50 };
    if (nome === "EQ LOW") return { dev: "mic", p: "low", forma: "continuo", def: 50 };
    if (nome === "MUTE") return { dev: "mic", p: "mute", forma: "interruttore", def: 0 };
    const s = nome.match(/^SEND (\d)$/);
    if (s) return { dev: "mic", p: `snd${s[1]}`, forma: "continuo", def: 0 };
  }
  if (modulo === "5-WAY") {
    const v = VIE.indexOf(parti[1]);
    if (v >= 0) {
      if (nome === "KILL") return { dev: "five", p: KILL[v], forma: "kill", def: 0, posizioni: [1, 0, 1] };
      if (nome === "GAIN") return { dev: "five", p: `g_${v + 1}`, forma: "continuo", def: 50 };
      if (nome === "POSITION") return { dev: "five", p: `p_${v + 1}`, forma: "continuo", def: 50 };
      if (nome === "WIDTH") return { dev: "five", p: `w_${v + 1}`, forma: "continuo", def: 50 };
    }
    if (nome === "GROWL") return { dev: "five", p: "growl", forma: "continuo", def: 0 };
    if (nome === "NASTRO") return { dev: "five", p: "nastro", forma: "continuo", def: 0 };
  }
  if (modulo === "MASTER") {
    if (nome === "MASTER") return { dev: "master", p: "level", forma: "continuo", def: 80, formato: fmt.master };
    if (nome === "MONO") return { dev: "master", p: "mono", forma: "interruttore", def: 0 };
  }
  m = modulo.match(/^PEDALE (\d)$/);
  if (m) {
    const i = +m[1] - 1;
    const def = [[50, 45], [50, 45], [55, 50], [60, 45]][i][nome === "a" ? 0 : 1];
    return { dev: "pedale", i, p: nome, forma: "continuo", def };
  }
  if (modulo === "CUE" && nome === "BLEND") return { ...inerte, def: 50 };
  return inerte;
}

export { fmt };
