// Il cortile di notte: le due torri, il mixer sul flight case, ombre, bloom e fumo.
// Costava troppo per molti computer. Ora:
// - le ombre si calcolano una volta e si rifanno solo quando un comando si sposta;
// - la scena disegna solo quando qualcosa si muove (suono, camera, fumo, un comando);
// - la qualità ha tre gradini (qualita.ts) e scende da sola se i frame non reggono;
// - le 115 manopole del mixer sono tre InstancedMesh (mixer.ts).

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { scossa, spostamento } from "../audio/vie";
import { creaMondo } from "./mondo";
import { creaMateriali, creaTorre, type Stack } from "./stack";
import { creaSorveglianza, LIVELLI, SCALA_SCHERMO, SOTTO, type Gradino } from "./qualita";
import type { Contesto, Fotogramma, Scena } from "./scena";

type Vista = "mixer" | "sessione" | "impianto" | "stack";

export interface OpzioniPiena {
  gradino: Gradino;
  sorveglia: boolean; // falso nelle prove: la qualità resta quella chiesta
  suGradino(g: Gradino): void; // la scena è scesa di un gradino
  suLenta(): void; // anche il gradino più basso non regge
  ombreVive?: boolean; // solo per le misure: rifà le ombre a ogni disegno, come faceva la scena prima
}

