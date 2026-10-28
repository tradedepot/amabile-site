// Outside: bottle lifecycle shared by the API, the board and the Paystack webhook.
import {
  K, getJSON, fetchAll, listKeys, saveTicket, newTicket, wine, venuePrice, sendBottleNotice, sendText,
  newLightUntil, lightIsOn, addNight, addStamp, addBadge, rankFor, nightKey, RULES, SITE, naira
} from "./_outside.mjs";
import { autoPayout } from "./_outside_payout.mjs";

// A bottle as its sender may see it: never where, never when beyond the day, never a decline.
export function senderView(b) {
  const status = { pending: "Paying", link: "Not opened yet", waiting: "Waiting", on_way: "Waiting", served: "Delivered",
    declined: "Waiting", passed: "Passed on", refunded: "Not claimed", review: "Checking payment", expired: "Not claimed" }[b.status] || "Waiting";
  // A decline shows as Waiting until 30 days, then Not claimed.
  const shown = b.status === "declined" && Date.now() - (b.paidAt || b.createdAt) > 30 * 864e5 ? "Not claimed" : status;
  return { id: b.id, toMasked: b.toName || b.toMasked || "", wine: b.wine, note: b.note || "", status: shown, via: b.via || "",
    ...(b.via === "link" && b.status === "link" ? { giftUrl: SITE + "/g/" + b.giftCode, forLabel: b.forLabel || "" } : {}),
    day: b.servedAt ? new Date(b.servedAt).toISOString().slice(0, 10) : null, createdAt: b.createdAt };
}

// A bottle as its recipient sees it.
export function bagView(b) {
  return { id: b.id, from: b.anon ? "Someone" : (b.fromName || "A friend"), anon: !!b.anon, wine: b.wine,
    band: b.band, note: b.note || "", status: b.status, kind: b.kind, venueId: b.venueId || null,
    table: b.table || null, ticketId: b.ticketId || null, createdAt: b.createdAt };
}

export async function saveBottle(s, b) {
  b.updatedAt = Date.now();
  await s.setJSON(K.bottle(b.id), b);
}

// Idempotent: webhook, status poll and return page may all arrive.
export async function markBottlePaid(s, b, tx, via) {
  if (!b || !tx || tx.status !== "success") return b;
  if (b.status !== "pending") return b;
  if (Number(tx.amount) !== b.price * 100 || String(tx.currency).toUpperCase() !== "NGN") {
    b.status = "review"; b.reviewReason = "amount_mismatch"; b.paidAmount = Number(tx.amount) / 100;
    await saveBottle(s, b); return b;
  }
  b.paidAt = Date.now(); b.paidVia = via; b.channel = tx.channel || "";
  // Sender stats.
  const sender = await getJSON(s, K.player(b.from));
  if (sender) {
    sender.sentCount = (sender.sentCount || 0) + 1;
    if (b.to) sender.sentTo = [...new Set([...(sender.sentTo || []), b.to])].slice(-200);
    sender.rank = rankFor(sender);
    await s.setJSON(K.player(b.from), sender);
  }
  await s.setJSON(K.outbox(b.from, b.id), { id: b.id, at: b.createdAt });

  if (b.kind === "light" || b.kind === "table") {
    // Straight to the runner board for the recipient's table.
    const v = await getJSON(s, K.venue(b.venueId));
    const { pickBeacon } = await import("./_outside.mjs");
    const l = b.kind === "light" ? await getJSON(s, K.light(b.to)) : null;
    const t = newTicket({ venueId: b.venueId, kind: b.kind, bottleId: b.id, wine: b.wine, table: b.table, spot: (l && l.spot) || "", beacon: l && l.beacon ? l.beacon : await pickBeacon(s, b.venueId),
      name: b.toFirst || "", photo: null, label: b.kind === "table" ? ("From " + (b.anon ? "table " + (b.fromTable || "?") : (b.fromName || "a friend"))) : ("From " + (b.anon ? "someone" : (b.fromName || "a friend"))),
      playerPhone: b.to, senderPhone: b.from, payout: venuePrice(v, b.wine) || b.price });
    await saveTicket(s, t);
    b.status = "on_way"; b.ticketId = t.id; b.claimedAt = Date.now();
    await saveBottle(s, b);
    await s.setJSON(K.inbox(b.to, b.id), { id: b.id, at: b.createdAt });
    const from = b.anon ? "Someone" : (b.fromName || "A friend");
    sendText(b.to, from + " sent you an Amabile " + (wine(b.wine)?.name || "") + ". It's on its way to your table. Open Andiamo and tap Glow when you see the runner.").catch(() => {});
    return b;
  }

  if (b.via === "link") {
    // Waits for someone to open the link and keep it (see _outside_gift.mjs).
    b.status = "link";
    await saveBottle(s, b);
    return b;
  }

  b.status = "waiting";
  await saveBottle(s, b);
  await s.setJSON(K.inbox(b.to, b.id), { id: b.id, at: b.createdAt });
  const r = await sendBottleNotice(b).catch((e) => ({ ok: false, err: String(e) }));
  b.notice = { ok: !!(r && r.ok), at: Date.now(), skip: r && r.skip };
  await saveBottle(s, b);
  return b;
}

