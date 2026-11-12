// Diagnosi sul computer vero di chi guarda: si accende solo con ?diagnosi nell'indirizzo.
// Ogni 3 secondi manda al Worker (POST /diag) le misure della pagina: frame, disegni, gradino,
// risoluzione, buchi audio. Chi mantiene il sito le legge con `npx wrangler@4 tail`. Niente viene salvato.

export interface Fonti {
  canvas: HTMLCanvasElement;
  scena: string;
  disegni(): number;
  audio(): Record<string, unknown> | null;
}

export function creaDiagnosi(f: Fonti): ((dt: number) => void) | null {
  if (!new URLSearchParams(location.search).has("diagnosi")) return null;
  const id = Math.random().toString(36).slice(2, 7);
  const manda = (dati: Record<string, unknown>): void => {
    void fetch("/diag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...dati }), keepalive: true }).catch(() => {});
  };
  let scheda = "?";
  try {
    const gl = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
    const est = gl?.getExtension("WEBGL_debug_renderer_info");
    scheda = gl ? String(est ? gl.getParameter(est.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : "niente WebGL";
  } catch {
    /* resta "?" */
  }
  manda({
    tipo: "avvio",
    ua: navigator.userAgent,
    core: navigator.hardwareConcurrency,
    dpr: devicePixelRatio,
    schermo: `${screen.width}x${screen.height}`,
    finestra: `${innerWidth}x${innerHeight}`,
    scheda,
    scena: f.scena,
    isolata: crossOriginIsolated,
  });
  addEventListener("error", (e) => manda({ tipo: "errore", testo: String(e.message).slice(0, 300) }));
  addEventListener("unhandledrejection", (e) => manda({ tipo: "errore", testo: String(e.reason).slice(0, 300) }));

  let tempo = 0;
  let frame = 0;
  let peggiore = 0;
  let lunghi = 0; // frame oltre 50 ms
  let disegniPrima = f.disegni();
  let giro = 0;
  return (dt: number): void => {
    tempo += dt;
    frame++;
    if (dt > peggiore) peggiore = dt;
    if (dt > 0.05) lunghi++;
    if (tempo < 3) return;
    const d = f.disegni();
    manda({
      tipo: "misura",
      n: giro++,
      fps: +(frame / tempo).toFixed(1),
      disegni: +((d - disegniPrima) / tempo).toFixed(1),
      peggiore: Math.round(peggiore * 1000),
      lunghi,
      qualita: f.canvas.dataset.qualita ?? f.scena,
      tela: `${f.canvas.width}x${f.canvas.height}`,
      nascosta: document.hidden,
      audio: f.audio(),
    });
    disegniPrima = d;
    tempo = frame = peggiore = lunghi = 0;
  };
}
