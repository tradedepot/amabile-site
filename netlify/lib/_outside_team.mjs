// Who can use the Andiamo admin, and what each person can see and do.
// The team signs in with Google (tradedepot.co accounts only) and must be on the team list.
// The owner can also sign in with ANDIAMO_ADMIN_KEY, the root password, if Google sign-in ever fails.
// Onboarders (our people and the distributors and wholesalers we supply) sign in with WhatsApp in the onboard app.
import { getJSON, listKeys, fetchAll, sign, verify, clean, phoneE164, phoneKey, tsKey } from "./_outside.mjs";

const DOMAIN = "tradedepot.co";
// Not a secret: the browser needs it to show the Google button. Overridable in Netlify.
export const googleClientId = () => process.env.OUTSIDE_GOOGLE_CLIENT_ID || "549766711724-7ms0u0tarjj9h6d2vcsmo2rm2nflp48v.apps.googleusercontent.com";
const ownerEmails = () => String(process.env.OUTSIDE_OWNER_EMAILS || "cizukanne@tradedepot.co").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);

export const ROLES = ["owner", "ops", "field", "growth", "finance"];
export const ROLE_NAMES = { owner: "Owner", ops: "Ops", field: "Field", growth: "Growth", finance: "Finance" };

// What each role may do. Anything not listed is the owner's alone.
const ALL = ROLES;
const RUN = ["owner", "ops"];
const P = {
  venues: ALL, banks: ALL, glow: ALL, drops: ALL, unmet: ["owner", "ops", "field", "growth"],
  "drop-save": ["owner", "ops", "growth", "field"], "drop-cancel": ["owner", "ops", "growth", "field"],
  requests: ["owner", "ops", "field"], "request-update": ["owner", "ops", "field"],
  bottles: ["owner", "ops", "field", "finance"], bottle: ["owner", "ops", "field", "finance"],
  ledger: ["owner", "ops", "finance"], balance: ["owner", "ops", "finance"], "ledger-paid": ["owner", "ops", "finance"], "payout-send": ["owner", "ops", "finance"],
  "request-list": RUN, "venue-save": RUN, "venue-keys": RUN, "venue-link": RUN, "venue-supply": RUN, "venue-purchase": RUN, "venue-live": RUN, "venue-off": RUN,
  "staff-add": RUN, "staff-remove": RUN, "payout-account": RUN, "payout-resolve": RUN, "outlet-search": RUN, "outlet-get": RUN,
  tents: RUN, "bands-save": RUN, codes: RUN, "code-save": RUN, "code-active": RUN,
  "submission-approve": RUN, "submission-return": RUN, "submission-photo": ["owner", "ops", "field"],
  me: ALL
};
export const can = (role, action) => (P[action] || ["owner"]).includes(role);
// What the console may show this person: "*" for the owner, else the actions their role allows.
export const allowedFor = (role) => (role === "owner" ? "*" : Object.keys(P).filter((k) => P[k].includes(role)));
// Actions that only read. Everything else goes in the activity log.
const READS = new Set(["venues", "banks", "glow", "drops", "unmet", "requests", "bottles", "bottle", "ledger", "balance", "codes", "outlet-search", "outlet-get", "payout-resolve", "me", "team", "activity", "wa-status", "wa-test-status", "wallet-status", "submission-photo"]);
export const isWrite = (a) => !READS.has(a);

// ---------- the team list ----------
const TK = (email) => "team/" + email;
const OK_ = (ph) => "onb/" + phoneKey(ph);
const normEmail = (e) => String(e || "").trim().toLowerCase();

// The first list, written once when the store has none. After that the Team page is the only source.
export async function seedTeam(s) {
  if ((await listKeys(s, "team/")).length) return;
  // OUTSIDE_TEAM_SEED in Netlify: {"team":[{email, role, name}], "onboarders":[{phone, name, company, auto}]}. Kept out of the code.
  let SEED; try { SEED = JSON.parse(process.env.OUTSIDE_TEAM_SEED || ""); } catch { SEED = null; }
  if (!SEED) return;
  SEED.team = SEED.team || []; SEED.onboarders = SEED.onboarders || [];
  for (const m of SEED.team) await s.setJSON(TK(normEmail(m.email)), { email: normEmail(m.email), role: m.role, name: m.name || "", active: true, addedAt: Date.now(), addedBy: "seed" });
  if (!(await listKeys(s, "onb/")).length) {
    for (const o of SEED.onboarders) { const ph = phoneE164(o.phone); if (ph) await s.setJSON(OK_(ph), { phone: ph, name: o.name, company: o.company || "", auto: !!o.auto, active: true, addedAt: Date.now(), addedBy: "seed" }); }
  }
}

export async function listTeam(s) {
  const team = (await fetchAll(s, await listKeys(s, "team/"))).filter(Boolean);
  const onboarders = (await fetchAll(s, await listKeys(s, "onb/"))).filter(Boolean);
  // The owner set in Netlify is always on the list, whatever the store says.
  for (const e of ownerEmails()) if (!team.some((m) => m.email === e)) team.unshift({ email: e, role: "owner", name: "", active: true, fixed: true });
  team.forEach((m) => { if (ownerEmails().includes(m.email)) { m.role = "owner"; m.fixed = true; } });
  return { team: team.sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.email.localeCompare(b.email)), onboarders: onboarders.sort((a, b) => String(a.name).localeCompare(String(b.name))) };
}

