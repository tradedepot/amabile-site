// Resolve a short link: wya.to/r/<code> → the pre-filled invite generator.
import { getStore } from "@netlify/blobs";
import { clean } from "./_lib.mjs";

export const config = { path: "/r/:code" };

const FALLBACK = "https://www.amabiledirosa.com/?invite=1";
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export default async (req) => {
  const url = new URL(req.url);
  const m = url.pathname.match(/\/r\/([^\/?#]+)/);
  const code = clean((m && m[1]) || "", 40).toLowerCase();
  if (!code) return Response.redirect(FALLBACK, 302);

  const rec = await getStore("amabile-invites").get("r:" + code, { type: "json" }).catch(() => null);
  if (!rec) return Response.redirect(FALLBACK, 302);

  const p = ["invite=1", "v=linkup"];
  if (rec.host) p.push("host=" + encodeURIComponent(rec.host));
  if (rec.when) p.push("when=" + encodeURIComponent(rec.when));
  if (rec.where) p.push("where=" + encodeURIComponent(rec.where));
  p.push("utm_source=venue", "utm_medium=reservation");
  if (rec.venue) p.push("utm_campaign=" + encodeURIComponent(slug(rec.venue)));

  return Response.redirect("https://www.amabiledirosa.com/?" + p.join("&"), 302);
};
