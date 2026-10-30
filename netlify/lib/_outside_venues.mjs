// Outside: venues joining on their own.
//
// A venue owner or manager registers on /outside/venue with a verified WhatsApp number. The request lands
// in admin as "requested". Ops books a visit, lists the venue (location, prices, tables), notes how the
// venue gets its Amabile, and takes it live. The venue then appears on the map with its runner board.
// Supply is recorded, never required: a venue may buy from us, or from a distributor or wholesaler.
//
// Venues can be linked to the outlet account we already hold for them. Linking fills in the location
// and contact, and lets admin confirm a purchase from us in the sales data.
import {
  K, getJSON, rid, clean, now, phoneE164, maskPhone, hashKey, BAND_ORDER, VENUE_KINDS, SITE, WINES, sendText
} from "./_outside.mjs";
import { outletsByPhone, getOutlet } from "./_outside_bq.mjs";

const KIND_LABEL = { lounge: "Lounge or bar", restaurant: "Restaurant", hotel: "Hotel", rooftop: "Rooftop", beach: "Beach", brewery: "Brewery", club: "Club", garden: "Garden or terrace" };

// A venue from our records (d.store, picked as they typed their name) comes with its name, place, type and
// location already known, so it only adds its menu prices. The same store twice becomes one request.
export async function createVenueRequest(s, phone, d) {
  let o = null;
  if (d.store) {
    const X = await import("./_outside_outlets.mjs");
    o = await X.storeFromRef(s, d.store);
    if (!o) return { ok: false, error: "store" };
    const st = X.statusOf(o, await X.andiamoIndex(s));
    if (st && st.stage === "live") return { ok: false, error: "already_live", name: o.name };
    // Already being added by an onboarder, or already asked for: one request per store.
    if (st && (st.stage === "waiting" || st.stage === "asked" || st.stage === "listed") && st.requestId) {
      const q = await getJSON(s, K.request(st.requestId));
      if (q && q.source !== "onboard") {
        if (q.phone === phone) { mergeInto(q, d, o); }
        else if (!(q.others || []).some((x) => x.phone === phone)) q.others = [...(q.others || []), { phone, contactName: clean(d.contactName, 40), at: now() }].slice(-5);
        q.updatedAt = now(); await s.setJSON(K.request(q.id), q);
      }
      return { ok: true, id: st.requestId, already: true, name: o.name };
    }
    if (st && st.stage === "listed") return { ok: true, already: true, name: o.name };
  }
  const name = o ? o.name : clean(d.name, 60);
  if (name.length < 2) return { ok: false, error: "venue_name" };
  const contactName = clean(d.contactName, 40);
  if (!contactName) return { ok: false, error: "contact_name" };
  const X = o ? await import("./_outside_outlets.mjs") : null;
  const kind = VENUE_KINDS.includes(d.kind) ? d.kind : (o && X.kindFor(o.type)) || "lounge";
  const area = o ? X.areaFor(o) : clean(d.area, 40);
  if (!area) return { ok: false, error: "area" };

  // One open request per number at a time.
  const mine = (await listRequests(s)).filter((r) => r.phone === phone && !["live", "declined"].includes(r.stage));
  // The same venue sent twice from the same number: keep the first.
  const same = mine.find((r) => r.name.toLowerCase() === name.toLowerCase());
  if (same) { if (o) { mergeInto(same, d, o); await s.setJSON(K.request(same.id), same); } return { ok: true, id: same.id, already: true, name }; }
  if (mine.length >= 3) return { ok: false, error: "too_many_requests" };

  const r = {
    id: rid(8), stage: "requested", createdAt: now(), updatedAt: now(),
    phone, contactName, role: ["owner", "manager", "other"].includes(d.role) ? d.role : "manager",
    email: clean(d.email, 80), name, kind, area, address: clean(d.address, 120), mapsLink: clean(d.mapsLink, 300),
    instagram: clean(d.instagram, 40).replace(/^@/, ""), tables: Math.max(0, Math.min(500, Number(d.tables) || 0)),
    nights: clean(d.nights, 60), stocksAmabile: ["yes", "no", "not_sure"].includes(d.stocksAmabile) ? d.stocksAmabile : "not_sure",
    visitTime: clean(d.visitTime, 60), note: clean(d.note, 300),
    history: [{ at: now(), stage: "requested", by: "venue" }]
  };
  if (o) mergeInto(r, d, o);
  else {
    // Suggest an existing outlet account with the same contact number.
    const match = await outletsByPhone(phone).catch(() => ({ rows: [] }));
    r.suggested = (match.rows || []).map((x) => ({ id: x.id, name: x.name, number: x.number, lga: x.lga, lat: x.lat, lng: x.lng }));
  }
  await s.setJSON(K.request(r.id), r);
  notifyOps(r).catch(() => {});
  return { ok: true, id: r.id, matched: !!o, name };
}
// What a store from our records brings to its request, and the menu prices the venue gave.
function mergeInto(r, d, o) {
  r.outletId = o.id; r.outletIds = o.ids; r.stocksAmabile = "yes";
  r.lat = o.lat; r.lng = o.lng; r.address = r.address || [o.street, o.lga].filter(Boolean).join(", ");
  r.records = { name: o.name, type: o.type, lastBought: o.lastBought, cases: o.cases, accounts: o.ids.length };
  const prices = {};
  for (const w of WINES) { const p = Math.round(Number(String((d.prices || {})[w.id] || "").replace(/[^\d.]/g, ""))); if (p > 0 && p < 10000000) prices[w.id] = p; }
  if (Object.keys(prices).length) r.prices = prices;
  if (d.contactName) r.contactName = clean(d.contactName, 40);
}

