// Outside: player API. Owns /api/outside/*.
//   GET  config                      wines, bands, venues, glow, live drops
//   POST auth/start {phone}          send a sign-in code on WhatsApp
//   POST auth/verify {phone, code}   → session token
//   POST auth/link {token}           claim-link from WhatsApp → session token + bottle id
//   POST profile {name, dob, avatar}
//   GET  me                          player, bag, sent, light, circle, open tickets
//   POST send {to, wine, band, note, anon, mode, table}   → Paystack
//   GET  pay?ref=                    payment status (self-heals with Paystack)
//   POST claim {bottleId, lat, lng, acc, venueId?, tent?, table, quiet}
//   POST cancel {bottleId}           runner not there yet, keep the bottle for another night
//   POST received {ticketId, venueId}
//   POST decline {bottleId}  |  pass {bottleId, to}
//   POST light {on, lat, lng, acc, venueId?, tent?, table, visible}
//   POST circle {phone, level|remove} | block {phone}
//   GET  room                        players visible in the same venue
//   POST drop {dropId, lat, lng, acc, tent?, table, passTo?}
import {
  store, json, clean, K, getJSON, listKeys, fetchAll, phoneE164, phoneKey, maskPhone, sessionToken, sessionFrom,
  verify, rid, code4, WINES, wine, BAND_ORDER, BAND_NAMES, getBands, bandPrice, bandRank, venuesNear, allVenues,
  publicVenue, venuePrice, claimCheck, numberHash, pickBeacon, BEACONS, computeGlow, lightIsOn, newTicket, saveTicket, paystackInit, paystackVerify,
  payEmail, sendCode, publicPlayer, isAdult, nightKey, RULES, SITE, hashKey, metres, lagosHour
} from "./_outside.mjs";
import { senderView, bagView, saveBottle, markBottlePaid, markTopupPaid, lightOn, openTicketsFor, ticketServed } from "./_outside_flow.mjs";

export const config = { path: "/api/outside/*" };

const bad = (error, status = 400, extra = {}) => json({ ok: false, error, ...extra }, status);

async function body(req) { try { return await req.json(); } catch { return {}; } }

// Resolve where a player is from a tent token, a chosen venue id, or their location.
async function locate(s, d) {
  const venues = await allVenues(s);
  if (d.tent) {
    const t = verify(d.tent);
    if (t && t.k === "t") {
      const v = venues.find((x) => x.id === t.v && x.active && !x.paused);
      if (v) return { venue: v, table: t.t, via: "tent" };
    }
  }
  const lat = Number(d.lat), lng = Number(d.lng);
  const hasLoc = Number.isFinite(lat) && Number.isFinite(lng);
  const near = hasLoc ? venuesNear(venues, { lat, lng }, d.acc) : [];
  if (d.venueId) {
    const v = venues.find((x) => x.id === d.venueId && x.active && !x.paused);
    // A chosen venue must still be near the player when we have a location.
    if (v && hasLoc && (near.some((n) => n.id === v.id) || metres({ lat, lng }, v) <= (v.radius || RULES.venueRadiusM) + 150)) return { venue: v, table: clean(d.table, 12), via: "pick" };
  }
  if (near.length === 1) return { venue: venues.find((x) => x.id === near[0].id), table: clean(d.table, 12), via: "gps" };
  if (near.length > 1) return { choose: near };
  return { none: true, hasLoc, lat, lng };
}

async function logUnmet(s, d, phone, why) {
  if (!Number.isFinite(Number(d.lat))) return;
  await s.setJSON(K.unmet(), { lat: Math.round(Number(d.lat) * 1e3) / 1e3, lng: Math.round(Number(d.lng) * 1e3) / 1e3, why, at: Date.now() });
}

