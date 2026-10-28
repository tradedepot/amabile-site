// Outside: the Amabile bottle game. Shared helpers; the leading _ keeps Netlify from exposing this file.
//
// A bottle can be sent to any Nigerian number. It waits in the recipient's WhatsApp until they are out at
// a partner venue, then the venue's own runner brings it to their table from the venue's own stock.
// Claiming switches the player's light on for their circle. Amabile places drops at venues.
//
// Storage: Netlify Blobs, store "amabile-outside". Records are one blob each; boards poll an append-only
// event log per venue (same pattern as the seat-ordering board), so concurrent writes never collide.
//
// Env:
//   OUTSIDE_SECRET          HMAC key for session and claim-link tokens (required)
//   PAYSTACK_SECRET_KEY, PAYSTACK_PUBLIC_KEY
//   WA_TOKEN, WA_PHONE_ID   WhatsApp Cloud API (Meta): system user token and the number's phone number ID
//   WA_VERIFY_TOKEN         any string, the same one entered for the webhook in the Meta app
//   WA_APP_SECRET           the Meta app's secret, to check webhook signatures (recommended)
//   OUTSIDE_TPL_BOTTLE      approved template for "x is sending an Amabile to your table" (name)
//   OUTSIDE_TPL_CODE        approved authentication template for sign-in codes (name)
//   OUTSIDE_TPL_LANG        template language code, default "en"
//   OUTSIDE_DEV=1           returns sign-in codes in API responses (test only, never in production)
//   TABLE_ADMIN_KEY         admin console password (shared with the Table admin)
//   OUTSIDE_SITE            public origin of the game, e.g. https://outside.ng (default amabiledirosa.com/outside)
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export const SITE = (process.env.OUTSIDE_SITE || "https://www.amabiledirosa.com/outside").replace(/\/$/, "");
export const TZ_OFFSET_MS = 60 * 60 * 1000; // Lagos is UTC+1 all year
export const CURRENCY = "NGN";

// ---------- wines ----------
export const WINES = [
  { id: "rosso",   family: "frizzante", name: "Rosso",   label: "Amabile Rosso",   kind: "Sweet Red" },
  { id: "bianco",  family: "frizzante", name: "Bianco",  label: "Amabile Bianco",  kind: "Sweet White" },
  { id: "rosato",  family: "frizzante", name: "Rosato",  label: "Amabile Rosato",  kind: "Sweet Rosé" },
  { id: "sp-rose", family: "spumante",  name: "Spumante Rosé",   label: "Amabile Spumante Rosé",   kind: "" },
  { id: "sp-bianco", family: "spumante", name: "Spumante Bianco", label: "Amabile Spumante Bianco", kind: "" }
];
export const wine = (id) => WINES.find((w) => w.id === id) || null;

// ---------- bands ----------
// Bands are ordered. A bottle bought in a band can be claimed at any venue in that band or a lower one.
// "top" has no gift price: waiting bottles need a top-up there; sends to a light or table at a Top venue
// are priced at that venue's own menu price.
export const BAND_ORDER = ["everyday", "lounge", "premium", "top"];
export const DEFAULT_BANDS = {
  frizzante: { everyday: 40000, lounge: 60000, premium: 80000, top: null },
  spumante:  { everyday: null,  lounge: null,  premium: 200000, top: null } // Premium only for now; revisit once venue menus are in
};
export const BAND_NAMES = { everyday: "Chill", lounge: "Classy", premium: "Premium", top: "VIP" };
export const bandRank = (b) => BAND_ORDER.indexOf(b);

// ---------- rules ----------
export const RULES = {
  lightHours: 3,              // a light goes off this long after it went on
  lightHardOffHour: 2,        // and always at 2am Lagos time
  glowMin: 5,                 // venues glow only from this many lights
  glowCacheMs: 5 * 60 * 1000, // glow recomputed every 5 minutes
  maxOpenLinks: 5,            // bottle links one sender can have out that nobody has kept yet
  maxPendingToNumber: 3,      // unclaimed bottles one sender can have waiting for one number (30 days)
  maxTableSendsPerNight: 2,
  ticketEscalateMin: 15,
  reserveMinutes: 15,         // a drop bottle is held for a table this long until served
  venueRadiusM: 60,
  locationKeepH: 24
};

