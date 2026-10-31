// The stores we already supply, from our own records, so a venue joining Andiamo! is found, not typed in.
// Source: the same sales data as the where-to-buy map (stores carrying an active Amabile product, or that
// bought Amabile in the last year), less distributors, wholesalers, event partners and B2B accounts.
// One snapshot, kept in the store and refreshed every six hours. If the sales data can't be reached the last
// snapshot is used, and with none at all every lookup simply comes back empty: typing a name still works.
//
// Our records hold the same store more than once (two accounts, one bar). Those are folded into one store,
// keeping every contact we have for it.
import { getJSON, listKeys, fetchAll, K, sign, verify, phoneE164, metres, clean } from "./_outside.mjs";

const CACHE = "oc/v1";
const FRESH = 6 * 3600 * 1000;
const SKIP_TYPES = ["Wholesaler", "Regional Distributor", "Master Distributor", "Event Organizer", "Activation Partner", "Online store", ""];
const ON_TRADE = new Set(["Night Club/Lounge", "Restaurant", "Fast Food Restaurant", "Hotel", "Hotel - Bar", "Beer Parlor/Pub"]);
const KIND = { "Night Club/Lounge": "lounge", "Beer Parlor/Pub": "lounge", "Restaurant": "restaurant", "Fast Food Restaurant": "restaurant", "Hotel": "hotel", "Hotel - Bar": "hotel" };

// Rough centres of the areas a venue can pick, to place a store from its coordinates. Anything further than
// 5 km from all of them, or outside Lagos, is "Somewhere else".
const CENTRES = [["Victoria Island", 6.4281, 3.4216], ["Ikoyi", 6.4549, 3.4346], ["Lekki Phase 1", 6.4474, 3.4723], ["Lekki", 6.4400, 3.5300], ["Ajah", 6.4669, 3.5700],
  ["Ikeja GRA", 6.5790, 3.3560], ["Ikeja", 6.6018, 3.3515], ["Surulere", 6.5006, 3.3540], ["Yaba", 6.5095, 3.3711], ["Gbagada", 6.5550, 3.3900], ["Magodo", 6.6210, 3.3800], ["Festac", 6.4660, 3.2830]];
export function areaFor(o) {
  if (!o || o.lat == null || o.lng == null || (o.state && !/lagos/i.test(o.state))) return "Somewhere else";
  let best = null;
  for (const [n, lat, lng] of CENTRES) { const d = metres(o, { lat, lng }); if (!best || d < best.d) best = { n, d }; }
  return best && best.d < 5000 ? best.n : "Somewhere else";
}
export const kindFor = (type) => KIND[type] || null;

// ---------- the snapshot ----------
async function fromSalesData() {
  const key = process.env.GCP_SA_KEY, projectId = process.env.GCP_PROJECT_ID;
  if (!key || !projectId) return null;
  try {
    const { BigQuery } = await import("@google-cloud/bigquery");
    const bq = new BigQuery({ projectId, credentials: JSON.parse(key) });
    const T = (t) => "`" + projectId + "." + (process.env.OUTSIDE_SALES_DATASET || "tradedepot") + "." + t + "`";
    const [rows] = await bq.query({ query: `
      WITH p AS (SELECT _id FROM ${T("products")} WHERE LOWER(name) LIKE '%amabile%' AND status = 'active'),
      am AS (SELECT retailOutletId, MAX(wk_of) AS lastBought, ROUND(SUM(qty), 1) AS cases FROM ${T("sales_facts")}
        WHERE LOWER(brand) LIKE '%amabile%' AND wk_of >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY) GROUP BY retailOutletId),
      a AS (SELECT DISTINCT op.retailoutletid AS id FROM ${T("outletproducts")} op JOIN p ON p._id = op.productid UNION DISTINCT SELECT retailOutletId FROM am)
      SELECT ro._id AS id, ro.outletbusinessname AS name, ro.outlettype AS type, ro.lga AS lga, ro.state AS state, ro.streetname AS street,
        ro.contactperson AS contactPerson, ro.contactphone AS contactPhone, ro.coordinates__latitude__double AS lat, ro.coordinates__longitude__double AS lng,
        CAST(am.lastBought AS STRING) AS lastBought, am.cases AS cases
      FROM a JOIN ${T("retailoutlets")} ro ON ro._id = a.id LEFT JOIN am ON am.retailOutletId = ro._id
      WHERE ro.archivedat IS NULL AND NOT IFNULL(ro.isb2b, FALSE) AND IFNULL(ro.outlettype, '') NOT IN UNNEST(@skip)`,
      params: { skip: SKIP_TYPES }, location: process.env.OUTSIDE_BQ_LOCATION || undefined });
    return rows.map((r) => ({ id: String(r.id), name: String(r.name || "").trim(), type: r.type || "", lga: r.lga || "", state: r.state || "", street: /^(na|n\/a|nil|none|-)$/i.test(String(r.street || "").trim()) ? "" : String(r.street || "").trim(),
      contactPerson: String(r.contactPerson || "").trim(), contactPhone: r.contactPhone || "", lat: typeof r.lat === "number" ? r.lat : null, lng: typeof r.lng === "number" ? r.lng : null,
      lastBought: r.lastBought || null, cases: r.cases != null ? Number(r.cases) : 0 })).filter((r) => r.name);
  } catch (e) {
    // Name the account in the log (an address, not a secret), so a permission error says who needs the access.
    let who = ""; try { who = JSON.parse(key).client_email || ""; } catch {}
    console.warn("outside outlets", who, String(e).slice(0, 300)); return null;
  }
}