async function liveDrops(s, glowCounts) {
  const drops = await fetchAll(s, await listKeys(s, K.dropPrefix));
  const t = Date.now();
  const out = [];
  for (const dr of drops) {
    if (dr.status === "cancelled") continue;
    if (t > dr.end + 30 * 60 * 1000) continue;            // gone from the map 30 minutes after it ends
    if (t < dr.start - 48 * 3600 * 1000) continue;        // announced 48 hours ahead
    if (dr.visibility === "hidden" && t < dr.start) continue;
    const taken = await dropTaken(s, dr);
    out.push({ id: dr.id, venueId: dr.venueId, kind: dr.kind, start: dr.start, end: dr.end, bottles: dr.bottles,
      left: Math.max(0, dr.bottles - taken), hidden: dr.visibility === "hidden", clue: dr.clue || "", reward: dr.reward || "",
      gatheringLights: dr.gatheringLights || 0, wines: dr.wines || [], state: t < dr.start ? "soon" : t <= dr.end ? "live" : "gone" });
  }
  // Hidden drops: never say where until found.
  return out.map((x) => (x.hidden ? { ...x, venueId: null } : x));
}

async function dropTicketFor(s, light) {
  if (!lightIsOn(light) || !light.dropTicket) return [];
  const t = await getJSON(s, K.ticket(light.dropTicket.venueId, light.dropTicket.id));
  if (!t || !["open", "taken"].includes(t.status)) return [];
  return [{ ticketId: t.id, bottleId: null, venueId: t.venueId, code: t.code, status: t.status, table: t.table, spot: t.spot || "", beacon: t.beacon || null, wine: t.wine, kind: "drop" }];
}

async function dropTaken(s, dr) {
  const intents = await listKeys(s, K.dropIntentPrefix(dr.id));
  const rel = new Set((await listKeys(s, K.dropReleasePrefix(dr.id))).map((k) => k.split("/").pop()));
  return intents.filter((k) => !rel.has(k.split("/").pop())).length;
}

