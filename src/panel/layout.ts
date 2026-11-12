// Disposizione del pannello: traduzione di maelcum_mixer/docs/pannelli/genera_pannelli.py
// (setup completo: 4 canali CDJ con 4 FX-SEND, 1 MIC, 3 MONO, FX 4 ritorni, filtro, 5-way,
// master, CUE). Stesse misure in millimetri, stessi colori standard di Filippo. Invece dello
// SVG registra ogni comando con la sua posizione assoluta sul rack.

export const STRISCIA = 36.0;
export const RACK = 482.6;
export const ORECCHIA = 16.3;
export const UTILE = RACK - 2 * ORECCHIA;
const TESTA = 13.0;

export const C = {
  p_canale: "#dbe6f2", p_send: "#e8f0f8", p_filtro: "#f2dede",
  p_fx: "#e1eedb", p_mic: "#f2ead6", p_five: "#e8def2",
  p_master: "#e1e1df", p_cue: "#ebebe8", p_cieco: "#f6f6f4",
  p_testa: "#d4d4cf",
  k_gain: "#2a2a28", k_eq_canale: "#2b2a33", k_eq_9mm: "#3b3a36",
  k_level_send: "#2c3329", k_reroute: "#33292b", k_filtro: "#3a2a2a",
  k_5w_gain: "#2a2f3a", k_5w_pos: "#2f2a3a", k_5w_width: "#2a3a37",
  k_sat: "#3a332a", k_master: "#262626", k_cue: "#30302c",
  k_send_mic: "#2d2d34",
  k_indice: "#f4f4f0",
  f_binario: "#2e2e2b", f_cursore: "#3a3a37", f_riga: "#f2f2ee",
  l_kill: "#8a8a84", l_filtro: "#8d8780", l_linea: "#86868e",
  l_leva: "#1f1f1e",
  b_cue: "#fbfbf9", b_fx: "#f9fbfb", b_mono: "#fbf9fb", b_mute: "#fbfbf7",
  luce_cue: "#e8c547", luce_fx: "#4fa3e0", luce_mono: "#e07a4f",
  luce_mute: "#d23a3a",
  m_blu: "#3f6fd2", m_verde: "#3f9d4a", m_giallo: "#e6d23a",
  m_ambra: "#e0a526", m_rosso: "#d2452f", m_viola: "#8e3fd2",
  led_verde: "#41a04c", led_giallo: "#e2a828", led_rosso: "#d44731",
  j_ghiera: "#c9c9c4", j_foro: "#252523",
  rack: "#cfcfca", rack_foro: "#fefefe",
  t_comando: "#1d1d1b", t_piccolo: "#6b6b66", t_modulo: "#1c1c1a",
  s_pannello: "#1b1b19", s_anello: "#6a6a65", s_detent: "#1a1a18",
  s_bottone: "#191917", s_levetta: "#181816", s_tacche: "#696964",
  s_viti: "#68686e", s_jack: "#171715", s_rack: "#161614",
} as const;
export type Colore = keyof typeof C;

const R14 = 7.5;
const R9 = 5.5;
const R12 = 6.0;
const DX = 5.5;
const PASSO = 17.0;

export type Comando =
  | { id: string; tipo: "manopola"; x: number; y: number; r: number; colore: Colore; detent: boolean }
  | { id: string; tipo: "levetta"; x: number; y: number; r: number; colore: Colore; tre: boolean }
  | { id: string; tipo: "bottone"; x: number; y: number; w: number; h: number; colore: Colore; luce: Colore }
  | { id: string; tipo: "fader"; x: number; y: number; corsa: number }
  | { id: string; tipo: "meter"; x: number; y: number; n: number; passo: number }
  | { id: string; tipo: "led3"; x: number; y: number }
  | { id: string; tipo: "jack"; x: number; y: number };

export interface Testo {
  x: number;
  y: number;
  t: string;
  size: number;
  peso: "normal" | "bold";
  colore: string;
  anchor: "start" | "middle" | "end";
}

export interface Riquadro {
  nome: string;
  classe: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  larghezza: number;
  altezza: number;
  riquadri: Riquadro[];
  comandi: Comando[];
  testi: Testo[];
  foriRack: { x: number; y: number }[];
}

type Locale = Comando extends infer K ? (K extends Comando ? Omit<K, "id"> & { nome: string } : never) : never;

class Pannello {
  y = TESTA + 4;
  h = 0;
  gruppo = "";
  readonly el: Locale[] = [];
  readonly testi: Testo[] = [];
  constructor(readonly nome: string, readonly classe: string, readonly w: number) {}

