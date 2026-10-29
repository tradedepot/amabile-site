// Outside: a bottle sent as a link, for people you know on Instagram or Snapchat but not by number.
// The link is a key, not the gift. The first verified number to keep it owns the bottle, and from then on
// it is an ordinary bottle: Amabile's WhatsApp message goes out, it waits, it is claimed at a venue.
// The sender's "For" line is private: shown only on the opening, never in the link preview or a share card.
import nodeCrypto from "node:crypto";
import { K, getJSON, clean, wine, maskPhone, SITE, sendBottleNotice } from "./_outside.mjs";
import { saveBottle } from "./_outside_flow.mjs";

const ALPHA = "abcdefghjkmnpqrstuvwxyz23456789";
const newCode = () => Array.from(nodeCrypto.randomBytes(9), (x) => ALPHA[x % ALPHA.length]).join("");
export const giftCode = (c) => String(c || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
export const giftUrl = (code) => SITE + "/g/" + code;

// Called when a link bottle is created (before payment).
export async function attachGift(s, b, forLabel) {
  b.via = "link"; b.to = null; b.anon = false;
  b.forLabel = clean(forLabel, 40);
  b.giftCode = newCode();
  b.toMasked = b.forLabel || "Link";
  await s.set(K.gift(b.giftCode), b.id);
}

async function bottleFor(s, code) {
  const id = await s.get(K.gift(giftCode(code))).catch(() => null);
  return id ? getJSON(s, K.bottle(String(id))) : null;
}

// Anyone with the link: what the opening shows.
export async function giftView(s, code, me) {
  const b = await bottleFor(s, code);
  if (!b || b.via !== "link" || b.giftCode !== giftCode(code)) return { ok: false, error: "gift_unknown" };
  const w = wine(b.wine);
  const base = { ok: true, from: b.fromName || "A friend", wine: b.wine, wineLabel: w ? w.label : "Amabile", note: b.note || "", band: b.band };
  if (b.status === "pending" || b.status === "review") return { ...base, state: "not_ready" };
  if (b.status === "link") return { ...base, state: "open", forLabel: b.forLabel || "" };
  if (me && b.to === me) return { ...base, state: "mine", bottleId: b.id, forLabel: b.forLabel || "" };
  if (["cancelled", "refunded", "expired"].includes(b.status)) return { ...base, state: "gone" };
  return { ...base, state: "taken" };
}

// Signed in with a verified number and a profile: keep it.
export async function acceptGift(s, me, player, code) {
  const b = await bottleFor(s, code);
  if (!b || b.via !== "link" || b.giftCode !== giftCode(code)) return { ok: false, error: "gift_unknown" };
  if (b.to === me) return { ok: true, bottleId: b.id, already: true };
  if (b.status !== "link") return { ok: false, error: "gift_taken" };
  if (b.from === me) return { ok: false, error: "self" };
  b.to = me; b.toFirst = player.name || ""; b.toMasked = b.toFirst || maskPhone(me);
  b.status = "waiting"; b.acceptedAt = Date.now();
  await saveBottle(s, b);
  await s.setJSON(K.inbox(me, b.id), { id: b.id, at: b.createdAt });
  // From here it is Amabile's moment: the same WhatsApp a number send gets.
  const r = await sendBottleNotice(b).catch((e) => ({ ok: false, err: String(e) }));
  b.notice = { ok: !!(r && r.ok), at: Date.now(), skip: r && r.skip };
  await saveBottle(s, b);
  return { ok: true, bottleId: b.id };
}

// Sender: a fresh link (the old one stops working), only before anyone keeps it.
export async function reissueGift(s, me, bottleId) {
  const b = await getJSON(s, K.bottle(clean(bottleId, 20)));
  if (!b || b.from !== me || b.via !== "link") return { ok: false, error: "not_found" };
  if (b.status !== "link") return { ok: false, error: "gift_taken" };
  await s.delete(K.gift(b.giftCode)).catch(() => {});
  b.giftCode = newCode();
  await s.set(K.gift(b.giftCode), b.id);
  await saveBottle(s, b);
  return { ok: true, url: giftUrl(b.giftCode) };
}
