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
import { clean, FROM } from "./_lib.mjs";

export const STORE_NAME = "amabile-invites";

// Sender for Table emails specifically, so the Table can move to table@amabiledirosa.com
// while the consumer invite loop stays on vibes@. Defaults to the shared sender until you
// set TABLE_FROM_EMAIL — that address MUST be a verified sender (or authenticated domain)
// in Brevo, or Brevo rejects the send.
export const TABLE_FROM = {
  email: process.env.TABLE_FROM_EMAIL || FROM.email,
  name: process.env.TABLE_FROM_NAME || "The Amabile Table"
};

// Email shell for Table messages (confirmation, waitlist, promotion, reminder): same visual
// system as the invitation (cream, wine top bar, serif), UTF-8 charset in the head, and NO
// tagline. Keep copy free of em dashes.
export function tableShell(inner) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body style="margin:0;background:#efe4cf;font-family:Georgia,'Times New Roman',serif;color:#2a1207">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efe4cf;padding:32px 14px"><tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf7;border:1px solid #e6d3a8;border-radius:10px;overflow:hidden">
        <tr><td style="height:6px;background:#7d1d1d"></td></tr>
        <tr><td style="padding:34px 44px 28px;color:#2a1207;font-size:16px;line-height:1.65">${inner}</td></tr>
        <tr><td style="padding:20px 44px 24px;border-top:1px solid #efe4cf;text-align:center">
          <div style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:15px;color:#8a6d4a">Amabile di Rosa</div>
          <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#b09a8c;margin-top:6px">Lagos, Nigeria</div>
        </td></tr>
      </table></td></tr></table></body></html>`;
}
export function tableRow(label, val) {
  return val ? `<tr>
    <td style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#b08d57;padding:12px 18px 0 0;vertical-align:top;white-space:nowrap">${label}</td>
    <td style="font-size:16px;color:#2a1207;padding:8px 0 0;line-height:1.3">${val}</td></tr>` : "";
}
export function tableBtn(href, label) {
  return `<a href="${href}" style="display:inline-block;background:#7d1d1d;color:#fffdf7;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:15px;letter-spacing:.03em;padding:14px 38px;border-radius:999px">${label}</a>`;
}
// Strong consistency: a save must see the save just before it. The default (eventual) let a
// second request seconds later read a guest's record as empty and re-send their emails.
export function tstore() { return getStore({ name: STORE_NAME, consistency: "strong" }); }

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
// Timing copy, defined once. One WHEN row, two lines, arrival first so it reads as the
// main time; the cutoff follows it rather than sitting on its own row.
//   When:  Sunday 13 September
//          3:00pm prompt, seated by 3:30pm
export function whenPartsOf(edition) {
  const date = edition.dateISO ? fmtDate(edition.dateISO) : (edition.dateLabel || "");
  const t = clean(edition.timeLabel, 60);
  const s = clean(edition.seatedByLabel, 60);
  const time = t ? t + " prompt" + (s ? ", seated by " + s : "") : "";
  return { date, time };
}
export function whenLineOf(edition) {
  const p = whenPartsOf(edition);
  return p.date + (p.time ? ", " + p.time : "");
}
// HTML for the WHEN cell (escaped), date on line one, timing on line two.
export function whenCellOf(edition) {
  const e = (x) => String(x == null ? "" : x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const p = whenPartsOf(edition);
  return e(p.date) + (p.time ? "<br>" + e(p.time) : "");
}
export function deadlinePassed(edition) {
  if (!edition || !edition.deadlineISO) return false;
  const t = Date.parse(edition.deadlineISO);
  return Number.isFinite(t) && Date.now() >= t;
}
