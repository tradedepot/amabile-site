// Andiamo: browser push notifications. They go out alongside the WhatsApp message, never instead of it.
// A player turns them on once (bottles tab or their profile); each phone or browser is one subscription.
// Android Chrome works straight away; iPhone only once Andiamo is added to the Home Screen (Apple's rule).
// Env: OUTSIDE_VAPID_PUBLIC, OUTSIDE_VAPID_PRIVATE (a VAPID key pair). Without them nothing is sent.
import crypto from "node:crypto";
import webpush from "web-push";
import { store, getJSON, clean, phoneKey, SITE, claimLinkToken, wine } from "./_outside.mjs";

const subsKey = (ph) => "pu/" + phoneKey(ph);
const MAX_SUBS = 5; // phones and browsers per player
// One phone, one owner: if someone else signs in on this phone, the old number stops getting its pings.
const ownerKey = (endpoint) => "pe/" + crypto.createHash("sha256").update(endpoint).digest("hex").slice(0, 32);

let ready = null;
function setup() {
  if (ready !== null) return ready;
  const pub = process.env.OUTSIDE_VAPID_PUBLIC, priv = process.env.OUTSIDE_VAPID_PRIVATE;
  ready = false;
  if (pub && priv) { try { webpush.setVapidDetails("mailto:hello@amabiledirosa.com", pub, priv); ready = true; } catch (e) { console.warn("push setup", String(e)); } }
  return ready;
}
export const vapidPublic = () => process.env.OUTSIDE_VAPID_PUBLIC || "";

// ---------- subscriptions ----------
function cleanSub(sub) {
  const endpoint = clean(sub && sub.endpoint, 1000);
  const p256dh = clean(sub && sub.keys && sub.keys.p256dh, 200), auth = clean(sub && sub.keys && sub.keys.auth, 100);
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) return null;
  return { endpoint, keys: { p256dh, auth } };
}
export async function saveSub(s, phone, sub, ua) {
  const c = cleanSub(sub);
  if (!c) return { ok: false, error: "subscription" };
  const prev = String((await s.get(ownerKey(c.endpoint)).catch(() => "")) || "");
  if (prev && prev !== phoneKey(phone)) await dropSub(s, "+" + prev, c.endpoint, true);
  const list = ((await getJSON(s, subsKey(phone))) || []).filter((x) => x.endpoint !== c.endpoint);
  list.push({ ...c, ua: clean(ua, 160), at: Date.now() });
  await s.setJSON(subsKey(phone), list.slice(-MAX_SUBS));
  await s.set(ownerKey(c.endpoint), phoneKey(phone));
  return { ok: true };
}
export async function dropSub(s, phone, endpoint, keepOwner) {
  const list = (await getJSON(s, subsKey(phone))) || [];
  const next = list.filter((x) => x.endpoint !== endpoint);
  if (next.length !== list.length) await s.setJSON(subsKey(phone), next);
  if (!keepOwner && endpoint) await s.delete(ownerKey(endpoint)).catch(() => {});
  return { ok: true };
}
export async function hasSub(s, phone, endpoint) {
  const list = (await getJSON(s, subsKey(phone))) || [];
  return list.some((x) => x.endpoint === endpoint);
}

// ---------- sending ----------
// msg = { title, body, url, tag }. Never throws; dead subscriptions (gone from the browser) are removed.
export async function pushTo(phone, msg) {
  if (!phone || !setup()) return { ok: false, skip: "not_configured" };
  const s = store();
  const list = (await getJSON(s, subsKey(phone))) || [];
  if (!list.length) return { ok: false, skip: "no_subscription" };
  const payload = JSON.stringify({ title: clean(msg.title, 80), body: clean(msg.body, 200), url: msg.url || SITE + "/", tag: clean(msg.tag, 40) });
  let sent = 0; const dead = [];
  await Promise.all(list.map(async (sub) => {
    try { await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, { TTL: 24 * 3600, urgency: "high" }); sent++; }
    catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) dead.push(sub.endpoint);
      else console.warn("push", e && e.statusCode, String(e && (e.body || e.message) || e).slice(0, 200));
    }
  }));
  if (dead.length) await s.setJSON(subsKey(phone), list.filter((x) => !dead.includes(x.endpoint)));
  return { ok: sent > 0, sent };
}

const fromOf = (b) => (b.anon ? "Someone" : b.fromName || "A friend");

// A bottle waiting for them, to claim at any spot (the same moment as the WhatsApp bottle notice).
export function bottleWaitingPush(b) {
  return pushTo(b.to, {
    title: fromOf(b) + "'s sending you an Amabile",
    body: b.note ? "“" + b.note + "”" : "For next time you're outside.",
    url: SITE + "/c/" + claimLinkToken(b.to, b.id),
    tag: "b-" + b.id
  });
}
// A bottle sent straight to the table they're at.
export function bottleOnWayPush(b) {
  return pushTo(b.to, {
    title: fromOf(b) + " sent you an Amabile" + (wine(b.wine) ? " " + wine(b.wine).name : ""),
    body: "It's on its way to your table. Tap Glow when you see the waiter.",
    url: SITE + "/",
    tag: "b-" + b.id
  });
}
