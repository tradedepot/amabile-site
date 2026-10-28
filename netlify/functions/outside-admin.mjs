// Outside: admin console API (password: TABLE_ADMIN_KEY). Owns /api/outside-admin.
//   POST {ak, action, ...}
//   venues            list all venues (with prices, bands, keys never shown)
//   venue-save        {venue}          create or update; returns new runner/manager keys once when asked
//   venue-keys        {id}             issue new runner and manager keys (old ones stop working)
//   bands-save        {bands}
//   tents             {id, from, to}   signed table-tent links for tables from..to
//   drops             list drops
//   drop-save         {drop}
//   drop-cancel       {id}
//   ledger            {from?, to?}     payouts owed per venue
//   ledger-paid       {keys: []}       mark ledger lines paid by hand (skips lines Paystack is paying)
//   banks | payout-account {venueId, bankCode, account} | payout-send {keys} | balance   Paystack Transfers to venues
//   bottle            {id | ref}       look up one bottle
//   bottles           recent bottles (last 200)
//   unmet             failed claims (for the sales team)
//   glow              {force?}         venues with people outside now (cached unless force)
import {
  store, json, clean, K, getJSON, listKeys, fetchAll, adminAuthorised, rid, hashKey, getBands, BAND_ORDER, WINES,
  wine, tentToken, SITE, computeGlow, maskPhone
} from "./_outside.mjs";

import { listRequests, updateRequest, listFromRequest, linkOutlet, recordSupply, liveChecks, goLive } from "./_outside_venues.mjs";
import { searchOutlets, getOutlet } from "./_outside_bq.mjs";
import { listBanks, resolveAccount, setPayoutAccount, sendPayout, autoPayoutsOn, paystackBalance } from "./_outside_payout.mjs";

export const config = { path: "/api/outside-admin" };

const num = (x) => { const n = Math.round(Number(String(x).replace(/[^\d.]/g, ""))); return Number.isFinite(n) && n > 0 ? n : 0; };