export async function listRequests(s) {
  const { blobs } = await s.list({ prefix: K.requestPrefix });
  const out = await Promise.all(blobs.map((b) => getJSON(s, b.key)));
  return out.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
}

// Stage changes from admin. Going live is separate (goLive) because it has checks.
export async function updateRequest(s, id, d, by) {
  const r = await getJSON(s, K.request(id));
  if (!r) return { ok: false, error: "not_found" };
  if (d.visit) {
    r.visit = { by: clean(d.visit.by, 40), date: clean(d.visit.date, 30), note: clean(d.visit.note, 200) };
    if (r.stage === "requested") r.stage = "visit_booked";
  }
  if (d.note !== undefined) r.opsNote = clean(d.note, 500);
  if (d.decline) { r.stage = "declined"; r.declineReason = clean(d.decline, 200); }
  if (d.reopen && r.stage === "declined") r.stage = r.venueId ? "listed" : "requested";
  r.history = [...(r.history || []), { at: now(), stage: r.stage, by }].slice(-30);
  r.updatedAt = now();
  await s.setJSON(K.request(id), r);
  return { ok: true, request: r };
}

// Create the venue (not yet live) from a request, filling what we know from the request and any linked outlet.
export async function listFromRequest(s, id, by) {
  const r = await getJSON(s, K.request(id));
  if (!r) return { ok: false, error: "not_found" };
  if (r.venueId) return { ok: true, venueId: r.venueId };
  const v = {
    id: rid(6), name: r.name, area: r.area, art: r.kind, band: "lounge", prices: {}, taxIncluded: false,
    lat: null, lng: null, radius: 60, tables: r.tables || 20, runnerFee: 1000, tonight: "",
    contact: { name: r.contactName, phone: r.phone }, payout: {}, active: false, stage: "listed",
    requestId: r.id, createdAt: now(), updatedAt: now()
  };
  await s.setJSON(K.venue(v.id), v);
  r.venueId = v.id; r.stage = "listed";
  r.history = [...(r.history || []), { at: now(), stage: "listed", by }];
  r.updatedAt = now();
  await s.setJSON(K.request(r.id), r);
  return { ok: true, venueId: v.id };
}

