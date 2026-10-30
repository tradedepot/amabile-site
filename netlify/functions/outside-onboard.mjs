// Andiamo! onboard app API. Owns /api/outside-onboard.
// Onboarders (our people, and the distributors and wholesalers we supply) add stores standing in them.
// They sign in with a WhatsApp code; only numbers on the onboarder list get one.
// Every store waits for approval in admin, unless the onboarder is set to go live without it.
// A bank account whose name doesn't match the store always waits, whoever sent it.
//   POST {action:"start", phone}            send a sign-in code (onboarders only)
//   POST {action:"verify", phone, code}     → session
//   POST {at, action:"me"}                  who am I, my stores, the wines and areas
//   POST {at, action:"banks"}
//   POST {at, action:"resolve", bankCode, account}   the name on the account, from the bank
//   POST {at, action:"submit", store}       add a store, or send a returned one back
import { store, json, clean, getJSON, phoneE164, sign, verify, hashKey, sendCode, WINES, K, rid, listKeys, fetchAll } from "../lib/_outside.mjs";
import { getOnboarder } from "../lib/_outside_team.mjs";
import { listBanks, resolveAccount } from "../lib/_outside_payout.mjs";
import { nameMatches, approveSubmission, AREAS, KINDS } from "../lib/_outside_onboard.mjs";

export const config = { path: "/api/outside-onboard" };
const bad = (error, status = 400, extra = {}) => json({ ok: false, error, ...extra }, status);
const OTP = (ph) => "onbotp/" + String(ph).replace(/\D/g, "");