export const store = () => getStore({ name: "amabile-outside", consistency: "strong" });

// ---------- basics ----------
export function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extra }
  });
}
export const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, " ").slice(0, n).trim();
export const naira = (n) => "₦" + Number(n || 0).toLocaleString("en-NG");
export const now = () => Date.now();
export function rid(n = 10) {
  const A = "abcdefghjkmnpqrstuvwxyz23456789";
  const buf = new Uint32Array(n); crypto.getRandomValues(buf);
  let s = ""; for (const x of buf) s += A[x % A.length]; return s;
}
export function code4() { return String(crypto.randomInt(0, 10000)).padStart(4, "0"); }
export const tsKey = () => String(Date.now()).padStart(14, "0") + "-" + rid(4);

// Lagos calendar night: a night runs noon to noon, so 1am Saturday still counts as Friday night.
export function nightKey(t = Date.now()) {
  const d = new Date(t + TZ_OFFSET_MS - 12 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}
export function lagosHour(t = Date.now()) { return new Date(t + TZ_OFFSET_MS).getUTCHours(); }

// Next 2am Lagos time after t.
export function next2am(t = Date.now()) {
  const d = new Date(t + TZ_OFFSET_MS);
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 2, 0, 0) - TZ_OFFSET_MS;
  return base > t ? base : base + 24 * 3600 * 1000;
}

// ---------- phone numbers ----------
// Nigerian numbers only. Returns +234XXXXXXXXXX or null.
export function phoneE164(raw) {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) return "+234" + d.slice(1);
  if (d.length === 13 && d.startsWith("234")) return "+" + d;
  if (d.length === 10 && /^[789]/.test(d)) return "+234" + d;
  return null;
}
export const phoneKey = (e164) => String(e164 || "").replace(/\D/g, "");
export const maskPhone = (e164) => { const d = phoneKey(e164); return d ? "0" + d.slice(3, 6) + " *** " + d.slice(-4) : ""; };

// ---------- tokens ----------
const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
function secret() {
  const s = process.env.OUTSIDE_SECRET;
  if (!s) throw new Error("OUTSIDE_SECRET not set");
  return s;
}
export function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  const mac = b64u(crypto.createHmac("sha256", secret()).update(body).digest()).slice(0, 32);
  return body + "." + mac;
}
export function verify(token) {
  try {
    const [body, mac] = String(token || "").split(".");
    if (!body || !mac) return null;
    const want = b64u(crypto.createHmac("sha256", secret()).update(body).digest()).slice(0, 32);
    if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
    const p = JSON.parse(unb64u(body).toString());
    if (p.e && Date.now() > p.e) return null;
    return p;
  } catch { return null; }
}
export const sessionToken = (phone) => sign({ k: "s", p: phone, e: Date.now() + 90 * 24 * 3600 * 1000 });
export const claimLinkToken = (phone, bottleId) => sign({ k: "c", p: phone, b: bottleId, e: Date.now() + 120 * 24 * 3600 * 1000 });
export const tentToken = (venueId, table) => sign({ k: "t", v: venueId, t: String(table) });

export function sessionFrom(req) {
  const h = req.headers.get("authorization") || "";
  const tok = h.startsWith("Bearer ") ? h.slice(7) : "";
  const p = verify(tok);
  return p && p.k === "s" ? p.p : null;
}

