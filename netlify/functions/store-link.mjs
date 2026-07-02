// Team-only: mint short adr.wine/s/<code> link(s) for in-store sampling.
// Protected by SAMPLING_KEY. Links land on the join form carrying store + campaign UTMs.
// Supports a single link, a password-check (verify), and a batch (items[]) for bulk upload.
import { getStore } from "@netlify/blobs";
import { json, clean } from "./_lib.mjs";

function rid(n) { let s = "", a = "abcdefghjkmnpqrstuvwxyz23456789"; for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }

export default async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  let d;
  try { d = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const KEY = process.env.SAMPLING_KEY || "";
  if (!KEY || clean(d.key, 80) !== KEY) return json({ ok: false, error: "unauthorized" }, 401);

  // Password-check only (used by the gate before revealing the form).
  if (d.verify) return json({ ok: true });

  const store = getStore("amabile-invites");

  async function mint(venue, city, campaign) {
    const rec = { store: clean(venue, 80), location: clean(city, 80), campaign: clean(campaign, 80) || "offline_sampling", createdAt: Date.now() };
    const code = rid(6);
    await store.setJSON("s:" + code, rec);
    return { venue: rec.store, city: rec.location, url: "https://adr.wine/s/" + code };
  }

  // Batch (bulk uploader): mint many at once.
  if (Array.isArray(d.items)) {
    const out = [];
    for (const it of d.items) {
      if (!clean(it.venue, 80)) continue;
      out.push(await mint(it.venue, it.city, it.campaign || d.campaign));
    }
    return json({ ok: true, items: out });
  }

  // Single.
  if (!clean(d.store, 80)) return json({ ok: false, error: "venue_required" }, 400);
  const one = await mint(d.store, d.location, d.campaign);
  return json({ ok: true, code: one.url.split("/s/")[1], url: one.url });
};
