// Seat ordering for live events (first run: Whalemouth "The Last Bachelor", 18 Oct 2026,
// Balmoral Convention Centre). Guests scan a QR, pick wine, pay with Paystack, and a runner
// brings it to their table. Shared helpers; the leading _ keeps Netlify from exposing this file.
//
// Storage: Netlify Blobs, store "amabile-show". One blob per order plus an append-only event
// log (one blob per change), so concurrent orders never overwrite each other and the runner
// board only fetches what changed since its last poll.
//
// Env: PAYSTACK_SECRET_KEY, PAYSTACK_PUBLIC_KEY, SHOW_KEY (runner board password, falls back
// to SAMPLING_KEY), optional WhatsApp alerts (see notifyWhatsApp), optional BREVO_API_KEY.
import { getStore } from "@netlify/blobs";

export const EVENT = {
  slug: "whalemouth-2026",
  name: "Whalemouth: The Last Bachelor",
  short: "The Last Bachelor",
  venue: "Balmoral Convention Centre",
  // Hard stop for new orders (the board can also pause/resume at any time). 3am WAT, 19 Oct.
  closesAt: Date.parse("2026-10-19T02:00:00Z"),
  currency: "NGN",
  maxBottles: 6,       // per order
  suyaMin: 2           // orders of this many bottles or more get one complimentary suya
};

// Frizzante portfolio. Facts from 02_brand_context/product_data.md. Accents per brand colours.
export const WINES = [
  { id: "bianco", name: "Bianco", kind: "Sweet White", price: 20000, abv: "9%",
    notes: "Pear, elderflower, citrus blossom. Light fizz.", img: "/assets/images/products/bianco.jpg", accent: "#82B28C" },
  { id: "rosato", name: "Rosato", kind: "Sweet Rosé", price: 20000, abv: "9%",
    notes: "Strawberry, raspberry, rose petals. Delicate sparkle.", img: "/assets/images/products/rosato.jpg", accent: "#4D7396" },
  { id: "rosso", name: "Rosso", kind: "Sweet Red", price: 20000, abv: "9%",
    notes: "Cherry, blackberry, cocoa. Gentle sparkle.", img: "/assets/images/products/rosso.jpg", accent: "#E74529" }
];

export const DEFAULT_SETTINGS = { open: true, suya: true, soldOut: {} };

const P = EVENT.slug + "/";
export const K = {
  order: (id) => P + "o/" + id,
  ordersPrefix: P + "o/",
  evPrefix: P + "ev/",
  ev: (id) => P + "ev/" + String(Date.now()).padStart(14, "0") + "-" + id + "-" + Math.random().toString(36).slice(2, 6),
  settings: P + "settings",
  notified: (id) => P + "n/" + id
};

export const store = () => getStore({ name: "amabile-show", consistency: "strong" });

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
export const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").slice(0, n).trim();
export const isEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || "").trim());
export const naira = (n) => "₦" + Number(n || 0).toLocaleString("en-NG");

export async function getSettings(s) {
  const v = await s.get(K.settings, { type: "json" }).catch(() => null);
  return { ...DEFAULT_SETTINGS, ...(v || {}), soldOut: { ...((v && v.soldOut) || {}) } };
}

export const isOpen = (settings) => settings.open && Date.now() < EVENT.closesAt;

// Table QRs carry the table number: /bachelor/12 = Table 12.
export function tableLabel(code) {
  const c = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  if (!c) return "";
  return "Table " + (/^\d+$/.test(c) ? String(Number(c)) : c);
}

// Short order codes runners can shout across a room. No 0/O, 1/I/L, 5/S, 2/Z, 8/B.
const ALPHA = "ACDEFGHJKMNPQRTUVWXY34679";
export function newCode(n = 3) {
  let s = "";
  const buf = new Uint32Array(n);
  crypto.getRandomValues(buf);
  for (const x of buf) s += ALPHA[x % ALPHA.length];
  return s;
}