let mem = null;
export async function stores(s) {
  if (mem && Date.now() - mem.at < 10 * 60 * 1000) return mem.list;
  let c = await getJSON(s, CACHE);
  if (!c || Date.now() - c.at > FRESH) {
    const rows = await fromSalesData();
    if (rows) { c = { at: Date.now(), rows }; await s.setJSON(CACHE, c).catch(() => {}); }
  }
  const list = fold((c && c.rows) || []);
  mem = { at: Date.now(), list };
  return list;
}
export const _forget = () => { mem = null; };

// ---------- names ----------
const FILLER = new Set(["the", "and", "ltd", "limited", "nig", "nigeria", "lagos", "enterprise", "enterprises", "venture", "ventures", "global", "co", "company", "bar", "lounge", "restaurant", "hotel", "club", "store", "stores", "supermarket", "by", "of", "&"]);
export const norm = (x) => String(x || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/['’`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const words = (x) => norm(x).split(" ").filter(Boolean);
const core = (x) => words(x).filter((w) => !FILLER.has(w) && w.length >= 2);
// Same store under two spellings: "Bamboa Lounge" and "BAMBOA LOUNGE VI", "Quay" and "Quay Lagos".
export function sameName(a, b) {
  const x = core(a), y = core(b);
  if (!x.length || !y.length) return norm(a) === norm(b);
  const [s1, s2] = x.length <= y.length ? [x, y] : [y, x];
  return s1.every((w) => s2.includes(w));
}

// Two records of one store: the same name within 150 m, or the same name with no location at all.
function fold(rows) {
  const out = [];
  const sorted = [...rows].sort((a, b) => String(b.lastBought || "").localeCompare(String(a.lastBought || "")) || (b.cases || 0) - (a.cases || 0));
  for (const r of sorted) {
    const here = r.lat != null && r.lng != null;
    const twin = out.find((o) => norm(o.name) === norm(r.name) && (here && o.lat != null ? metres(o, r) < 150 : !here && o.lat == null));
    const phone = phoneE164(r.contactPhone);
    const contact = phone ? { name: firstName(r.contactPerson), full: r.contactPerson, phone } : null;
    if (twin) {
      twin.ids.push(r.id);
      if (contact && !twin.contacts.some((c) => c.phone === phone)) twin.contacts.push(contact);
      twin.cases = Math.round(((twin.cases || 0) + (r.cases || 0)) * 10) / 10;
      continue;
    }
    out.push({ id: r.id, ids: [r.id], name: r.name, type: r.type, lga: r.lga, state: r.state, street: r.street, lat: r.lat, lng: r.lng,
      contacts: contact ? [contact] : [], lastBought: r.lastBought, cases: r.cases || 0, onTrade: ON_TRADE.has(r.type) });
  }
  return out;
}
const firstName = (x) => { const w = String(x || "").trim().split(/\s+/)[0] || ""; return /^[\p{L}'-]{2,20}$/u.test(w) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""; };

// ---------- finding a store ----------
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function score(o, q, qw) {
  const n = norm(o.name), nw = n.split(" ");
  let sc = 0;
  if (n === q) sc = 120;
  else if (n.startsWith(q)) sc = 100;
  else if (qw.every((w) => nw.some((x) => x.startsWith(w)))) sc = 80;
  else if (n.includes(q)) sc = 60;
  else if (qw.every((w) => w.length >= 4 ? nw.some((x) => lev(w, x.slice(0, w.length)) <= 1) : nw.some((x) => x.startsWith(w)))) sc = 40;
  if (!sc) return 0;
  return sc + (o.onTrade ? 6 : 0) + (/lagos/i.test(o.state) ? 3 : 0) + (o.lastBought ? 2 : 0);
}
export async function searchStores(s, raw, n = 6) {
  const q = norm(clean(raw, 60));
  if (q.length < 2) return [];
  const qw = q.split(" ");
  return (await stores(s)).map((o) => ({ o, sc: score(o, q, qw) })).filter((x) => x.sc).sort((a, b) => b.sc - a.sc || a.o.name.localeCompare(b.o.name)).slice(0, n).map((x) => x.o);
}
export async function nearbyStores(s, at, radius = 400, n = 8) {
  if (!at || !Number.isFinite(at.lat) || !Number.isFinite(at.lng)) return [];
  return (await stores(s)).filter((o) => o.lat != null).map((o) => ({ ...o, metres: Math.round(metres(at, o)) })).filter((o) => o.metres <= radius)
    .sort((a, b) => a.metres - b.metres).slice(0, n);
}

// A store is handed to the browser as a signed reference, never as our internal account number.
export const storeRef = (o) => sign({ k: "st", id: o.id, e: Date.now() + 2 * 864e5 });
export async function storeFromRef(s, ref) {
  const t = verify(ref);
  if (!t || t.k !== "st" || !t.id || Date.now() > t.e) return null;
  return (await stores(s)).find((o) => o.ids.includes(t.id)) || null;
}

// ---------- where a store already is on Andiamo! ----------
// Live venues, stores waiting for approval, and venues that asked to join, matched to our records by account
// or, when they were added without one, by name within 150 m.
export async function andiamoIndex(s) {
  const venues = (await fetchAll(s, await listKeys(s, K.venuePrefix))).filter(Boolean);
  const reqs = (await fetchAll(s, await listKeys(s, K.requestPrefix))).filter(Boolean);
  return { venues, reqs };
}
export function statusOf(o, idx) {
  const near = (x) => x && x.lat != null && o.lat != null && metres(o, x) < 150;
  const v = idx.venues.find((x) => (x.outlet && o.ids.includes(x.outlet.id)) || (sameName(x.name, o.name) && near(x)));
  if (v && v.active) return { stage: "live", venueId: v.id };
  const open = idx.reqs.filter((r) => !["live", "declined"].includes(r.stage));
  const sub = open.find((r) => r.source === "onboard" && r.stage === "submitted" && ((r.store && o.ids.includes(r.store.outletId)) || (sameName(r.name, o.name) && near(r.store))));
  if (sub) return { stage: "waiting", requestId: sub.id, by: sub.onboarderName || "" };
  if (v) return { stage: "listed", venueId: v.id };
  const asked = open.find((r) => r.source !== "onboard" && (o.ids.includes(r.outletId) || (sameName(r.name, o.name) && (near(r) || r.lat == null))));
  if (asked) return { stage: "asked", requestId: asked.id };
  return null;
}

// What the public sign-up page may show: only what the where-to-buy map already shows. No contacts.
export function publicStore(o, st) {
  return { ref: storeRef(o), name: o.name, type: o.type, place: [o.street, o.lga].filter(Boolean).join(", "), state: o.state, live: !!(st && st.stage === "live") };
}
// What an onboarder sees. Our own people get the contacts and the buying record; distributors don't.
export function onboardStore(o, st, internal) {
  return { ref: storeRef(o), name: o.name, type: o.type, place: [o.street, o.lga].filter(Boolean).join(", "), area: areaFor(o), kind: kindFor(o.type),
    lat: o.lat, lng: o.lng, metres: o.metres, status: st ? st.stage : null, requestId: st && st.requestId || null, waitingBy: st && st.by || "",
    ...(internal ? { contacts: o.contacts.map((c) => ({ name: c.full || c.name, phone: c.phone })), lastBought: o.lastBought, cases: o.cases, accounts: o.ids.length } : {}) };
}
