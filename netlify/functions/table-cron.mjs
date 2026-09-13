// Scheduled, every 10 minutes. Two jobs, both once-only per edition, both best-effort:
//   1. Two days before: the reminder to seated guests, sent in the 10:00 Lagos hour,
//      stamped remindedAt.
//   2. The day of: a short "see you at 3" note to seated guests, sent on the first tick at
//      or after DAYOF_FROM_HOUR Lagos time, stamped dayOfSentAt.
// Seated means RSVP yes and within the cap. A failure never blocks anything.
import { sendEmail, isEmail, clean, INVITE_SITE } from "./_lib.mjs";
import { tstore, kEdition, kMetaPrefix, loadGuests, loadRsvps, standings, fmtDate, whenCellOf, TABLE_FROM, tableShell, tableRow, tableBtn } from "./_table.mjs";
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const config = { schedule: "*/10 * * * *" };

const DAYOF_FROM_HOUR = Number(process.env.DAYOF_FROM_HOUR || 7); // Lagos hour, earliest the day-of note goes

function ymd(d) { return d.toISOString().slice(0, 10); }
// Lagos is UTC+1 all year, so shift and read the UTC fields.
function lagosNow() { return new Date(Date.now() + 3600000); }

// "3:00 PM" -> "3", "3:15pm" -> "3:15", anything else -> the label as typed.
function shortTime(label) {
  const m = String(label || "").trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)?$/);
  if (!m) return String(label || "").trim();
  return m[2] && m[2] !== "00" ? `${m[1]}:${m[2]}` : m[1];
}

function dayOfHtml({ first, hostName, title, venue, at }) {
  const p = (t, extra = "") => `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#4a3a2c;text-align:left;${extra}">${t}</p>`;
  return tableShell(`
    <div style="text-align:center">
      <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:.34em;text-transform:uppercase;color:#b08d57;margin-bottom:16px">THE AMABILE TABLE</div>
      <h1 style="margin:0 0 6px;font-size:30px;line-height:1.15;color:#2a1207;font-weight:normal">${esc(title)}</h1>
      ${hostName ? `<div style="font-size:15px;font-style:italic;color:#b08d57">Hosted by ${esc(hostName)}</div>` : ""}
      <div style="width:46px;height:2px;background:#c9a15a;margin:22px auto 24px"></div>
    </div>
    ${p(`Ciao ${esc(first) || "there"},`)}
    ${p(`Looking forward to this afternoon, good conversations and a lovely room of people.${venue ? " " + esc(venue) + "." : ""}`)}
    <p style="margin:0 0 16px;font-size:22px;line-height:1.4;color:#2a1207;text-align:left">See you${at ? " at " + esc(at) : ""}.</p>
    <p style="margin:0;font-size:16px;line-height:1.7;color:#4a3a2c;text-align:left">${esc(String(hostName || "").split(" ")[0])}</p>
  `);
}

export default async () => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return new Response("no-brevo");
  const st = tstore();

  const now = lagosNow();
  const todayYmd = ymd(now);
  const lagosHour = now.getUTCHours();
  const twoDaysYmd = ymd(new Date(now.getTime() + 2 * 86400000));

  let reminded = 0, dayOf = 0;
  try {
    const { blobs } = await st.list({ prefix: kMetaPrefix() });
    for (const b of blobs) {
      if (b.key.split(":").length !== 2) continue;
      const ed = await st.get(b.key, { type: "json" }).catch(() => null);
      if (!ed || !ed.edition || !ed.dateISO) continue;

      const wantReminder = ed.dateISO === twoDaysYmd && !ed.remindedAt && lagosHour === 10;
      const wantDayOf = ed.dateISO === todayYmd && !ed.dayOfSentAt && lagosHour >= DAYOF_FROM_HOUR;
      if (!wantReminder && !wantDayOf) continue;

      const rsvps = await loadRsvps(st, ed.edition);
      const stand = standings(rsvps, ed.cap || 0);
      const guests = await loadGuests(st, ed.edition);
      const tokByGid = {}, nameByGid = {};
      Object.entries(guests).forEach(([tok, g]) => { tokByGid[g.gid] = tok; nameByGid[g.gid] = g.name || ""; });

      if (wantReminder) {
        const details = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 20px">${tableRow("When", whenCellOf(ed))}${tableRow("Where", esc(clean(ed.venue, 160)))}</table>`;
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
          reminded++;
        }
        ed.remindedAt = Date.now();
      }

      if (wantDayOf) {
        const hostName = clean(ed.hostName || ed.host, 80);
        const at = shortTime(ed.timeLabel);
        const subject = at ? `See you at ${at}` : "See you this afternoon";
        for (const r of stand.seated) {
          if (!isEmail(r.email)) continue;
          const first = clean(r.name || nameByGid[r.gid], 80).split(" ")[0];
          const html = dayOfHtml({ first, hostName, title: clean(ed.title, 80) || ed.edition, venue: clean(ed.venue, 160), at });
          await sendEmail(apiKey, r.email, subject, html, TABLE_FROM);
          dayOf++;
        }
        ed.dayOfSentAt = Date.now();
      }

      await st.setJSON(kEdition(ed.edition), ed);
    }
  } catch (_) {}
  return new Response(`reminders-sent:${reminded} dayof-sent:${dayOf}`);
};
