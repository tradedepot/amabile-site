// Team-only: mint a short adr.wine/s/<code> link for an in-store sampling.
// Protected by SAMPLING_KEY. The link lands on the join form carrying store + campaign UTMs.
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

  const rec = {
    store: clean(d.store, 80),
    location: clean(d.location, 120),
    campaign: clean(d.campaign, 80) || "offline_sampling",
    createdAt: Date.now()
  };
  if (!rec.store) return json({ ok: false, error: "store_required" }, 400);

  const store = getStore("amabile-invites");
  const code = rid(6);
  await store.setJSON("s:" + code, rec);
  return json({ ok: true, code, url: "https://adr.wine/s/" + code });
};
