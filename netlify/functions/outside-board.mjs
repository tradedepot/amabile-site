// Outside: runner board API for one venue. Owns /api/outside-board.
//   GET  ?v=venueId&t=boardToken[&after=cursor]  tickets (all open + today's, or changed since cursor)
//   POST {action: "start", phone} | {action: "verify", phone, code}    staff sign in with their WhatsApp number
//   POST {v, t, action: "team" | "team-add" {phone, name, role} | "team-remove" {phone}}   managers manage their staff
//   POST {v, k, action, id?, runner?, code?, wine?, message?}
//        scan {code} (a player's QR) | take | serve (code) | undo | cantfind (message to player) | swap (wine) | release (drop table not found)
//        manager (mk = manager key): pause | resume | stock {wine: bool}
import { store, json, clean, K, getJSON, listKeys, fetchAll, saveTicket, boardView, hashKey, wine, sendText, RULES } from "./_outside.mjs";
import { ticketServed } from "./_outside_flow.mjs";
import { boardStart, boardVerify, staffFromToken, addStaff, removeStaff, staffView } from "./_outside_staff.mjs";

export const config = { path: "/api/outside-board" };

// Staff sign in with their own WhatsApp number and get a board token (t). The old shared codes (k) still open a board.
async function venueFor(s, v, k, t) {
  if (t) return staffFromToken(s, t, v ? clean(v, 20) : "");
  const venue = await getJSON(s, K.venue(clean(v, 20)));
  if (!venue || !venue.active) return null;
  const h = hashKey(String(k || ""));
  if (h === venue.runnerKeyHash) return { venue, role: "runner" };
  if (h === venue.managerKeyHash) return { venue, role: "manager" };
  return null;
}

