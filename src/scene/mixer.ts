// Il mixer in 3D: il pannello di Filippo disegnato su una texture (fondi, testate, scritte,
// anelli, tacche) e i comandi veri come oggetti sopra, nelle loro posizioni in millimetri.

import * as THREE from "three";
import { C, type Comando, type Layout } from "../panel/layout";

const MM = 0.001;
const PXMM = 4; // risoluzione della texture del pannello

export interface Visivo {
  id: string;
  comando: Comando;
  presa: THREE.Object3D; // ciò che il raycast colpisce
  imposta(v: number): void; // 0..100, oppure -1/0/1 per le levette
  luce?(on: boolean): void;
}

export interface MeterVisivo {
  id: string;
  imposta(dbu: number, clip?: boolean): boolean; // clip: il latch del codice gen~ accende il LED in cima. Vero se un LED è cambiato
  accesi(): number;
}

export interface Mixer {
  gruppo: THREE.Group;
  pannello: THREE.Mesh;
  visivi: Map<string, Visivo>;
  meter: Map<string, MeterVisivo>;
  led3: Map<string, (stato: number) => boolean>; // vero se un LED è cambiato
  larghezza: number;
  altezza: number;
}

type Materia = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
interface Parametri {
  color: THREE.ColorRepresentation;
  map?: THREE.Texture;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
}
function disegnaPannello(l: Layout): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = Math.round(l.larghezza * PXMM);
  cv.height = Math.round(l.altezza * PXMM);
  const g = cv.getContext("2d");
  if (!g) throw new Error("canvas 2d non disponibile");
  g.scale(PXMM, PXMM);
  g.fillStyle = C.rack;
  g.fillRect(0, 0, l.larghezza, l.altezza);
  for (const f of l.foriRack) {
    g.fillStyle = "#111";
    g.beginPath();
    g.roundRect(f.x - 3.2, f.y - 1.7, 6.4, 3.4, 1.7);
    g.fill();
  }
  const sfondo: Record<string, string> = {
    canale: C.p_canale, send: C.p_send, filtro: C.p_filtro, fx: C.p_fx, mic: C.p_mic,
    five: C.p_five, master: C.p_master, cue: C.p_cue, cieco: C.p_cieco,
  };
  for (const r of l.riquadri) {
    g.fillStyle = sfondo[r.classe] ?? C.p_cieco;
    g.fillRect(r.x, r.y, r.w, r.h);
    g.strokeStyle = C.s_pannello;
    g.lineWidth = 0.45;
    g.strokeRect(r.x, r.y, r.w, r.h);
    if (r.classe !== "cieco") {
      g.fillStyle = C.p_testa;
      g.fillRect(r.x, r.y, r.w, 10);
      g.fillStyle = C.t_modulo;
      g.font = `bold 3.1px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      g.textAlign = "center";
      g.fillText(r.nome, r.x + r.w / 2, r.y + 7.6);
    } else {
      g.fillStyle = C.t_piccolo;
      g.font = `2.6px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      g.textAlign = "center";
      g.fillText(r.nome, r.x + r.w / 2, r.y + r.h / 2);
    }
    g.strokeStyle = C.s_viti;
    g.lineWidth = 0.3;
    for (const [vx, vy] of [[2.6, 2.6], [r.w - 2.6, 2.6], [2.6, r.h - 2.6], [r.w - 2.6, r.h - 2.6]]) {
      g.beginPath();
      g.arc(r.x + vx, r.y + vy, 0.9, 0, Math.PI * 2);
      g.stroke();
    }
  }
  for (const c of l.comandi) {
    if (c.tipo === "manopola") {
      g.strokeStyle = C.s_anello;
      g.lineWidth = 0.25;
      g.setLineDash([0.6, 1.2]);
      g.beginPath();
      g.arc(c.x, c.y, c.r + 1.6, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      // scala da 7 a 5 (300 gradi), come le tacche di un pannello vero
      g.strokeStyle = C.s_tacche;
      g.lineWidth = 0.3;
      for (let k = 0; k <= 10; k++) {
        const a = (-150 + 30 * k) * (Math.PI / 180) - Math.PI / 2;
        const r0 = c.r + 2.4;
        const r1 = c.r + (k % 5 === 0 ? 3.6 : 3.0);
        g.beginPath();
        g.moveTo(c.x + Math.cos(a) * r0, c.y + Math.sin(a) * r0);
        g.lineTo(c.x + Math.cos(a) * r1, c.y + Math.sin(a) * r1);
        g.stroke();
      }
      if (c.detent) {
        g.strokeStyle = C.s_detent;
        g.lineWidth = 0.5;
        g.beginPath();
        g.moveTo(c.x, c.y - c.r - 2.6);
        g.lineTo(c.x, c.y - c.r - 1.2);
        g.stroke();
      }
    } else if (c.tipo === "levetta") {
      g.fillStyle = C[c.colore];
      g.strokeStyle = C.s_levetta;
      g.lineWidth = 0.35;
      g.beginPath();
      g.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    } else if (c.tipo === "fader") {
      g.fillStyle = C.f_binario;
      g.beginPath();
      g.roundRect(c.x - 0.9, c.y, 1.8, c.corsa, 0.9);
      g.fill();
      g.strokeStyle = C.s_tacche;
      g.lineWidth = 0.25;
      for (let i = 0; i <= 10; i++) {
        const yy = c.y + (c.corsa * i) / 10;
        g.beginPath();
        g.moveTo(c.x - 4.5, yy);
        g.lineTo(c.x - 2.6, yy);
        g.stroke();
      }
    } else if (c.tipo === "meter") {
      g.fillStyle = "#151513";
      g.fillRect(c.x - 0.6, c.y - 0.6, 3.8, c.n * c.passo + 0.4);
    } else if (c.tipo === "jack") {
      g.fillStyle = C.j_ghiera;
      g.beginPath();
      g.arc(c.x, c.y, 4.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = C.j_foro;
      g.beginPath();
      g.arc(c.x, c.y, 1.8, 0, Math.PI * 2);
      g.fill();
    }
  }
  for (const t of l.testi) {
    g.fillStyle = t.colore;
    g.font = `${t.peso === "bold" ? "bold " : ""}${t.size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    g.textAlign = t.anchor === "middle" ? "center" : t.anchor === "end" ? "right" : "left";
    g.fillText(t.t, t.x, t.y);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const ZONE = ["m_blu", "m_verde", "m_verde", "m_verde", "m_verde", "m_giallo", "m_giallo", "m_ambra", "m_rosso", "m_viola"] as const;

// leggero: materiali senza riflessi per la vista dall'alto, dove non ci sono ombre né bloom
export function creaMixer(l: Layout, opzioni: { leggero?: boolean } = {}): Mixer {
  // Senza riflessi lo shader costa molto meno su una grafica debole.
  const fai = (p: Parametri): Materia => {
    if (!opzioni.leggero) return new THREE.MeshStandardMaterial(p);
    const { roughness: _r, metalness: _m, ...resto } = p;
    return new THREE.MeshLambertMaterial(resto);
  };
  const W = l.larghezza * MM;
  const H = l.altezza * MM;
  const gruppo = new THREE.Group();
  const px = (x: number): number => x * MM - W / 2;
  const py = (y: number): number => H / 2 - y * MM;

  const tex = disegnaPannello(l);
  const pannello = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    fai({ map: tex, roughness: 0.7, metalness: 0.1, color: 0xd2d0cb }),
  );
  pannello.receiveShadow = true;
  pannello.position.z = 0.0001;
  gruppo.add(pannello);
  const scocca = new THREE.Mesh(
    new THREE.BoxGeometry(W + 0.004, H + 0.004, 0.09),
    fai({ color: 0x1b1b1a, roughness: 0.5, metalness: 0.4 }),
  );
  scocca.position.z = -0.045;
  scocca.castShadow = true;
  gruppo.add(scocca);

  const visivi = new Map<string, Visivo>();
  const meter = new Map<string, MeterVisivo>();
  const led3 = new Map<string, (s: number) => boolean>();
  const mat = new Map<string, Materia>();
  const materiale = (col: string, rough = 0.55, metal = 0.05): Materia => {
    const k = `${col}${rough}${metal}`;
    let m = mat.get(k);
    if (!m) {
      m = fai({ color: col, roughness: rough, metalness: metal });
      mat.set(k, m);
    }
    return m;
  };
  const indiceMat = fai({ color: C.k_indice, roughness: 0.4 });

  // Le manopole sono 115: tre mesh a testa volevano 345 disegni. Ora sono tre InstancedMesh:
  // corpi (col colore per istanza), gonne e indici. Solo l'indice si muove quando la manopola gira.
  const nManopole = l.comandi.filter((c) => c.tipo === "manopola").length;
  const geoCorpo = new THREE.CylinderGeometry(0.86, 1, 1, 28);
  const corpi = new THREE.InstancedMesh(geoCorpo, fai({ color: 0xffffff, roughness: 0.7, metalness: 0.05 }), nManopole);
  const gonne = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.08, 1.1, 1, 28), materiale("#1a1a19", 0.6), nManopole);
  const indici = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), indiceMat, nManopole);
  corpi.castShadow = true;
  for (const m of [corpi, gonne, indici]) {
    m.frustumCulled = false; // le istanze coprono tutto il pannello: il test sul volume della geometria base sbaglia
    gruppo.add(m);
  }
  const invisibile = new THREE.MeshBasicMaterial({ visible: false });
  const posa = new THREE.Matrix4();
  const tmpV = new THREE.Vector3();
  const tmpS = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpC = new THREE.Color();
  const asseZ = new THREE.Vector3(0, 0, 1);
  const quarto = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2); // il cilindro nasce con l'asse lungo y
  let iManopola = 0;

  // Tutti i LED dei meter in una sola InstancedMesh: erano circa 150 disegni, uno per LED.
  // Fanno luce propria (materiale senza ombre): acceso o spento è il colore dell'istanza.
  // Acceso supera 1: è ciò che il bloom raccoglie.
  const LED_ACCESO = 2.6;
  const LED_SPENTO = 0.1;
  const nLed = l.comandi.reduce((n, c) => n + (c.tipo === "meter" ? c.n : 0), 0);
  const led = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), nLed);
  led.frustumCulled = false;
  gruppo.add(led);
  const fermo = new THREE.Quaternion();
  let iLed = 0;

  for (const c of l.comandi) {
    if (c.tipo === "manopola") {
      const r = c.r * MM;
      const alt = (c.r > 6.5 ? 16 : 13) * MM;
      const k = iManopola++;
      const cx = px(c.x);
      const cy = py(c.y);
      // corpo e gonna sono tondi: girare la manopola non li cambia, quindi si posano una volta sola
      posa.compose(tmpV.set(cx, cy, alt / 2), quarto, tmpS.set(r, alt, r));
      corpi.setMatrixAt(k, posa);
      corpi.setColorAt(k, tmpC.set(C[c.colore]));
      posa.compose(tmpV.set(cx, cy, 0.8 * MM), quarto, tmpS.set(r, 1.6 * MM, r));
      gonne.setMatrixAt(k, posa);
      const giraIndice = (v: number): void => {
        tmpQ.setFromAxisAngle(asseZ, -THREE.MathUtils.degToRad(-150 + 3 * v));
        tmpV.set(0, r * 0.42, alt + 0.2 * MM).applyQuaternion(tmpQ);
        posa.compose(tmpV.set(cx + tmpV.x, cy + tmpV.y, tmpV.z), tmpQ, tmpS.set(0.9 * MM, r * 0.75, 0.6 * MM));
        indici.setMatrixAt(k, posa);
        indici.instanceMatrix.needsUpdate = true;
      };
      giraIndice(0);
      // la presa per il raycast: invisibile, una per manopola, come per fader e levette
      const presa = new THREE.Mesh(geoCorpo, invisibile);
      presa.position.set(cx, cy, alt / 2);
      presa.quaternion.copy(quarto);
      presa.scale.set(r, alt, r);
      gruppo.add(presa);
      visivi.set(c.id, { id: c.id, comando: c, presa, imposta: giraIndice });
    } else if (c.tipo === "fader") {
      const g = new THREE.Group();
      const cap = new THREE.Mesh(new THREE.BoxGeometry(10 * MM, 7 * MM, 9 * MM), materiale(C.f_cursore, 0.5));
      cap.position.z = 4.5 * MM;
      cap.castShadow = true;
      const riga = new THREE.Mesh(new THREE.BoxGeometry(10.2 * MM, 0.7 * MM, 0.4 * MM), indiceMat);
      riga.position.z = 9.1 * MM;
      g.add(cap, riga);
      gruppo.add(g);
      const binario = new THREE.Mesh(new THREE.PlaneGeometry(14 * MM, c.corsa * MM + 8 * MM), new THREE.MeshBasicMaterial({ visible: false }));
      binario.position.set(px(c.x), py(c.y + c.corsa / 2), 0.002);
      gruppo.add(binario);
      visivi.set(c.id, {
        id: c.id,
        comando: c,
        presa: binario,
        imposta: (v) => g.position.set(px(c.x), py(c.y + c.corsa * (1 - v / 100)), 0),
      });
      binario.userData.cap = cap;
    } else if (c.tipo === "levetta") {
      const g = new THREE.Group();
      g.position.set(px(c.x), py(c.y), 0);
      const dado = new THREE.Mesh(new THREE.CylinderGeometry(c.r * 0.55 * MM, c.r * 0.55 * MM, 2.5 * MM, 6), materiale("#9a9a96", 0.35, 0.8));
      dado.rotation.x = Math.PI / 2;
      dado.position.z = 1.25 * MM;
      const perno = new THREE.Group();
      perno.position.z = 2.5 * MM;
      const leva = new THREE.Mesh(new THREE.CylinderGeometry(0.9 * MM, 1.3 * MM, 11 * MM, 12), materiale("#c9c9c4", 0.25, 0.9));
      leva.position.y = 0;
      leva.rotation.x = Math.PI / 2;
      leva.position.z = 5.5 * MM;
      perno.add(leva);
      const presa = new THREE.Mesh(new THREE.BoxGeometry(c.r * 3.2 * MM, c.r * 3.6 * MM, 12 * MM), new THREE.MeshBasicMaterial({ visible: false }));
      presa.position.z = 6 * MM;
      g.add(dado, perno, presa);
      gruppo.add(g);
      visivi.set(c.id, {
        id: c.id,
        comando: c,
        presa,
        imposta: (v) => {
          perno.rotation.x = -v * THREE.MathUtils.degToRad(24);
        },
      });
    } else if (c.tipo === "bottone") {
      const g = new THREE.Group();
      g.position.set(px(c.x), py(c.y), 0);
      const corpo = new THREE.Mesh(new THREE.BoxGeometry(c.w * MM, c.h * MM, 4 * MM), materiale(C[c.colore], 0.45));
      corpo.position.z = 2 * MM;
      corpo.castShadow = true;
      const lm = fai({ color: C[c.luce], emissive: C[c.luce], emissiveIntensity: 0.05, roughness: 0.3 });
      const luce = new THREE.Mesh(new THREE.BoxGeometry((c.w - 2.4) * MM, 1.1 * MM, 0.5 * MM), lm);
      luce.position.set(0, (c.h / 2 - 0.8 - 0.55) * MM, 4.1 * MM);
      g.add(corpo, luce);
      gruppo.add(g);
      visivi.set(c.id, {
        id: c.id,
        comando: c,
        presa: corpo,
        imposta: (v) => {
          corpo.position.z = (v ? 1.4 : 2) * MM;
          luce.position.z = (v ? 3.5 : 4.1) * MM;
          lm.emissiveIntensity = v ? 3.2 : 0.05;
        },
      });
    } else if (c.tipo === "meter") {
      const primo = iLed;
      const colori: THREE.Color[] = [];
      const stato: boolean[] = [];
      for (let i = 0; i < c.n; i++) {
        colori.push(new THREE.Color(C[ZONE[Math.min(Math.floor((i * 10) / c.n), 9)]]));
        stato.push(false);
        posa.compose(tmpV.set(px(c.x + 1.3), py(c.y + (c.n - 1 - i) * c.passo + (c.passo - 0.8) / 2), 0.6 * MM), fermo, tmpS.set(2.6 * MM, (c.passo - 0.8) * MM, 1.2 * MM));
        led.setMatrixAt(iLed, posa);
        led.setColorAt(iLed++, tmpC.copy(colori[i]).multiplyScalar(LED_SPENTO));
      }
      // scala: 10 LED da -18 a +24 dBu (0 dBu nominale al quarto); 20 LED a passi di 3 dB da -33
      const soglie = c.n === 10 ? [-18, -12, -6, 0, 3, 6, 9, 12, 18, 24] : Array.from({ length: c.n }, (_, i) => -33 + 3 * i);
      meter.set(c.id, {
        id: c.id,
        imposta: (dbu, clip = false) => {
          let cambiato = false;
          for (let i = 0; i < c.n; i++) {
            const on = dbu >= soglie[i] || (clip && i === c.n - 1);
            if (stato[i] === on) continue;
            stato[i] = on;
            cambiato = true;
            led.setColorAt(primo + i, tmpC.copy(colori[i]).multiplyScalar(on ? LED_ACCESO : LED_SPENTO));
          }
          if (cambiato && led.instanceColor) led.instanceColor.needsUpdate = true;
          return cambiato;
        },
        accesi: () => stato.filter(Boolean).length,
      });
    } else if (c.tipo === "led3") {
      const cols = [C.led_verde, C.led_giallo, C.led_rosso];
      const ms = cols.map((col) => fai({ color: new THREE.Color(col).multiplyScalar(0.2), emissive: col, emissiveIntensity: 0 }));
      ms.forEach((m, i) => {
        const s = new THREE.Mesh(new THREE.SphereGeometry(1.4 * MM, 12, 8), m);
        s.position.set(px(c.x - 4 + 4 * i), py(c.y), 0.4 * MM);
        gruppo.add(s);
      });
      led3.set(c.id, (stato) => {
        let cambiato = false;
        ms.forEach((m, i) => {
          const e = Math.round(stato) === i + 1 ? 2.8 : 0;
          if (m.emissiveIntensity !== e) cambiato = true;
          m.emissiveIntensity = e;
        });
        return cambiato;
      });
    }
  }
  return { gruppo, pannello, visivi, meter, led3, larghezza: W, altezza: H };
}
