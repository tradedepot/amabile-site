// Stores added in the onboard app, and their approval in admin.
// A submission is a venue request with source "onboard" and the full store in r.store.
// Approving it creates the venue, adds the bar phones, registers the payout account and takes it live in one step.
import { K, getJSON, rid, clean, getBands, venueBand, sendText, SITE } from "./_outside.mjs";

export const AREAS = ["Victoria Island", "Ikoyi", "Lekki Phase 1", "Lekki", "Ajah", "Ikeja GRA", "Ikeja", "Surulere", "Yaba", "Gbagada", "Magodo", "Festac", "Somewhere else"];
export const KINDS = [["lounge", "Lounge"], ["restaurant", "Restaurant"], ["hotel", "Hotel"], ["rooftop", "Rooftop"], ["beach", "Beach"], ["brewery", "Brewery"], ["club", "Club"], ["garden", "Garden"]];

// Does the name on the bank account look like the store? Loose on purpose: "Trib3" matches "TRIB3 LOUNGE LIMITED".
// A personal name, or someone else's business, doesn't match, and that store waits for a person to check.
const FILLER = new Set(["LTD", "LIMITED", "NIG", "NIGERIA", "ENTERPRISE", "ENTERPRISES", "VENTURE", "VENTURES", "GLOBAL", "THE", "AND", "BAR", "BARS", "LOUNGE", "RESTAURANT", "CLUB", "HOTEL", "HOTELS", "CO", "COMPANY", "INTL", "INTERNATIONAL", "SERVICES", "SERVICE", "PLC", "INVESTMENT", "INVESTMENTS", "GROUP", "NIGERIAN", "RC", "BN"]);
const words = (x) => String(x || "").toUpperCase().replace(/&/g, " AND ").replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !FILLER.has(w));
export function nameMatches(storeName, accountName) {
  const a = new Set(words(accountName)), s = words(storeName);
  return s.length > 0 && s.some((w) => a.has(w));
}

export async function approveSubmission(s, id, { by, confirmMismatch = false }) {
  const r = await getJSON(s, K.request(clean(id, 20)));
  if (!r || r.source !== "onboard") return { ok: false, error: "not_found" };
  if (r.stage !== "submitted") return { ok: false, error: "state", stage: r.stage };
  const x = r.store;
  // Never approved without a person checking: a bank name that doesn't match the store.
  if (x.payout && !x.payout.matches && !confirmMismatch) return { ok: false, error: "mismatch" };
  const now = Date.now();
  const v = {
    id: rid(6), name: x.name, area: x.area, art: x.kind, band: "lounge", prices: x.prices, taxIncluded: !!x.taxIncluded,
    lat: x.lat, lng: x.lng, radius: 60, tables: 20, runnerFee: 1000, tonight: "",
    contact: { name: x.managerName, phone: x.managerPhone }, payout: {}, active: false, stage: "listed", requestId: r.id,
    onboardedBy: { phone: r.submittedBy, name: r.onboarderName, company: r.company }, createdAt: now, updatedAt: now
  };
  // A distributor or wholesaler onboarding a store they serve: that's where the store gets its Amabile.
  if (r.company && r.company.toLowerCase() !== "amabile") v.supply = { source: "other", supplier: r.company, note: "Onboarded by " + r.onboarderName, at: now, by };
  // Picked from our records: the venue stays tied to the account we supply.
  if (x.outletId) v.outlet = { id: x.outletId, ids: x.outletIds || [x.outletId], name: x.recordName || x.name, linkedAt: now, linkedBy: by };
  v.band = venueBand(await getBands(s), v);
  await s.setJSON(K.venue(v.id), v);
  r.venueId = v.id;
  r.history = [...(r.history || []), { at: now, stage: "approved", by: confirmMismatch ? by + " (checked the bank name)" : by }].slice(-30);
  await s.setJSON(K.request(r.id), r);

  const { addStaff } = await import("./_outside_staff.mjs");
  for (const ph of x.barPhones || []) await addStaff(s, v.id, { phone: ph, name: "Bar phone", role: "runner" }, by).catch(() => {});
  if (x.payout) {
    const { setPayoutAccount } = await import("./_outside_payout.mjs");
    const p = await setPayoutAccount(s, v.id, { bankCode: x.payout.bankCode, account: x.payout.account }).catch(() => ({ ok: false }));
    if (!p.ok) { r.payoutError = p.error || "payout"; await s.setJSON(K.request(r.id), r); }
  }
  const { goLive } = await import("./_outside_venues.mjs");
  const g = await goLive(s, v.id, by);
  if (!g.ok) return { ok: false, error: g.error, missing: g.missing, venueId: v.id };
  // The venue's own request to join, if it had one, is done too.
  if (r.fromRequest) { const q = await getJSON(s, K.request(r.fromRequest)); if (q) { q.stage = "live"; q.venueId = v.id; q.updatedAt = Date.now(); q.history = [...(q.history || []), { at: Date.now(), stage: "live", by }].slice(-30); await s.setJSON(K.request(q.id), q); } }
  sendText(r.submittedBy, `${v.name} is live on Andiamo. Thank you.`).catch(() => {});
  return { ok: true, venueId: v.id, payoutError: r.payoutError || "" };
}

// Back to the onboarder with what to fix. They change it in the app and send it again.
export async function returnSubmission(s, id, note, by) {
  const r = await getJSON(s, K.request(clean(id, 20)));
  if (!r || r.source !== "onboard") return { ok: false, error: "not_found" };
  if (r.stage !== "submitted") return { ok: false, error: "state" };
  const n = clean(note, 300); if (!n) return { ok: false, error: "note" };
  r.stage = "sent_back"; r.returnNote = n; r.updatedAt = Date.now();
  r.history = [...(r.history || []), { at: Date.now(), stage: "sent_back", by, note: n }].slice(-30);
  await s.setJSON(K.request(r.id), r);
  sendText(r.submittedBy, `${r.name} needs a fix before it goes live: ${n} Open ${SITE}/onboard to change it.`).catch(() => {});
  return { ok: true };
}