export default async (req) => {
  const s = store();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const auth = await venueFor(s, url.searchParams.get("v"), url.searchParams.get("k"), url.searchParams.get("t"));
    if (!auth) return json({ ok: false, error: "unauthorized" }, 401);
    const v = auth.venue.id;
    const after = url.searchParams.get("after") || "";
    const evKeys = await listKeys(s, K.evPrefix(v));
    const cursor = evKeys.length ? evKeys[evKeys.length - 1] : "";
    let tickets;
    if (!after) {
      const all = await fetchAll(s, await listKeys(s, K.ticketPrefix(v)));
      const dayAgo = Date.now() - 20 * 3600 * 1000;
      tickets = all.filter((t) => ["open", "taken"].includes(t.status) || t.updatedAt > dayAgo);
    } else {
      const ts = Number((after.slice(K.evPrefix(v).length).split("-")[0]) || 0);
      const floor = K.evPrefix(v) + String(Math.max(0, ts - 20000)).padStart(14, "0");
      const byId = new Map();
      for (const t of await fetchAll(s, evKeys.filter((k) => k > floor))) {
        const prev = byId.get(t.id);
        if (!prev || (t.updatedAt || 0) >= (prev.updatedAt || 0)) byId.set(t.id, t);
      }
      tickets = [...byId.values()];
    }
    const nowT = Date.now();
    return json({ ok: true, full: !after, cursor: cursor || after, role: auth.role, you: auth.member ? { name: auth.member.name, role: auth.member.role } : null,
      venue: { id: v, name: auth.venue.name, paused: !!auth.venue.paused, outOf: auth.venue.outOf || {} },
      tickets: tickets.map((t) => ({ ...boardView(t), late: ["open", "taken"].includes(t.status) && nowT - t.createdAt > RULES.ticketEscalateMin * 60000 })),
      now: nowT });
  }

  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  let d; try { d = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }
  if (d.action === "start") { const r = await boardStart(s, d.phone); return json(r, r.ok ? 200 : r.error === "slow_down" ? 429 : 400); }
  if (d.action === "verify") { const r = await boardVerify(s, d.phone, d.code); return json(r, r.ok ? 200 : 400); }
  const auth = await venueFor(s, d.v, d.k, d.t);
  if (!auth) return json({ ok: false, error: "unauthorized" }, 401);
  const venue = auth.venue;
  if (auth.member) d.runner = auth.member.name;

  if (["team", "team-add", "team-remove"].includes(d.action)) {
    if (auth.role !== "manager") return json({ ok: false, error: "manager_only" }, 403);
    if (d.action === "team-add") {
      const r = await addStaff(s, venue.id, { phone: d.phone, name: d.name, role: d.role }, "manager:" + (auth.member ? auth.member.name : "code"));
      if (!r.ok) return json(r, 400);
    }
    if (d.action === "team-remove") {
      if (auth.member && auth.member.phone === d.phone) return json({ ok: false, error: "self" }, 400);
      const r = await removeStaff(s, venue.id, d.phone);
      if (!r.ok) return json(r, 400);
    }
    const v = await getJSON(s, K.venue(venue.id));
    return json({ ok: true, team: (v.staff || []).map(staffView), you: auth.member ? auth.member.phone : null });
  }

  if (["pause", "resume", "stock"].includes(d.action)) {
    if (auth.role !== "manager") return json({ ok: false, error: "manager_only" }, 403);
    if (d.action === "pause") venue.paused = true;
    if (d.action === "resume") venue.paused = false;
    if (d.action === "stock") { venue.outOf = { ...(venue.outOf || {}) }; for (const [w, out] of Object.entries(d.stock || {})) if (wine(w)) venue.outOf[w] = !!out; }
    await s.setJSON(K.venue(venue.id), venue);
    return json({ ok: true, paused: !!venue.paused, outOf: venue.outOf || {} });
  }

  if (d.action === "scan") {
    const { scanQr } = await import("./_outside_qr.mjs");
    const r = await scanQr(s, venue, d.code, d.runner);
    return json(r, r.ok ? 200 : 409);
  }

  const t = await getJSON(s, K.ticket(venue.id, clean(d.id, 20)));
  if (!t) return json({ ok: false, error: "not_found" }, 404);
  const runner = clean(d.runner, 30) || "Runner";

  if (d.action === "take") {
    if (t.status === "taken" && t.runner && t.runner !== runner && !d.force) return json({ ok: false, error: "taken", ticket: boardView(t) }, 409);
    if (!["open", "taken"].includes(t.status)) return json({ ok: false, error: "state", ticket: boardView(t) }, 409);
    t.status = "taken"; t.runner = runner; t.takenAt = Date.now();
    await saveTicket(s, t);
  } else if (d.action === "serve") {
    if (!["open", "taken"].includes(t.status)) return json({ ok: false, error: "state", ticket: boardView(t) }, 409);
    // Drop and pass-it-on tables have no player code; the runner confirms by hand.
    // A QR claim was made face to face with the runner, so no code is asked for.
    if (t.playerPhone && t.via !== "qr" && String(d.code || "").trim() !== t.code) return json({ ok: false, error: "code" }, 400);
    t.runner = t.runner || runner;
    await ticketServed(s, t, "runner:" + runner);
  } else if (d.action === "undo") {
    if (t.status === "taken") { t.status = "open"; t.runner = ""; t.takenAt = null; await saveTicket(s, t); }
    else return json({ ok: false, error: "state", ticket: boardView(t) }, 409);
  } else if (d.action === "cantfind") {
    if (!t.playerPhone) return json({ ok: false, error: "no_player" }, 400);
    const msg = clean(d.message, 160) || "I'm at the bar with your bottle. Where are you sitting?";
    await sendText(t.playerPhone, "From " + venue.name + ": " + msg).catch(() => {});
    t.messages = [...(t.messages || []), { at: Date.now(), msg }].slice(-5);
    await saveTicket(s, t);
  } else if (d.action === "swap") {
    if (!wine(d.wine) || t.item) return json({ ok: false, error: "wine" }, 400);
    t.swapFrom = t.swapFrom || t.wine; t.wine = d.wine;
    await saveTicket(s, t);
  } else if (d.action === "release") {
    if (!["open", "taken"].includes(t.status)) return json({ ok: false, error: "state" }, 409);
    t.status = "released"; t.releasedAt = Date.now();
    await saveTicket(s, t);
    if (t.kind === "drop" && t.intentKey) await s.setJSON(K.dropRelease(t.dropId, t.intentKey), { at: Date.now(), why: "runner" });
    if (t.bottleId) {
      // A gift goes back to waiting. A bottle sent to a light keeps its value as a waiting gift.
      // A bottle sent to a stranger's table that could not be found is refunded to the sender.
      const b = await getJSON(s, K.bottle(t.bottleId));
      if (b && b.status === "on_way") {
        if (b.kind === "table" || !b.to) { b.status = "refund_due"; b.refundReason = "table_not_found"; }
        else {
          b.kind = "gift"; b.status = "waiting"; b.venueId = null; b.table = null; b.ticketId = null;
          await s.setJSON(K.inbox(b.to, b.id), { id: b.id, at: b.createdAt });
        }
        b.updatedAt = Date.now();
        await s.setJSON(K.bottle(b.id), b);
      }
    }
  } else {
    return json({ ok: false, error: "action" }, 400);
  }
  return json({ ok: true, ticket: boardView(t) });
};