// ---------- keys ----------
export const K = {
  player: (ph) => "p/" + phoneKey(ph),
  otp: (ph) => "otp/" + phoneKey(ph),
  bottle: (id) => "b/" + id,
  inbox: (ph, id) => "in/" + phoneKey(ph) + "/" + id,
  inboxPrefix: (ph) => "in/" + phoneKey(ph) + "/",
  outbox: (ph, id) => "out/" + phoneKey(ph) + "/" + id,
  outboxPrefix: (ph) => "out/" + phoneKey(ph) + "/",
  ref: (r) => "ref/" + r,
  venue: (id) => "v/" + id,
  venuePrefix: "v/",
  ticket: (v, id) => "t/" + v + "/" + id,
  ticketPrefix: (v) => "t/" + v + "/",
  ev: (v) => "ev/" + v + "/" + tsKey(),
  evPrefix: (v) => "ev/" + v + "/",
  light: (ph) => "l/" + phoneKey(ph),
  lightPrefix: "l/",
  circle: (ph, other) => "c/" + phoneKey(ph) + "/" + phoneKey(other),
  circlePrefix: (ph) => "c/" + phoneKey(ph) + "/",
  drop: (id) => "d/" + id,
  dropPrefix: "d/",
  dropIntent: (d, ph) => "di/" + d + "/" + tsKey() + "-" + phoneKey(ph),
  dropIntentPrefix: (d) => "di/" + d + "/",
  dropRelease: (d, intentKey) => "dr/" + d + "/" + intentKey.split("/").pop(),
  dropReleasePrefix: (d) => "dr/" + d + "/",
  nightDrop: (night, ph) => "nd/" + night + "/" + phoneKey(ph),
  tableSends: (night, ph) => "ts/" + night + "/" + phoneKey(ph),
  ledger: (v, ticketId) => "lg/" + v + "/" + tsKey() + "-" + ticketId,
  ledgerPrefix: (v) => "lg/" + v + "/",
  unmet: () => "um/" + tsKey(),
  unmetPrefix: "um/",
  bands: "settings/bands",
  glow: "cache/glow",
  block: (ph, other) => "x/" + phoneKey(ph) + "/" + phoneKey(other),
  phash: (h) => "ph/" + h,                       // player number hash -> phone key
  waitingFor: (h) => "rh/" + h,                  // contacts of a non-player yet: owners who saved them
  contacts: (ph) => "cx/" + phoneKey(ph),         // hashes a player picked from their contacts
  gift: (c) => "g/" + c,                          // a bottle sent as a link (Instagram, Snapchat): code to bottle
  waName: (ph) => "wn/" + phoneKey(ph),             // WhatsApp profile name, from messages they sent us
  qr: (c) => "qr/" + c,                           // a bottle shown as a QR to a runner
  request: (id) => "rq/" + id,                    // a venue's request to join Outside
  requestPrefix: "rq/",
  // WhatsApp inbox (answered from Slack #outside-inbox). Our copy is the record; Slack is the screen.
  conv: (ph) => "wc/" + phoneKey(ph),             // one per person: Slack thread, last message each way
  convMsg: (ph) => "wm/" + phoneKey(ph) + "/" + tsKey(),  // every message, both ways
  convMsgPrefix: (ph) => "wm/" + phoneKey(ph) + "/",
  slackThread: (ts) => "st/" + ts,                // Slack thread -> phone
  waOut: (id) => "wo/" + id,                      // our WhatsApp message id -> phone and Slack thread
  seen: (id) => "seen/" + id                      // webhook deliveries already handled
};

// A venue's journey onto the map. Only "live" venues are active in the game.
export const REQUEST_STAGES = ["requested", "visit_booked", "listed", "stocked", "live", "declined"];
export const VENUE_KINDS = ["lounge", "restaurant", "hotel", "rooftop", "beach", "brewery", "club", "garden"];
export const numberHash = (e164) => crypto.createHash("sha256").update("outside:" + e164).digest("hex").slice(0, 32);

// Beacon colours for finding a table without tents: the runner sees the colour, the player's screen glows it.
export const BEACONS = [
  { id: "gold", hex: "#F2B705", name: "Gold" }, { id: "pink", hex: "#FF4FA3", name: "Pink" },
  { id: "blue", hex: "#2F8CFF", name: "Blue" }, { id: "green", hex: "#19C37D", name: "Green" },
  { id: "orange", hex: "#FF7A1A", name: "Orange" }, { id: "purple", hex: "#9B5CFF", name: "Purple" }
];
export async function pickBeacon(s, venueId) {
  const keys = await listKeys(s, "t/" + venueId + "/");
  const recent = (await fetchAll(s, keys.slice(-60))).filter((t) => ["open", "taken"].includes(t.status));
  const used = new Map(BEACONS.map((b) => [b.id, 0]));
  for (const t of recent) if (t.beacon && used.has(t.beacon)) used.set(t.beacon, used.get(t.beacon) + 1);
  const min = Math.min(...used.values());
  const free = BEACONS.filter((b) => used.get(b.id) === min);
  return free[Math.floor(Math.random() * free.length)].id;
}