export default async (req) => {
  if (req.method !== "POST") return bad("method", 405);
  let d; try { d = await req.json(); } catch { return bad("bad_json"); }
  const s = store();
  const a = d.action;

  if (a === "start") {
    const ph = phoneE164(d.phone); if (!ph) return bad("phone");
    if (!(await getOnboarder(s, ph))) return bad("not_onboarder", 403);
    const prev = await getJSON(s, OTP(ph));
    const recent = (prev && prev.sends || []).filter((t) => Date.now() - t < 10 * 60 * 1000);
    if (recent.length >= 3) return bad("slow_down", 429);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await s.setJSON(OTP(ph), { h: hashKey(code + ph), exp: Date.now() + 10 * 60 * 1000, tries: 0, sends: [...recent, Date.now()] });
    const r = await sendCode(ph, code).catch(() => ({ ok: false }));
    // The code is only ever shown on screen on a test setup with no WhatsApp. Never once WhatsApp is connected.
    const testOnly = process.env.OUTSIDE_DEV === "1" && !process.env.WA_TOKEN;
    if (!r.ok && !testOnly) return bad("send_failed", 502);
    return json({ ok: true, ...(testOnly ? { devCode: code } : {}) });
  }
  if (a === "verify") {
    const ph = phoneE164(d.phone); if (!ph) return bad("phone");
    const o = await getJSON(s, OTP(ph));
    if (!o || Date.now() > o.exp) return bad("expired");
    if (o.tries >= 5) return bad("too_many", 429);
    if (hashKey(String(d.code || "").trim() + ph) !== o.h) { o.tries++; await s.setJSON(OTP(ph), o); return bad("wrong_code"); }
    await s.delete(OTP(ph));
    if (!(await getOnboarder(s, ph))) return bad("not_onboarder", 403);
    return json({ ok: true, token: sign({ k: "onb", p: ph, e: Date.now() + 30 * 864e5 }) });
  }

  // Signed in, and still on the list: taking someone off cuts them off at once.
  const t = verify(d.at);
  if (!t || t.k !== "onb") return bad("signin", 401);
  const me = await getOnboarder(s, t.p);
  if (!me) return bad("not_onboarder", 401);

  // Our own people (company Amabile) also see venues that asked to join on andiamo.ng/venue, so they need one app, not two.
  const internal = String(me.company || "").trim().toLowerCase() === "amabile";
  if (a === "me") {
    const all = (await fetchAll(s, await listKeys(s, K.requestPrefix))).filter(Boolean);
    const asked = internal ? all.filter((r) => r.source !== "onboard" && ["requested", "visit_booked"].includes(r.stage) && !r.submissionId)
      .sort((x, y) => y.createdAt - x.createdAt).map((r) => ({ id: r.id, name: r.name, area: r.area, contactName: r.contactName, phone: r.phone, stocksAmabile: r.stocksAmabile, createdAt: r.createdAt })) : [];
    const mine = all.filter((r) => r.source === "onboard" && r.submittedBy === me.phone)
      .sort((x, y) => y.createdAt - x.createdAt).map((r) => ({ id: r.id, name: r.name, area: r.area, stage: r.stage, returnNote: r.returnNote || "", createdAt: r.createdAt, store: r.store }));
    return json({ ok: true, me: { name: me.name, company: me.company, auto: !!me.auto }, stores: mine, asked, wines: WINES.map((w) => ({ id: w.id, name: w.name, label: w.label })), areas: AREAS, kinds: KINDS });
  }
  if (a === "banks") return json({ ok: true, banks: await listBanks(s) });
  if (a === "resolve") { const r = await resolveAccount(s, { bankCode: d.bankCode, account: d.account }); return json(r.ok ? { ...r, matches: nameMatches(d.storeName, r.name) } : r, r.ok ? 200 : 400); }

  if (a === "submit") {
    const x = d.store || {};
    const name = clean(x.name, 60); if (name.length < 2) return bad("name");
    const area = clean(x.area, 40); if (!AREAS.includes(area)) return bad("area");
    const kind = KINDS.some(([k]) => k === x.kind) ? x.kind : null; if (!kind) return bad("kind");
    const lat = x.lat === "" || x.lat == null ? NaN : Number(x.lat), lng = x.lng === "" || x.lng == null ? NaN : Number(x.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return bad("location");
    const prices = {};
    for (const w of WINES) { const p = Math.round(Number(String((x.prices || {})[w.id] || "").replace(/[^\d.]/g, ""))); if (p > 0) prices[w.id] = p; }
    if (!Object.keys(prices).length) return bad("prices");
    const managerName = clean(x.managerName, 30); if (!managerName) return bad("manager_name");
    const managerPhone = phoneE164(x.managerPhone); if (!managerPhone) return bad("manager_phone");
    const barPhones = [];
    for (const raw of String(x.barPhones || "").split(/[,;\n]+/).map((y) => y.trim()).filter(Boolean)) { const p = phoneE164(raw); if (!p) return bad("bar_phone", 400, { bad: raw }); if (p !== managerPhone) barPhones.push(p); }
    // The account name comes from the bank, never from what was typed.
    let payout = null;
    if (x.account || x.bankCode) {
      const r = await resolveAccount(s, { bankCode: x.bankCode, account: x.account });
      if (!r.ok) return bad(r.error === "account_number" ? "account_number" : r.error === "bank" ? "bank" : "resolve");
      payout = { bankCode: r.bankCode, bank: r.bank, account: r.account, accountName: r.name, matches: nameMatches(name, r.name) };
    }
    const menuPhoto = typeof x.menuPhoto === "string" && /^data:image\/jpeg;base64,/.test(x.menuPhoto) && x.menuPhoto.length < 900000 ? x.menuPhoto : null;
    const storeData = { name, area, kind, lat, lng, acc: Math.round(Number(x.acc) || 0), prices, taxIncluded: !!x.taxIncluded, managerName, managerPhone, barPhones, payout, hasPhoto: !!menuPhoto };

    // Adding a venue that asked to join: the new store is tied to its request, which leaves the Asked to join list.
    const from = internal && x.fromRequest ? await getJSON(s, K.request(clean(x.fromRequest, 20))) : null;
    if (x.fromRequest && (!from || from.source === "onboard" || from.submissionId && !x.id)) return bad("request_taken", 409);
    let r = x.id ? await getJSON(s, K.request(clean(x.id, 20))) : null;
    if (r && (r.submittedBy !== me.phone || r.stage !== "sent_back")) return bad("not_editable", 409);
    if (!r) {
      // The same store twice from the same person: once is enough.
      const mine = (await fetchAll(s, await listKeys(s, K.requestPrefix))).filter((q) => q && q.source === "onboard" && q.submittedBy === me.phone && q.stage === "submitted");
      if (mine.some((q) => q.name.toLowerCase() === name.toLowerCase())) return bad("duplicate", 409);
      r = { id: rid(8), createdAt: Date.now(), history: [] };
    }
    Object.assign(r, {
      source: "onboard", stage: "submitted", updatedAt: Date.now(), submittedBy: me.phone, onboarderName: me.name, company: me.company || "",
      name, area, kind, phone: managerPhone, contactName: managerName, stocksAmabile: "yes", store: storeData, returnNote: ""
    });
    r.history = [...(r.history || []), { at: Date.now(), stage: "submitted", by: me.name + " (" + (me.company || "onboarder") + ")" }].slice(-30);
    if (from) r.fromRequest = from.id;
    await s.setJSON(K.request(r.id), r);
    if (from && from.submissionId !== r.id) { from.submissionId = r.id; from.history = [...(from.history || []), { at: Date.now(), stage: from.stage, by: me.name + " added the store" }].slice(-30); await s.setJSON(K.request(from.id), from); }
    if (menuPhoto) await s.set("menuimg/" + r.id, menuPhoto);
    // Straight to live only for onboarders set to skip approval, and never with a bank name that doesn't match.
    if (me.auto && (!payout || payout.matches)) {
      const ok = await approveSubmission(s, r.id, { by: "auto (" + me.name + ")" });
      if (ok.ok) return json({ ok: true, id: r.id, stage: "live", venueId: ok.venueId });
    }
    return json({ ok: true, id: r.id, stage: "submitted", held: me.auto && payout && !payout.matches ? "name_mismatch" : "" });
  }
  return bad("unknown_action", 404);
};
