// Outside: the page behind a bottle link (/outside/g/<code>). It exists for the link preview in Instagram,
// Snapchat and WhatsApp: a sealed card with the sender's first name in the title, never the wine, the note
// or who it is for. People are sent straight on to the game, which stages the opening.
import { store, K, getJSON, SITE } from "./_outside.mjs";
import { giftCode } from "./_outside_gift.mjs";

// /g/* serves the same page on the game's own domain (weoutside.ng/g/<code>).
export const config = { path: ["/outside/g/*", "/g/*"] };

const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export default async (req) => {
  const url = new URL(req.url);
  const code = giftCode(url.pathname.split("/").pop());
  let from = "";
  try {
    const s = store();
    const id = await s.get(K.gift(code));
    const b = id ? await getJSON(s, K.bottle(String(id))) : null;
    if (b && b.via === "link") from = (b.fromName || "").split(/\s+/)[0];
  } catch {}
  const title = from ? `${from}'s sending you an Amabile` : "Someone's sending you an Amabile";
  const desc = "Something's coming to your table. Open it to see what.";
  const page = `${SITE}/g/${code}`, img = `${SITE}/img/gift-og.jpg`;
  const game = (url.pathname.startsWith("/outside/") ? "/outside/" : "/") + "?g=" + encodeURIComponent(code);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="noindex">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Outside by Amabile di Rosa">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(page)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${esc(img)}">
<meta property="snapchat:sticker" content="${esc(SITE + "/img/gift-sticker.png")}">
<meta name="theme-color" content="#7d1d1d">
<meta http-equiv="refresh" content="0;url=${esc(game)}">
<style>body{margin:0;background:#7d1d1d;color:#fff6e6;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh}a{color:#f2c66b}</style>
</head><body><p><a href="${esc(game)}">Open it</a></p><script>location.replace(${JSON.stringify(game)})</script></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" } });
};
