// Andiamo: paying venues automatically through Paystack Transfers.
// A served ticket writes a ledger line (what the venue is owed). With OUTSIDE_AUTO_PAYOUTS=1 and a verified payout
// account on the venue, that line is sent to the venue's bank straight away. Paystack confirms by webhook
// (transfer.success / transfer.failed / transfer.reversed), which marks the line paid or failed.
// Env: PAYSTACK_SECRET_KEY, OUTSIDE_AUTO_PAYOUTS ("1" to switch on), OUTSIDE_PAYOUT_CAP (largest single transfer, ₦; default 300000).
import { store, K, getJSON, clean } from "./_outside.mjs";

const PS = "https://api.paystack.co";
const headers = () => ({ authorization: "Bearer " + (process.env.PAYSTACK_SECRET_KEY || ""), "content-type": "application/json" });
export const autoPayoutsOn = () => process.env.OUTSIDE_AUTO_PAYOUTS === "1";
const cap = () => Number(process.env.OUTSIDE_PAYOUT_CAP) || 300000;
const REF_PREFIX = "andiamo-po-";
const refKey = (ref) => "po/" + ref; // transfer reference -> ledger key

async function ps(path, { method = "GET", body } = {}) {
  try {
    const r = await fetch(PS + path, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok && d.status !== false, status: r.status, data: d.data, message: d.message || "" };
  } catch (e) { return { ok: false, status: 0, data: null, message: "network" }; }
}

// ---------- the venue's account ----------
export async function listBanks(s) {
  const cached = await getJSON(s, "cache/banks");
  if (cached && Date.now() - cached.at < 24 * 3600e3 && cached.banks.length) return cached.banks;
  const r = await ps("/bank?country=nigeria&currency=NGN&perPage=200");
  if (!r.ok || !Array.isArray(r.data)) return cached ? cached.banks : [];
  const seen = new Set();
  const banks = r.data.filter((b) => b.active !== false && b.code && !seen.has(b.code) && seen.add(b.code))
    .map((b) => ({ name: b.name, code: String(b.code) })).sort((a, b) => a.name.localeCompare(b.name));
  await s.setJSON("cache/banks", { at: Date.now(), banks });
  return banks;
}

// Ask the bank whose account this is, before anything is saved.
export async function resolveAccount(s, { bankCode, account }) {
  const acct = String(account || "").replace(/\D/g, ""), code = clean(bankCode, 12);
  if (acct.length !== 10) return { ok: false, error: "account_number" };
  if (!code) return { ok: false, error: "bank" };
  const res = await ps(`/bank/resolve?account_number=${acct}&bank_code=${encodeURIComponent(code)}`);
  if (!res.ok || !res.data || !res.data.account_name) return { ok: false, error: "resolve", message: res.message };
  const banks = await listBanks(s);
  return { ok: true, name: res.data.account_name, account: acct, bankCode: code, bank: (banks.find((b) => b.code === code) || {}).name || "" };
}

// Check the account with the bank, then register it with Paystack as a transfer recipient.
export async function setPayoutAccount(s, venueId, { bankCode, account }) {
  const v = await getJSON(s, K.venue(venueId));
  if (!v) return { ok: false, error: "not_found" };
  const acct = String(account || "").replace(/\D/g, "");
  const code = clean(bankCode, 12);
  if (acct.length !== 10) return { ok: false, error: "account_number" };
  if (!code) return { ok: false, error: "bank" };
  const res = await ps(`/bank/resolve?account_number=${acct}&bank_code=${encodeURIComponent(code)}`);
  if (!res.ok || !res.data || !res.data.account_name) return { ok: false, error: "resolve", message: res.message };
  const name = res.data.account_name;
  const rc = await ps("/transferrecipient", { method: "POST", body: { type: "nuban", name, account_number: acct, bank_code: code, currency: "NGN", metadata: { app: "outside", venueId } } });
  if (!rc.ok || !rc.data || !rc.data.recipient_code) return { ok: false, error: "recipient", message: rc.message };
  const banks = await listBanks(s);
  v.payout = { bank: (banks.find((b) => b.code === code) || {}).name || (rc.data.details && rc.data.details.bank_name) || "", bankCode: code, account: acct, name, recipient: rc.data.recipient_code, verifiedAt: Date.now() };
  v.updatedAt = Date.now();
  await s.setJSON(K.venue(v.id), v);
  return { ok: true, payout: v.payout };
}

