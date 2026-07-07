// Trade lead → Google Sheet + Meta Conversions API + GA4 Measurement Protocol.
// Server-side so ad blockers / client 503s can't drop the lead.
//
// Netlify env vars:
//   META_CAPI_TOKEN   (required for Meta CAPI) — Events Manager → Settings → Conversions API → Generate access token
//   GA4_API_SECRET    (required for GA4 MP)    — GA4 Admin → Data Streams → your stream → Measurement Protocol API secrets
//   META_PIXEL_ID     (optional, defaults below)
//   GA4_MEASUREMENT_ID(optional, defaults below)
//   LEAD_WEBHOOK      (optional, defaults to the current Apps Script /exec URL)
import crypto from "node:crypto";

const SHEET_DEFAULT = "https://script.google.com/macros/s/AKfycbwQPpN1tMc_GIz1Q6yK847J79nwnfZTrocpsAcQHGRaH5a7StOSZLqWy4Kl7QAYba2afg/exec";
const PIXEL_DEFAULT = "1899998984027982";
const GA4_DEFAULT = "G-VPXZKLYBL3";

const hashEmail = (s) => { s = String(s || "").trim().toLowerCase(); return s ? crypto.createHash("sha256").update(s).digest("hex") : null; };
const hashPhone = (s) => { const d = String(s || "").replace(/[^0-9]/g, ""); return d ? crypto.createHash("sha256").update(d).digest("hex") : null; };

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let d;
  try { d = await req.json(); } catch { return new Response("Bad request", { status: 400 }); }

  const ip = (req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const ua = req.headers.get("user-agent") || "";
  const url = d.page_url || "https://www.amabiledirosa.com/trade.html";
  const eventId = d.event_id || crypto.randomUUID();
  const out = {};

  // 1) Google Sheet — keep the existing lead capture.
  const SHEET = process.env.LEAD_WEBHOOK || SHEET_DEFAULT;
  try {
    await fetch(SHEET, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(d) });
    out.sheet = "ok";
  } catch (e) { out.sheet = "fail"; }

  // 2) Meta Conversions API — Lead (deduped with the browser pixel via event_id).
  const CAPI = process.env.META_CAPI_TOKEN;
  const PIXEL = process.env.META_PIXEL_ID || PIXEL_DEFAULT;
  if (CAPI) {
    const user_data = { client_user_agent: ua };
    if (ip) user_data.client_ip_address = ip;
    const em = hashEmail(d.email); if (em) user_data.em = [em];
    const ph = hashPhone(d.phone); if (ph) user_data.ph = [ph];
    if (d.fbp) user_data.fbp = d.fbp;
    if (d.fbc) user_data.fbc = d.fbc;
    const body = { data: [{
      event_name: "Lead",
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: "website",
      event_source_url: url,
      user_data,
      custom_data: { content_name: "Wholesale enquiry", business_type: d.buyer_type || "", location: d.location || "" }
    }] };
    try {
      const r = await fetch(`https://graph.facebook.com/v19.0/${PIXEL}/events?access_token=${encodeURIComponent(CAPI)}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
      });
      out.meta = r.ok ? "ok" : ("err:" + r.status);
    } catch (e) { out.meta = "fail"; }
  } else { out.meta = "skip:no-token"; }

  // 3) GA4 Measurement Protocol — generate_lead.
  const SECRET = process.env.GA4_API_SECRET;
  const MID = process.env.GA4_MEASUREMENT_ID || GA4_DEFAULT;
  if (SECRET) {
    const cid = d.ga_client_id || (Math.floor(Math.random() * 1e10) + "." + Math.floor(Date.now() / 1000));
    const body = { client_id: cid, events: [{ name: "generate_lead", params: { business_type: d.buyer_type || "", location: d.location || "", engagement_time_msec: 100 } }] };
    try {
      const r = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(MID)}&api_secret=${encodeURIComponent(SECRET)}`, {
        method: "POST", body: JSON.stringify(body)
      });
      out.ga4 = (r.ok || r.status === 204) ? "ok" : ("err:" + r.status);
    } catch (e) { out.ga4 = "fail"; }
  } else { out.ga4 = "skip:no-secret"; }

  return new Response(JSON.stringify({ ok: true, out }), { headers: { "content-type": "application/json" } });
};