// Link a venue to an existing outlet account. Fills location and contact where the venue has none.
export async function linkOutlet(s, venueId, outletId, by) {
  const v = await getJSON(s, K.venue(venueId));
  if (!v) return { ok: false, error: "not_found" };
  if (!outletId) { v.outlet = null; await s.setJSON(K.venue(v.id), v); return { ok: true, venue: v }; }
  const o = await getOutlet(outletId, "2025-01-01");
  if (!o.ok) return { ok: false, error: o.error === "not_configured" ? "sales_data_not_connected" : "outlet_not_found" };
  const x = o.outlet;
  v.outlet = { id: x.id, name: x.name, number: x.number, contactPerson: x.contactPerson, contactPhone: x.contactPhone, linkedAt: now(), linkedBy: by };
  if ((v.lat == null || v.lng == null) && x.lat && x.lng) { v.lat = x.lat; v.lng = x.lng; v.locationFrom = "outlet"; }
  if (!v.contact || !v.contact.phone) v.contact = { name: x.contactPerson, phone: x.contactPhone };
  v.updatedAt = now();
  await s.setJSON(K.venue(v.id), v);
  return { ok: true, venue: v, purchases: o.purchases };
}

// How the venue gets its Amabile. From us: found in the linked outlet's sales, or an order recorded by hand.
// Or through another supplier (a distributor or wholesaler), named by ops. Recorded for the stock picture;
// it does not gate going live.
export async function recordSupply(s, venueId, d, by) {
  const v = await getJSON(s, K.venue(venueId));
  if (!v) return { ok: false, error: "not_found" };
  if (d.via === "other") {
    const supplier = clean(d.supplier, 60);
    if (!supplier) return { ok: false, error: "supplier" };
    v.supply = { source: "other", supplier, note: clean(d.note, 160), at: now(), by };
  } else if (d.fromSales) {
    if (!v.outlet) return { ok: false, error: "link_outlet_first" };
    const req = v.requestId ? await getJSON(s, K.request(v.requestId)) : null;
    // From a request: anything bought since a week before they asked. Added directly by ops (an account we already supply): the last 90 days.
    const since = new Date(req ? req.createdAt - 7 * 864e5 : now() - 90 * 864e5).toISOString().slice(0, 10);
    const o = await getOutlet(v.outlet.id, since);
    if (!o.ok) return { ok: false, error: "sales_data_not_connected" };
    if (!o.purchases.length) return { ok: false, error: "no_purchase_found", since };
    const cases = o.purchases.reduce((n, p) => n + Number(p.cases || 0), 0);
    const amount = o.purchases.reduce((n, p) => n + Number(p.amount || 0), 0);
    v.supply = { source: "sales", week: o.purchases[0].week, cases, amount, lines: o.purchases.slice(0, 6), at: now(), by };
  } else {
    const ref = clean(d.ref, 40);
    if (!ref) return { ok: false, error: "order_ref" };
    v.supply = { source: "manual", ref, cases: Number(d.cases) || 0, amount: Number(String(d.amount || "").replace(/[^\d.]/g, "")) || 0, date: clean(d.date, 12), at: now(), by };
  }
  delete v.purchase;
  if (!v.active) v.stage = "stocked";
  v.updatedAt = now();
  await s.setJSON(K.venue(v.id), v);
  if (v.requestId) {
    const r = await getJSON(s, K.request(v.requestId));
    if (r && r.stage !== "live") { r.stage = "stocked"; r.history = [...(r.history || []), { at: now(), stage: "stocked", by }]; r.updatedAt = now(); await s.setJSON(K.request(r.id), r); }
  }
  return { ok: true, venue: v };
}