// ---------- sending money ----------
// Send one ledger line to the venue's bank. Safe to call twice: a line already paid or on its way is left alone.
export async function sendPayout(s, key, { venue, reason } = {}) {
  const line = await getJSON(s, key);
  if (!line) return { ok: false, error: "not_found" };
  if (line.paid) return { ok: true, skipped: "paid" };
  if (line.transfer && ["pending", "success"].includes(line.transfer.status)) return { ok: true, skipped: line.transfer.status };
  const v = venue || (await getJSON(s, K.venue(line.venueId)));
  const rcp = v && v.payout && v.payout.recipient;
  if (!rcp) return { ok: false, error: "no_account" };
  if (!(line.amount > 0)) return { ok: false, error: "amount" };
  if (line.amount > cap()) { line.transfer = { status: "held", error: "Over the single-transfer limit. Check and pay by hand.", at: Date.now() }; await s.setJSON(key, line); return { ok: false, error: "over_cap" }; }
  const attempt = ((line.transfer && line.transfer.attempt) || 0) + 1;
  const ref = (REF_PREFIX + String(line.ticketId || key.split("-").pop()).toLowerCase().replace(/[^a-z0-9]/g, "") + "-" + attempt).slice(0, 50);
  line.transfer = { ref, attempt, status: "pending", at: Date.now() };
  await s.setJSON(key, line);
  await s.set(refKey(ref), key);
  const r = await ps("/transfer", { method: "POST", body: { source: "balance", amount: Math.round(line.amount * 100), recipient: rcp, reference: ref,
    reason: (reason || `Andiamo ${line.settle === "fee" ? "drop handover" : "bottle"}${v.name ? " at " + v.name : ""}`).slice(0, 100) } });
  const st = r.data && r.data.status;
  if (r.ok && (st === "success" || st === "pending" || st === "received")) {
    line.transfer = { ...line.transfer, status: st === "success" ? "success" : "pending", code: r.data.transfer_code || "" };
    if (st === "success") Object.assign(line, { paid: true, paidAt: Date.now(), paidRef: r.data.transfer_code || ref, paidVia: "paystack" });
  } else if (st === "otp") {
    line.transfer = { ...line.transfer, status: "failed", error: "Paystack wants an OTP for each transfer. Turn off OTP for transfers in Paystack settings." };
  } else {
    line.transfer = { ...line.transfer, status: "failed", error: r.message || "Transfer failed" };
  }
  await s.setJSON(key, line);
  if (line.paid) await markTicketPaid(s, line);
  return { ok: line.transfer.status !== "failed", status: line.transfer.status, error: line.transfer.error };
}

// Called right after a ticket is served. Never throws: serving must not fail because a transfer did.
export async function autoPayout(s, key, venue) {
  if (!autoPayoutsOn()) return null;
  try { return await sendPayout(s, key, { venue }); } catch (e) { console.warn("autoPayout", String(e)); return null; }
}

async function markTicketPaid(s, line) {
  if (!line.ticketId) return;
  const t = await getJSON(s, K.ticket(line.venueId, line.ticketId));
  if (!t) return;
  t.paidOut = { amount: line.amount, at: line.paidAt || Date.now() };
  await s.setJSON(K.ticket(line.venueId, line.ticketId), t);
}

// ---------- Paystack's answer ----------
export function isOurTransfer(evt) {
  return !!(evt && /^transfer\./.test(evt.event || "") && evt.data && String(evt.data.reference || "").startsWith(REF_PREFIX));
}
export async function handleTransferEvent(evt) {
  const s = store();
  const ref = String(evt.data.reference || "");
  const key = String((await s.get(refKey(ref)).catch(() => "")) || "");
  if (!key) return;
  // Ask Paystack directly rather than trusting the payload.
  const vr = await ps("/transfer/verify/" + encodeURIComponent(ref));
  const status = (vr.ok && vr.data && vr.data.status) || "";
  const line = await getJSON(s, key);
  if (!line || !line.transfer || line.transfer.ref !== ref) return;
  if (status === "success") {
    Object.assign(line, { paid: true, paidAt: Date.now(), paidRef: (vr.data && vr.data.transfer_code) || ref, paidVia: "paystack" });
    line.transfer = { ...line.transfer, status: "success" };
    await s.setJSON(key, line);
    await markTicketPaid(s, line);
  } else if (status === "failed" || status === "reversed") {
    line.transfer = { ...line.transfer, status, error: status === "reversed" ? "The bank sent it back." : (vr.data && vr.data.reason) || "Transfer failed" };
    await s.setJSON(key, line);
  }
}

export async function paystackBalance() {
  const r = await ps("/balance");
  if (!r.ok || !Array.isArray(r.data)) return null;
  const ngn = r.data.find((b) => b.currency === "NGN");
  return ngn ? Math.round(ngn.balance / 100) : null;
}
