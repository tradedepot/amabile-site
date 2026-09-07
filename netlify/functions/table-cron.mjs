// Scheduled: two-days-before reminder to seated guests. Runs daily; for each edition whose
// date is two days out and hasn't been reminded yet, emails the currently-seated guests and
// marks the edition so it never double-sends. Best-effort — a failure never blocks anything.
import { sendEmail, isEmail, clean, INVITE_SITE } from "./_lib.mjs";
import { tstore, kEdition, kMetaPrefix, loadGuests, loadRsvps, standings, fmtDate, whenLineOf, seatedByLineOf, TABLE_FROM, tableShell, tableRow, tableBtn } from "./_table.mjs";
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const config = { schedule: "0 9 * * *" }; // 09:00 UTC daily

function ymd(d) { return d.toISOString().slice(0, 10); }

export default async () => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return new Response("no-brevo");
  const st = tstore();

  const target = new Date(Date.now() + 2 * 86400000);
  const targetYmd = ymd(target);

  let sent = 0;
  try {
    const { blobs } = await st.list({ prefix: kMetaPrefix() });
    for (const b of blobs) {
      if (b.key.split(":").length !== 2) continue;
      const ed = await st.get(b.key, { type: "json" }).catch(() => null);
      if (!ed || !ed.edition || !ed.dateISO) continue;
      if (ed.dateISO !== targetYmd) continue;
      if (ed.remindedAt) continue;

      const rsvps = await loadRsvps(st, ed.edition);
      const stand = standings(rsvps, ed.cap || 0);
      const guests = await loadGuests(st, ed.edition);
      const tokByGid = {};
      Object.entries(guests).forEach(([tok, g]) => { tokByGid[g.gid] = tok; });
      const details = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 20px">${tableRow("When", esc(whenLineOf(ed)))}${tableRow("Seated by", esc(seatedByLineOf(ed)))}${tableRow("Where", esc(clean(ed.venue, 160)))}</table>`;

      for (const r of stand.seated) {
        if (!isEmail(r.email)) continue;
        const link = `${INVITE_SITE}/table/${ed.edition}?g=${encodeURIComponent(tokByGid[r.gid] || "")}`;
        const html = tableShell(`
          <h2 style="margin:0 0 10px;font-size:22px;font-weight:normal">Two days to go.</h2>
          <p style="margin:0 0 6px">A reminder that ${esc(clean(ed.title, 80))} is this ${esc(fmtDate(ed.dateISO))}. Your seat is saved.</p>
          ${details}
          <p style="margin:0 0 18px">If anything has changed and you can no longer make it, please let us know so we can offer the seat on.</p>
          <p style="margin:0">${tableBtn(link, "View or change your reply")}</p>
        `);
        await sendEmail(apiKey, r.email, `Two days to go, ${clean(ed.title, 60)}`, html, TABLE_FROM);
        sent++;
      }
      await st.setJSON(kEdition(ed.edition), { ...ed, remindedAt: Date.now() });
    }
  } catch (_) {}
  return new Response("reminders-sent:" + sent);
};
