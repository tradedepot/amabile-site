// Stores and serves the per-invite card image (used as the link-preview image).
// POST {code, dataUrl}  → save the JPEG/PNG for that invite
// GET  ?c=<code>        → stream the saved image (falls back to a neutral image)
import { getStore } from "@netlify/blobs";
import { json, clean } from "./_lib.mjs";

const FALLBACK = "https://www.amabiledirosa.com/assets/images/occasions/just_because.jpg";

export default async (req) => {
  const store = getStore("amabile-invites");

  if (req.method === "POST") {
    let d;
    try { d = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }
    const code = clean(d.code, 40).toLowerCase();
    const dataUrl = String(d.dataUrl || "");
    const m = dataUrl.match(/^data:(image\/(?:png|jpeg));base64,/);
    if (!code || !m) return json({ ok: false, error: "bad" }, 400);
    try {
      const b64 = dataUrl.slice(m[0].length);
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      await store.set("img:" + code, bytes.buffer, { metadata: { ct: m[1] } });
    } catch (e) {
      return json({ ok: false, error: "store" }, 500);
    }
    return json({ ok: true });
  }

  const url = new URL(req.url);
  const code = clean(url.searchParams.get("c"), 40).toLowerCase();
  if (code) {
    const res = await store.getWithMetadata("img:" + code, { type: "arrayBuffer" }).catch(() => null);
    if (res && res.data) {
      const ct = (res.metadata && res.metadata.ct) || "image/jpeg";
      return new Response(res.data, { headers: { "content-type": ct, "cache-control": "public, max-age=86400" } });
    }
  }
  return Response.redirect(FALLBACK, 302);
};
