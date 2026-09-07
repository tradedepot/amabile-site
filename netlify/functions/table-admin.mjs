// Private admin API for the Amabile Table. Gated by the TABLE_ADMIN_KEY env var, sent in
// the POST body (never in the query string) and checked on every action. Handles editions
// as DATA (create/update without a deploy) and bulk guest-list import from a spreadsheet
// paste, minting a collision-checked per-guest token for each row.
import { json, clean, isEmail, INVITE_SITE, sendEmail, shell, button } from "./_lib.mjs";
import {
  tstore, edId, kEdition, kGuests, kRsvp, kRsvpPrefix, loadEdition, loadGuests, loadRsvps,
  standings, mintToken, mintGid, fmtDate, deadlinePassed, kMetaPrefix, TABLE_FROM,
  whenLineOf, seatedByLineOf
} from "./_table.mjs";

function authed(d) {
  const key = process.env.TABLE_ADMIN_KEY || "";
  return key && typeof d.k === "string" && d.k === key;
}

// A real invitation email. The body is a per-edition field (third person, not the host's
// voice). No wine framing, plus-ones stated once and plainly, single preamble, no em dashes.
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
          <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto"><tr>
            <td style="padding:0 6px"><a href="${link}&amp;r=yes" style="display:inline-block;background:#7d1d1d;border:2px solid #7d1d1d;color:#fffdf7;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:15px;letter-spacing:.03em;padding:13px 30px;border-radius:999px">Yes, I will be there</a></td>
            <td style="padding:0 6px"><a href="${link}&amp;r=no" style="display:inline-block;background:transparent;border:2px solid #7d1d1d;color:#7d1d1d;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:15px;letter-spacing:.03em;padding:13px 30px;border-radius:999px">I cannot make it</a></td>
          </tr></table>
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
    return json({ ok: true, added, updated, total: Object.keys(base).length });
  }

  // ---- send invitees their personal invite link by email ------------------------------
  // Default: everyone with an email who has not been emailed yet. Pass gids:[...] to (re)send
  // to specific guests regardless. The outcome is stored on the guest so the list shows it.
  if (action === "send-invites") {
    const ed = edId(d.edition || "");
    const edition = await loadEdition(st, ed);
    if (!edition) return json({ ok: false, error: "no_edition" }, 404);
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) return json({ ok: false, error: "no_brevo_key" }, 500);
    const guests = await loadGuests(st, ed);
    const only = Array.isArray(d.gids) && d.gids.length ? new Set(d.gids.map((g) => clean(g, 40))) : null;
    const onlyNew = !only && d.onlyNew !== false;
    const site = INVITE_SITE || "https://wya.to";
    const hostName = clean(edition.hostName || edition.host, 80) || "Amabile di Rosa";
    const whenLine = whenLineOf(edition);
    const seatedByLine = seatedByLineOf(edition);
    const cardDefault = "An intimate lunch. One long table, twenty-eight guests, culture-led conversation over lunch and drinks, with Moses Oyeleye's exhibition, The City People, as the backdrop.";
    const cardParagraph = clean(edition.cardParagraph || edition.invite, 1600) || cardDefault;
    let sent = 0, skipped = 0; const failed = [];
    for (const [tok, g] of Object.entries(guests)) {
      if (only && !only.has(g.gid)) continue;
      // Guests without an email on file just keep their link (you copy and send it).
      if (!isEmail(g.email)) { skipped++; continue; }
      if (onlyNew && g.invitedAt) { skipped++; continue; }
      const link = `${site}/table/${ed}?g=${tok}`;
      const html = inviteEmailHtml({
        name: clean(g.name, 80).split(" ")[0], hostName, title: clean(edition.title, 80),
        whenLine, venue: clean(edition.venue, 120), seatedBy: seatedByLine, cardParagraph, link
      });
      const res = await sendEmail(apiKey, g.email, `You're invited to ${clean(edition.title, 60)}`, html, TABLE_FROM);
      g.inviteResult = { ok: !!(res && res.ok), status: (res && res.status) || null, text: (res && (res.text || res.error) || "").slice(0, 140), at: Date.now() };
      if (res && res.ok) { sent++; g.invitedAt = Date.now(); }
      else failed.push({ email: g.email, status: g.inviteResult.status, text: g.inviteResult.text });
    }
    await st.setJSON(kGuests(ed), guests);
    return json({ ok: true, sent, skipped, failed });
  }

  // ---- remove one guest (and their response, if any) ---------------------------------
  if (action === "remove-guest") {
    const ed = edId(d.edition || "");
    const gid = clean(d.gid, 40);
    if (!ed || !gid) return json({ ok: false, error: "bad_request" }, 400);
    const guests = await loadGuests(st, ed);
    const tok = Object.keys(guests).find((t) => guests[t].gid === gid);
    if (!tok) return json({ ok: false, error: "no_guest" }, 404);
    delete guests[tok];
    await st.setJSON(kGuests(ed), guests);
    await st.delete(kRsvp(ed, gid)).catch(() => {});
    return json({ ok: true, total: Object.keys(guests).length });
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

  // ---- the one list: every guest with invite state + reply state ---------------------
  if (action === "data") {
    const ed = edId(d.edition || "");
    const edition = await loadEdition(st, ed);
    if (!edition) return json({ ok: false, error: "no_edition" }, 404);
    const guests = await loadGuests(st, ed);
    const rsvps = await loadRsvps(st, ed);
    const cap = edition.cap || 0;
    const stand = standings(rsvps, cap);
    const site = INVITE_SITE || "https://wya.to";

    const byGid = {};
    stand.seated.forEach((r) => { byGid[r.gid] = { ...r, status: "seated", position: null }; });
    stand.wait.forEach((r, i) => { byGid[r.gid] = { ...r, status: "wait", position: i + 1 }; });
    stand.declined.forEach((r) => { byGid[r.gid] = { ...r, status: "declined", position: null }; });

    const order = { seated: 0, wait: 1, declined: 2, "no-reply": 3 };
    const list = Object.entries(guests).map(([tok, g]) => {
      const r = byGid[g.gid] || null;
      return {
        gid: g.gid, name: g.name, email: g.email || "", link: `${site}/table/${ed}?g=${tok}`,
        invitedAt: g.invitedAt || null, inviteResult: g.inviteResult || null,
        status: r ? r.status : "no-reply", position: r ? r.position : null,
        mobile: r ? r.mobile || "" : "", role: r ? r.role || "" : "", notes: r ? r.notes || "" : "",
        optin: r ? !!r.optin : false, emailStatus: r ? r.emailStatus || null : null,
        at: r ? r.updatedAt || r.at || 0 : 0
      };
    }).sort((a, b) => order[a.status] - order[b.status] || (a.position || 0) - (b.position || 0) || String(a.name).localeCompare(String(b.name)));

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
        invited: list.length,
        seated: stand.seatedCount, cap, waitlist: stand.waitCount,
        declined: stand.declined.length, noReply: list.filter((g) => g.status === "no-reply").length, full: stand.full
      },
      guests: list
    });
  }

  return json({ ok: false, error: "bad_action" }, 400);
};
