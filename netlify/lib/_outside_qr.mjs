// Outside: claim by QR. The player shows a QR for a waiting bottle; a runner at a partner venue scans it.
// The scan is the location check: the runner's board belongs to one venue, so no phone location is needed.
// The QR carries only a short code. It lasts 20 minutes and works once.
import {
  K, getJSON, clean, getBands, claimCheck, newTicket, saveTicket, pickBeacon, venuePrice, publicVenue, boardView, SITE, BAND_NAMES, listKeys, fetchAll
} from "./_outside.mjs";
import { saveBottle, lightOn } from "./_outside_flow.mjs";
import nodeCrypto from "node:crypto";

const QR_MS = 20 * 60 * 1000;
const ALPHA = "ACDEFGHJKMNPQRTUVWXY3479";
const newCode = () => Array.from(nodeCrypto.randomBytes(6), (x) => ALPHA[x % ALPHA.length]).join("");
export const normCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

// Player: a fresh code for one of their waiting bottles.
export async function createQr(s, me, d) {
  const b = await getJSON(s, K.bottle(clean(d.bottleId, 20)));
  if (!b || b.to !== me) return { ok: false, error: "not_found" };
  if (b.status !== "waiting") return { ok: false, error: "state" };
  const prev = b.qrCode ? await getJSON(s, K.qr(b.qrCode)) : null;
  if (prev && prev.status === "ready" && prev.exp - Date.now() > 5 * 60 * 1000 && !!prev.quiet === !!d.quiet) return { ok: true, ...view(prev) };
  if (prev) await s.delete(K.qr(prev.code)).catch(() => {});
  const r = { code: newCode(), bottleId: b.id, phone: me, quiet: !!d.quiet, exp: Date.now() + QR_MS, status: "ready", at: Date.now() };
  await s.setJSON(K.qr(r.code), r);
  b.qrCode = r.code; await saveBottle(s, b);
  return { ok: true, ...view(r) };
}
const view = (r) => ({ code: r.code, url: SITE + "/board?q=" + r.code, exp: r.exp, status: r.status });

// Player: has a runner scanned it yet?
export async function qrStatus(s, me, code) {
  const r = await getJSON(s, K.qr(normCode(code)));
  if (!r || r.phone !== me) return { ok: false, error: "not_found" };
  const out = { ok: true, status: Date.now() > r.exp && r.status === "ready" ? "expired" : r.status };
  if (r.status === "topup") Object.assign(out, { topup: r.topup, venue: r.venue, bandName: BAND_NAMES[r.bottleBand] });
  if (r.status === "claimed") out.ticketId = r.ticketId;
  if (r.status === "refused") out.reason = r.reason;
  return out;
}

// Runner: scan. Returns the ticket, or why the bottle can't be served here.
export async function scanQr(s, venue, rawCode, runner) {
  const code = normCode(rawCode);
  const r = code.length === 6 ? await getJSON(s, K.qr(code)) : null;
  if (!r) return { ok: false, error: "qr_unknown" };
  // The QR on a Wallet card stands for the player, not one bottle: serve the oldest one this venue can pour.
  if (r.kind === "wallet" && r.status === "ready") {
    if (Date.now() > r.exp) return { ok: false, error: "qr_expired" };
    if (venue.paused) return { ok: false, error: "paused" };
    const pick = await walletPick(s, r.phone, venue);
    if (!pick.b) return pick.topup ? { ok: false, error: "topup", topup: pick.topup, wine: pick.wine } : { ok: false, error: "wallet_none" };
    r.bottleId = pick.b.id;
  }
  const b = await getJSON(s, K.bottle(r.bottleId));
  if (!b || b.to !== r.phone) return { ok: false, error: "qr_unknown" };
  // Scanned again at the same venue after claiming: show the same ticket.
  if (r.status === "claimed") {
    if (r.venueId !== venue.id) return { ok: false, error: "qr_used" };
    const t = await getJSON(s, K.ticket(venue.id, r.ticketId));
    return t ? { ok: true, ticket: boardView(t), again: true } : { ok: false, error: "qr_used" };
  }
  if (Date.now() > r.exp) return { ok: false, error: "qr_expired" };
  if (b.status !== "waiting") return { ok: false, error: "qr_used" };
  if (venue.paused) return { ok: false, error: "paused" };
  const chk = claimCheck(await getBands(s), b, venue);
  if (!chk.ok) {
    r.venueId = venue.id; r.venue = publicVenue(venue); r.bottleBand = b.band;
    if (chk.reason === "band" && chk.topup) { r.status = "topup"; r.topup = chk.topup; }
    else { r.status = "refused"; r.reason = chk.reason; }
    await s.setJSON(K.qr(code), r);
    return { ok: false, error: r.status === "topup" ? "topup" : chk.reason, topup: chk.topup || 0, wine: b.wine };
  }
  const p = await getJSON(s, K.player(r.phone));
  const t = newTicket({ venueId: venue.id, kind: "gift", via: "qr", bottleId: b.id, wine: b.wine, table: "", spot: "",
    beacon: await pickBeacon(s, venue.id), name: (p && p.name) || "", label: "From " + (b.anon ? "someone" : (b.fromName || "a friend")),
    playerPhone: r.phone, payout: venuePrice(venue, b.wine), status: "taken", runner: clean(runner, 30) || "Runner", takenAt: Date.now() });
  await saveTicket(s, t);
  b.status = "on_way"; b.venueId = venue.id; b.table = ""; b.ticketId = t.id; b.claimedAt = Date.now(); b.claimVia = "qr";
  await saveBottle(s, b);
  r.status = "claimed"; r.venueId = venue.id; r.ticketId = t.id; r.claimedAt = Date.now();
  await s.setJSON(K.qr(code), r);
  // A Wallet code works once: the card gets a fresh one (the bottle's change already refreshed it).
  if (r.kind === "wallet") { const { touchCard } = await import("./_outside_wallet.mjs"); await touchCard(s, r.phone); }
  if (!r.quiet) await lightOn(s, r.phone, venue.id, "", { beacon: t.beacon });
  return { ok: true, ticket: boardView(t) };
}

// The bottle a Wallet card's QR stands for at this venue: the oldest waiting one it can pour without a top-up.
async function walletPick(s, phone, venue) {
  const keys = await listKeys(s, K.inboxPrefix(phone));
  const bag = (await fetchAll(s, keys.map((k) => K.bottle(k.split("/").pop())))).filter((b) => b && b.status === "waiting" && b.to === phone).sort((a, b) => a.createdAt - b.createdAt);
  const bands = await getBands(s);
  let topup = null;
  for (const b of bag) {
    const chk = claimCheck(bands, b, venue);
    if (chk.ok) return { b };
    if (chk.reason === "band" && chk.topup && (!topup || chk.topup < topup.topup)) topup = { topup: chk.topup, wine: b.wine };
  }
  return topup || {};
}

// Top-up after a scan: the venue comes from the scan, not the phone's location.
export async function qrVenueFor(s, me, code, bottleId) {
  const r = await getJSON(s, K.qr(normCode(code)));
  if (!r || r.phone !== me || r.bottleId !== bottleId || r.status !== "topup" || Date.now() > r.exp + QR_MS) return null;
  return getJSON(s, K.venue(r.venueId));
}