export async function getJSON(s, key) { return s.get(key, { type: "json" }).catch(() => null); }
export async function listKeys(s, prefix) {
  const { blobs } = await s.list({ prefix });
  return blobs.map((b) => b.key).sort();
}
export async function fetchAll(s, keys) {
  const out = [];
  for (let i = 0; i < keys.length; i += 25) {
    const batch = await Promise.all(keys.slice(i, i + 25).map((k) => getJSON(s, k)));
    out.push(...batch.filter(Boolean));
  }
  return out;
}

export async function getBands(s) {
  const v = await getJSON(s, K.bands);
  const out = JSON.parse(JSON.stringify(DEFAULT_BANDS));
  if (v) for (const f of Object.keys(out)) Object.assign(out[f], v[f] || {});
  return out;
}

// ---------- geo ----------
export function metres(a, b) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Venues near a point, nearest first. Accuracy widens the net a little, never beyond 250m.
export function venuesNear(venues, pt, accuracy = 0) {
  const slack = Math.min(Math.max(Number(accuracy) || 0, 0), 150);
  return venues
    .filter((v) => v.active && !v.paused && typeof v.lat === "number")
    .map((v) => ({ v, d: metres(pt, v) }))
    .filter(({ v, d }) => d <= (v.radius || RULES.venueRadiusM) + slack)
    .sort((a, b) => a.d - b.d)
    .map(({ v, d }) => ({ ...publicVenue(v), distance: Math.round(d) }));
}

export async function allVenues(s) {
  return (await fetchAll(s, await listKeys(s, K.venuePrefix)));
}

// What players and the map may see of a venue. Never prices, keys or payout details.
export function publicVenue(v) {
  return {
    id: v.id, name: v.name, area: v.area || "", lat: v.lat, lng: v.lng, band: v.band,
    wines: Object.keys(v.prices || {}).filter((w) => v.prices[w] > 0),
    tonight: v.tonight || "", art: v.art || "lounge", active: !!v.active
  };
}

// Price at a venue for a wine, or null if it does not stock it.
export const venuePrice = (v, wineId) => (v && v.prices && v.prices[wineId] > 0 ? v.prices[wineId] : null);

// Gift price of a band for a wine, or null if the band has no fixed gift price for that family.
export function bandPrice(bands, band, wineId) {
  const w = wine(wineId); if (!w) return null;
  const p = bands[w.family] && bands[w.family][band];
  return p > 0 ? p : null;
}

// Can a bottle bought in `bottleBand` be claimed at venue v? Returns { ok, topup }.
export function claimCheck(bands, bottle, v) {
  if (!venuePrice(v, bottle.wine) || (v.outOf && v.outOf[bottle.wine])) return { ok: false, reason: "not_stocked" };
  if (bandRank(v.band) <= bandRank(bottle.band)) return { ok: true, topup: 0 };
  const target = bandPrice(bands, v.band, bottle.wine) || venuePrice(v, bottle.wine);
  return { ok: false, reason: "band", topup: Math.max(0, target - bottle.price) };
}

// ---------- lights ----------
export function lightIsOn(l, t = Date.now()) { return !!(l && l.on && l.until > t); }
export function newLightUntil(t = Date.now()) { return Math.min(t + RULES.lightHours * 3600 * 1000, next2am(t)); }

export async function computeGlow(s, force = false) {
  const cached = await getJSON(s, K.glow);
  if (!force && cached && Date.now() - cached.at < RULES.glowCacheMs) return cached;
  const lights = await fetchAll(s, await listKeys(s, K.lightPrefix));
  const counts = {};
  for (const l of lights) if (lightIsOn(l)) counts[l.venueId] = (counts[l.venueId] || 0) + 1;
  const glow = {};
  for (const [v, n] of Object.entries(counts)) {
    if (n < RULES.glowMin) continue;
    glow[v] = n >= 40 ? "blazing" : n >= 15 ? "bright" : "warm";
  }
  const out = { at: Date.now(), glow };
  await s.setJSON(K.glow, out);
  return out;
}

// ---------- tickets (the runner board) ----------
export async function saveTicket(s, t) {
  t.updatedAt = Date.now();
  await s.setJSON(K.ticket(t.venueId, t.id), t);
  await s.setJSON(K.ev(t.venueId), t);
}
export function newTicket(fields) {
  return { id: rid(8), code: code4(), status: "open", createdAt: Date.now(), ...fields };
}
// What the venue sees: never the player's number or the sender unless the sender chose to show a name.
export function boardView(t) {
  const { code, playerPhone, senderPhone, ...rest } = t;
  return { ...rest, hasPlayer: !!playerPhone };
}

