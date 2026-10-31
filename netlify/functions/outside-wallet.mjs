// Andiamo!: Apple Wallet web service for the bottles card (see lib/_outside_wallet.mjs).
//   GET    /api/wallet/add?s&e&m                                     the card itself, from a signed link the app opens
//   POST   /api/wallet/v1/devices/:device/registrations/:type/:serial   a phone added the card (push token in the body)
//   GET    /api/wallet/v1/devices/:device/registrations/:type           which of its cards changed since a tag
//   DELETE /api/wallet/v1/devices/:device/registrations/:type/:serial   the card was removed from that phone
//   GET    /api/wallet/v1/passes/:type/:serial                          the latest card
//   POST   /api/wallet/v1/log                                           Wallet's own error reports
// Apple calls these with "Authorization: ApplePass <token>", the token we put in the card.
import { store, getJSON } from "../lib/_outside.mjs";
import { WK, walletConfig, appleOn, authFor, addLinkOk, buildPkpass, register, unregister, updatedSince } from "../lib/_outside_wallet.mjs";

export const config = { path: "/api/wallet/*" };

const PKPASS = "application/vnd.apple.pkpass";
const txt = (status, body = "") => new Response(status === 204 || status === 304 ? null : body, { status });
const passResponse = (bytes, c) => new Response(bytes, { status: 200, headers: {
  "content-type": PKPASS, "content-disposition": 'attachment; filename="andiamo.pkpass"', "cache-control": "no-store",
  "last-modified": new Date(c.updatedAt || Date.now()).toUTCString() } });

// In-app browsers (WhatsApp, Instagram, Facebook, Snapchat...) can't hand a card to Wallet: they show the file
// as text. On an iPhone, anything that isn't Safari or a real browser gets a page that opens Safari instead.
const IN_APP = /WhatsApp|Instagram|FBAN|FBAV|FB_IAB|FBIOS|Snapchat|Twitter|TikTok|musical_ly|BytedanceWebview|Line\/|LinkedInApp|Telegram/i;
export const inAppIOS = (ua = "") => /iPhone|iPad|iPod/.test(ua) && (IN_APP.test(ua) || !/Safari\//.test(ua));
const escapePage = (link) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Add to Apple Wallet</title>
<style>body{margin:0;font-family:-apple-system,system-ui,sans-serif;background:#F4EBDD;color:#3a2a20;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box}
.c{max-width:380px;width:100%;box-sizing:border-box;background:#FBFAEB;border:3px solid #3a2a20;border-radius:28px;padding:26px 22px;text-align:center}
h1{font-family:Georgia,serif;color:#E74529;font-size:28px;margin:0 0 10px}p{font-size:16px;line-height:1.45;margin:0 0 18px;color:#6b5646}
a.b{display:block;background:#E74529;color:#fff;font-weight:800;font-size:17px;text-decoration:none;padding:14px;border-radius:999px;border:3px solid #3a2a20;box-shadow:0 4px 0 #3a2a20}
button{margin-top:14px;background:none;border:0;color:#E74529;font-weight:800;font-size:15px;text-decoration:underline}small{display:block;margin-top:16px;color:#6b5646;font-size:13px;line-height:1.4}</style></head>
<body><div class="c"><h1>Add it in Safari</h1><p>This browser can't add cards to Wallet. Safari can, in one tap.</p>
<a class="b" href="x-safari-${link}">Open in Safari</a><button id="cp">Copy the link</button>
<small>If Safari doesn't open, tap ⋯ at the top and choose Open in browser.</small></div>
<script>document.getElementById("cp").onclick=async()=>{try{await navigator.clipboard.writeText(${JSON.stringify(link)});document.getElementById("cp").textContent="Copied. Paste it in Safari."}catch(e){}}</script></body></html>`,
  { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

export default async (req) => {
  const s = store();
  const cfg = await walletConfig(s);
  if (!appleOn(cfg)) return txt(503, "Wallet is not set up yet.");
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/wallet\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const typeOk = (t) => t === cfg.apple.passTypeId;
  const authed = (serial) => (req.headers.get("authorization") || "") === "ApplePass " + authFor(serial);

  try {
    // The player taps Add to Apple Wallet in the app.
    if (parts[0] === "add" && req.method === "GET") {
      const serial = url.searchParams.get("s") || "";
      if (!addLinkOk(serial, url.searchParams.get("e"), url.searchParams.get("m") || "")) return txt(403, "This link has expired. Open Andiamo! and tap Add to Apple Wallet again.");
      const c = await getJSON(s, WK.card(serial));
      if (!c) return txt(404);
      const ua = req.headers.get("user-agent") || "";
      console.log("wallet add", inAppIOS(ua) ? "in-app" : "browser", ua.slice(0, 200));
      if (inAppIOS(ua)) return escapePage(url.toString());
      return passResponse(await buildPkpass(s, c), c);
    }
    if (parts[0] !== "v1") return txt(404);

    if (parts[1] === "log" && req.method === "POST") {
      const d = await req.json().catch(() => ({}));
      for (const m of (d.logs || []).slice(0, 10)) console.warn("wallet log", String(m).slice(0, 300));
      return txt(200);
    }

    if (parts[1] === "devices" && parts[3] === "registrations") {
      const device = parts[2], type = parts[4], serial = parts[5];
      if (!device || !typeOk(type)) return txt(404);
      if (serial) {
        if (!authed(serial)) return txt(401);
        if (!(await getJSON(s, WK.card(serial)))) return txt(404);
        if (req.method === "POST") {
          const d = await req.json().catch(() => ({}));
          if (!d.pushToken) return txt(400);
          return txt(await register(s, device, serial, String(d.pushToken).slice(0, 200)));
        }
        if (req.method === "DELETE") { await unregister(s, device, serial); return txt(200); }
        return txt(405);
      }
      if (req.method === "GET") {
        const r = await updatedSince(s, device, url.searchParams.get("passesUpdatedSince"));
        return r ? new Response(JSON.stringify(r), { status: 200, headers: { "content-type": "application/json" } }) : txt(204);
      }
      return txt(405);
    }

    if (parts[1] === "passes" && req.method === "GET") {
      const type = parts[2], serial = parts[3];
      if (!typeOk(type) || !serial) return txt(404);
      if (!authed(serial)) return txt(401);
      const c = await getJSON(s, WK.card(serial));
      if (!c) return txt(404);
      const since = Date.parse(req.headers.get("if-modified-since") || "");
      if (since && Math.floor((c.updatedAt || 0) / 1000) <= Math.floor(since / 1000)) return txt(304);
      return passResponse(await buildPkpass(s, c), c);
    }
    return txt(404);
  } catch (e) {
    console.error("outside-wallet", String(e && e.stack || e).slice(0, 500));
    return txt(500);
  }
};
