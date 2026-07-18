// Bamboa × Amabile "Predict & Win" (World Cup final: Spain vs Argentina).
// Stores each entry (for winner selection) and adds/updates a Brevo contact tagged for the event.
import { getStore } from "@netlify/blobs";
import { json, clean, isEmail } from "./_lib.mjs";

const CAMPAIGN = "bamboa-spain-argentina";
const VENUE = "Bamboa";
const KEY = "predict:" + CAMPAIGN;

export default async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  let d;
  try { d = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const name = clean(d.name, 80);
  const email = clean(d.email, 160);
  const home = String(d.home == null ? "" : d.home).replace(/[^0-9]/g, "").slice(0, 2);
  const away = String(d.away == null ? "" : d.away).replace(/[^0-9]/g, "").slice(0, 2);
  if (!name || !isEmail(email) || home === "" || away === "") return json({ ok: false, error: "missing" }, 400);

  const prediction = "Spain " + home + "–" + away + " Argentina";

  // Store the entry (source of truth for winner selection).
  const store = getStore("amabile-invites");
  const list = (await store.get(KEY, { type: "json" }).catch(() => null)) || [];
  list.push({ name, email, home: Number(home), away: Number(away), prediction, at: Date.now() });
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

  return json({ ok: true, prediction });
};
