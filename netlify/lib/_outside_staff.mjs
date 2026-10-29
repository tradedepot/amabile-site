// Andiamo: who can open a venue's runner board. No shared codes: staff sign in with their own WhatsApp number
// and a one-time code, like players. A venue's managers add and remove their runners; Amabile admin can too.
// venue.staff = [{ phone, name, role: "manager" | "runner", addedAt, by }]; index "sx/<number>" = [venueIds].
import { K, getJSON, clean, phoneE164, phoneKey, maskPhone, hashKey, sign, verify, sendCode } from "./_outside.mjs";

const idxKey = (ph) => "sx/" + phoneKey(ph);
const ROLES = ["manager", "runner"];
export const staffView = (m) => ({ phone: m.phone, masked: maskPhone(m.phone), name: m.name, role: m.role, addedAt: m.addedAt });
export const memberOf = (venue, phone) => (venue && venue.staff || []).find((m) => m.phone === phone) || null;

async function index(s, phone, venueId, on) {
  const cur = (await getJSON(s, idxKey(phone))) || [];
  const next = on ? [...new Set([...cur, venueId])] : cur.filter((x) => x !== venueId);
  if (next.length) await s.setJSON(idxKey(phone), next); else await s.delete(idxKey(phone)).catch(() => {});
}

// Add someone, or change their name or role. Returns the venue.
export async function addStaff(s, venueId, { phone, name, role }, by) {
  const v = await getJSON(s, K.venue(clean(venueId, 20)));
  if (!v) return { ok: false, error: "not_found" };
  const ph = phoneE164(phone); if (!ph) return { ok: false, error: "phone" };
  const nm = clean(name, 30); if (!nm) return { ok: false, error: "name" };
  const rl = ROLES.includes(role) ? role : "manager";
  v.staff = v.staff || [];
  const m = memberOf(v, ph);
  if (m) Object.assign(m, { name: nm, role: rl });
  else v.staff.push({ phone: ph, name: nm, role: rl, addedAt: Date.now(), by: clean(by, 40) });
  v.updatedAt = Date.now();
  await s.setJSON(K.venue(v.id), v);
  await index(s, ph, v.id, true);
  return { ok: true, venue: v, member: staffView(memberOf(v, ph)) };
}

export async function removeStaff(s, venueId, phone, { keepAManager = true } = {}) {
  const v = await getJSON(s, K.venue(clean(venueId, 20)));
  if (!v) return { ok: false, error: "not_found" };
  const ph = phoneE164(phone) || phone;
  const m = memberOf(v, ph); if (!m) return { ok: false, error: "not_staff" };
  if (keepAManager && m.role === "manager" && (v.staff || []).filter((x) => x.role === "manager").length < 2) return { ok: false, error: "last_manager" };
  v.staff = v.staff.filter((x) => x.phone !== ph);
  v.updatedAt = Date.now();
  await s.setJSON(K.venue(v.id), v);
  await index(s, ph, v.id, false);
  return { ok: true, venue: v };
}

// The venue's contact becomes its first manager when it goes live (or when the contact is set later).
export async function ensureManager(s, v) {
  const ph = phoneE164(v.contact && v.contact.phone);
  if (!ph || memberOf(v, ph)) return v;
  const r = await addStaff(s, v.id, { phone: ph, name: (v.contact && v.contact.name) || "Manager", role: "manager" }, "contact");
  return r.ok ? r.venue : v;
}

// ---------- signing in to the board ----------
async function staffVenues(s, ph) {
  const ids = (await getJSON(s, idxKey(ph))) || [];
  const out = [];
  for (const id of ids) {
    const v = await getJSON(s, K.venue(id));
    const m = memberOf(v, ph);
    if (v && v.active && m) out.push({ v, m });
  }
  return out;
}

export async function boardStart(s, phone) {
  const ph = phoneE164(phone); if (!ph) return { ok: false, error: "phone" };
  const list = await staffVenues(s, ph);
  if (!list.length) return { ok: false, error: "not_staff" };
  const prev = await getJSON(s, K.otp(ph));
  const recent = (prev && prev.sends || []).filter((t) => Date.now() - t < 10 * 60 * 1000);
  if (recent.length >= 3) return { ok: false, error: "slow_down" };
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await s.setJSON(K.otp(ph), { h: hashKey(code + ph), exp: Date.now() + 10 * 60 * 1000, tries: 0, sends: [...recent, Date.now()] });
  const r = await sendCode(ph, code).catch(() => ({ ok: false }));
  const dev = process.env.OUTSIDE_DEV === "1";
  if (!r.ok && !dev) return { ok: false, error: "send_failed" };
  return { ok: true, ...(dev ? { devCode: code } : {}) };
}

// The bar phone stays signed in for a year. Removing the person from the venue signs it out at once.
export const boardToken = (phone, venueId) => sign({ k: "b", p: phone, v: venueId, e: Date.now() + 365 * 24 * 3600 * 1000 });

export async function boardVerify(s, phone, code) {
  const ph = phoneE164(phone); if (!ph) return { ok: false, error: "phone" };
  const o = await getJSON(s, K.otp(ph));
  if (!o || Date.now() > o.exp) return { ok: false, error: "expired" };
  if (o.tries >= 5) return { ok: false, error: "too_many" };
  if (hashKey(String(code || "").trim() + ph) !== o.h) { o.tries++; await s.setJSON(K.otp(ph), o); return { ok: false, error: "wrong_code" }; }
  await s.delete(K.otp(ph));
  const list = await staffVenues(s, ph);
  if (!list.length) return { ok: false, error: "not_staff" };
  return { ok: true, venues: list.map(({ v, m }) => ({ id: v.id, name: v.name, area: v.area || "", role: m.role, you: m.name, token: boardToken(ph, v.id) })) };
}

// Who is asking, from a board token. Membership is checked every time, so removing someone locks them out at once.
export async function staffFromToken(s, token, venueId) {
  const p = verify(token);
  if (!p || p.k !== "b" || (venueId && p.v !== venueId)) return null;
  const v = await getJSON(s, K.venue(p.v));
  if (!v || !v.active) return null;
  const m = memberOf(v, p.p);
  return m ? { venue: v, role: m.role, member: m } : null;
}