// A top-up paid: the bottle moves up to the venue's band and goes to the runner board.
export async function markTopupPaid(s, b, tx, via) {
  if (!b || !b.topup || b.topup.status !== "pending" || !tx || tx.status !== "success") return b;
  if (Number(tx.amount) !== b.topup.amount * 100) { b.topup.status = "review"; await saveBottle(s, b); return b; }
  const v = await getJSON(s, K.venue(b.topup.venueId));
  b.topup.status = "paid"; b.topup.paidAt = Date.now(); b.topup.via = via;
  b.price += b.topup.amount; b.band = v ? v.band : b.band;
  if (b.status === "waiting" && v) {
    const p = await getJSON(s, K.player(b.to));
    const { pickBeacon } = await import("./_outside.mjs");
    const t = newTicket({ venueId: v.id, kind: "gift", ...(b.topup.qr ? { via: "qr" } : {}), bottleId: b.id, wine: b.wine, table: b.topup.table, beacon: await pickBeacon(s, v.id), name: (p && p.name) || "",
      label: "From " + (b.anon ? "someone" : (b.fromName || "a friend")), playerPhone: b.to, payout: venuePrice(v, b.wine) });
    await saveTicket(s, t);
    b.status = "on_way"; b.venueId = v.id; b.table = b.topup.table; b.ticketId = t.id; b.claimedAt = Date.now();
    let quiet = false;
    if (b.topup.qr) {
      const q = await getJSON(s, K.qr(b.topup.qr));
      if (q) { quiet = !!q.quiet; q.status = "claimed"; q.ticketId = t.id; q.claimedAt = Date.now(); await s.setJSON(K.qr(q.code), q); }
    }
    if (!quiet) await lightOn(s, b.to, v.id, b.topup.table, {});
  }
  await saveBottle(s, b);
  return b;
}

// Switch a player's light on at a venue table.
export async function lightOn(s, phone, venueId, table, { manual = false, visible = false, spot = "", beacon = null } = {}) {
  const prev = await getJSON(s, K.light(phone));
  const l = { phone, venueId, table: String(table || ""), spot, beacon: beacon || (prev && prev.venueId === venueId ? prev.beacon : null), on: true, manual, visible,
    since: lightIsOn(prev) && prev.venueId === venueId ? prev.since : Date.now(), until: newLightUntil() };
  await s.setJSON(K.light(phone), l);
  return l;
}

// A served ticket: pay the venue (ledger), close the bottle, credit the player's night and stamp.
export async function ticketServed(s, t, by) {
  t.status = "served"; t.servedAt = Date.now(); t.servedBy = by;
  await saveTicket(s, t);
  const v = await getJSON(s, K.venue(t.venueId));
  const amount = t.kind === "drop" ? (v && v.runnerFee) || 2000 : (t.payout || 0);
  const lk = K.ledger(t.venueId, t.id);
  await s.setJSON(lk, { venueId: t.venueId, ticketId: t.id, kind: t.kind, bottleId: t.bottleId || null,
    dropId: t.dropId || null, wine: t.wine, amount, settle: t.kind === "drop" ? "fee" : "menu", at: Date.now(), paid: false });
  // Pay the venue straight away when automatic payouts are on and the venue's account is verified.
  await autoPayout(s, lk, v);
  if (t.bottleId) {
    const b = await getJSON(s, K.bottle(t.bottleId));
    if (b) { b.status = "served"; b.servedAt = Date.now(); await saveBottle(s, b); }
  }
  if (t.playerPhone) {
    const p = await getJSON(s, K.player(t.playerPhone));
    if (p) {
      addNight(p); addStamp(p, t.venueId); addBadge(p, "first-light");
      if (t.kind !== "drop" && t.bottleId) p.received = (p.received || 0) + 1;
      if (t.kind === "drop" && t.createdAt - (t.dropStart || 0) < 10 * 60 * 1000) addBadge(p, "early");
      p.rank = rankFor(p);
      await s.setJSON(K.player(t.playerPhone), p);
    }
  }
  return t;
}

// Tickets a player has open (for the code on their screen).
export async function openTicketsFor(s, phone, bottles) {
  const out = [];
  for (const b of bottles) {
    if (b.status !== "on_way" || !b.ticketId || !b.venueId) continue;
    const t = await getJSON(s, K.ticket(b.venueId, b.ticketId));
    if (t && ["open", "taken"].includes(t.status)) out.push({ ticketId: t.id, bottleId: b.id, venueId: t.venueId, code: t.code, status: t.status, table: t.table, spot: t.spot || "", beacon: t.beacon || null, wine: t.wine, item: t.item || "", icon: t.icon || "", kind: t.kind, via: t.via || "" });
  }
  return out;
}

export { naira, SITE, RULES, nightKey, fetchAll, listKeys };