export default async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  let d; try { d = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }
  if (!adminAuthorised(d.ak)) return json({ ok: false, error: "unauthorized" }, 401);
  const s = store();
  const a = d.action;

  if (a === "venues") {
    const vs = await fetchAll(s, await listKeys(s, K.venuePrefix));
    return json({ ok: true, venues: vs.map(({ runnerKeyHash, managerKeyHash, ...v }) => ({ ...v, hasKeys: !!runnerKeyHash, checks: liveChecks(v) })), bands: await getBands(s), wines: WINES, bandOrder: BAND_ORDER });
  }

  if (a === "venue-save") {
    const x = d.venue || {};
    const id = clean(x.id, 20) || rid(6);
    const prev = (await getJSON(s, K.venue(id))) || { id, createdAt: Date.now() };
    const prices = {};
    for (const w of WINES) { const p = num(x.prices && x.prices[w.id]); if (p) prices[w.id] = p; }
    const v = {
      ...prev, id,
      name: clean(x.name, 60) || prev.name,
      area: clean(x.area, 40),
      lat: Number(x.lat), lng: Number(x.lng),
      radius: Math.max(20, Math.min(200, Number(x.radius) || 60)),
      band: BAND_ORDER.includes(x.band) ? x.band : prev.band || "lounge",
      prices, taxIncluded: !!x.taxIncluded,
      runnerFee: num(x.runnerFee) || prev.runnerFee || 2000,
      tables: Math.max(1, Math.min(200, Number(x.tables) || prev.tables || 20)),
      art: clean(x.art, 16) || prev.art || "lounge",
      tonight: clean(x.tonight, 80),
      payout: prev.payout || {}, // set only through payout-account, which checks it with the bank
      contact: { name: clean(x.contact && x.contact.name, 40), phone: clean(x.contact && x.contact.phone, 20) },
      active: !!x.active, updatedAt: Date.now()
    };
    if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng) || (v.lat === 0 && v.lng === 0)) { v.lat = null; v.lng = null; }
    // A venue only goes live with a location, a price level and menu prices.
    const checks = liveChecks(v);
    if (v.active && checks.missing.length) { v.active = false; v.blockedLive = checks.missing; } else delete v.blockedLive;
    if (v.active) v.stage = "live";
    let keys = null;
    if (v.active && (!v.runnerKeyHash || d.newKeys)) {
      keys = { runner: rid(6), manager: rid(8) };
      v.runnerKeyHash = hashKey(keys.runner); v.managerKeyHash = hashKey(keys.manager);
    }
    await s.setJSON(K.venue(id), v);
    const { runnerKeyHash, managerKeyHash, ...view } = v;
    return json({ ok: true, venue: view, keys, board: keys ? SITE + "/board?v=" + id : null, checks });
  }

  if (a === "venue-keys") {
    const v = await getJSON(s, K.venue(clean(d.id, 20)));
    if (!v) return json({ ok: false, error: "not_found" }, 404);
    const keys = { runner: rid(6), manager: rid(8) };
    v.runnerKeyHash = hashKey(keys.runner); v.managerKeyHash = hashKey(keys.manager);
    await s.setJSON(K.venue(v.id), v);
    return json({ ok: true, keys, board: SITE + "/board?v=" + v.id });
  }

  if (a === "bands-save") {
    const cur = await getBands(s);
    for (const fam of Object.keys(cur)) for (const b of BAND_ORDER) {
      const val = d.bands && d.bands[fam] && d.bands[fam][b];
      cur[fam][b] = val === null || val === "" || val === undefined ? null : (num(val) || null);
    }
    await s.setJSON(K.bands, cur);
    return json({ ok: true, bands: cur });
  }

  if (a === "tents") {
    const v = await getJSON(s, K.venue(clean(d.id, 20)));
    if (!v) return json({ ok: false, error: "not_found" }, 404);
    const from = Math.max(1, Number(d.from) || 1), to = Math.min(200, Number(d.to) || v.tables || 20);
    const tents = [];
    for (let i = from; i <= to; i++) tents.push({ table: String(i), url: SITE + "/t/" + tentToken(v.id, String(i)) });
    tents.push({ table: "Bar", url: SITE + "/t/" + tentToken(v.id, "Bar") });
    return json({ ok: true, venue: { id: v.id, name: v.name }, tents });
  }

  if (a === "drops") {
    const ds = await fetchAll(s, await listKeys(s, K.dropPrefix));
    for (const dr of ds) {
      const intents = await listKeys(s, K.dropIntentPrefix(dr.id));
      const rel = new Set((await listKeys(s, K.dropReleasePrefix(dr.id))).map((k) => k.split("/").pop()));
      dr.taken = intents.filter((k) => !rel.has(k.split("/").pop())).length;
    }
    return json({ ok: true, drops: ds.sort((x, y) => y.start - x.start) });
  }

  if (a === "drop-save") {
    const x = d.drop || {};
    const id = clean(x.id, 20) || rid(6);
    const v = await getJSON(s, K.venue(clean(x.venueId, 20)));
    if (!v) return json({ ok: false, error: "venue" }, 400);
    const start = Date.parse(x.start), end = Date.parse(x.end);
    if (!start || !end || end <= start) return json({ ok: false, error: "times" }, 400);
    // Hard rule: nothing after 2am Lagos time.
    const endLagos = new Date(end + 3600 * 1000), hh = endLagos.getUTCHours(), mm = endLagos.getUTCMinutes();
    if (hh >= 2 && hh < 6 && !(hh === 2 && mm === 0)) return json({ ok: false, error: "after_2am" }, 400);
    const kind = ["open", "gathering", "hidden", "passiton"].includes(x.kind) ? x.kind : "open";
    // What drops: bottles, or something else from Amabile (card games, merch). The runner hands it over either way.
    const prize = x.prize === "item" ? "item" : "bottle";
    const item = prize === "item" ? clean(x.item, 40) : "";
    if (prize === "item" && !item) return json({ ok: false, error: "item" }, 400);
    const dr = {
      id, venueId: v.id, kind, start, end,
      bottles: Math.max(1, Math.min(200, Number(x.bottles) || 20)),
      prize, item, icon: prize === "item" ? (["cards", "gift"].includes(x.icon) ? x.icon : "cards") : "",
      wines: prize === "item" ? [] : (Array.isArray(x.wines) ? x.wines : []).filter((w) => wine(w)),
      visibility: kind === "hidden" ? "hidden" : "public",
      clue: clean(x.clue, 140), reward: clean(x.reward, 80),
      gatheringLights: kind === "gathering" ? Math.max(5, Number(x.gatheringLights) || 15) : 0,
      status: "scheduled", updatedAt: Date.now()
    };
    if (prize === "bottle" && !dr.wines.length) dr.wines = ["rosso", "bianco"];
    await s.setJSON(K.drop(id), dr);
    return json({ ok: true, drop: dr });
  }

  if (a === "drop-cancel") {
    const dr = await getJSON(s, K.drop(clean(d.id, 20)));
    if (!dr) return json({ ok: false, error: "not_found" }, 404);
    dr.status = "cancelled"; await s.setJSON(K.drop(dr.id), dr);
    return json({ ok: true });
  }

  if (a === "ledger") {
    const vs = await fetchAll(s, await listKeys(s, K.venuePrefix));
    const out = [];
    for (const v of vs) {
      const keys = await listKeys(s, K.ledgerPrefix(v.id));
      const lines = (await fetchAll(s, keys)).map((l, i) => ({ ...l, key: keys[i] }));
      const owed = lines.filter((l) => !l.paid);
      const st = (l) => (l.transfer && l.transfer.status) || "";
      const day = Date.now() - 24 * 3600e3;
      const paidToday = lines.filter((l) => l.paid && (l.paidAt || 0) > day);
      out.push({ venueId: v.id, name: v.name, payout: { bank: (v.payout || {}).bank || "", account: (v.payout || {}).account || "", name: (v.payout || {}).name || "", verified: !!(v.payout && v.payout.recipient) },
        owed: owed.reduce((n, l) => n + l.amount, 0),
        lines: owed.length, menu: owed.filter((l) => l.settle === "menu").length, drops: owed.filter((l) => l.settle === "fee").length,
        pending: owed.filter((l) => st(l) === "pending").length, failed: owed.filter((l) => ["failed", "reversed", "held"].includes(st(l))).map((l) => ({ key: l.key, amount: l.amount, error: l.transfer.error || "" })),
        paidToday: paidToday.reduce((n, l) => n + l.amount, 0), paidTodayAuto: paidToday.filter((l) => l.paidVia === "paystack").length,
        keys: owed.filter((l) => !["pending", "success"].includes(st(l))).map((l) => l.key), sendable: owed.filter((l) => !["pending", "success"].includes(st(l))).reduce((n, l) => n + l.amount, 0) });
    }
    return json({ ok: true, auto: autoPayoutsOn(), ledger: out.sort((x, y) => y.owed - x.owed) });
  }

  if (a === "ledger-paid") {
    let n = 0;
    for (const k of (d.keys || []).slice(0, 500)) {
      if (!String(k).startsWith("lg/")) continue;
      const l = await getJSON(s, k); if (!l || l.paid) continue;
      if (l.transfer && ["pending", "success"].includes(l.transfer.status)) continue; // Paystack is already paying it
      l.paid = true; l.paidAt = Date.now(); l.paidRef = clean(d.ref, 60);
      await s.setJSON(k, l); n++;
    }
    return json({ ok: true, marked: n });
  }

  if (a === "bottle") {
    let id = clean(d.id, 20);
    if (!id && d.ref) id = String((await s.get(K.ref(clean(d.ref, 60))).catch(() => "")) || "").replace(/^T:/, "");
    const b = await getJSON(s, K.bottle(id));
    if (!b) return json({ ok: false, error: "not_found" }, 404);
    return json({ ok: true, bottle: { ...b, from: maskPhone(b.from), to: b.to ? maskPhone(b.to) : null } });
  }

  if (a === "bottles") {
    const keys = (await listKeys(s, "b/")).slice(-400);
    const bs = (await fetchAll(s, keys)).sort((x, y) => y.createdAt - x.createdAt).slice(0, 200)
      .map((b) => ({ id: b.id, kind: b.kind, wine: b.wine, band: b.band, price: b.price, status: b.status, from: b.fromName, to: b.to ? maskPhone(b.to) : b.toMasked, venueId: b.venueId || null, createdAt: b.createdAt, notice: b.notice || null }));
    return json({ ok: true, bottles: bs });
  }

  if (a === "unmet") {
    const keys = (await listKeys(s, K.unmetPrefix)).slice(-1000);
    return json({ ok: true, unmet: await fetchAll(s, keys) });
  }

  // ---------- venues joining ----------
  const by = clean(d.by, 30) || "admin";
  if (a === "requests") return json({ ok: true, requests: await listRequests(s) });
  if (a === "request-update") { const r = await updateRequest(s, clean(d.id, 20), d, by); return json(r, r.ok ? 200 : 404); }
  if (a === "request-list") { const r = await listFromRequest(s, clean(d.id, 20), by); return json(r, r.ok ? 200 : 404); }
  if (a === "outlet-search") return json(await searchOutlets(d.q));
  if (a === "outlet-get") return json(await getOutlet(clean(d.id, 40), clean(d.since, 10) || "2025-01-01"));
  if (a === "venue-link") { const r = await linkOutlet(s, clean(d.venueId, 20), clean(d.outletId, 40), by); return json(r, r.ok ? 200 : 400); }
  if (a === "venue-supply" || a === "venue-purchase") { const r = await recordSupply(s, clean(d.venueId, 20), d, by); return json(r, r.ok ? 200 : 400); }
  if (a === "venue-live") { const r = await goLive(s, clean(d.venueId, 20), by); return json(r, r.ok ? 200 : 400); }
  if (a === "venue-off") {
    const v = await getJSON(s, K.venue(clean(d.venueId, 20))); if (!v) return json({ ok: false, error: "not_found" }, 404);
    v.active = false; v.stage = "paused"; v.updatedAt = Date.now(); await s.setJSON(K.venue(v.id), v); return json({ ok: true });
  }

  // ---------- paying venues through Paystack ----------
  if (a === "banks") return json({ ok: true, banks: await listBanks(s) });
  if (a === "payout-resolve") { const r = await resolveAccount(s, { bankCode: d.bankCode, account: d.account }); return json(r, r.ok ? 200 : 400); }
  if (a === "payout-account") { const r = await setPayoutAccount(s, clean(d.venueId, 20), { bankCode: d.bankCode, account: d.account }); return json(r, r.ok ? 200 : 400); }
  if (a === "payout-send") {
    const out = [];
    for (const k of (d.keys || []).slice(0, 200)) if (String(k).startsWith("lg/")) out.push(await sendPayout(s, k));
    return json({ ok: true, sent: out.filter((x) => x.ok && !x.skipped).length, failed: out.filter((x) => !x.ok).map((x) => x.error) });
  }
  if (a === "balance") return json({ ok: true, balance: await paystackBalance(), auto: autoPayoutsOn() });

  if (a === "glow") return json({ ok: true, glow: await computeGlow(s, !!d.force) });

  return json({ ok: false, error: "action" }, 400);
};
