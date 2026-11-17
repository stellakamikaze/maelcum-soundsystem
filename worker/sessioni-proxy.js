// Proxy delle registrazioni per i siti su Cloudflare Workers.
// Qui lo chiama worker/index.js dopo la password: registra solo chi è entrato.
// Il browser parla solo col dominio del sito (CSP connect-src 'self'), il Worker
// inoltra a OpenReplay su Ganimede. Copia di proxy/worker.js del repo consenso.

const ORIGINE = "https://replay.stellakamikaze.org/ingest";
const TETTO = 5 * 1024 * 1024; // OpenReplay manda lotti di qualche centinaio di KB

export async function sessioniProxy(request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/r/")) return null;
  // Un % o un .. nel path (/api/r/..%2fapi/) portava la richiesta fuori da /ingest,
  // oltre il bypass di Access e fino al pannello (#5985). Il tracker non li usa.
  if (/%|\.\./.test(url.pathname)) return new Response(null, { status: 400 });
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST" && request.method !== "GET") {
    return new Response(null, { status: 405, headers: { allow: "GET, POST" } });
  }
  const lunghezza = Number(request.headers.get("content-length") || 0);
  if (lunghezza > TETTO) return new Response(null, { status: 413 });

  const destinazione = ORIGINE + url.pathname.slice("/api/r".length) + url.search;
  const headers = new Headers();
  for (const h of ["content-type", "authorization", "user-agent", "accept", "content-encoding"]) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  // L'IP serve a OpenReplay per ricavare paese e città della sessione.
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) headers.set("x-forwarded-for", ip);
  try {
    const r = await fetch(destinazione, {
      method: request.method,
      headers,
      body: request.method === "POST" ? request.body : undefined,
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