export default async (req) => {
  const s = store();
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/outside\/?/, "").replace(/\/$/, "");
  const me = sessionFrom(req);
  const d = req.method === "POST" ? await body(req) : {};

  try {
    // ---------- public ----------
    if (route === "config") {
      const [bands, venues, glow] = await Promise.all([getBands(s), allVenues(s), computeGlow(s)]);
      return json({ ok: true, site: SITE, wines: WINES, bands, bandOrder: BAND_ORDER, bandNames: BAND_NAMES,
        venues: venues.filter((v) => v.active).map(publicVenue), glow: glow.glow, drops: await liveDrops(s),
        beacons: BEACONS, paystackKey: process.env.PAYSTACK_PUBLIC_KEY || "", rules: { lightHours: RULES.lightHours } });
    }

    if (route === "auth/start") {
      const ph = phoneE164(d.phone); if (!ph) return bad("phone");
      const prev = await getJSON(s, K.otp(ph));
      const recent = (prev && prev.sends || []).filter((t) => Date.now() - t < 10 * 60 * 1000);
      if (recent.length >= 3) return bad("slow_down", 429);
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await s.setJSON(K.otp(ph), { h: hashKey(code + ph), exp: Date.now() + 10 * 60 * 1000, tries: 0, sends: [...recent, Date.now()] });
      const r = await sendCode(ph, code).catch(() => ({ ok: false }));
      const dev = process.env.OUTSIDE_DEV === "1";
      if (!r.ok && !dev) return bad("send_failed", 502);
      return json({ ok: true, sent: !!r.ok, ...(dev ? { devCode: code } : {}) });
    }

    if (route === "auth/verify") {
      const ph = phoneE164(d.phone); if (!ph) return bad("phone");
      const o = await getJSON(s, K.otp(ph));
      if (!o || Date.now() > o.exp) return bad("expired");
      if (o.tries >= 5) return bad("too_many", 429);
      if (hashKey(String(d.code || "").trim() + ph) !== o.h) { o.tries++; await s.setJSON(K.otp(ph), o); return bad("wrong_code"); }
      await s.delete(K.otp(ph));
      const p = await getJSON(s, K.player(ph));
      if (p && p.blockedUntil && Date.now() < p.blockedUntil) return bad("not_now", 403);
      return json({ ok: true, token: sessionToken(ph), needsProfile: !(p && p.name && p.dob) });
    }

    if (route === "auth/link") {
      const t = verify(d.token);
      if (!t || t.k !== "c") return bad("link");
      const p = await getJSON(s, K.player(t.p));
      if (p && p.blockedUntil && Date.now() < p.blockedUntil) return bad("not_now", 403);
      return json({ ok: true, token: sessionToken(t.p), bottleId: t.b, needsProfile: !(p && p.name && p.dob) });
    }

    // ---------- signed in ----------
    if (!me) return bad("signin", 401);

    if (route === "profile") {
      const existing = await getJSON(s, K.player(me));
      const name = clean(d.name, 24).split(/\s+/)[0] || (existing && existing.name) || "";
      if (!name) return bad("name");
      if (!d.dob && existing && existing.dob) d.dob = existing.dob;
      if (!isAdult(d.dob)) {
        await s.setJSON(K.player(me), { phone: me, blockedUntil: Date.now() + 30 * 864e5, createdAt: Date.now() });
        return bad("age", 403);
      }
      const p = (await getJSON(s, K.player(me))) || { phone: me, createdAt: Date.now(), rank: "JJC" };
      p.name = name; p.dob = d.dob;
      if (d.avatar && typeof d.avatar === "object") p.avatar = {
        face: clean(d.avatar.face, 12), hair: clean(d.avatar.hair, 12), outfit: clean(d.avatar.outfit, 12), skin: clean(d.avatar.skin, 12) };
      const isNew = !p.hash;
      p.hash = numberHash(me);
      await s.setJSON(K.player(me), p);
      if (isNew) {
        await s.set(K.phash(p.hash), phoneKey(me));
        // People who picked this number from their contacts before this player joined.
        const owners = (await getJSON(s, K.waitingFor(p.hash))) || [];
        for (const o of owners.slice(0, 200)) await s.setJSON(K.circle("+" + o, me), { other: me, level: "visible", source: "contacts", at: Date.now() });
        if (owners.length) await s.delete(K.waitingFor(p.hash));
      }
      return json({ ok: true, player: publicPlayer(p) });
    }

    // A venue owner or manager asks to put their venue on Outside. Needs a verified number, not a player profile.
    if (route === "venue-request") {
      const { createVenueRequest } = await import("./_outside_venues.mjs");
      const r = await createVenueRequest(s, me, d);
      return r.ok ? json(r) : bad(r.error);
    }

    const player = await getJSON(s, K.player(me));
    if (!player || !player.name) return bad("profile", 409);

    if (route === "me") {
      const inKeys = await listKeys(s, K.inboxPrefix(me));
      const bag = (await fetchAll(s, inKeys.map((k) => K.bottle(k.split("/").pop()))))
        .filter((b) => ["waiting", "on_way"].includes(b.status))
        .sort((a, b) => b.createdAt - a.createdAt);
      const outKeys = (await listKeys(s, K.outboxPrefix(me))).slice(-40);
      const sent = (await fetchAll(s, outKeys.map((k) => K.bottle(k.split("/").pop())))).sort((a, b) => b.createdAt - a.createdAt).map(senderView);
      const light = await getJSON(s, K.light(me));
      // Circle: mutual edges only; show "out" by the level THEY set for me.
      const mine = await fetchAll(s, await listKeys(s, K.circlePrefix(me)));
      const circle = [];
      for (const e of mine) {
        const theirs = await getJSON(s, K.circle(e.other, me));
        const them = await getJSON(s, K.player(e.other));
        if (!them || !them.name) { circle.push({ phone: maskPhone(e.other), name: "", pending: true, level: e.level }); continue; }
        const mutual = !!theirs && theirs.level !== "hidden";
        let out = false, band = null, wines = [];
        if (mutual) {
          const l = await getJSON(s, K.light(e.other));
          out = lightIsOn(l);
          if (out) { const v = await getJSON(s, K.venue(l.venueId)); band = v ? v.band : null; wines = v ? publicVenue(v).wines.filter((w) => !(v.outOf || {})[w]) : []; }
        }
        circle.push({ key: phoneKey(e.other), name: them.name, avatar: them.avatar || null, level: e.level, mutual, out, band, wines, pending: !theirs });
      }
      return json({ ok: true, player: { ...publicPlayer(player), phone: maskPhone(me), invite: player.hash || numberHash(me), nights: (player.nights || []).length },
        bag: bag.map(bagView), sent, light: lightIsOn(light) ? { venueId: light.venueId, table: light.table, until: light.until, visible: !!light.visible, manual: !!light.manual } : null,
        circle, tickets: [...await openTicketsFor(s, me, bag), ...await dropTicketFor(s, light)], night: nightKey() });
    }

    if (route === "send") {
      const w = wine(d.wine); if (!w) return bad("wine");
      const mode = ["number", "light", "table"].includes(d.mode) ? d.mode : "number";
      const bands = await getBands(s);
      const note = clean(d.note, 140);
      const b = { id: rid(10), from: me, fromName: player.name, anon: !!d.anon, wine: w.id, note, createdAt: Date.now(), status: "pending", kind: "gift" };

      if (mode === "number" || mode === "light") {
        const to = mode === "light" ? null : phoneE164(d.to);
        let toPhone = to;
        if (mode === "light") {
          // Sending to someone in my circle who is out: identified by their key from /me.
          const key = String(d.toKey || "").replace(/\D/g, "");
          const theirEdge = await getJSON(s, "c/" + key + "/" + phoneKey(me));
          const l = await getJSON(s, "l/" + key);
          if (!theirEdge || theirEdge.level === "hidden" || !lightIsOn(l)) return bad("not_out");
          toPhone = "+" + key;
          const v = await getJSON(s, K.venue(l.venueId));
          if (!venuePrice(v, w.id)) return bad("not_stocked_there");
          b.kind = "light"; b.venueId = v.id; b.table = l.table; b.band = v.band;
          b.price = bandPrice(bands, v.band, w.id) || venuePrice(v, w.id);
          const them = await getJSON(s, K.player(toPhone)); b.toFirst = them && them.name || "";
        } else {
          if (!toPhone) return bad("to");
          if (toPhone === me) return bad("self");
          if (await getJSON(s, K.block(toPhone, me))) return bad("cant_send", 403);
          const band = BAND_ORDER.includes(d.band) ? d.band : "lounge";
          const price = bandPrice(bands, band, w.id);
          if (!price) return bad("band_price");
          b.band = band; b.price = price;
          // Limit: three unclaimed bottles to the same number within 30 days.
          const outKeys = await listKeys(s, K.outboxPrefix(me));
          const mineToThem = (await fetchAll(s, outKeys.slice(-60).map((k) => K.bottle(k.split("/").pop()))))
            .filter((x) => x.to === toPhone && x.status === "waiting" && Date.now() - x.createdAt < 30 * 864e5);
          if (mineToThem.length >= RULES.maxPendingToNumber) return bad("limit");
          const them = await getJSON(s, K.player(toPhone)); b.toFirst = them && them.name || "";
        }
        b.to = toPhone; b.toMasked = b.toFirst || maskPhone(toPhone);
      } else {
        // Send to a table in the same venue as me.
        const l = await getJSON(s, K.light(me));
        if (!lightIsOn(l)) return bad("not_in_venue");
        const table = clean(d.table, 12); if (!table) return bad("table");
        const night = nightKey();
        const sends = (await getJSON(s, K.tableSends(night, me))) || { n: 0 };
        if (sends.n >= RULES.maxTableSendsPerNight) return bad("limit");
        const v = await getJSON(s, K.venue(l.venueId));
        if (!venuePrice(v, w.id)) return bad("not_stocked_there");
        b.kind = "table"; b.venueId = v.id; b.table = table; b.fromTable = l.table; b.band = v.band;
        b.price = venuePrice(v, w.id); b.to = null; b.toMasked = "Table " + table;
        await s.setJSON(K.tableSends(night, me), { n: sends.n + 1 });
      }

      b.ref = "OUT-" + b.id + "-" + rid(4);
      await saveBottle(s, b);
      await s.set(K.ref(b.ref), b.id);
      const init = await paystackInit({ email: payEmail(me), amount: b.price, reference: b.ref,
        callbackUrl: SITE + "/?paid=" + encodeURIComponent(b.ref),
        metadata: { kind: "bottle", bottle_id: b.id, custom_fields: [
          { display_name: "Bottle", variable_name: "bottle", value: b.id },
          { display_name: "Wine", variable_name: "wine", value: w.label },
          { display_name: "Band", variable_name: "band", value: b.band || "" }] } });
      if (!init) return bad("payment_init", 502);
      return json({ ok: true, bottleId: b.id, ref: b.ref, price: b.price, authorization_url: init.authorization_url, access_code: init.access_code });
    }

    if (route === "pay") {
      const ref = clean(url.searchParams.get("ref"), 60);
      const rv = await s.get(K.ref(ref)).catch(() => null);
      if (!rv) return bad("not_found", 404);
      if (String(rv).startsWith("T:")) {
        let b = await getJSON(s, K.bottle(String(rv).slice(2)));
        if (!b || b.to !== me || !b.topup) return bad("not_found", 404);
        if (b.topup.status === "pending" && process.env.PAYSTACK_SECRET_KEY) {
          const tx = await paystackVerify(ref).catch(() => null);
          if (tx) b = await markTopupPaid(s, b, tx, "poll");
        }
        return json({ ok: true, topup: true, paid: b.topup.status === "paid", bottleId: b.id });
      }
      const id = rv;
      let b = await getJSON(s, K.bottle(id));
      if (!b || b.from !== me) return bad("not_found", 404);
      if (b.status === "pending" && process.env.PAYSTACK_SECRET_KEY) {
        const tx = await paystackVerify(ref).catch(() => null);
        if (tx) b = await markBottlePaid(s, b, tx, "poll");
      }
      return json({ ok: true, bottle: senderView(b), paid: b.status !== "pending" });
    }

    if (route === "claim") {
      const b = await getJSON(s, K.bottle(clean(d.bottleId, 20)));
      if (!b || b.to !== me) return bad("not_found", 404);
      if (b.status !== "waiting") return bad("state", 409, { status: b.status });
      const where = await locate(s, d);
      if (where.choose) return json({ ok: false, error: "choose", venues: where.choose });
      if (where.none) { await logUnmet(s, d, me, "claim"); return bad("no_venue"); }
      const v = where.venue;
      const table = clean(where.table || d.table, 12);
      const spot = clean(d.spot, 40);
      const bands = await getBands(s);
      const chk = claimCheck(bands, b, v);
      if (!chk.ok) return json({ ok: false, error: chk.reason, topup: chk.topup || 0, venue: publicVenue(v) });
      const t = newTicket({ venueId: v.id, kind: "gift", bottleId: b.id, wine: b.wine, table, spot, beacon: await pickBeacon(s, v.id), name: player.name,
        photo: d.photo === true ? (player.photo || null) : null, label: "From " + (b.anon ? "someone" : (b.fromName || "a friend")),
        playerPhone: me, payout: venuePrice(v, b.wine) });
      await saveTicket(s, t);
      b.status = "on_way"; b.venueId = v.id; b.table = table; b.ticketId = t.id; b.claimedAt = Date.now(); b.claimVia = where.via;
      await saveBottle(s, b);
      const light = d.quiet ? null : await lightOn(s, me, v.id, table, { manual: false, visible: !!d.visible, spot, beacon: t.beacon });
      return json({ ok: true, venue: publicVenue(v), ticket: { id: t.id, code: t.code, table, spot, beacon: t.beacon }, light: !!light });
    }

    // Claim by QR: show it to a runner, they scan it on the board.
    if (route === "qr") {
      const { createQr } = await import("./_outside_qr.mjs");
      const r = await createQr(s, me, d);
      return r.ok ? json(r) : bad(r.error, r.error === "not_found" ? 404 : 409);
    }
    if (route === "qr-status") {
      const { qrStatus } = await import("./_outside_qr.mjs");
      const r = await qrStatus(s, me, url.searchParams.get("code") || d.code);
      return r.ok ? json(r) : bad(r.error, 404);
    }

    if (route === "topup") {
      const b = await getJSON(s, K.bottle(clean(d.bottleId, 20)));
      if (!b || b.to !== me || b.status !== "waiting") return bad("state", 409);
      let where, qr = null;
      if (d.qr) {
        // After a runner scanned the QR: the scan fixed the venue.
        const { qrVenueFor, normCode } = await import("./_outside_qr.mjs");
        const v = await qrVenueFor(s, me, d.qr, b.id);
        if (!v) return bad("qr_expired");
        where = { venue: v, table: "" }; qr = normCode(d.qr);
      } else where = await locate(s, d);
      if (!where.venue) return bad("no_venue");
      const table = clean(where.table || d.table, 12); if (!table && !qr) return bad("table");
      const chk = claimCheck(await getBands(s), b, where.venue);
      if (chk.ok) return bad("no_topup_needed");
      if (!chk.topup) return bad(chk.reason || "not_stocked");
      const ref = "OUT-T-" + b.id + "-" + rid(4);
      b.topup = { ref, amount: chk.topup, venueId: where.venue.id, table, at: Date.now(), status: "pending", ...(qr ? { qr } : {}) };
      await saveBottle(s, b);
      await s.set(K.ref(ref), "T:" + b.id);
      const init = await paystackInit({ email: payEmail(me), amount: chk.topup, reference: ref,
        callbackUrl: SITE + "/?topup=" + encodeURIComponent(ref), metadata: { kind: "topup", bottle_id: b.id } });
      if (!init) return bad("payment_init", 502);
      return json({ ok: true, ref, amount: chk.topup, authorization_url: init.authorization_url });
    }

    if (route === "cancel") {
      const b = await getJSON(s, K.bottle(clean(d.bottleId, 20)));
      if (!b || b.to !== me || b.status !== "on_way" || b.kind !== "gift") return bad("state", 409);
      const t = await getJSON(s, K.ticket(b.venueId, b.ticketId));
      if (t && t.status === "served") return bad("served", 409);
      if (t) { t.status = "cancelled"; t.cancelledAt = Date.now(); await saveTicket(s, t); }
      b.status = "waiting"; b.venueId = null; b.table = null; b.ticketId = null;
      await saveBottle(s, b);
      return json({ ok: true });
    }

    if (route === "received") {
      const t = await getJSON(s, K.ticket(clean(d.venueId, 20), clean(d.ticketId, 20)));
      if (!t || t.playerPhone !== me) return bad("not_found", 404);
      if (t.status === "served") return json({ ok: true });
      await ticketServed(s, t, "player");
      return json({ ok: true });
    }

    if (route === "decline") {
      const b = await getJSON(s, K.bottle(clean(d.bottleId, 20)));
      if (!b || b.to !== me || b.status !== "waiting") return bad("state", 409);
      b.status = "declined"; b.declinedAt = Date.now();
      await saveBottle(s, b);
      await s.delete(K.inbox(me, b.id));
      return json({ ok: true });
    }

    if (route === "pass") {
      const b = await getJSON(s, K.bottle(clean(d.bottleId, 20)));
      const to = phoneE164(d.to);
      if (!b || b.to !== me || b.status !== "waiting") return bad("state", 409);
      if (!to || to === me) return bad("to");
      await s.delete(K.inbox(me, b.id));
      b.passedFrom = me; b.to = to; b.fromName = player.name + " (from " + (b.anon ? "someone" : b.fromName) + ")";
      b.anon = false; b.status = "waiting"; b.passedAt = Date.now();
      await saveBottle(s, b);
      await s.setJSON(K.inbox(to, b.id), { id: b.id, at: Date.now() });
      const { sendBottleNotice } = await import("./_outside.mjs");
      sendBottleNotice(b).catch(() => {});
      return json({ ok: true });
    }

    if (route === "light") {
      if (!d.on) { await s.delete(K.light(me)); return json({ ok: true, light: null }); }
      const where = await locate(s, d);
      if (where.choose) return json({ ok: false, error: "choose", venues: where.choose });
      if (where.none) return bad("no_venue");
      const table = clean(where.table || d.table, 12);
      const l = await lightOn(s, me, where.venue.id, table, { manual: true, visible: !!d.visible, spot: clean(d.spot, 40) });
      return json({ ok: true, light: { venueId: l.venueId, table: l.table, until: l.until, visible: l.visible, manual: true }, venue: publicVenue(where.venue) });
    }

    if (route === "visible") {
      const l = await getJSON(s, K.light(me));
      if (!lightIsOn(l)) return bad("not_out");
      l.visible = !!d.visible; await s.setJSON(K.light(me), l);
      return json({ ok: true });
    }

    if (route === "circle") {
      const other = phoneE164(d.phone) || (d.key ? "+" + String(d.key).replace(/\D/g, "") : null);
      if (!other || other === me) return bad("phone");
      if (d.remove) { await s.delete(K.circle(me, other)); return json({ ok: true }); }
      const level = d.level === "hidden" ? "hidden" : "visible";
      await s.setJSON(K.circle(me, other), { other, level, at: Date.now() });
      return json({ ok: true });
    }

    if (route === "contacts") {
      // Hashes of numbers the player picked from their contacts (hashed in the browser).
      const hashes = [...new Set((Array.isArray(d.hashes) ? d.hashes : []).map((h) => String(h).toLowerCase()).filter((h) => /^[0-9a-f]{32}$/.test(h)))].slice(0, 300);
      const prev = (await getJSON(s, K.contacts(me))) || { hashes: [] };
      const fresh = hashes.filter((h) => !prev.hashes.includes(h));
      let matched = 0;
      for (let i = 0; i < fresh.length; i += 25) {
        await Promise.all(fresh.slice(i, i + 25).map(async (h) => {
          if (h === player.hash) return;
          const other = await s.get(K.phash(h)).catch(() => null);
          if (other) {
            matched++;
            const existing = await getJSON(s, K.circle(me, "+" + other));
            if (!existing) await s.setJSON(K.circle(me, "+" + other), { other: "+" + other, level: "visible", source: "contacts", at: Date.now() });
          } else {
            const list = (await getJSON(s, K.waitingFor(h))) || [];
            if (!list.includes(phoneKey(me))) { list.push(phoneKey(me)); await s.setJSON(K.waitingFor(h), list.slice(-200)); }
          }
        }));
      }
      // An invite link is consent from both sides: the sharer gets the edge back too.
      if (d.invite && hashes.length === 1) {
        const other = await s.get(K.phash(hashes[0])).catch(() => null);
        if (other && !(await getJSON(s, K.circle("+" + other, me)))) await s.setJSON(K.circle("+" + other, me), { other: me, level: "visible", source: "invite", at: Date.now() });
      }
      await s.setJSON(K.contacts(me), { hashes: [...prev.hashes, ...fresh].slice(-1500), at: Date.now() });
      return json({ ok: true, matched, added: fresh.length });
    }

    if (route === "block") {
      const other = phoneE164(d.phone) || (d.key ? "+" + String(d.key).replace(/\D/g, "") : null);
      if (!other) return bad("phone");
      await s.setJSON(K.block(me, other), { at: Date.now() });
      await s.delete(K.circle(me, other));
      return json({ ok: true });
    }

    if (route === "room") {
      const l = await getJSON(s, K.light(me));
      if (!lightIsOn(l)) return json({ ok: true, room: [] });
      const lights = await fetchAll(s, await listKeys(s, K.lightPrefix));
      const room = [];
      for (const x of lights) {
        if (!lightIsOn(x) || !x.visible || x.venueId !== l.venueId || x.phone === me) continue;
        if (await getJSON(s, K.block(x.phone, me))) continue;
        const p = await getJSON(s, K.player(x.phone));
        if (p) room.push({ name: p.name, avatar: p.avatar || null, table: x.table });
      }
      return json({ ok: true, room, venueId: l.venueId });
    }

    if (route === "drop") {
      const dr = await getJSON(s, K.drop(clean(d.dropId, 20)));
      if (!dr || dr.status === "cancelled") return bad("not_found", 404);
      const t = Date.now();
      if (t < dr.start) return bad("not_yet");
      if (t > dr.end) return bad("over");
      const where = await locate(s, { ...d, venueId: dr.venueId });
      if (!where.venue || where.venue.id !== dr.venueId) return bad("not_here");
      const table = clean(where.table || d.table, 12);
      const spot = clean(d.spot, 40);
      if (!d.twoPlus) return bad("two_plus");
      const night = nightKey();
      if (await getJSON(s, K.nightDrop(night, me))) return bad("one_a_night");
      if (dr.kind === "gathering") {
        const lights = await fetchAll(s, await listKeys(s, K.lightPrefix));
        const here = lights.filter((x) => lightIsOn(x) && x.venueId === dr.venueId).length;
        if (here < (dr.gatheringLights || 0)) return bad("locked", 409, { here, need: dr.gatheringLights });
      }
      // Claim by writing an intent; the first N un-released intents win. Strong consistency makes
      // the listing agree for every claimant.
      const ik = K.dropIntent(dr.id, me);
      await s.setJSON(ik, { phone: me, table, at: t });
      const intents = await listKeys(s, K.dropIntentPrefix(dr.id));
      const rel = new Set((await listKeys(s, K.dropReleasePrefix(dr.id))).map((k) => k.split("/").pop()));
      const live = intents.filter((k) => !rel.has(k.split("/").pop()));
      const rank = live.indexOf(ik);
      if (rank < 0 || rank >= dr.bottles) {
        await s.setJSON(K.dropRelease(dr.id, ik), { at: Date.now(), why: "full" });
        return bad("gone");
      }
      await s.setJSON(K.nightDrop(night, me), { dropId: dr.id, at: t });
      const passTo = dr.kind === "passiton" ? clean(d.passTo, 12) : "";
      if (dr.kind === "passiton" && !passTo) {
        await s.setJSON(K.dropRelease(dr.id, ik), { at: Date.now(), why: "no_pass" });
        await s.delete(K.nightDrop(night, me));
        return bad("pass_table");
      }
      const tk = newTicket({ venueId: dr.venueId, kind: "drop", dropId: dr.id, dropStart: dr.start, intentKey: ik,
        wine: d.wine && dr.wines && dr.wines.includes(d.wine) ? d.wine : (dr.wines || [])[0] || "rosso",
        table: passTo || table, spot: passTo ? "" : spot, beacon: passTo ? null : await pickBeacon(s, dr.venueId), name: passTo ? "" : player.name,
        label: passTo ? ("Pass it on, from " + (table ? "table " + table : player.name)) : "Drop: one bottle for the table",
        last: rank === dr.bottles - 1 && dr.reward ? dr.reward : "", playerPhone: passTo ? null : me });
      await saveTicket(s, tk);
      if (passTo) { const { addBadge } = await import("./_outside.mjs"); addBadge(player, "pass-it-on"); await s.setJSON(K.player(me), player); }
      await lightOn(s, me, dr.venueId, table, { manual: false, visible: !!d.visible, spot, beacon: tk.beacon });
      if (!passTo) { const l2 = await getJSON(s, K.light(me)); l2.dropTicket = { venueId: dr.venueId, id: tk.id }; await s.setJSON(K.light(me), l2); }
      return json({ ok: true, ticket: { id: tk.id, code: tk.code, table: tk.table, spot: tk.spot, beacon: tk.beacon }, last: !!tk.last, venue: publicVenue(where.venue) });
    }

    return bad("route", 404);
  } catch (e) {
    console.error("outside-api", route, e);
    return bad("server", 500);
  }
};
