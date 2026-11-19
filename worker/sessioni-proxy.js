// Proxy delle registrazioni per i siti su Cloudflare Workers.
// Qui lo chiama worker/index.js dopo la password: registra solo chi è entrato.
// Il browser parla solo col dominio del sito (CSP connect-src 'self'), il Worker
// inoltra a OpenReplay su Ganimede. Copia di proxy/worker.js del repo consenso.

const ORIGINE = "https://replay.stellakamikaze.org/ingest";
export const TETTO = 5 * 1024 * 1024; // OpenReplay manda lotti di qualche centinaio di KB

// env.LIMITE_REGISTRAZIONI è il binding [[ratelimits]] di wrangler: 120 richieste al minuto per IP.
export async function sessioniProxy(request, env = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/r/")) return null;
  // Un % o un .. nel path (/api/r/..%2fapi/) portava la richiesta fuori da /ingest,
  // oltre il bypass di Access e fino al pannello (#5985). Il tracker non li usa.
  if (/%|\.\./.test(url.pathname)) return new Response(null, { status: 400 });
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST" && request.method !== "GET") {
    return new Response(null, { status: 405, headers: { allow: "GET, POST" } });
  }
  const ip = request.headers.get("cf-connecting-ip");
  if (env.LIMITE_REGISTRAZIONI) {
    const { success } = await env.LIMITE_REGISTRAZIONI.limit({ key: ip || "senza-ip" });
    if (!success) return new Response(null, { status: 429, headers: { "retry-after": "60" } });
  }
  // Il tetto vale sui byte che arrivano davvero: una richiesta chunked non ha content-length.
  const lunghezza = Number(request.headers.get("content-length") || 0);
  if (lunghezza > TETTO) return new Response(null, { status: 413 });
  let corpo;
  if (request.method === "POST") {
    corpo = await leggiConTetto(request.body, TETTO);
    if (corpo === null) return new Response(null, { status: 413 });
  }

  const destinazione = ORIGINE + url.pathname.slice("/api/r".length) + url.search;
  const headers = new Headers();
  for (const h of ["content-type", "authorization", "user-agent", "accept", "content-encoding"]) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  // L'IP serve a OpenReplay per ricavare paese e città della sessione.
  if (ip) headers.set("x-forwarded-for", ip);
  try {
    const r = await fetch(destinazione, {
      method: request.method,
      headers,
      body: corpo,
    });
    const fuori = new Headers();
    for (const h of ["content-type", "content-encoding"]) {
      const v = r.headers.get(h);
      if (v) fuori.set(h, v);
    }
    fuori.set("cache-control", "no-store");
    return new Response(r.body, { status: r.status, headers: fuori });
  } catch {
    return new Response(null, { status: 502 });
  }
}

/** Legge il corpo fino a `tetto` byte. Oltre il tetto smette di leggere e restituisce null. */
export async function leggiConTetto(flusso, tetto) {
  if (!flusso) return new Uint8Array(0);
  const lettore = flusso.getReader();
  const pezzi = [];
  let totale = 0;
  for (;;) {
    const { done, value } = await lettore.read();
    if (done) break;
    totale += value.byteLength;
    if (totale > tetto) {
      await lettore.cancel().catch(() => {});
      return null;
    }
    pezzi.push(value);
  }
  const corpo = new Uint8Array(totale);
  let posizione = 0;
  for (const pezzo of pezzi) {
    corpo.set(pezzo, posizione);
    posizione += pezzo.byteLength;
  }
  return corpo;
}
