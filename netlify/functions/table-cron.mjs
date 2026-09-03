// Scheduled: two-days-before reminder to seated guests. Runs daily; for each edition whose
// date is two days out and hasn't been reminded yet, emails the currently-seated guests and
// marks the edition so it never double-sends. Best-effort — a failure never blocks anything.
import { sendEmail, shell, button, isEmail, clean, INVITE_SITE } from "./_lib.mjs";
import { tstore, kEdition, kMetaPrefix, loadGuests, loadRsvps, standings, fmtDate } from "./_table.mjs";

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
      const whenBits = [fmtDate(ed.dateISO), ed.timeLabel || "", ed.venue || ""].filter(Boolean).join(" · ");

      for (const r of stand.seated) {
        if (!isEmail(r.email)) continue;
        const link = `${INVITE_SITE}/table/${ed.edition}?g=${encodeURIComponent(tokByGid[r.gid] || "")}`;
        const html = shell(`
          <h2 style="margin:0 0 8px;font-size:22px;color:#2a1207">See you in two days 🍷</h2>
          <p style="margin:0 0 8px;color:#6a4634"><b>${clean(ed.title, 80)}</b></p>
          <p style="margin:0 0 14px;color:#6a4634">${clean(whenBits, 200)}${ed.address ? " · " + clean(ed.address, 160) : ""}</p>
          <p style="margin:0 0 14px;color:#6a4634">Your seat is saved. If anything has changed and you can no longer make it, please let us know so we can offer the seat on — one tap:</p>
          <p style="margin:0">${button(link, "View or change your RSVP →")}</p>
        `);
        await sendEmail(apiKey, r.email, `Two days to go — ${clean(ed.title, 60)}`, html);
        sent++;
      }
      await st.setJSON(kEdition(ed.edition), { ...ed, remindedAt: Date.now() });
    }
  } catch (_) {}
  return new Response("reminders-sent:" + sent);
};
