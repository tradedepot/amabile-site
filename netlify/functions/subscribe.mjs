// Newsletter / join-form signup → Brevo contact.
// Env vars (Netlify → Environment variables):
//   BREVO_API_KEY  (required)
//   BREVO_LIST_ID  (optional — numeric list ID)
// To capture in-store sampling tags, create these TEXT attributes in Brevo
// (Contacts → Settings → Contact attributes): SOURCE, VENUE, CAMPAIGN. (CITY already exists.)
// If they don't exist, signup still succeeds — the tags are just skipped.
export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let data = {};
  try { data = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "Bad request" }; }

  const email = String(data.email || "").trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { statusCode: 400, body: "Valid email required" };

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { statusCode: 500, body: "Server not configured (missing BREVO_API_KEY)" };

  const clean = (s, n) => String(s == null ? "" : s).slice(0, n).trim();
  const base = { FIRSTNAME: clean(data.name, 80), CITY: clean(data.city, 80) };
  const extra = {};
  if (data.source) extra.SOURCE = clean(data.source, 60);
  if (data.store && data.medium === "sampling") extra.VENUE = clean(data.store, 80); // only samplings have a real venue
  if (data.location) extra.CITY = clean(data.location, 80); // sampling city overrides the typed city
  if (data.campaign) extra.CAMPAIGN = clean(data.campaign, 80);

  const listId = process.env.BREVO_LIST_ID;

  async function send(attributes) {
    const body = { email, attributes, updateEnabled: true };
    if (listId) body.listIds = [Number(listId)];
    const res = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body)
    });
    const text = res.ok ? "" : await res.text();
    return { res, text };
  }

  try {
    let { res, text } = await send({ ...base, ...extra });
    // If the sampling attributes aren't defined in Brevo, retry with just the basics so signup never fails.
    if (!res.ok && res.status !== 204 && Object.keys(extra).length && /attribute/i.test(text)) {
      ({ res, text } = await send(base));
    }
    if (res.ok || res.status === 204) return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    if (/already|exist/i.test(text)) return { statusCode: 200, body: JSON.stringify({ ok: true, note: "updated" }) };
    return { statusCode: res.status, body: text };
  } catch (e) {
    return { statusCode: 502, body: String(e) };
  }
}
