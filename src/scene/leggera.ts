// La vista dall'alto: solo il mixer e i quattro pedali, coi loro colori, sotto una luce calda al sodio.
// Niente cortile, niente torri, niente ombre, niente bloom, nessuna immagine da scaricare. Disegna solo
// quando qualcosa cambia. È l'ultimo gradino (qualità "minima"): non parte da sola, la sceglie chi guarda.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { creaPedali, LARGO_PEDALE, LUNGO_PEDALE } from "./pedali";
import type { Contesto, Scena } from "./scena";

const STACCO = 0.03; // spazio fra mixer e pedali
const PASSO = LARGO_PEDALE + 0.012;

export function creaLeggera({ canvas, mixer }: Contesto): Scena {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "default" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // disegna di rado: può permettersi la nitidezza
  renderer.toneMapping = THREE.NoToneMapping;

  const scena = new THREE.Scene();
  scena.background = new THREE.Color(0x0e0c0a);
  scena.add(new THREE.HemisphereLight(0xfff1e0, 0x6a5a48, 1.7));
  const sole = new THREE.DirectionalLight(0xffc48a, 1.7); // il lampione al sodio, da sopra
  sole.position.set(-0.3, 1, 0.45); // un po' di lato: i fianchi delle manopole restano leggibili
  scena.add(sole);

  // mixer piatto: l'alto del pannello guarda verso -z, che per la camera è l'alto dello schermo
  mixer.gruppo.rotation.x = -Math.PI / 2;
  mixer.gruppo.position.set(0, 0, 0);
  scena.add(mixer.gruppo);
  const { scatole, pedali } = creaPedali();
  for (const g of scatole) scena.add(g);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  camera.up.set(0, 0, -1);
  const orbita = new OrbitControls(camera, canvas);
  orbita.enableRotate = false;
  orbita.enableDamping = false;
  orbita.screenSpacePanning = true;
  orbita.minZoom = 1;
  orbita.maxZoom = 5;
  orbita.zoomToCursor = true;
  orbita.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  orbita.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };

  let sporco = true;
  let disegni = 0;
  const richiedi = (): void => {
    sporco = true;
  };
  orbita.addEventListener("change", richiedi);

  // Inquadra mixer e pedali nello spazio libero fra l'intestazione e la barra dei deck.
  function inquadra(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    const W = mixer.larghezza;
    const H = mixer.altezza;
    const verticale = w < h;
    // pedali: a destra in 2x2 su uno schermo largo, sotto in fila su uno stretto
    scatole.forEach((g, i) => {
      if (verticale) g.position.set((i - 1.5) * PASSO, 0, H / 2 + STACCO + LUNGO_PEDALE / 2);
      else g.position.set(W / 2 + STACCO + LARGO_PEDALE / 2 + (i % 2) * PASSO, 0, (Math.floor(i / 2) - 0.5) * (LUNGO_PEDALE + 0.02));
    });
    const x0 = -W / 2;
    const x1 = verticale ? W / 2 : W / 2 + STACCO + LARGO_PEDALE + PASSO;
    const z0 = -H / 2;
    const z1 = verticale ? H / 2 + STACCO + LUNGO_PEDALE : H / 2;
    const barra = document.querySelector<HTMLElement>("#barra");
    const sopra = 60;
    const sotto = (barra && !barra.hidden ? barra.offsetHeight : 0) + 14;
    const lato = 14;
    const largo = Math.max(50, w - 2 * lato);
    const alto = Math.max(50, h - sopra - sotto);
    const scala = Math.min(largo / (x1 - x0), alto / (z1 - z0)); // pixel per metro
    const cx = lato + largo / 2; // centro dello spazio libero, in pixel
    const cy = sopra + alto / 2;
    camera.left = -cx / scala;
    camera.right = (w - cx) / scala;
    camera.top = cy / scala;
    camera.bottom = -(h - cy) / scala;
    camera.zoom = 1;
    camera.position.set((x0 + x1) / 2, 1, (z0 + z1) / 2);
    orbita.target.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    camera.updateProjectionMatrix();
    orbita.update();
    richiedi();
  }
  window.addEventListener("resize", inquadra);
  inquadra();

  return {
    nome: "leggera",
    camera,
    renderer,
    torri: [],
    pedali,
    disattivaOrbita: (on) => (orbita.enabled = !on),
    richiedi,
    disegni: () => disegni,
    forza: () => renderer.render(scena, camera),
    aggiorna: () => {
      if (!sporco) return;
      sporco = false;
      disegni++;
      renderer.render(scena, camera);
    },
    dopoAccensione: inquadra, // ora la barra dei deck è visibile: l'inquadratura le lascia posto
  };
}