  testo(x: number, y: number, t: string, size = 2.9, peso: "normal" | "bold" = "normal", colore: string = C.t_comando, anchor: Testo["anchor"] = "middle"): void {
    this.testi.push({ x, y, t, size, peso, colore, anchor });
  }
  private nomeDi(nome: string): string {
    return this.gruppo ? `${this.gruppo}|${nome}` : nome;
  }
  manopola(x: number, y: number, nome: string, tipo: Colore, r = R14, detent = false, lato: "dx" | "sx" | null = null): void {
    this.el.push({ tipo: "manopola", x, y, r, colore: tipo, detent, nome: this.nomeDi(nome) });
    if (lato === "dx") this.testo(x + r + 2.0, y + 1.0, nome, 2.5, "normal", C.t_comando, "start");
    else if (lato === "sx") this.testo(x - r - 2.0, y + 1.0, nome, 2.5, "normal", C.t_comando, "end");
    else this.testo(x, y + r + 4.0, nome, 2.7);
  }
  colonna(c: number, voci: [string, Colore, boolean, number?][], r = R14, passo = PASSO): void {
    let rr = r;
    voci.forEach((voce, i) => {
      const [nome, tipo, det] = voce;
      rr = voce[3] ?? r;
      const sx = i % 2 === 0;
      const x = sx ? c - DX : c + DX;
      this.manopola(x, this.y + rr + 3, nome, tipo, rr, det, sx ? "dx" : "sx");
      this.y += rr === R14 ? passo : passo - (rr === R9 ? 3 : 1.5);
    });
    this.y += rr + 4;
  }
  levetta(x: number, y: number, tipo: Colore, su: string, giu: string, centro: string | null = null, nome: string | null = null, piccola = false): void {
    const rg = piccola ? 2.6 : 3.4;
    this.el.push({ tipo: "levetta", x, y, r: rg, colore: tipo, tre: centro !== null || nome === "KILL", nome: this.nomeDi(nome ?? `${su}/${giu}`) });
    this.testo(x, y - rg - 1.4, su, 2.1, "normal", C.t_piccolo);
    this.testo(x, y + rg + 3.0, giu, 2.1, "normal", C.t_piccolo);
    if (centro) this.testo(x + rg + 1.6, y + 0.8, centro, 2.1, "normal", C.t_piccolo, "start");
    if (nome) this.testo(x - rg - 1.6, y + 0.8, nome, 2.4, "normal", C.t_comando, "end");
  }
  bottone(x: number, y: number, nome: string, tipo: "cue" | "fx" | "mono" | "mute", w = 9.0, h = 6.0): void {
    this.el.push({ tipo: "bottone", x, y, w, h, colore: `b_${tipo}`, luce: `luce_${tipo}`, nome: this.nomeDi(nome) });
    this.testo(x, y + 1.6, nome, 2.2);
  }
  fader(x: number, y: number, corsa = 100.0, nome = "FADER"): void {
    this.el.push({ tipo: "fader", x, y, corsa, nome: this.nomeDi(nome) });
    this.testo(x, y + corsa + 5.0, nome, 2.6);
  }
  meter(x: number, y: number, n: number, passo = 3.0, nome: string | null = null): void {
    this.el.push({ tipo: "meter", x, y, n, passo, nome: this.nomeDi(`METER${nome && nome !== "METER" ? " " + nome : ""}`) });
    if (nome) this.testo(x + 1.3, y + n * passo + 3.2, nome, 2.0, "normal", C.t_piccolo);
  }
  led3(x: number, y: number, nome = "LED"): void {
    this.el.push({ tipo: "led3", x, y, nome: this.nomeDi(nome) });
    this.testo(x, y + 4.4, nome, 2.3);
  }
  jack(x: number, y: number, nome: string): void {
    this.el.push({ tipo: "jack", x, y, nome: this.nomeDi(nome) });
    this.testo(x, y + 8.0, nome, 2.4);
  }
  chiudi(h?: number): this {
    this.h = h ?? this.y + 4;
    return this;
  }
}

function canale(n: number): Pannello {
  const p = new Pannello(`CDJ ${n}`, "canale", STRISCIA);
  const c = STRISCIA / 2;
  p.levetta(c, p.y + 5, "l_linea", "LINE", "PHONO", null, null, true);
  p.y += 14;
  p.colonna(c, [["GAIN", "k_gain", true], ...(["HIGH", "MID-HIGH", "LOW-MID", "LOW"] as const).map((b): [string, Colore, boolean] => [b, "k_eq_canale", true])]);
  p.levetta(c + 4, p.y + 6, "l_filtro", "HPF", "LPF", "OFF", "FILTRO");
  p.y += 18;
  ([[-6, 0], [6, 0], [-6, 9], [6, 9]] as const).forEach(([dx, dy], i) => p.bottone(c + dx, p.y + 4 + dy, `FX${i + 1}`, "fx"));
  p.y += 19;
  p.bottone(c, p.y + 4, "CUE", "cue", 14);
  p.y += 12;
  p.meter(c - 13.5, p.y + 2, 10, 6.0, "METER");
  p.fader(c + 4, p.y + 2, 100.0);
  p.y += 112;
  return p.chiudi();
}

