// Cancello d'entrata di hornsandbricks.stellakamikaze.org: una pagina chiede la password,
// il Worker la confronta col secret PASSWORD e lascia un cookie di sessione firmato con scadenza.
// Dopo la password, /api/r/* inoltra le registrazioni delle sessioni (OpenReplay, solo col consenso del banner).
// Tutto ciò che passa riceve COOP/COEP (il motore audio usa SharedArrayBuffer) e niente cache pubblica.
//
// Secret (npx wrangler@4 secret put, da stdin):
//   PASSWORD        la password d'entrata
//   SEGRETO_COOKIE  chiave HMAC del cookie, separata dalla password (revisione del 19/11/2026)
// Il cookie è "<scadenza>.<HMAC(SEGRETO_COOKIE, scadenza)>" e vale 30 giorni, come dipping-for-goldfish.
// Binding [[ratelimits]] in wrangler.toml: LIMITE_ENTRA (5 tentativi al minuto per IP) e LIMITE_REGISTRAZIONI (/api/r).

import { sessioniProxy } from "./sessioni-proxy.js";

const COOKIE = "hb_sessione";
const DURATA = 30 * 24 * 3600;
const enc = new TextEncoder();

async function firma(segreto, testo) {
  const chiave = await crypto.subtle.importKey("raw", enc.encode(segreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", chiave, enc.encode(testo));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function uguali(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function cookieNuovo(env) {
  const scade = String(Math.floor(Date.now() / 1000) + DURATA);
  return `${scade}.${await firma(env.SEGRETO_COOKIE, scade)}`;
}

async function cookieValido(req, env) {
  const cookie = req.headers.get("Cookie") || "";
  const valore = cookie.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || "";
  const [scade, sig] = valore.split(".");
  if (!scade || !sig || !/^\d+$/.test(scade) || Number(scade) < Date.now() / 1000) return false;
  return uguali(sig, await firma(env.SEGRETO_COOKIE, scade));
}

// Cache: l'HTML mai (passa dal cancello), i file di Vite con l'impronta per un anno, audio e immagini per una
// settimana. Sempre "private": stanno dietro la password e non devono finire nella cache di Cloudflare.
export function cacheDi(pathname, contentType = "") {
  if (contentType.startsWith("text/html")) return "private, no-store";
  if (pathname.startsWith("/assets/")) return "private, max-age=31536000, immutable";
  if (pathname.startsWith("/audio/") || pathname.startsWith("/img/")) return "private, max-age=604800";
  return "private, no-cache";
}

function intestazioni(h, cache = "private, no-store") {
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("Cross-Origin-Embedder-Policy", "require-corp");
  h.set("Cache-Control", cache);
  h.set("X-Robots-Tag", "noindex, nofollow");
  h.set("Referrer-Policy", "no-referrer");
  return h;
}

function testo(status, corpo, extra = {}) {
  return new Response(corpo, { status, headers: intestazioni(new Headers({ "Content-Type": "text/plain; charset=utf-8", ...extra })) });
}

// "poi" è la coda dell'indirizzo chiesto (?diagnosi, ?qualita=…): dopo la password si torna lì.
const codaSicura = (x) => (/^\?[\w=&.-]{0,80}$/.test(x) ? x : "");

function paginaAccesso(errore, poi = "") {
  const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Horns &amp; Bricks</title>
<style>
:root { --fuliggine:#0e0c0a; --sodio:#ffa24a; --osso:#f1ece2; --osso-2:#c9bfb0; color-scheme: dark; }
* { box-sizing: border-box; }
body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px; background:radial-gradient(ellipse at 70% 10%, #3a1d0c 0%, var(--fuliggine) 60%); color:var(--osso); font-family:"Helvetica Neue", Helvetica, Arial, sans-serif; }
main { width:min(400px, 100%); }
h1 { margin:0 0 6px; font-size:clamp(44px, 12vw, 64px); line-height:.9; font-weight:900; letter-spacing:-.02em; text-transform:uppercase; font-stretch:condensed; }
p { margin:0 0 26px; color:var(--osso-2); font-size:17px; line-height:1.4; }
label { display:block; font-weight:600; font-size:15px; margin-bottom:8px; }
input { width:100%; font:inherit; font-size:20px; padding:12px 14px; background:#1a1612; color:var(--osso); border:1px solid rgba(241,236,226,.25); }
input:focus { outline:2px solid var(--sodio); outline-offset:2px; border-color:transparent; }
button { margin-top:14px; width:100%; font:inherit; font-weight:900; font-size:20px; text-transform:uppercase; letter-spacing:.03em; padding:14px; background:var(--sodio); color:var(--fuliggine); border:0; cursor:pointer; }
.errore { color:var(--sodio); font-weight:600; margin:12px 0 0; }
::selection { background:var(--sodio); color:var(--fuliggine); }
</style></head><body><main>
<h1>Horns &amp; Bricks</h1>
<p>Il mixer maelcum di Filippo, suonato sul suo impianto. Pagina privata.</p>
<form method="post" action="/entra">
<input type="hidden" name="poi" value="${codaSicura(poi)}">
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
<button type="submit">Entra</button>
${errore ? '<p class="errore" role="alert">Password sbagliata. Riprova.</p>' : ""}
</form></main></body></html>`;
  return new Response(html, {
    status: errore ? 401 : 200,
    headers: intestazioni(new Headers({ "Content-Type": "text/html; charset=utf-8" })),
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!env.PASSWORD || !env.SEGRETO_COOKIE) return new Response("Mancano i secret PASSWORD o SEGRETO_COOKIE", { status: 500 });

    if (url.pathname === "/entra" && req.method === "POST") {
      if (env.LIMITE_ENTRA) {
        const { success } = await env.LIMITE_ENTRA.limit({ key: req.headers.get("CF-Connecting-IP") || "sconosciuto" });
        if (!success) return testo(429, "Troppi tentativi. Riprova fra un minuto.\n", { "Retry-After": "60" });
      }
      let dati;
      try {
        dati = await req.formData();
      } catch {
        return testo(400, "Richiesta non valida.\n");
      }
      const data = String(dati.get("password") || "");
      const poi = String(dati.get("poi") || "");
      // Confronto a tempo costante: le due firme hanno sempre la stessa lunghezza.
      if (!uguali(await firma(env.PASSWORD, data), await firma(env.PASSWORD, env.PASSWORD))) return paginaAccesso(true, poi);
      const h = intestazioni(new Headers({ Location: "/" + codaSicura(poi) }));
      h.append("Set-Cookie", `${COOKIE}=${await cookieNuovo(env)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DURATA}`);
      return new Response(null, { status: 303, headers: h });
    }
    if (url.pathname === "/esci") {
      const h = intestazioni(new Headers({ Location: "/" }));
      h.append("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
      return new Response(null, { status: 303, headers: h });
    }

    if (!(await cookieValido(req, env))) return paginaAccesso(false, url.search);

    const sessioni = await sessioniProxy(req, env);
    if (sessioni) return sessioni;

    // Diagnosi (?diagnosi nella pagina): le misure finiscono nel log del Worker, lette con `wrangler tail`.
    if (url.pathname === "/diag" && req.method === "POST") {
      console.log("DIAG", (await req.text()).slice(0, 2000));
      return new Response(null, { status: 204, headers: intestazioni(new Headers()) });
    }

    const r = await env.ASSETS.fetch(req);
    const h = intestazioni(new Headers(r.headers), cacheDi(url.pathname, r.headers.get("Content-Type") || ""));
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
  },
};
