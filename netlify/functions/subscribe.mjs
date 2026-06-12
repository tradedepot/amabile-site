// Newsletter signup → Brevo contact
// Set these in Netlify → Site configuration → Environment variables:
//   BREVO_API_KEY  (required — keep secret, never in the repo)
//   BREVO_LIST_ID  (optional — numeric ID of the Brevo list to add contacts to)
export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  let data = {};
  try { data = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "Bad request" }; }

  const email = String(data.email || "").trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { statusCode: 400, body: "Valid email required" };
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { statusCode: 500, body: "Server not configured (missing BREVO_API_KEY)" };

  const body = {
    email,
    attributes: {
      FIRSTNAME: String(data.name || "").trim(),
      CITY: String(data.city || "").trim()
    },
    updateEnabled: true   // update the contact if they already exist
  };
  const listId = process.env.BREVO_LIST_ID;
  if (listId) body.listIds = [Number(listId)];

  try {
    const res = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body)
    });
    if (res.ok || res.status === 204) {
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }
    const text = await res.text();
    if (/already|exist/i.test(text)) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, note: "updated" }) };
    }
    return { statusCode: res.status, body: text };
  } catch (e) {
    return { statusCode: 502, body: String(e) };
  }
}