function send(n: number): Pannello {
  const p = new Pannello(`FX-SEND ${n}`, "send", STRISCIA);
  const c = STRISCIA / 2;
  p.colonna(c, [["EQ HIGH", "k_eq_9mm", false], ["EQ LOW", "k_eq_9mm", false]], R9);
  p.colonna(c, [["LEVEL", "k_level_send", false]]);
  return p.chiudi();
}

function filtro(w: number): Pannello {
  const p = new Pannello("FILTRO (4 canali)", "filtro", w);
  (["HPF", "LPF"] as const).forEach((sez, riga) => {
    const y = p.y + 9 + riga * 27;
    p.testo(7, y + 1, sez, 2.8, "bold", C.t_comando, "start");
    p.gruppo = sez;
    (["FREQ", "RES", "DRIVE"] as const).forEach((nm, i) => p.manopola(w * (0.33 + 0.24 * i), y, nm, "k_filtro"));
  });
  p.gruppo = "";
  p.y += 54;
  return p.chiudi();
}

function fx(w: number): Pannello {
  const p = new Pannello("FX — 4 RITORNI", "fx", w);
  p.y += 2;
  const col = w / 4;
  const y0 = p.y;
  for (let r = 0; r < 4; r++) {
    const x = col * r + col / 2;
    p.y = y0;
    p.gruppo = `RET ${r + 1}`;
    p.testo(x, p.y + 2, `RET ${r + 1}`, 2.6, "bold");
    p.y += 5;
    p.colonna(x, [["GAIN", "k_gain", false]]);
    p.colonna(x, [["EQ HIGH", "k_eq_9mm", false], ["EQ LOW", "k_eq_9mm", false]], R9);
    p.colonna(x, [0, 1, 2, 3].map((b): [string, Colore, boolean] => [b === r ? "SELF" : `> FX${b + 1}`, "k_reroute", true]), R9);
    const y = p.y;
    p.meter(x - 13.5, y + 2, 10, 6.0, "METER");
    p.fader(x + 4, y + 2, 100.0);
    p.y = y + 112;
  }
  p.gruppo = "";
  return p.chiudi();
}

function micmono(tipo: string): Pannello {
  const p = new Pannello(tipo, "mic", STRISCIA);
  const c = STRISCIA / 2;
  p.colonna(c, [["GAIN", "k_gain", false]]);
  p.colonna(c, [["EQ HIGH", "k_eq_9mm", false], ["EQ LOW", "k_eq_9mm", false]], R9);
  p.colonna(c, [0, 1, 2, 3].map((i): [string, Colore, boolean] => [`SEND ${i + 1}`, "k_send_mic", false]));
  p.led3(c, p.y + 3);
  p.y += 12;
  if (tipo === "MIC") p.bottone(c, p.y + 4, "MUTE", "mute", 14);
  p.y += 12;
  return p.chiudi();
}

function five(w: number): Pannello {
  const p = new Pannello("5-WAY", "five", w);
  const bande = ["SUB", "KICK", "MID", "HIGH", "SUPER"];
  const col = (w - 40) / 5;
  const y0 = p.y;
  bande.forEach((b, i) => {
    const x = col * i + col / 2 + 2;
    p.y = y0;
    p.gruppo = b;
    p.testo(x, p.y + 2, b, 2.7, "bold");
    p.y += 9;
    p.levetta(x, p.y + 4, "l_kill", "FISSO", "MOLLA", null, "KILL");
    p.y += 16;
    p.colonna(x, [["GAIN", "k_5w_gain", true], ["POSITION", "k_5w_pos", false, R12], ["WIDTH", "k_5w_width", false, R12]]);
    p.testo(x - DX, p.y - PASSO + R12 + 4.5, "Q3 … Q.3", 2.0, "normal", C.t_piccolo);
  });
  p.gruppo = "";
  const y = p.y;
  const x = w - 26;
  p.manopola(x, y0 + 14, "GROWL", "k_sat");
  p.manopola(x, y0 + 40, "NASTRO", "k_sat");
  p.meter(w - 9, y0 + 2, 10, 5.0, "METER");
  p.y = Math.max(y, y0 + 56);
  return p.chiudi();
}

function master(w: number): Pannello {
  const p = new Pannello("MASTER", "master", w);
  const x = w * 0.36;
  p.manopola(x, p.y + 10, "MASTER", "k_master", 8.0, true);
  p.manopola(x, p.y + 38, "BOOTH", "k_master");
  p.bottone(x, p.y + 60, "MONO", "mono", 14);
  p.meter(w - 17, p.y + 1, 20, 3.2, "L");
  p.meter(w - 11, p.y + 1, 20, 3.2, "R");
  p.y += 72;
  return p.chiudi();
}

