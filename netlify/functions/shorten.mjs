// Mint a short wya.to/r/<code> link for a venue's pre-filled round-up invite.
import { getStore } from "@netlify/blobs";
import { json, clean } from "./_lib.mjs";

function rid(n) { let s = "", a = "abcdefghjkmnpqrstuvwxyz23456789"; for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }

export default async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  let d;
  try { d = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const rec = {
    host: clean(d.host, 80),
    when: clean(d.when, 120),
    where: clean(d.where, 120),
    venue: clean(d.venue || d.where, 120),
    createdAt: Date.now()
  };

  const store = getStore("amabile-invites");
  const code = rid(6);
  await store.setJSON("r:" + code, rec);
  return json({ ok: true, code });
};
