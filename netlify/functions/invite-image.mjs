// Stores and serves the per-invite card image (used as the link-preview image).
// POST {code, dataUrl}  → save the PNG for that invite
// GET  ?c=<code>        → stream the saved PNG (falls back to a neutral image)
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
    if (!code || !/^data:image\/png;base64,/.test(dataUrl)) return json({ ok: false, error: "bad" }, 400);
    try {
      const b64 = dataUrl.split(",")[1];
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      await store.set("img:" + code, bytes.buffer);
    } catch (e) {
      return json({ ok: false, error: "store" }, 500);
    }
    return json({ ok: true });
  }

  const url = new URL(req.url);
  const code = clean(url.searchParams.get("c"), 40).toLowerCase();
  if (code) {
    const buf = await store.get("img:" + code, { type: "arrayBuffer" }).catch(() => null);
    if (buf) {
      return new Response(buf, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
    }
  }
  return Response.redirect(FALLBACK, 302);
};
