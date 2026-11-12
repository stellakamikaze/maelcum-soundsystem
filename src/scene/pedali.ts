// I quattro pedali degli effetti: scatole con due manopole ciascuna. Stanno sul flight case nella
// scena piena e accanto al mixer nella vista leggera: chi li crea decide dove posarli.

import * as THREE from "three";
import type { Visivo } from "./mixer";

export interface Pedali {
  scatole: THREE.Group[]; // una per pedale, con l'origine al centro della base
  pedali: Visivo[];
}

export const LARGO_PEDALE = 0.075;
export const LUNGO_PEDALE = 0.12;

function etichetta(testo: string, sotto: string, w: number, h: number, fondo: string): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = Math.round((512 * h) / w);
  const g = cv.getContext("2d");
  if (!g) throw new Error("canvas");
  g.fillStyle = fondo;
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = "#f1ece2";
  g.textAlign = "center";
  // il nome sta sempre dentro la scatola: se è lungo, il corpo scende
  let corpo = Math.round(cv.height * 0.13);
  const stile = (px: number): string => `600 ${px}px "Big Shoulders Stencil Display", "Helvetica Neue", sans-serif`;
  g.font = stile(corpo);
  const largo = g.measureText(testo).width;
  if (largo > cv.width * 0.88) corpo = Math.floor((corpo * cv.width * 0.88) / largo);
  g.font = stile(corpo);
  g.fillText(testo, cv.width / 2, cv.height * 0.86);
  g.font = `500 ${Math.round(cv.height * 0.07)}px "Big Shoulders Text", "Helvetica Neue", sans-serif`;
  g.fillStyle = "rgba(241,236,226,0.7)";
  g.fillText(sotto, cv.width / 2, cv.height * 0.95, cv.width * 0.88);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function creaPedali(): Pedali {
  const scatole: THREE.Group[] = [];
  const pedali: Visivo[] = [];
  const nomi: [string, string, string][] = [
    ["ECO A NASTRO", "TEMPO · RIPETIZIONI", "#5a2a1c"],
    ["PING-PONG", "TEMPO · RIPETIZIONI", "#1f3a4a"],
    ["MOLLA", "CODA · TONO", "#3f4a1f"],
    ["RIVERBERO", "CODA · TONO", "#3a2a4a"],
  ];
  nomi.forEach(([nome, sotto, colore], i) => {
    const g = new THREE.Group();
    const pw = LARGO_PEDALE, ph = LUNGO_PEDALE;
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.045, ph), [
      new THREE.MeshStandardMaterial({ color: colore, roughness: 0.5, metalness: 0.3 }),
      new THREE.MeshStandardMaterial({ color: colore, roughness: 0.5, metalness: 0.3 }),
      new THREE.MeshStandardMaterial({ map: etichetta(nome, sotto, pw, ph, colore), roughness: 0.55, metalness: 0.2 }),
      new THREE.MeshStandardMaterial({ color: colore }),
      new THREE.MeshStandardMaterial({ color: colore }),
      new THREE.MeshStandardMaterial({ color: colore }),
    ]);
    corpo.castShadow = true;
    corpo.position.y = 0.0225;
    g.add(corpo);
    (["a", "b"] as const).forEach((k, j) => {
      const pom = new THREE.Group();
      pom.position.set((j ? 1 : -1) * 0.018, 0.045, -0.032);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0095, 0.014, 20), new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.6 }));
      m.position.y = 0.007;
      const ind = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.001, 0.007), new THREE.MeshStandardMaterial({ color: 0xf0f0ea }));
      ind.position.set(0, 0.0142, -0.0035);
      pom.add(m, ind);
      g.add(pom);
      pedali.push({
        id: `PEDALE ${i + 1}|${k}`,
        comando: { id: `PEDALE ${i + 1}|${k}`, tipo: "manopola", x: 0, y: 0, r: 9, colore: "k_gain", detent: false },
        presa: m,
        imposta: (v) => {
          pom.rotation.y = -THREE.MathUtils.degToRad(-150 + 3 * v);
        },
      });
    });
    scatole.push(g);
  });
  return { scatole, pedali };
}