// What still stops a venue going live.
export function liveChecks(v) {
  const missing = [];
  if (typeof v.lat !== "number" || typeof v.lng !== "number" || !isFinite(v.lat)) missing.push("location");
  if (!Object.values(v.prices || {}).some((p) => p > 0)) missing.push("menu prices");
  const warnings = [];
  if (!v.supply && !v.purchase) warnings.push("how they get Amabile");
  if (!v.payout || !v.payout.recipient) warnings.push("verified payout account");
  if (!v.outlet) warnings.push("linked outlet account");
  return { missing, warnings };
}

export async function goLive(s, venueId, by) {
  const v = await getJSON(s, K.venue(venueId));
  if (!v) return { ok: false, error: "not_found" };
  const { missing, warnings } = liveChecks(v);
  if (missing.length) return { ok: false, error: "not_ready", missing };
  let keys = null;
  if (!v.runnerKeyHash) {
    keys = { runner: rid(6), manager: rid(8) };
    v.runnerKeyHash = hashKey(keys.runner); v.managerKeyHash = hashKey(keys.manager);
  }
  v.active = true; v.stage = "live"; v.liveAt = now(); v.updatedAt = now();
  await s.setJSON(K.venue(v.id), v);
  // The venue's contact becomes its first manager on the board. They sign in with their own WhatsApp number.
  const { ensureManager } = await import("./_outside_staff.mjs");
  Object.assign(v, await ensureManager(s, v));
  if (v.requestId) {
    const r = await getJSON(s, K.request(v.requestId));
    if (r) { r.stage = "live"; r.history = [...(r.history || []), { at: now(), stage: "live", by }]; r.updatedAt = now(); await s.setJSON(K.request(r.id), r); }
  }
  // Tell the manager, best effort. Codes are also handed over in person on the visit.
  const ph = phoneE164(v.contact && v.contact.phone);
  if (ph) sendText(ph, `${v.name} is live on Andiamo. Open ${SITE}/board on the bar phone and sign in once with this WhatsApp number. It stays signed in; your runners use that phone.`).catch(() => {});
  const { runnerKeyHash, managerKeyHash, ...view } = v;
  return { ok: true, venue: view, keys, warnings, board: SITE + "/board?v=" + v.id };
}

async function notifyOps(r) {
  const to = String(process.env.OUTSIDE_OPS_EMAIL || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!to.length || !process.env.BREVO_API_KEY) return;
  const { sendEmail } = await import("./_lib.mjs");
  const rows = [
    ["Venue", r.name], ["Type", KIND_LABEL[r.kind] || r.kind], ["Area", r.area], ["Address", r.address], ["Instagram", r.instagram ? "@" + r.instagram : ""],
    ["Contact", r.contactName + " (" + r.role + ")"], ["Phone", r.phone], ["Email", r.email], ["Tables", r.tables || ""], ["Open", r.nights],
    ["Stocks Amabile", { yes: "Yes", no: "No", not_sure: "Not sure" }[r.stocksAmabile]], ["Best time to visit", r.visitTime], ["Note", r.note],
    ["Possible existing account", (r.suggested || []).map((o) => o.name + " #" + o.number).join(", ")],
    ["In our records", r.records ? r.records.name + (r.records.cases ? ", " + r.records.cases + " cases this year" : "") : ""],
    ["Menu prices", r.prices ? Object.entries(r.prices).map(([k, v]) => ((WINES.find((w) => w.id === k) || {}).name || k) + " ₦" + Number(v).toLocaleString("en-NG")).join(", ") : ""]
  ].filter(([, v]) => v);
  const esc = (x) => String(x).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const html = `<p>A venue has asked to join Andiamo.</p><table>${rows.map(([k, v]) => `<tr><td style="padding:3px 12px 3px 0;color:#6b5646">${esc(k)}</td><td style="padding:3px 0"><b>${esc(v)}</b></td></tr>`).join("")}</table>
    <p><a href="${SITE}/admin">Open Andiamo admin</a></p>`;
  for (const addr of to) await sendEmail(process.env.BREVO_API_KEY, addr, "Andiamo venue request: " + r.name, html);
}


export { KIND_LABEL, maskPhone, WINES };