// ---------- players ----------
export function publicPlayer(p) {
  if (!p) return null;
  const lv = levelFor(p.received);
  return { name: p.name || "", avatar: p.avatar || null, received: p.received || 0, level: lv.name, next: lv.next, toNext: lv.toNext, sentCount: p.sentCount || 0 };
}
export function isAdult(dob) {
  const m = String(dob || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const t = new Date();
  let age = t.getUTCFullYear() - d.getUTCFullYear();
  if (t.getUTCMonth() < d.getUTCMonth() || (t.getUTCMonth() === d.getUTCMonth() && t.getUTCDate() < d.getUTCDate())) age--;
  return age >= 18 && age < 110;
}

// Ranks count nights, never bottles, and only two nights a week.
// Status is the bottles people have sent to your table: worn the way money was in Lagos Life.
// Counts gifts that reached you (drops from Amabile don't count). You can't send to yourself.
export const LEVELS = [
  { at: 0, name: "JJC" }, { at: 1, name: "Known Face" }, { at: 3, name: "Correct Person" }, { at: 7, name: "Big Deal" },
  { at: 15, name: "Celeb" }, { at: 30, name: "Agba" }, { at: 60, name: "Chairman" }
];
export function levelFor(received) {
  const n = Number(received) || 0;
  let i = 0; while (i + 1 < LEVELS.length && n >= LEVELS[i + 1].at) i++;
  const nx = LEVELS[i + 1];
  return { name: LEVELS[i].name, next: nx ? nx.name : null, toNext: nx ? nx.at - n : 0 };
}
export function rankFor(p) { return levelFor(p.received).name; }
export function addNight(p, t = Date.now()) {
  const night = nightKey(t);
  p.nights = p.nights || [];
  if (p.nights.includes(night)) return false;
  // At most two nights count in any 7-day window.
  const weekAgo = nightKey(t - 7 * 24 * 3600 * 1000);
  const recent = p.nights.filter((n) => n > weekAgo);
  if (recent.length >= 2) return false;
  p.nights.push(night);
  return true;
}
export function addStamp(p, venueId) {
  p.stamps = p.stamps || [];
  if (!p.stamps.includes(venueId)) p.stamps.push(venueId);
}
export function addBadge(p, b) {
  p.badges = p.badges || [];
  if (!p.badges.includes(b)) { p.badges.push(b); return true; }
  return false;
}

// ---------- WhatsApp, straight from Meta (WhatsApp Cloud API) ----------
// Only two things go out on WhatsApp: the sign-in code and "x is sending you a bottle". No selling, no prices.
// Env: WA_TOKEN (system user token), WA_PHONE_ID (the number's ID in WhatsApp Manager), WA_API_VERSION (default v23.0).
async function wa(to, msg) {
  const token = process.env.WA_TOKEN, phoneId = process.env.WA_PHONE_ID, v = process.env.WA_API_VERSION || "v23.0";
  if (!token || !phoneId) return { ok: false, skip: "no-whatsapp" };
  const r = await fetch(`https://graph.facebook.com/${v}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: phoneKey(to), ...msg })
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
  const t = await r.text().catch(() => "");
  if (!r.ok) console.warn("whatsapp", r.status, t.slice(0, 300));
  let j = {}; try { j = JSON.parse(t); } catch {}
  const id = (j.messages && j.messages[0] && j.messages[0].id) || null;
  const err = j.error ? { code: j.error.code, message: (j.error.error_data && j.error.error_data.details) || j.error.message || "" } : null;
  return { ok: !!r.ok, status: r.status, id, error: err };
}
// Template parameters may not contain new lines, tabs or runs of spaces.
const waParam = (t) => String(t).replace(/[\n\r\t]+/g, " ").replace(/ {4,}/g, "   ").slice(0, 300);
function waTemplate(name, bodyParams, buttonParam, headerImage) {
  const components = [{ type: "body", parameters: bodyParams.map((t) => ({ type: "text", text: waParam(t) })) }];
  if (headerImage) components.unshift({ type: "header", parameters: [{ type: "image", image: { link: headerImage } }] });
  if (buttonParam) components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: String(buttonParam) }] });
  return { type: "template", template: { name, language: { code: process.env.OUTSIDE_TPL_LANG || "en" }, components } };
}

// The name on their WhatsApp profile, if they have ever messaged the Outside number (saved by outside-wa-hook).
// Meta gives no way to look up the name of a number that has never messaged us.
export async function contactFirstName(e164) {
  if (!e164) return "";
  try {
    const raw = String((await store().get(K.waName(e164))) || "");
    const first = raw.trim().split(/\s+/)[0] || "";
    const name = first.replace(/[^\p{L}'-]/gu, "");
    return name.length >= 2 && name.length <= 24 && !/^\+?\d+$/.test(first) ? name.charAt(0).toUpperCase() + name.slice(1) : "";
  } catch { return ""; }
}

// Image header (img/wa-header.jpg) + "*Ada*'s sending an Amabile to your table. For next time you're outside." + _note_ + [Claim it]
export async function sendBottleNotice(bottle) {
  const tpl = process.env.OUTSIDE_TPL_BOTTLE;
  const link = claimLinkToken(bottle.to, bottle.id);
  const from = bottle.anon ? "Someone" : (bottle.fromName || "A friend");
  const note = bottle.note ? "“" + bottle.note + "”" : "No note.";
  if (!tpl) return { ok: false, skip: "no-template", link: SITE + "/c/" + link };
  const r = await wa(bottle.to, waTemplate(tpl, [from, note], link, SITE + "/img/wa-header.jpg"));
  return { ...r, link: SITE + "/c/" + link };
}
// Free text only reaches someone who messaged the number in the last 24 hours; otherwise WhatsApp drops it.
export async function sendText(e164, text) {
  return wa(e164, { type: "text", text: { body: String(text).slice(0, 4096) } });
}
// A photo, voice note or file someone sent us. Meta gives a short-lived URL that needs the same token.
export async function waMedia(mediaId, maxBytes = 8 * 1024 * 1024) {
  const token = process.env.WA_TOKEN, v = process.env.WA_API_VERSION || "v23.0";
  if (!token || !mediaId) return null;
  try {
    const m = await (await fetch(`https://graph.facebook.com/${v}/${mediaId}`, { headers: { Authorization: "Bearer " + token } })).json();
    if (!m || !m.url || Number(m.file_size || 0) > maxBytes) return null;
    const r = await fetch(m.url, { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) return null;
    const bytes = Buffer.from(await r.arrayBuffer());
    return bytes.length && bytes.length <= maxBytes ? { bytes, mime: m.mime_type || "application/octet-stream" } : null;
  } catch { return null; }
}
export async function sendCode(e164, code) {
  const tpl = process.env.OUTSIDE_TPL_CODE;
  if (!tpl) return { ok: false, skip: "no-template" };
  // Authentication templates: the code fills the body and the copy-code button.
  return wa(e164, waTemplate(tpl, [code], code));
}

// ---------- Paystack ----------
const PS = "https://api.paystack.co";
const psHeaders = () => ({ authorization: "Bearer " + (process.env.PAYSTACK_SECRET_KEY || ""), "content-type": "application/json" });
export async function paystackInit({ email, amount, reference, callbackUrl, metadata }) {
  const r = await fetch(PS + "/transaction/initialize", {
    method: "POST", headers: psHeaders(),
    body: JSON.stringify({ email, amount: amount * 100, currency: CURRENCY, reference, callback_url: callbackUrl,
      channels: ["card", "bank_transfer", "ussd", "bank"], metadata: { app: "outside", ...metadata } })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.status) { console.warn("paystackInit", r.status, JSON.stringify(d).slice(0, 300)); return null; }
  return d.data;
}
export async function paystackVerify(ref) {
  const r = await fetch(PS + "/transaction/verify/" + encodeURIComponent(ref), { headers: psHeaders() });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.status) return null;
  return d.data;
}
export const payEmail = (e164) => "p" + phoneKey(e164) + "@outside.amabiledirosa.com";

// ---------- admin ----------
export function adminAuthorised(k) {
  const key = process.env.TABLE_ADMIN_KEY || "";
  return !!key && typeof k === "string" && k === key;
}
export const hashKey = (k) => crypto.createHash("sha256").update(String(k)).digest("hex");