export async function saveMember(s, d, by) {
  const email = normEmail(d.email);
  if (!/^[a-z0-9._%+-]+@tradedepot\.co$/.test(email)) return { ok: false, error: "email" };
  if (!ROLES.includes(d.role)) return { ok: false, error: "role" };
  if (ownerEmails().includes(email)) return { ok: false, error: "fixed_owner" };
  const prev = await getJSON(s, TK(email));
  const m = { ...(prev || { addedAt: Date.now(), addedBy: by }), email, role: d.role, name: clean(d.name, 40), active: d.active !== false, updatedAt: Date.now() };
  await s.setJSON(TK(email), m);
  return { ok: true, member: m };
}
export async function removeMember(s, email) {
  email = normEmail(email);
  if (ownerEmails().includes(email)) return { ok: false, error: "fixed_owner" };
  await s.delete(TK(email));
  return { ok: true };
}
export async function saveOnboarder(s, d, by) {
  const phone = phoneE164(d.phone);
  if (!phone) return { ok: false, error: "phone" };
  const name = clean(d.name, 40); if (!name) return { ok: false, error: "name" };
  const prev = await getJSON(s, OK_(phone));
  const o = { ...(prev || { addedAt: Date.now(), addedBy: by }), phone, name, company: clean(d.company, 60), auto: !!d.auto, active: d.active !== false, updatedAt: Date.now() };
  await s.setJSON(OK_(phone), o);
  return { ok: true, onboarder: o };
}
export async function removeOnboarder(s, phone) { const ph = phoneE164(phone); if (!ph) return { ok: false, error: "phone" }; await s.delete(OK_(ph)); return { ok: true }; }
export async function getOnboarder(s, phone) { const o = await getJSON(s, OK_(phone)); return o && o.active ? o : null; }

// ---------- signing in ----------
// Google's own check of the sign-in token. We then hold it to our client, a verified tradedepot.co address, and the team list.
export async function googleSignIn(s, credential) {
  if (!credential) return { ok: false, error: "google" };
  let t;
  try { const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential)); if (!r.ok) return { ok: false, error: "google" }; t = await r.json(); }
  catch { return { ok: false, error: "google" }; }
  const email = normEmail(t.email);
  if (t.aud !== googleClientId() || !["accounts.google.com", "https://accounts.google.com"].includes(t.iss)) return { ok: false, error: "google" };
  if (Number(t.exp) * 1000 < Date.now()) return { ok: false, error: "google" };
  if (String(t.email_verified) !== "true" || t.hd !== DOMAIN || !email.endsWith("@" + DOMAIN)) return { ok: false, error: "not_tradedepot" };
  await seedTeam(s);
  const m = await memberFor(s, email);
  if (!m) return { ok: false, error: "not_on_team", email };
  if (!m.name && t.given_name) { m.name = t.given_name; if (!m.fixed) await s.setJSON(TK(email), m).catch(() => {}); }
  return { ok: true, token: sign({ k: "adm", m: email, e: Date.now() + 7 * 864e5 }), me: publicMe(m, t.picture) };
}
async function memberFor(s, email) {
  if (ownerEmails().includes(email)) { const m = (await getJSON(s, TK(email))) || {}; return { ...m, email, role: "owner", active: true, fixed: true }; }
  const m = await getJSON(s, TK(email));
  return m && m.active && ROLES.includes(m.role) ? m : null;
}
const publicMe = (m, picture) => ({ email: m.email, name: m.name || m.email.split("@")[0], role: m.role, roleName: ROLE_NAMES[m.role], can: allowedFor(m.role), ...(picture ? { picture } : {}) });

// Who is asking, checked on every call, so taking someone off the list cuts them off at once.
export async function whoFrom(s, d) {
  const key = process.env.ANDIAMO_ADMIN_KEY || "";
  if (key && typeof d.ak === "string" && d.ak === key) return { email: "break-glass", name: "Root password", role: "owner", roleName: "Owner", can: "*", breakGlass: true };
  const t = verify(d.at);
  if (!t || t.k !== "adm" || !t.m) return null;
  const m = await memberFor(s, t.m);
  return m ? publicMe(m) : null;
}

// ---------- activity ----------
export async function logActivity(s, who, action, d) {
  const target = clean(d.id || d.venueId || (d.venue && (d.venue.id || d.venue.name)) || (d.code && (d.code.code || d.code)) || (d.drop && (d.drop.id || d.drop.title)) || d.email || d.phone || "", 60);
  await s.setJSON("al/" + tsKey(), { at: Date.now(), by: who.email, name: who.name, role: who.role, action, target }).catch(() => {});
}
export async function listActivity(s, n = 200) {
  const keys = (await listKeys(s, "al/")).sort().slice(-n).reverse();
  return (await fetchAll(s, keys)).filter(Boolean);
}
