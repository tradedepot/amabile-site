// Resolve a short link wya.to/r/<code>:
//  - crawlers (WhatsApp link preview) get venue-coded "booking confirmed" tags
//  - real users are redirected on to the pre-filled invite generator
import { getStore } from "@netlify/blobs";
import { clean } from "./_lib.mjs";

export const config = { path: "/r/:code" };

const GEN = "https://wya.to/";
const IMG = "https://www.amabiledirosa.com/assets/images/occasions/just_because.jpg";
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export default async (req) => {
  const url = new URL(req.url);
  const m = url.pathname.match(/\/r\/([^\/?#]+)/);
  const code = clean((m && m[1]) || "", 40).toLowerCase();
  const rec = code ? await getStore("amabile-invites").get("r:" + code, { type: "json" }).catch(() => null) : null;

  let target = GEN + "?invite=1&v=linkup";
  let venue = "";
  if (rec) {
    venue = rec.venue || rec.where || "";
    const p = ["invite=1", "v=linkup"];
    if (rec.host) p.push("host=" + encodeURIComponent(rec.host));
    if (rec.when) p.push("when=" + encodeURIComponent(rec.when));
    if (rec.where) p.push("where=" + encodeURIComponent(rec.where));
    p.push("utm_source=venue", "utm_medium=reservation");
    if (venue) p.push("utm_campaign=" + encodeURIComponent(slug(venue)));
    target = GEN + "?" + p.join("&");
  }

  const title = venue ? ("Your table at " + venue + " is confirmed 🎉") : "Your booking is confirmed 🎉";
  const desc = "Now round up your crew — tap to sort who's coming.";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="robots" content="noindex">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${IMG}">
<meta name="theme-color" content="#E74529">
<script>location.replace(${JSON.stringify(target)});</script>
</head><body style="font-family:system-ui,sans-serif;background:#E74529;color:#FFF3E0;text-align:center;padding:48px 20px">
Taking you there… <a href="${esc(target)}" style="color:#fff">Continue</a>
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
};