function cue(w: number): Pannello {
  const p = new Pannello("CUE", "cue", w);
  const x = w / 2;
  p.manopola(x, p.y + 10, "BLEND", "k_cue", R14, true);
  p.manopola(x, p.y + 34, "LEVEL", "k_cue", R9);
  p.jack(x - 9, p.y + 56, "PHONES 1");
  p.jack(x + 9, p.y + 56, "PHONES 2");
  p.y += 70;
  return p.chiudi();
}

function cieco(w: number, h: number, testo = "pannello cieco"): Pannello {
  const p = new Pannello(testo, "cieco", w);
  p.h = h;
  return p;
}

const BLOCCO = 4 * STRISCIA;
const GAP = (UTILE - 3 * BLOCCO) / 2;

export function costruisciLayout(nCanali = 4, nMono = 3): Layout {
  // origine: angolo in alto a sinistra del telaio (nel foglio di Filippo: ox, oy - 4)
  const ox = 0;
  const oy = 4;
  const x0 = ox + ORECCHIA;
  const posati: { p: Pannello; x: number; y: number; h: number }[] = [];
  const posa = (p: Pannello, x: number, y: number, h?: number): void => {
    posati.push({ p, x, y, h: h ?? p.h });
  };

  const wMaster = 96.0;
  const wCue = 62.0;
  const alto = [five(UTILE - wMaster - wCue), master(wMaster), cue(wCue)];
  const hAlto = Math.max(...alto.map((p) => p.h));
  let x = x0;
  for (const p of alto) {
    posa(p, x, oy, hAlto);
    x += p.w;
  }
  const yBasso = oy + hAlto + 6;
  const sinistra = [micmono("MIC"), ...Array.from({ length: nMono }, () => micmono("MONO"))];
  const centro = fx(BLOCCO);
  const canali = Array.from({ length: nCanali }, (_, i) => canale(i + 1));
  const mandate = Array.from({ length: nCanali }, (_, i) => send(i + 1));
  const filt = filtro(BLOCCO);
  const hCan = canali[0].h;
  const hDx = hCan + mandate[0].h + filt.h;
  const hBasso = Math.max(hDx, centro.h, sinistra[0].h);

  x = x0;
  sinistra.forEach((p) => {
    posa(p, x, yBasso);
    x += p.w;
  });
  const vuotoSx = BLOCCO - sinistra.length * STRISCIA;
  if (vuotoSx > 0) posa(cieco(vuotoSx, sinistra[0].h), x, yBasso);
  posa(cieco(BLOCCO, hBasso - sinistra[0].h), x0, yBasso + sinistra[0].h);
  const xc = x0 + BLOCCO + GAP;
  posa(centro, xc, yBasso);
  if (hBasso > centro.h + 1) posa(cieco(BLOCCO, hBasso - centro.h), xc, yBasso + centro.h);
  const xd = xc + BLOCCO + GAP;
  x = xd;
  canali.forEach((p) => {
    posa(p, x, yBasso);
    x += p.w;
  });
  const vuotoDx = BLOCCO - nCanali * STRISCIA;
  if (vuotoDx > 0) posa(cieco(vuotoDx, hCan + mandate[0].h), x, yBasso);
  x = xd;
  mandate.forEach((p) => {
    posa(p, x, yBasso + hCan);
    x += p.w;
  });
  posa(filt, xd, yBasso + hCan + mandate[0].h, hBasso - hCan - mandate[0].h);

  const hTot = yBasso + hBasso - oy;
  const larghezza = RACK;
  const altezza = hTot + 8;

  const layout: Layout = { larghezza, altezza, riquadri: [], comandi: [], testi: [], foriRack: [] };
  const monoVisti = { n: 0 };
  for (const { p, x: px, y: py, h } of posati) {
    let modulo = p.nome;
    if (p.nome === "MONO") modulo = `MONO ${++monoVisti.n}`;
    layout.riquadri.push({ nome: p.nome, classe: p.classe, x: px, y: py, w: p.w, h });
    for (const t of p.testi) layout.testi.push({ ...t, x: t.x + px, y: t.y + py });
    for (const e of p.el) {
      const { nome, ...resto } = e;
      layout.comandi.push({ ...resto, x: resto.x + px, y: resto.y + py, id: `${modulo}|${nome}` } as Comando);
    }
  }
  for (const lato of [ox + ORECCHIA / 2, ox + RACK - ORECCHIA / 2]) {
    for (let yy = oy + 6; yy < oy + hTot - 4; yy += 44.45) layout.foriRack.push({ x: lato, y: yy + 1.7 });
  }
  return layout;
}