// Order totals are always computed here, never trusted from the browser.
export function price(items, settings) {
  const out = {};
  let bottles = 0, total = 0;
  for (const w of WINES) {
    const q = Math.max(0, Math.min(EVENT.maxBottles, parseInt(items && items[w.id], 10) || 0));
    if (!q) continue;
    if (settings.soldOut[w.id]) return { error: "sold_out", wine: w.id };
    out[w.id] = q; bottles += q; total += q * w.price;
  }
  if (!bottles) return { error: "empty" };
  if (bottles > EVENT.maxBottles) return { error: "too_many" };
  const suya = settings.suya && bottles >= EVENT.suyaMin ? 1 : 0;
  return { items: out, bottles, total, suya };
}

export function itemsText(o) {
  const parts = WINES.filter((w) => o.items && o.items[w.id]).map((w) => o.items[w.id] + " " + w.name);
  return parts.join(", ");
}

// The guest-facing view of an order (no other guests' data, no internals).
export function publicView(o) {
  return {
    id: o.id, status: o.status, items: o.items, bottles: o.bottles, total: o.total,
    suya: o.suya, where: o.where, name: o.name,
    paidAt: o.paidAt || null, claimedAt: o.claimedAt || null, deliveredAt: o.deliveredAt || null
  };
}

export async function saveOrder(s, o) {
  o.updatedAt = Date.now();
  await s.setJSON(K.order(o.id), o);
  await s.setJSON(K.ev(o.id), o);
}

// ---------- Paystack ----------
const PS = "https://api.paystack.co";
const psHeaders = () => ({ authorization: "Bearer " + (process.env.PAYSTACK_SECRET_KEY || ""), "content-type": "application/json" });

export async function paystackInit(o, callbackUrl) {
  const r = await fetch(PS + "/transaction/initialize", {
    method: "POST",
    headers: psHeaders(),
    body: JSON.stringify({
      email: o.email,
      amount: o.total * 100,
      currency: EVENT.currency,
      reference: o.ref,
      callback_url: callbackUrl,
      metadata: {
        order_id: o.id, event: EVENT.slug, where: o.where,
        custom_fields: [
          { display_name: "Order", variable_name: "order_id", value: o.id },
          { display_name: "Where", variable_name: "where", value: o.where },
          { display_name: "Wine", variable_name: "items", value: itemsText(o) }
        ]
      }
    })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.status) { console.warn("paystackInit failed", r.status, JSON.stringify(d).slice(0, 300)); return null; }
  return d.data; // { authorization_url, access_code, reference }
}

export async function paystackVerify(ref) {
  const r = await fetch(PS + "/transaction/verify/" + encodeURIComponent(ref), { headers: psHeaders() });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.status) return null;
  return d.data;
}

export const idFromRef = (ref) => {
  const m = String(ref || "").match(/^WM-([A-Z0-9]{3,5})-/);
  return m ? m[1] : "";
};

// Mark an order paid from a verified Paystack transaction. Idempotent: the webhook and the
// guest's status poll can both arrive; only the first one changes anything.
export async function markPaid(s, o, tx, via) {
  if (!o || !tx) return o;
  if (o.status !== "pending") return o;
  if (tx.status !== "success") return o;
  if (Number(tx.amount) !== o.total * 100 || String(tx.currency).toUpperCase() !== EVENT.currency) {
    console.warn("markPaid amount mismatch", o.id, tx.amount, o.total);
    o.status = "review"; o.reviewReason = "amount_mismatch"; o.paidAmount = Number(tx.amount) / 100;
    await saveOrder(s, o);
    return o;
  }
  o.status = "paid";
  o.paidAt = Date.now();
  o.paidVia = via;
  o.channel = tx.channel || "";
  await saveOrder(s, o);
  await notifyOnce(s, o);
  addContact(o).catch(() => {});
  return o;
}

