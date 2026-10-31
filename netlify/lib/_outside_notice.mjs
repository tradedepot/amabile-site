// Andiamo!: bottle notices that WhatsApp didn't deliver.
// Meta can refuse a marketing template for a person who has had many from other businesses (error 131049,
// "healthy ecosystem engagement"). When a bottle notice fails:
//   1. the sender is told at once and gets a link to send the bottle themselves (the self-send link), and
//   2. we try the notice again a day later, and daily after that, up to four times, while the bottle waits.
// A delivered or read report, or the bottle being kept or claimed, ends the retries.
import { K, getJSON, listKeys, SITE } from "./_outside.mjs";
import { saveBottle } from "./_outside_flow.mjs";

const NK = { msg: (id) => "wb/" + id, retry: (bid) => "nr/" + bid, retryPrefix: "nr/" };
const DAY = 864e5;
export const MAX_RETRIES = 4;
// Worth trying again later: Meta's per-person marketing limit, and Meta's own temporary trouble.
const RETRY = new Set([131049, 131000, 131016, 130429, 131056]);

// Meta's report on a message we sent. Returns what it did, for the logs and tests.
export async function noticeStatus(s, st) {
  const m = st && st.id ? await getJSON(s, NK.msg(st.id)) : null;
  if (!m) return null;
  const b = await getJSON(s, K.bottle(m.b));
  if (!b) return null;
  if (st.status === "delivered" || st.status === "read") {
    if (b.notice && b.notice.delivered) return "seen";
    b.notice = { ...(b.notice || {}), ok: true, delivered: Date.now() };
    await s.delete(NK.retry(b.id)).catch(() => {});
    await saveBottle(s, b);
    return "delivered";
  }
  if (st.status !== "failed") return null;
  const code = Number(((st.errors || [])[0] || {}).code) || 0;
  b.notice = { ...(b.notice || {}), ok: false, failedAt: Date.now(), code };
  const { ensureShareLink } = await import("./_outside_gift.mjs");
  const url = await ensureShareLink(s, b);
  b.noticeFallback = true;
  const again = RETRY.has(code) && (b.noticeRetries || 0) < MAX_RETRIES && b.status === "waiting";
  if (again) await s.setJSON(NK.retry(b.id), { b: b.id, next: Date.now() + DAY });
  else await s.delete(NK.retry(b.id)).catch(() => {});
  const tell = !b.senderTold && b.status === "waiting";
  if (tell) b.senderTold = Date.now();
  await saveBottle(s, b);
  if (tell) {
    const { pushTo } = await import("./_outside_push.mjs");
    await pushTo(b.from, { title: "We couldn't reach " + (b.toFirst || "them") + " on WhatsApp",
      body: "Send them your bottle yourself. Tap to share the link.", url: SITE + "/?sent=" + b.id, tag: "nf-" + b.id }).catch(() => null);
  }
  return again ? "retry" : "fallback";
}

// Hourly: send the notices that are due again.
export async function retryNotices(s, now = Date.now()) {
  const { sendBottleNotice } = await import("./_outside.mjs");
  let sent = 0;
  for (const key of await listKeys(s, NK.retryPrefix)) {
    const r = await getJSON(s, key);
    if (!r || r.next > now) continue;
    await s.delete(key).catch(() => {});
    const b = await getJSON(s, K.bottle(r.b));
    if (!b || b.status !== "waiting" || !b.to || (b.notice && b.notice.delivered)) continue;
    b.noticeRetries = (b.noticeRetries || 0) + 1;
    const res = await sendBottleNotice(b).catch((e) => ({ ok: false, err: String(e) }));
    b.notice = { ...(b.notice || {}), retriedAt: Date.now(), accepted: !!(res && res.ok) };
    await saveBottle(s, b);
    sent++;
  }
  return { sent };
}
