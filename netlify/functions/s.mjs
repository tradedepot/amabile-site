// Resolve a sampling short link adr.wine/s/<code> → the join form, carrying store UTMs.
import { getStore } from "@netlify/blobs";
import { clean } from "./_lib.mjs";

export const config = { path: "/s/:code" };

const SITE = "https://www.amabiledirosa.com/";
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export default async (req) => {
  const url = new URL(req.url);
  const m = url.pathname.match(/\/s\/([^\/?#]+)/);
  const code = clean((m && m[1]) || "", 40).toLowerCase();
  const fallback = SITE + "?join=1#join";
  if (!code) return Response.redirect(fallback, 302);

  const rec = await getStore("amabile-invites").get("s:" + code, { type: "json" }).catch(() => null);
  if (!rec) return Response.redirect(fallback, 302);

  const p = [
    "utm_source=offline",
    "utm_medium=sampling",
    "utm_campaign=" + encodeURIComponent(slug(rec.campaign) || "offline_sampling")
  ];
  if (rec.store) p.push("utm_content=" + encodeURIComponent(slug(rec.store)));
  if (rec.location) p.push("utm_term=" + encodeURIComponent(slug(rec.location)));
  p.push("join=1");

  return Response.redirect(SITE + "?" + p.join("&") + "#join", 302);
};
