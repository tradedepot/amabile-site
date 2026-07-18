// Bamboa × Amabile "Predict & Win" (World Cup final: Spain vs Argentina).
// Stores each entry (for winner selection) and adds/updates a Brevo contact tagged for the event.
import { getStore } from "@netlify/blobs";
import { json, clean, isEmail } from "./_lib.mjs";

const CAMPAIGN = "bamboa-spain-argentina";
const VENUE = "Bamboa";
const KEY = "predict:" + CAMPAIGN;
// Kick-off: 8pm WAT (GMT+1) on 19 July 2026. Predictions close at kick-off.
const KICKOFF = Date.parse("2026-07-19T19:00:00Z");

export default async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  if (Date.now() >= KICKOFF) return json({ ok: false, error: "closed" }, 403);
  let d;
  try { d = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const name = clean(d.name, 80);
  const email = clean(d.email, 160);
  const home = String(d.home == null ? "" : d.home).replace(/[^0-9]/g, "").slice(0, 2);
  const away = String(d.away == null ? "" : d.away).replace(/[^0-9]/g, "").slice(0, 2);
  if (!name || !isEmail(email) || home === "" || away === "") return json({ ok: false, error: "missing" }, 400);

  const prediction = "Spain " + home + "–" + away + " Argentina";

  // Store the entry (source of truth for winner selection).
  // One entry per person, keyed by email: a repeat submission UPDATES the existing
  // record (last prediction wins) instead of adding a second shot at the draw.
  const store = getStore("amabile-invites");
  const list = (await store.get(KEY, { type: "json" }).catch(() => null)) || [];
  const key = email.toLowerCase();
  const i = list.findIndex((e) => (e.email || "").toLowerCase() === key);
  const rec = {
    name, email, home: Number(home), away: Number(away), prediction,
    at: i >= 0 ? list[i].at : Date.now(),
    updatedAt: Date.now(),
  };
  const updated = i >= 0;
  if (updated) list[i] = rec; else list.push(rec);
  await store.setJSON(KEY, list);

  // Brevo contact (tagged), with graceful fallback if attributes don't exist.
  const apiKey = process.env.BREVO_API_KEY;
  if (apiKey) {
    const base = { FIRSTNAME: name };
    const extra = { SOURCE: clean(d.source, 60) || "watchparty", CAMPAIGN, VENUE };
    async function add(attrs) {
      const body = { email, attributes: attrs, updateEnabled: true };
      const lid = process.env.BREVO_LIST_ID; if (lid) body.listIds = [Number(lid)];
      const r = await fetch("https://api.brevo.com/v3/contacts", {
        method: "POST", headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body)
      });
      return { ok: r.ok || r.status === 204, text: r.ok ? "" : await r.text() };
    }
    try {
      const res = await add({ ...base, ...extra });
      if (!res.ok && /attribute/i.test(res.text)) await add(base);
    } catch (_) {}
  }

  return json({ ok: true, prediction, updated });
};
