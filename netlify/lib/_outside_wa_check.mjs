// Andiamo: the WhatsApp check in the admin console. Reads the setup straight from Meta (Graph API) so we can see
// what's missing without opening Meta: the keys in Netlify, the number, the templates and the webhook.
// It can register the number (with its 6-digit PIN), subscribe the app to the WhatsApp account and send test messages.
// Never returns a secret: only whether each key is set.
// Env: WA_TOKEN, WA_PHONE_ID, WA_API_VERSION (default v23.0), WA_WABA_ID (optional; found from the token if not set).
import crypto from "node:crypto";
import { store, getJSON, clean, phoneE164, maskPhone, SITE, wa, waTemplate, sendCode } from "./_outside.mjs";

const V = () => process.env.WA_API_VERSION || "v23.0";
const errOf = (e) => ({ code: (e && e.code) || 0, sub: (e && e.error_subcode) || 0,
  message: String((e && (e.error_user_msg || (e.error_data && e.error_data.details) || e.message)) || "Unknown error").slice(0, 300) });

async function graph(path, { method = "GET", body } = {}) {
  try {
    const r = await fetch(`https://graph.facebook.com/${V()}/${path}`, {
      method, headers: { Authorization: "Bearer " + (process.env.WA_TOKEN || ""), ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) return { ok: false, status: r.status, error: errOf(j.error) };
    return { ok: true, data: j };
  } catch (e) { return { ok: false, status: 0, error: { code: 0, message: "Couldn't reach Meta." } }; }
}

const ENV = [
  ["WA_TOKEN", "The permanent token from the system user."],
  ["WA_PHONE_ID", "The number's Phone number ID, from WhatsApp, API Setup."],
  ["WA_VERIFY_TOKEN", "Any word or phrase. Type the same one into the webhook in Meta."],
  ["WA_APP_SECRET", "The app secret, from App settings, Basic. Proves messages really come from Meta."],
  ["OUTSIDE_TPL_CODE", "andiamo_code"],
  ["OUTSIDE_TPL_BOTTLE", "andiamo_bottle"],
  ["OUTSIDE_TPL_LANG", "en"]
];
const SHOW = new Set(["OUTSIDE_TPL_CODE", "OUTSIDE_TPL_BOTTLE", "OUTSIDE_TPL_LANG"]); // template names aren't secret

// The WhatsApp account (WABA) behind the number: WA_WABA_ID, or the account the token was given.
async function findWaba() {
  const pid = process.env.WA_PHONE_ID;
  const named = async (id) => { const r = await graph(`${id}?fields=id,name`); return r.ok ? { id: r.data.id, name: r.data.name || "" } : { error: r.error }; };
  if (process.env.WA_WABA_ID) return named(process.env.WA_WABA_ID);
  const d = await graph("debug_token?input_token=" + encodeURIComponent(process.env.WA_TOKEN || ""));
  if (!d.ok) return { error: d.error };
  const sc = (d.data.data && d.data.data.granular_scopes) || [];
  const ids = [...new Set(sc.filter((x) => /^whatsapp_business_(management|messaging)$/.test(x.scope)).flatMap((x) => x.target_ids || []))];
  if (!ids.length) return { error: { message: "The token has no WhatsApp account. In Business settings, give the system user the Andiamo WhatsApp account, then make a new token. Or set WA_WABA_ID." } };
  if (ids.length > 1 && pid) {
    for (const id of ids) {
      const r = await graph(`${id}/phone_numbers?fields=id&limit=50`);
      if (r.ok && (r.data.data || []).some((n) => n.id === pid)) return named(id);
    }
  }
  return named(ids[0]);
}

const FULL = "display_phone_number,verified_name,name_status,code_verification_status,quality_rating,platform_type,status,messaging_limit_tier,account_mode";
const BASIC = "display_phone_number,verified_name,name_status,code_verification_status,quality_rating,platform_type";

export async function waStatus(s) {
  const out = {
    env: ENV.map(([key, hint]) => ({ key, hint, set: !!process.env[key], ...(SHOW.has(key) ? { value: process.env[key] || "" } : {}) })),
    dev: process.env.OUTSIDE_DEV === "1",
    hookUrl: SITE.replace(/\/outside$/, "") + "/api/outside-wa",
    lastHook: await getJSON(s, "wa/hook"),
    want: { code: process.env.OUTSIDE_TPL_CODE || "", bottle: process.env.OUTSIDE_TPL_BOTTLE || "", lang: process.env.OUTSIDE_TPL_LANG || "en" }
  };
  if (!process.env.WA_TOKEN) { out.token = { ok: false, error: { message: "WA_TOKEN isn't set in Netlify." } }; return out; }
  const me = await graph("me?fields=id,name");
  out.token = me.ok ? { ok: true, name: me.data.name || "" } : { ok: false, error: me.error };
  if (!me.ok) return out;
  const pid = process.env.WA_PHONE_ID;
  const [num, waba] = await Promise.all([
    pid ? graph(`${pid}?fields=${FULL}`).then((r) => (!r.ok && r.error.code === 100 ? graph(`${pid}?fields=${BASIC}`) : r)) : null,
    findWaba()
  ]);
  if (num) out.number = num.ok ? { id: pid, ...num.data } : { error: num.error };
  out.waba = waba.id ? waba : { error: waba.error };
  if (waba.id) {
    const [t, a] = await Promise.all([
      graph(`${waba.id}/message_templates?fields=name,status,category,language,rejected_reason&limit=200`),
      graph(`${waba.id}/subscribed_apps`)
    ]);
    out.templates = t.ok ? (t.data.data || []).map((x) => ({ name: x.name, status: x.status, category: x.category, language: x.language, reason: x.rejected_reason && x.rejected_reason !== "NONE" ? x.rejected_reason : "" })) : { error: t.error };
    out.apps = a.ok ? (a.data.data || []).map((x) => { const w = x.whatsapp_business_api_data || x; return { id: w.id, name: w.name || "" }; }) : { error: a.error };
  }
  return out;
}

// Puts the number on the Cloud API. The PIN becomes the number's two-step verification PIN, so keep it.
export async function waRegister(pin) {
  pin = String(pin || "").trim();
  if (!/^\d{6}$/.test(pin)) return { ok: false, error: "pin" };
  if (!process.env.WA_PHONE_ID) return { ok: false, error: "no_phone_id" };
  const r = await graph(`${process.env.WA_PHONE_ID}/register`, { method: "POST", body: { messaging_product: "whatsapp", pin } });
  return r.ok ? { ok: true } : { ok: false, error: "meta", meta: r.error };
}

// Lets Meta send this app the messages and delivery updates for the WhatsApp account.
export async function waSubscribe() {
  const w = await findWaba();
  if (!w.id) return { ok: false, error: "meta", meta: w.error };
  const r = await graph(`${w.id}/subscribed_apps`, { method: "POST" });
  return r.ok ? { ok: true } : { ok: false, error: "meta", meta: r.error };
}

// ---------- test messages ----------
const testKey = (id) => "wat/" + crypto.createHash("sha256").update(String(id)).digest("hex").slice(0, 32);
const RANK = { accepted: 0, sent: 1, delivered: 2, read: 3, failed: 9 };

export async function waTest(s, kind, phone) {
  const to = phoneE164(phone);
  if (!to) return { ok: false, error: "phone" };
  if (!process.env.WA_TOKEN || !process.env.WA_PHONE_ID) return { ok: false, error: "no_whatsapp" };
  let r;
  if (kind === "code") {
    if (!process.env.OUTSIDE_TPL_CODE) return { ok: false, error: "no_template" };
    r = await sendCode(to, String(100000 + crypto.randomInt(900000)));
  } else {
    const tpl = process.env.OUTSIDE_TPL_BOTTLE;
    if (!tpl) return { ok: false, error: "no_template" };
    r = await wa(to, waTemplate(tpl, ["Test", "“A test from the admin console.”"], "test", SITE + "/img/wa-header.jpg"));
  }
  if (!r.ok || !r.id) return { ok: false, error: "meta", meta: r.error || { message: "Meta didn't accept it." } };
  await s.setJSON(testKey(r.id), { kind, to: maskPhone(to), at: Date.now(), status: "accepted" });
  return { ok: true, id: r.id, to: maskPhone(to) };
}
export const waTestStatus = (s, id) => getJSON(s, testKey(clean(id, 300)));

// Called by the webhook for every delivery from Meta: when it last heard from Meta, and how test messages got on.
export async function noteHook(value) {
  try {
    const s = store();
    const kind = (value.messages || []).length ? "message" : (value.statuses || []).length ? "status" : "other";
    await s.setJSON("wa/hook", { at: Date.now(), kind });
    for (const st of value.statuses || []) {
      if (!st.id || !(st.status in RANK)) continue;
      const k = testKey(st.id), t = await getJSON(s, k);
      if (!t || RANK[st.status] <= (RANK[t.status] || 0)) continue;
      t.status = st.status; t.statusAt = Date.now();
      if (st.status === "failed") t.error = (st.errors || []).map((e) => (e.error_data && e.error_data.details) || e.title || e.message).filter(Boolean).join("; ").slice(0, 300);
      await s.setJSON(k, t);
    }
  } catch (e) { console.warn("noteHook", String(e).slice(0, 200)); }
}
