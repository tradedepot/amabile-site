// Discount codes at checkout. Made in admin; typed by the sender on the send screen.
// A code takes a percentage or a naira amount off what the sender pays. The bottle keeps its full value:
// the venue is still paid its menu price and the bottle still works at its level.
// A code can be limited to certain numbers, to a number of uses, and to a date.
import { clean, getJSON, listKeys, fetchAll, phoneE164, phoneKey } from "./_outside.mjs";

const KEY = (c) => "code/" + c;
const USE = (c, ph) => "codeuse/" + c + "/" + phoneKey(ph);
export const normCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);

export async function listCodes(s) {
  const keys = await listKeys(s, "code/");
  return (await fetchAll(s, keys)).filter(Boolean).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function saveCode(s, d, by) {
  const code = normCode(d.code);
  if (code.length < 4) return { ok: false, error: "code" };
  const kind = d.kind === "naira" ? "naira" : "pct";
  const value = Math.round(Number(d.value) || 0);
  if (kind === "pct" && (value < 1 || value > 100)) return { ok: false, error: "value" };
  if (kind === "naira" && value < 100) return { ok: false, error: "value" };
  const phones = [];
  for (const raw of String(d.phones || "").split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean)) {
    const p = phoneE164(raw); if (!p) return { ok: false, error: "phone", bad: raw }; phones.push(p);
  }
  const prev = await getJSON(s, KEY(code));
  if (prev && d.isNew) return { ok: false, error: "exists" };
  const expires = d.expires ? Date.parse(d.expires + "T23:59:59+01:00") : 0;
  const c = { ...(prev || { createdAt: Date.now(), createdBy: by, uses: 0 }), code, kind, value,
    phones: [...new Set(phones)], maxUses: Math.max(0, Math.round(Number(d.maxUses) || 0)), perPerson: Math.max(0, Math.round(Number(d.perPerson) || 0)),
    expires: Number.isFinite(expires) ? expires : 0, note: clean(d.note, 80), active: d.active !== false, updatedAt: Date.now() };
  await s.setJSON(KEY(code), c);
  return { ok: true, code: c };
}

export async function setCodeActive(s, code, active) {
  const c = await getJSON(s, KEY(normCode(code)));
  if (!c) return { ok: false, error: "not_found" };
  c.active = !!active; c.updatedAt = Date.now();
  await s.setJSON(KEY(c.code), c);
  return { ok: true, code: c };
}

// Can this player use this code now? Returns the code, or the reason it can't be used.
export async function checkCode(s, raw, me) {
  const code = normCode(raw);
  if (!code) return { ok: false, error: "code_unknown" };
  const c = await getJSON(s, KEY(code));
  if (!c || !c.active) return { ok: false, error: "code_unknown" };
  if (c.expires && Date.now() > c.expires) return { ok: false, error: "code_expired" };
  if (c.phones && c.phones.length && !c.phones.includes(me)) return { ok: false, error: "code_unknown" };
  if (c.maxUses && (c.uses || 0) >= c.maxUses) return { ok: false, error: "code_used" };
  if (c.perPerson) {
    const u = await getJSON(s, USE(code, me));
    if (u && u.n >= c.perPerson) return { ok: false, error: "code_used" };
  }
  return { ok: true, code: c };
}

export const discountOn = (c, price) => Math.min(price, c.kind === "naira" ? c.value : Math.round(price * c.value / 100));

// Counted once the bottle is paid for, so a checkout that's dropped doesn't use it up.
export async function useCode(s, code, me) {
  const c = await getJSON(s, KEY(code));
  if (c) { c.uses = (c.uses || 0) + 1; c.lastUsedAt = Date.now(); await s.setJSON(KEY(code), c); }
  const u = (await getJSON(s, USE(code, me))) || { n: 0 };
  await s.setJSON(USE(code, me), { n: u.n + 1, at: Date.now() });
}

export const publicCode = (c) => ({ code: c.code, kind: c.kind, value: c.value });
