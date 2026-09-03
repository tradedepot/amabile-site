// Shared helpers for the Amabile Table RSVP tool (filename starts with _ so Netlify
// does not expose it as its own endpoint).
//
// Design note — why this can never miscount under concurrency:
// There is NO shared counter and NO read-modify-write of a shared list. Each guest owns
// exactly one blob, table:<edition>:rsvp:<gid>. Seating is DERIVED, not stored: list the
// per-guest blobs, take everyone whose response is "yes", order them by the moment they
// accepted, and the first <cap> are seated, the rest are the waitlist. Two people saying
// yes in the same second each write their own blob, so neither is lost, and the count is
// always exact because it is recomputed from the full set every time. A drop-out just flips
// one guest's blob to "no"; the next person on the waitlist is now within the first <cap>,
// i.e. promoted automatically, with no mutation of anyone else's record.
import { getStore } from "@netlify/blobs";
import { clean } from "./_lib.mjs";

export const STORE_NAME = "amabile-invites";
export function tstore() { return getStore(STORE_NAME); }

export const kEdition = (ed) => "table:" + ed;
export const kGuests = (ed) => "table:" + ed + ":guests";
export const kRsvp = (ed, gid) => "table:" + ed + ":rsvp:" + gid;
export const kRsvpPrefix = (ed) => "table:" + ed + ":rsvp:";
export const kMetaPrefix = () => "table:";

export const edId = (s) => clean(s, 40).toLowerCase().replace(/[^a-z0-9-]/g, "");
export const tokenClean = (s) => clean(s, 80).replace(/[^A-Za-z0-9_-]/g, "");

// Client IP (Netlify v2 context.ip, with header fallbacks).
export function clientIp(req, context) {
  return (context && context.ip) ||
    (req.headers.get("x-nf-client-connection-ip") || "").trim() ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "anon";
}

// Fixed-window rate limit, backed by Blobs. Approximate by design (rate limits don't need
// to be exact) and cheap. Returns true if the request is allowed.
export async function rateOk(st, fn, ip, limit = 20, windowMs = 60000) {
  try {
    const bucket = Math.floor(Date.now() / windowMs);
    const key = "rl:" + fn + ":" + ip + ":" + bucket;
    const cur = (await st.get(key, { type: "json" }).catch(() => null)) || { n: 0 };
    if (cur.n >= limit) return false;
    cur.n++;
    await st.setJSON(key, cur);
    return true;
  } catch (_) {
    return true; // never let the limiter itself break a request
  }
}

// A random per-guest token (unguessable; a forwarded-without-token link can't RSVP).
export function mintToken() {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 22; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}
export function mintGid() {
  return "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export async function loadEdition(st, ed) {
  return await st.get(kEdition(ed), { type: "json" }).catch(() => null);
}
export async function loadGuests(st, ed) {
  return (await st.get(kGuests(ed), { type: "json" }).catch(() => null)) || {}; // token -> {gid,name,email}
}
export function guestByToken(guests, token) {
  if (!token) return null;
  const g = guests[token];
  return g ? { token, ...g } : null;
}

export async function loadRsvps(st, ed) {
  const out = [];
  try {
    const { blobs } = await st.list({ prefix: kRsvpPrefix(ed) });
    for (const b of blobs) {
      const r = await st.get(b.key, { type: "json" }).catch(() => null);
      if (r) out.push(r);
    }
  } catch (_) {}
  return out;
}

// Pure derivation of standings from the immutable per-guest records.
export function standings(rsvps, cap) {
  const yes = rsvps
    .filter((r) => r.response === "yes")
    .sort((a, b) =>
      (a.acceptedAt || a.updatedAt || 0) - (b.acceptedAt || b.updatedAt || 0) ||
      String(a.gid).localeCompare(String(b.gid))
    );
  const seated = yes.slice(0, cap);
  const wait = yes.slice(cap);
  const declined = rsvps.filter((r) => r.response === "no");
  return { seated, wait, declined, cap, seatedCount: seated.length, waitCount: wait.length, full: seated.length >= cap };
}
export function statusOf(gid, st) {
  const si = st.seated.findIndex((r) => r.gid === gid);
  if (si > -1) return { status: "seated" };
  const wi = st.wait.findIndex((r) => r.gid === gid);
  if (wi > -1) return { status: "wait", position: wi + 1 };
  return { status: "none" };
}

// Presentational date/time helpers (edition stores an ISO date + free-text time/venue).
export function fmtDate(iso) {
  try {
    return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", {
      weekday: "long", day: "numeric", month: "long", timeZone: "UTC"
    });
  } catch (_) { return iso || ""; }
}
export function deadlinePassed(edition) {
  if (!edition || !edition.deadlineISO) return false;
  const t = Date.parse(edition.deadlineISO);
  return Number.isFinite(t) && Date.now() >= t;
}