// ---------- Runner alerts (WhatsApp) ----------
// Best-effort, never blocks an order. The board is the source of truth; this is a nudge.
//
// Option A, CallMeBot (free, quickest): each lead runner sends "I allow callmebot to send me
//   messages" to the CallMeBot number once and gets an apikey. Set
//   WA_CALLMEBOT="2348031234567:123456,2348039876543:654321"
// Option B, WhatsApp Cloud API (Meta business number): set WA_TOKEN, WA_PHONE_ID and
//   WA_TO="2348031234567,2348039876543". Free-form text only reaches people who have messaged
//   the business number in the last 24h, so runners send it a "hi" before doors.
//   Set WA_TEMPLATE (+ WA_TEMPLATE_LANG) to use an approved template with one body variable.
async function notifyOnce(s, o) {
  const seen = await s.get(K.notified(o.id)).catch(() => null);
  if (seen) return;
  await s.set(K.notified(o.id), String(Date.now()));
  await notifyWhatsApp(o).catch((e) => console.warn("notify error", String(e)));
}

export function alertText(o) {
  const lines = [
    "New order " + o.id + " · " + o.where,
    itemsText(o) + (o.suya ? " · + free suya" : ""),
    o.name + " · " + o.phone
  ];
  if (o.note) lines.push("Note: " + o.note);
  lines.push("Board: https://www.amabiledirosa.com/bachelor/board");
  return lines.join("\n");
}

export async function notifyWhatsApp(o) {
  const text = alertText(o);
  const jobs = [];
  const cmb = process.env.WA_CALLMEBOT || "";
  for (const pair of cmb.split(",").map((x) => x.trim()).filter(Boolean)) {
    const [phone, apikey] = pair.split(":");
    if (!phone || !apikey) continue;
    const u = "https://api.callmebot.com/whatsapp.php?phone=" + encodeURIComponent(phone) +
      "&text=" + encodeURIComponent(text) + "&apikey=" + encodeURIComponent(apikey);
    jobs.push(fetch(u).then((r) => { if (!r.ok) console.warn("callmebot", r.status); }));
  }
  const token = process.env.WA_TOKEN, phoneId = process.env.WA_PHONE_ID;
  if (token && phoneId) {
    const tmpl = process.env.WA_TEMPLATE;
    for (const to of String(process.env.WA_TO || "").split(",").map((x) => x.trim()).filter(Boolean)) {
      const body = tmpl
        ? { messaging_product: "whatsapp", to, type: "template",
            template: { name: tmpl, language: { code: process.env.WA_TEMPLATE_LANG || "en" },
              components: [{ type: "body", parameters: [{ type: "text", text: text.replace(/\n/g, " | ") }] }] } }
        : { messaging_product: "whatsapp", to, type: "text", text: { body: text } };
      jobs.push(fetch("https://graph.facebook.com/v21.0/" + phoneId + "/messages", {
        method: "POST",
        headers: { authorization: "Bearer " + token, "content-type": "application/json" },
        body: JSON.stringify(body)
      }).then(async (r) => { if (!r.ok) console.warn("wa cloud", r.status, (await r.text()).slice(0, 200)); }));
    }
  }
  await Promise.allSettled(jobs);
}

// ---------- Community (Brevo) ----------
async function addContact(o) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey || !isEmail(o.email)) return;
  const send = (attributes) => {
    const body = { email: o.email, attributes, updateEnabled: true };
    const lid = process.env.BREVO_LIST_ID; if (lid) body.listIds = [Number(lid)];
    return fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body)
    });
  };
  const first = String(o.name || "").split(" ")[0];
  const r = await send({ FIRSTNAME: first, SOURCE: "seat-order", CAMPAIGN: EVENT.slug, VENUE: EVENT.venue });
  if (!r.ok) { const t = await r.text().catch(() => ""); if (/attribute/i.test(t)) await send({ FIRSTNAME: first }); }
}

// Controls (pause, suya, stock), approvals and the QR printer use the same admin password
// as the Amabile Table admin (TABLE_ADMIN_KEY). Runners only have SHOW_KEY.
export function adminAuthorised(k) {
  const key = process.env.TABLE_ADMIN_KEY || "";
  return !!key && typeof k === "string" && k === key;
}

export function boardAuthorised(k) {
  const key = process.env.SHOW_KEY || process.env.SAMPLING_KEY || "";
  return !!key && k === key;
}