export function creaPiena({ canvas, mixer, calma }: Contesto, opzioni: OpzioniPiena): Scena {
  let gradino = opzioni.gradino;
  let L = LIVELLI[gradino];

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = L.ombre;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.info.autoReset = false; // i conti valgono per un disegno intero, ombre e bloom compresi

  const scena = new THREE.Scene();
  scena.background = new THREE.Color(0x0b0907);
  scena.fog = new THREE.FogExp2(0x1a120b, 0.048);
  scena.add(new THREE.HemisphereLight(0x3d4a66, 0x1c130b, 0.55));

  const camera = new THREE.PerspectiveCamera(40, 1, 0.02, 120);
  const orbita = new OrbitControls(camera, canvas);
  orbita.enableDamping = true;
  orbita.dampingFactor = 0.08;
  orbita.maxPolarAngle = Math.PI * 0.49;
  orbita.minDistance = 0.25;
  orbita.maxDistance = 14;

  const mondo = creaMondo();
  scena.add(mondo.gruppo);

  const TILT = 0.2;
  mixer.gruppo.rotation.x = -Math.PI / 2 + TILT;
  mixer.gruppo.position.set(-0.12, 0.86 + 0.09 + Math.sin(TILT) * (mixer.altezza / 2) * 0.2, 0);
  mondo.tavolo.add(mixer.gruppo);

  const legno = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}img/legno.jpg`);
  const materiali = creaMateriali(legno);
  const torri: Stack[] = [creaTorre(materiali, -1), creaTorre(materiali, 1)];
  torri[0].gruppo.position.set(-1.85, 0, -3.5);
  torri[0].gruppo.rotation.y = 0.14;
  torri[1].gruppo.position.set(1.85, 0, -3.5);
  torri[1].gruppo.rotation.y = -0.14;
  for (const t of torri) scena.add(t.gruppo);
  scena.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.castShadow) o.receiveShadow = true;
  });

  // ---------------- ombre ferme ----------------
  // Luci e oggetti non si muovono: ridisegnare le ombre a ogni frame voleva dire otto scene in più.
  // Si rifanno al primo disegno, quando torna il contesto grafico e quando un comando si sposta:
  // subito quella della lampada da lavoro, tutte e tre poco dopo l'ultimo movimento.
  const [, , lavoro] = mondo.ombre;
  mondo.ombre.forEach((l, i) => {
    l.shadow.autoUpdate = opzioni.ombreVive === true;
    l.shadow.mapSize.setScalar(L.mappe[i]); // decise all'avvio: mappe più piccole vogliono meno memoria video
  });
  let attesaOmbre = -1;
  const rifaiOmbre = (): void => {
    for (const l of mondo.ombre) l.shadow.needsUpdate = true;
  };
  rifaiOmbre();

  let sporco = true;
  let disegni = 0;
  function richiedi(forma = false): void {
    sporco = true;
    if (!forma) return;
    lavoro.shadow.needsUpdate = true;
    attesaOmbre = 0.3;
  }
  canvas.addEventListener("webglcontextrestored", () => {
    rifaiOmbre();
    sporco = true;
  });
  // le immagini arrivano dopo il primo disegno: ognuna ne chiede un altro
  THREE.DefaultLoadingManager.onProgress = () => (sporco = true);
  THREE.DefaultLoadingManager.onLoad = () => (sporco = true);

  // ---------------- bloom e gradini ----------------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scena, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.45, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function ridimensiona(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio, L.dpr * SCALA_SCHERMO);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    // bloom ridotto: l'alone si calcola a metà risoluzione, il resto della scena no
    if (L.bloom === "ridotto") bloom.setSize((w * pr) / 2, (h * pr) / 2);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 1 ? 52 : 40;
    camera.updateProjectionMatrix();
    sporco = true;
  }
  window.addEventListener("resize", ridimensiona);

  // Gradino essenziale: i materiali perdono i riflessi. Restano com'erano quelli che fanno luce
  // (LED, gole dei driver, finestre, lampione): altri pezzi di codice ne muovono l'intensità.
  const opachi = new Map<THREE.Material, THREE.Material>();
  let opacizzata = false;
  function opacizza(): void {
    if (opacizzata) return;
    opacizzata = true;
    const opaco = (m: THREE.Material): THREE.Material => {
      if (!(m instanceof THREE.MeshStandardMaterial) || m.emissive.getHex() !== 0) return m;
      let o = opachi.get(m);
      if (!o) {
        o = new THREE.MeshLambertMaterial({ color: m.color, map: m.map, side: m.side, transparent: m.transparent, opacity: m.opacity, visible: m.visible });
        opachi.set(m, o);
      }
      return o;
    };
    scena.traverse((ogg) => {
      const mesh = ogg as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(opaco) : opaco(mesh.material);
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.needsUpdate = true;
    });
    // il faretto davanti illumina ancora, ma non fa più ombra: la sua cade dietro le torri, sul muro.
    // Restano le ombre lunghe del lampione sul selciato e quella della lampada da lavoro sul mixer.
    mondo.ombre[1].castShadow = false;
  }

  const sorveglianza = creaSorveglianza();
  function applica(g: Gradino): void {
    const tipoPrima = renderer.shadowMap.type;
    gradino = g;
    L = LIVELLI[g];
    renderer.shadowMap.type = L.ombre;
    if (L.ombre !== tipoPrima) {
      // il tipo d'ombra sta dentro gli shader: vanno ricompilati
      scena.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        for (const x of Array.isArray(m) ? m : m ? [m] : []) x.needsUpdate = true;
      });
      rifaiOmbre();
    }
    if (L.opaco) opacizza();
    mondo.fumo.quante(L.fumo);
    canvas.dataset.qualita = g;
    ridimensiona();
    sorveglianza.azzera();
  }
  applica(gradino);

  // ---------------- inquadrature ----------------
  const centroMixer = new THREE.Vector3();
  scena.updateMatrixWorld(true);
  mixer.pannello.getWorldPosition(centroMixer);
  const viste: Record<Vista, { pos: THREE.Vector3; mira: THREE.Vector3 }> = {
    mixer: { pos: centroMixer.clone().add(new THREE.Vector3(0, 0.88, 0.4)), mira: centroMixer.clone().add(new THREE.Vector3(0, 0, 0.035)) },
    sessione: { pos: new THREE.Vector3(0, 1.7, 1.2), mira: new THREE.Vector3(0, 1.15, -2.6) },
    impianto: { pos: new THREE.Vector3(0.5, 1.25, 4.3), mira: new THREE.Vector3(0, 1.55, -3.4) },
    // da vicino e di lato: la corsa dei coni è lungo l'asse, di fronte non si legge
    stack: { pos: new THREE.Vector3(-0.72, 1.3, -1.45), mira: new THREE.Vector3(-1.85, 1.62, -3.2) },
  };
  let volo: { da: THREE.Vector3; daMira: THREE.Vector3; a: Vista; t: number } | null = null;
  let vistaCorrente: Vista = "impianto";
  // su uno schermo verticale la camera arretra lungo la sua linea di mira
  const posizione = (v: Vista): THREE.Vector3 => {
    // il mixer è già verticale: gli basta poco per stare nella larghezza di un telefono
    const k = camera.aspect >= 1 ? 1 : v === "mixer" ? Math.max(1, 0.56 / camera.aspect) : 1 + (1 - camera.aspect) * 1.6;
    return viste[v].mira.clone().add(viste[v].pos.clone().sub(viste[v].mira).multiplyScalar(k));
  };
  const tasti = document.querySelectorAll<HTMLButtonElement>("#viste button");
  function vai(v: Vista, subito = false): void {
    tasti.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.vista === v)));
    vistaCorrente = v;
    sporco = true;
    if (subito || calma.matches) {
      camera.position.copy(posizione(v));
      orbita.target.copy(viste[v].mira);
      return;
    }
    volo = { da: camera.position.clone(), daMira: orbita.target.clone(), a: v, t: 0 };
  }
  vai("impianto", true);
  window.addEventListener("resize", () => {
    if (!volo) camera.position.copy(posizione(vistaCorrente));
  });
  tasti.forEach((b) => b.addEventListener("click", () => vai(b.dataset.vista as Vista)));

  // ---------------- un frame ----------------
  const tmp = new THREE.Vector3();
  let suonava = false;
  let daUltimo = 1;

  // Muove ciò che si muove e dice se la scena è cambiata. Gira a ogni frame, anche quando non si disegna:
  // membrane e casse restano agganciate al suono.
  let cameraMossa = false; // volo o trascinamento: si disegna a ogni frame, il tetto vale solo per il suono
  function anima({ dtVero, dt, t, acceso, occupata, vie }: Fotogramma): boolean {
    let mosso = false;
    cameraMossa = false;
    if (volo) {
      volo.t = Math.min(1, volo.t + dtVero / 1.5); // tempo vero: il volo dura 1,5 s anche a pochi fps
      const e = volo.t >= 1 ? 1 : 1 - Math.pow(2, -10 * volo.t);
      camera.position.lerpVectors(volo.da, posizione(volo.a), e);
      orbita.target.lerpVectors(volo.daMira, viste[volo.a].mira, e);
      if (volo.t >= 1) volo = null;
      mosso = cameraMossa = true;
    } else if (!acceso && !calma.matches && L.respiro) {
      // attesa: la camera respira davanti all'impianto
      camera.position.x = posizione("impianto").x + Math.sin(t * 0.12) * 0.5;
      mosso = true;
    }
    const quieta = calma.matches;
    const suona = vie.some((v) => v.veloce > 1e-4 || v.lento > 1e-4 || Math.abs(v.forma) > 1e-4);
    if (suona || suonava) mosso = true; // un frame in più dopo il silenzio: le membrane tornano a riposo
    suonava = suona;
    const spinte: { pos: THREE.Vector3; forza: number; larghezza: number }[] = [];
    for (const st of torri) {
      for (const mb of st.membrane) {
        mb.oggetto.position.copy(mb.riposo).addScaledVector(mb.asse, mb.corsa * spostamento(vie[mb.via], mb.via, quieta));
        mb.gola.emissiveIntensity = mb.bagliore * (quieta ? vie[mb.via].lento : vie[mb.via].veloce);
      }
      const colpo = scossa(vie[0], vie[1], quieta);
      for (const c of st.casse) {
        const e = c.via <= 1 ? colpo : 0;
        c.oggetto.position.set(c.riposo.x, c.riposo.y + 0.0011 * e, c.riposo.z + 0.0014 * e);
      }
      if (quieta) continue;
      for (const b of st.bocche) {
        const forza = Math.max(0, vie[b.via].veloce - vie[b.via].lento);
        if (forza > 0.02) spinte.push({ pos: b.oggetto.localToWorld(tmp.copy(b.pos)).clone(), forza: forza * 2.2, larghezza: b.larghezza });
      }
    }
    if (!quieta && mondo.fumo.aggiorna(dt, spinte)) mosso = true;
    if (!occupata && orbita.update()) mosso = cameraMossa = true;
    if (attesaOmbre > 0 && (attesaOmbre -= dtVero) <= 0) {
      rifaiOmbre();
      mosso = true;
    }
    return mosso;
  }

  function disegna(): void {
    renderer.info.reset();
    disegni++;
    if (L.bloom === "spento") renderer.render(scena, camera);
    else composer.render();
  }

  function aggiorna(f: Fotogramma): void {
    const mosso = anima(f);
    daUltimo += f.dtVero;
    if (opzioni.sorveglia && sorveglianza.misura(f.dtVero, mosso, L.soglia)) {
      const giu = SOTTO[gradino];
      if (giu) {
        applica(giu);
        opzioni.suGradino(giu);
      } else opzioni.suLenta();
    }
    if (!mosso && !sporco) return;
    // tetto ai disegni: sotto il passo minimo si salta, e il disegno resta dovuto
    if (L.tetto > 0 && !cameraMossa && daUltimo < 1 / L.tetto - 0.004) {
      sporco = true;
      return;
    }
    sporco = false;
    daUltimo = 0;
    disegna();
  }

  return {
    nome: "piena",
    camera,
    renderer,
    torri,
    pedali: mondo.pedali,
    disattivaOrbita: (on) => (orbita.enabled = !on),
    richiedi,
    disegni: () => disegni,
    forza: disegna,
    aggiorna,
    dopoAccensione: () => vai("sessione"),
  };
}
