// Private admin API for the Amabile Table. Gated by the TABLE_ADMIN_KEY env var, sent in
// the POST body (never in the query string) and checked on every action. Handles editions
// as DATA (create/update without a deploy) and bulk guest-list import from a spreadsheet
// paste, minting a collision-checked per-guest token for each row.
import { json, clean, isEmail, INVITE_SITE, sendEmail, shell, button } from "./_lib.mjs";
import {
  tstore, edId, kEdition, kGuests, kRsvpPrefix, loadEdition, loadGuests, loadRsvps,
  standings, mintToken, mintGid, fmtDate, deadlinePassed, kMetaPrefix, TABLE_FROM,
  whenLineOf, seatedByLineOf
} from "./_table.mjs";

function authed(d) {
  const key = process.env.TABLE_ADMIN_KEY || "";
  return key && typeof d.k === "string" && d.k === key;
}

// A real invitation email: written in the host's own voice (first person), the body is a
// per-edition field so each host writes their own note and backdrop. No wine framing, plus-
// ones stated once and plainly, single preamble, no em dashes.
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inviteEmailHtml({ name, hostName, title, whenLine, seatedBy, venue, cardParagraph, link }) {
  const row = (label, val) => val
    ? `<tr>
        <td style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#b08d57;padding:13px 18px 0 0;vertical-align:top;white-space:nowrap">${label}</td>
        <td style="font-size:16px;color:#2a1207;padding:9px 0 0;line-height:1.3">${esc(val)}</td>
      </tr>` : "";
  const paras = String(cardParagraph || "").split(/\n{2,}|\n/).filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#4a3a2c;text-align:left">${esc(p)}</p>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body style="margin:0;background:#efe4cf;font-family:Georgia,'Times New Roman',serif;color:#2a1207">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efe4cf;padding:34px 14px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fffdf7;border:1px solid #e6d3a8;border-radius:10px;overflow:hidden">
        <tr><td style="height:6px;background:#7d1d1d"></td></tr>
        <tr><td style="padding:40px 46px 30px;text-align:center">
          <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:.34em;text-transform:uppercase;color:#b08d57;margin-bottom:16px">THE AMABILE TABLE</div>
          <h1 style="margin:0 0 6px;font-size:30px;line-height:1.15;color:#2a1207;font-weight:normal">${esc(title)}</h1>
          <div style="font-size:15px;font-style:italic;color:#b08d57">Hosted by ${esc(hostName)}</div>
          <div style="width:46px;height:2px;background:#c9a15a;margin:22px auto 24px"></div>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#4a3a2c;text-align:left">Ciao ${esc(name) || "there"},</p>
          ${paras}
          <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:8px auto 28px;text-align:left">
            ${row("When", whenLine)}
            ${row("Seated by", seatedBy)}
            ${row("Where", venue)}
          </table>
          <a href="${link}" style="display:inline-block;background:#7d1d1d;color:#fffdf7;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:15px;letter-spacing:.03em;padding:15px 42px;border-radius:999px">Reply to your invitation</a>
          <p style="margin:26px 0 0;font-size:13px;color:#9a8576;font-family:Arial,sans-serif;text-align:left">This invitation is personal to you. Seating is planned per person, so we are not able to accommodate plus-ones.</p>
        </td></tr>
        <tr><td style="padding:20px 46px 26px;border-top:1px solid #efe4cf;text-align:center">
          <div style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:15px;color:#8a6d4a">Amabile di Rosa</div>
          <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#b09a8c;margin-top:6px">Lagos, Nigeria</div>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

export default async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  let d;
  try { d = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }
  if (!authed(d)) return json({ ok: false, error: "unauthorized" }, 401);

  const st = tstore();
  const action = clean(d.action, 40);

  // ---- auth check only (admin page login) --------------------------------------------
  if (action === "auth") return json({ ok: true });

  // ---- diagnostics: send a real test email and return Brevo's actual response ---------
  if (action === "test-email") {
    const apiKey = process.env.BREVO_API_KEY;
    const to = clean(d.to, 160);
    const diag = {
      hasKey: !!apiKey,
      sender: TABLE_FROM.email,
      notifyEmailSet: !!process.env.TABLE_NOTIFY_EMAIL
    };
    if (!apiKey) return json({ ok: false, error: "no_brevo_key", ...diag });
    if (!isEmail(to)) return json({ ok: false, error: "bad_to", ...diag });
    try {
      const r = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: TABLE_FROM, to: [{ email: to }],
          subject: "Amabile Table test email",
          htmlContent: "<p>This is a test from the Amabile Table admin. If you received it, transactional email is working.</p>"
        })
      });
      const body = (await r.text().catch(() => "")).slice(0, 500);
      return json({ ok: r.status >= 200 && r.status < 300, status: r.status, body, ...diag });
    } catch (e) {
      return json({ ok: false, error: "fetch_failed", detail: String(e).slice(0, 200), ...diag });
    }
  }

  // ---- list editions -----------------------------------------------------------------
  if (action === "editions") {
    const out = [];
    try {
      const { blobs } = await st.list({ prefix: kMetaPrefix() });
      for (const b of blobs) {
        if (b.key.split(":").length !== 2) continue; // only table:<ed> meta blobs
        const m = await st.get(b.key, { type: "json" }).catch(() => null);
        if (m && m.edition) {
          const guests = await loadGuests(st, m.edition);
          out.push({
            edition: m.edition, title: m.title || m.edition, dateISO: m.dateISO || "",
            dateLabel: m.dateISO ? fmtDate(m.dateISO) : (m.dateLabel || ""), venue: m.venue || "",
            cap: m.cap || 0, deadlineISO: m.deadlineISO || "", closed: deadlinePassed(m),
            invited: Object.keys(guests).length
          });
        }
      }
    } catch (_) {}
    out.sort((a, b) => String(b.dateISO).localeCompare(String(a.dateISO)));
    return json({ ok: true, editions: out });
  }

  // ---- create / update an edition ----------------------------------------------------
  if (action === "save-edition") {
    const ed = edId(d.edition || "");
    if (!ed) return json({ ok: false, error: "bad_edition" }, 400);
    const prior = await loadEdition(st, ed);
    const meta = {
      edition: ed,
      title: clean(d.title, 120) || ("Table No " + String(ed).replace(/^no-?/i, "")),
      hostName: clean(d.hostName || d.host, 80),          // who is hosting this edition (shown "Hosted by")
      cardParagraph: clean(d.cardParagraph || d.invite, 1600), // the host's invitation body (their voice)
      dateISO: clean(d.dateISO, 10),           // YYYY-MM-DD
      timeLabel: clean(d.timeLabel, 60),       // arrival / start, e.g. "3:00 PM"
      seatedByLabel: clean(d.seatedByLabel, 60), // hard seating cutoff, e.g. "3:30 PM"
      venue: clean(d.venue, 120),
      address: clean(d.address, 200),
      cap: Math.max(1, parseInt(d.cap, 10) || 0),
      deadlineISO: clean(d.deadlineISO, 30),   // ISO datetime; RSVPs close at/after this
      deadlineLabel: clean(d.deadlineLabel, 80),
      createdAt: (prior && prior.createdAt) || Date.now(),
      updatedAt: Date.now()
    };
    await st.setJSON(kEdition(ed), meta);
    return json({ ok: true, edition: meta });
  }

  // ---- bulk import guests (spreadsheet paste) ----------------------------------------
  if (action === "import-guests") {
    const ed = edId(d.edition || "");
    if (!ed) return json({ ok: false, error: "bad_edition" }, 400);
    if (!(await loadEdition(st, ed))) return json({ ok: false, error: "no_edition" }, 404);
    const rows = Array.isArray(d.rows) ? d.rows : [];
    const guests = await loadGuests(st, ed);
    const replace = !!d.replace;
    const base = replace ? {} : guests;

    // Index existing by email to avoid duplicate invites when appending.
    const byEmail = {};
    Object.entries(base).forEach(([tok, g]) => { if (g.email) byEmail[g.email.toLowerCase()] = tok; });

    let added = 0, updated = 0;
    for (const row of rows) {
      const name = clean(row.name, 80);
      const email = clean(row.email, 160).toLowerCase();
      if (!name) continue;
      const existingTok = email && byEmail[email];
      if (existingTok) { base[existingTok].name = name; updated++; continue; }
      // Mint a collision-checked token.
      let tok = mintToken();
      while (base[tok]) tok = mintToken();
      base[tok] = { gid: mintGid(), name, email };
      if (email) byEmail[email] = tok;
      added++;
    }
    await st.setJSON(kGuests(ed), base);
    const site = INVITE_SITE || "https://wya.to";
    const links = Object.entries(base).map(([tok, g]) => ({
      name: g.name, email: g.email || "", link: `${site}/table/${ed}?g=${tok}`
    }));
    return json({ ok: true, added, updated, total: Object.keys(base).length, links });
  }

  // ---- send each invitee their personal invite link by email -------------------------
  if (action === "send-invites") {
    const ed = edId(d.edition || "");
    const edition = await loadEdition(st, ed);
    if (!edition) return json({ ok: false, error: "no_edition" }, 404);
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) return json({ ok: false, error: "no_brevo_key" }, 500);
    const guests = await loadGuests(st, ed);
    const onlyNew = d.onlyNew !== false; // default: skip anyone already invited (no double-emailing)
    const site = INVITE_SITE || "https://wya.to";
    const hostName = clean(edition.hostName || edition.host, 80) || "Amabile di Rosa";
    const whenLine = whenLineOf(edition);
    const seatedByLine = seatedByLineOf(edition);
    const cardDefault = "An intimate lunch. One long table, culture-led conversation over lunch and drinks.";
    const cardParagraph = clean(edition.cardParagraph || edition.invite, 1600) || cardDefault;
    let sent = 0, skipped = 0; const failed = [];
    for (const [tok, g] of Object.entries(guests)) {
      // Guests without an email on file just keep their link (you send it); we only email those we can.
      if (!isEmail(g.email)) { skipped++; continue; }
      if (onlyNew && g.invitedAt) { skipped++; continue; }
      const link = `${site}/table/${ed}?g=${tok}`;
      const html = inviteEmailHtml({
        name: clean(g.name, 80).split(" ")[0], hostName, title: clean(edition.title, 80),
        whenLine, venue: clean(edition.venue, 120), seatedBy: seatedByLine, cardParagraph, link
      });
      const res = await sendEmail(apiKey, g.email, `You're invited to ${clean(edition.title, 60)}`, html, TABLE_FROM);
      if (res && res.ok) { sent++; g.invitedAt = Date.now(); }
      else failed.push({ email: g.email, status: (res && res.status) || null, text: (res && (res.text || res.error) || "").slice(0, 140) });
    }
    await st.setJSON(kGuests(ed), guests);
    return json({ ok: true, sent, skipped, failed });
  }

  // ---- clear the guest list + responses (test-data reset) ----------------------------
  if (action === "clear-guests") {
    const ed = edId(d.edition || "");
    if (!ed) return json({ ok: false, error: "bad_edition" }, 400);
    await st.setJSON(kGuests(ed), {});
    let removed = 0;
    try {
      const { blobs } = await st.list({ prefix: kRsvpPrefix(ed) });
      for (const b of blobs) { await st.delete(b.key).catch(() => {}); removed++; }
    } catch (_) {}
    return json({ ok: true, removed });
  }

  // ---- guest links (for a mail-merge) ------------------------------------------------
  if (action === "guest-links") {
    const ed = edId(d.edition || "");
    const guests = await loadGuests(st, ed);
    const site = INVITE_SITE || "https://wya.to";
    const links = Object.entries(guests).map(([tok, g]) => ({
      name: g.name, email: g.email || "", link: `${site}/table/${ed}?g=${tok}`
    }));
    return json({ ok: true, links });
  }

  // ---- full standings for the admin view / CSV ---------------------------------------
  if (action === "data") {
    const ed = edId(d.edition || "");
    const edition = await loadEdition(st, ed);
    if (!edition) return json({ ok: false, error: "no_edition" }, 404);
    const guests = await loadGuests(st, ed);
    const rsvps = await loadRsvps(st, ed);
    const cap = edition.cap || 0;
    const stand = standings(rsvps, cap);
    const shape = (r, extra) => ({
      name: r.name, email: r.email || "", mobile: r.mobile || "", role: r.role || "",
      notes: r.notes || "", optin: !!r.optin, at: r.updatedAt || r.at || 0,
      emailStatus: r.emailStatus || null, ...extra
    });
    const seated = stand.seated.map((r) => shape(r, { status: "seated" }));
    const wait = stand.wait.map((r, i) => shape(r, { status: "wait", position: i + 1 }));
    const declined = stand.declined.map((r) => shape(r, { status: "declined" }));

    const respondedGids = new Set(rsvps.map((r) => r.gid));
    const noReply = Object.values(guests)
      .filter((g) => !respondedGids.has(g.gid))
      .map((g) => ({ name: g.name, email: g.email || "", status: "no-reply" }));

    return json({
      ok: true,
      edition: {
        edition: ed, title: edition.title, hostName: edition.hostName || edition.host || "", cardParagraph: edition.cardParagraph || edition.invite || "", dateISO: edition.dateISO || "",
        dateLabel: edition.dateISO ? fmtDate(edition.dateISO) : (edition.dateLabel || ""),
        timeLabel: edition.timeLabel || "", seatedByLabel: edition.seatedByLabel || "",
        venue: edition.venue || "", address: edition.address || "",
        cap, deadlineISO: edition.deadlineISO || "", closed: deadlinePassed(edition)
      },
      summary: {
        invited: Object.keys(guests).length,
        seated: stand.seatedCount, cap, waitlist: stand.waitCount,
        declined: declined.length, noReply: noReply.length, full: stand.full
      },
      seated, wait, declined, noReply
    });
  }

  return json({ ok: false, error: "bad_action" }, 400);
};
