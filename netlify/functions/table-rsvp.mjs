// Record or change a guest's response to an Amabile Table edition.
// Token-gated (only invited guests), rate limited, and race-free: each guest writes only
// their own blob and seating is derived by listing (see _table.mjs). A guest can change
// their answer any time before the deadline with no email to anyone. Dropping out frees a
// seat and the top of the waitlist is promoted automatically (and emailed).
import { json, isEmail, clean, sendEmail, shell, button, FROM, INVITE_SITE } from "./_lib.mjs";
import { bqInsert } from "./_bq.mjs";
import {
  tstore, edId, tokenClean, clientIp, rateOk,
  kRsvp, loadEdition, loadGuests, guestByToken, loadRsvps, standings, statusOf,
  deadlinePassed, whenCellOf, TABLE_FROM, tableShell, tableRow, tableBtn
} from "./_table.mjs";

function seatedGids(stand) { return new Set(stand.seated.map((r) => r.gid)); }

export default async (req, context) => {
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  const st = tstore();

  if (!(await rateOk(st, "table-rsvp", clientIp(req, context), 15, 60000))) {
    return json({ ok: false, error: "rate" }, 429);
  }

  let d;
  try { d = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const ed = edId(d.edition || "");
  const token = tokenClean(d.token || "");
  if (!ed || !token) return json({ ok: false, error: "bad_request" }, 400);

  const edition = await loadEdition(st, ed);
  if (!edition) return json({ ok: false, error: "no_edition" }, 404);
  if (deadlinePassed(edition)) return json({ ok: false, error: "closed" }, 403);

  const guests = await loadGuests(st, ed);
  const guest = guestByToken(guests, token);
  if (!guest) return json({ ok: false, error: "not_invited" }, 403); // forwarded / unknown token

  const response = d.response === "no" ? "no" : d.response === "yes" ? "yes" : null;
  if (!response) return json({ ok: false, error: "bad_response" }, 400);

  const email = clean(d.email, 160);
  const mobile = clean(d.mobile, 40);
  const role = clean(d.role, 120);      // legacy field, no longer asked
  const notes = clean(d.notes, 400);    // dietary
  const optin = false;                  // no newsletter opt-in on the Table

  // The email we confirm to: the one on the invitation, unless the guest supplies one (only
  // asked when the invite has none, i.e. a link handed over by hand).
  const confirmEmail = email || guest.email || "";
  if (response === "yes" && !isEmail(confirmEmail)) return json({ ok: false, error: "bad_email" }, 400);

  const cap = edition.cap || 0;
  const before = standings(await loadRsvps(st, ed), cap);
  const beforeSeated = seatedGids(before);

  const existing = await st.get(kRsvp(ed, guest.gid), { type: "json" }).catch(() => null);
  const wasYes = existing && existing.response === "yes";
  // acceptedAt fixes queue position at the moment of accepting. Preserve it while staying
  // "yes"; a fresh no→yes goes to the back of the queue (fair).
  const acceptedAt = response === "yes"
    ? (wasYes && existing.acceptedAt ? existing.acceptedAt : Date.now())
    : (existing ? existing.acceptedAt || null : null);

  const rec = {
    gid: guest.gid,
    name: guest.name,
    response,
    email: confirmEmail || (existing && existing.email) || "",
    mobile: mobile || (existing && existing.mobile) || "",
    role: role || (existing && existing.role) || "",
    notes,
    optin,
    acceptedAt,
    firstAt: (existing && existing.firstAt) || Date.now(),
    updatedAt: Date.now(),
    at: Date.now(),
    attr: clean(d.attr, 200) || (existing && existing.attr) || ""
  };
  await st.setJSON(kRsvp(ed, guest.gid), rec);

  // Recompute after the write. Blobs list() is only eventually consistent, so the record we
  // just wrote can be momentarily absent from the listing — which would make the guest come
  // back as status "none" and SKIP their confirmation email. Fold our own record in explicitly
  // so the recompute always reflects it.
  let afterList = await loadRsvps(st, ed);
  afterList = afterList.filter((r) => r.gid !== guest.gid).concat([rec]);
  const after = standings(afterList, cap);
  const mine = statusOf(guest.gid, after);
  const afterSeated = seatedGids(after);

  const apiKey = process.env.BREVO_API_KEY;
  const notifyTo = process.env.TABLE_NOTIFY_EMAIL || "";
  const guestLink = `${INVITE_SITE}/table/${encodeURIComponent(ed)}?g=${encodeURIComponent(token)}`;
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const venueLine = clean(edition.venue, 160);
  const hostName = clean(edition.hostName || edition.host, 80) || "Amabile di Rosa";
  const details = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 20px">${tableRow("When", whenCellOf(edition))}${tableRow("Where", esc(venueLine))}</table>`;
  const plusOnes = `<p style="margin:18px 0 0;font-size:13px;color:#9a8576;font-family:Arial,sans-serif">This invitation is personal to you. Seating is planned per person, so we are not able to accommodate plus-ones.</p>`;

  // Promotion: guests who moved into the seated set as a result of this change (a drop-out
  // freed a seat). Email each once. Skip the actor themselves.
  if (apiKey && response === "no" && wasYes) {
    for (const r of after.seated) {
      if (r.gid === guest.gid) continue;
      if (!beforeSeated.has(r.gid) && afterSeated.has(r.gid) && r.notifiedStatus !== "seated" && isEmail(r.email)) {
        const html = tableShell(`
          <h2 style="margin:0 0 10px;font-size:22px;font-weight:normal">A seat has opened, and it is yours.</h2>
          <p style="margin:0 0 6px">A place at ${esc(clean(edition.title, 80))} has come free, so we have moved you from the waitlist to a confirmed seat.</p>
          ${details}
          <p style="margin:0 0 18px">Please confirm you can still join us.</p>
          <p style="margin:0">${tableBtn(guestLink, "Confirm your seat")}</p>
          ${plusOnes}
        `);
        await sendEmail(apiKey, r.email, `A seat has opened, ${clean(edition.title, 60)}`, html, TABLE_FROM);
        try { await st.setJSON(kRsvp(ed, r.gid), { ...r, notifiedStatus: "seated" }); } catch (_) {}
      }
    }
  }

  // Emails to the responding guest. emailResult is surfaced in the response + logged so a
  // non-delivery is diagnosable in one RSVP (e.g. an unverified sender returns a 400 here).
  let emailResult = apiKey ? { attempted: false } : { attempted: false, reason: "no_api_key" };
  if (apiKey) {
    if (response === "yes" && mine.status === "seated" && isEmail(rec.email)) {
      const html = tableShell(`
        <h2 style="margin:0 0 10px;font-size:22px;font-weight:normal">Your seat is confirmed.</h2>
        <p style="margin:0 0 6px">We will see you at ${esc(clean(edition.title, 80))}, hosted by ${esc(hostName)}.</p>
        ${details}
        <p style="margin:0 0 18px">Plans change, so you can update your reply any time.</p>
        <p style="margin:0">${tableBtn(guestLink, "View or change your reply")}</p>
        ${plusOnes}
      `);
      emailResult = { attempted: true, to: rec.email, sender: TABLE_FROM.email, ...(await sendEmail(apiKey, rec.email, `Your seat is confirmed, ${clean(edition.title, 60)}`, html, TABLE_FROM)) };
      try { await st.setJSON(kRsvp(ed, guest.gid), { ...rec, notifiedStatus: "seated" }); } catch (_) {}
    } else if (response === "yes" && mine.status === "wait" && isEmail(rec.email)) {
      const html = tableShell(`
        <h2 style="margin:0 0 10px;font-size:22px;font-weight:normal">You are on the waitlist, position ${mine.position}.</h2>
        <p style="margin:0 0 6px">${esc(clean(edition.title, 80))} is full for now, so we have saved you a place in line. If a seat opens we will email you. There is nothing you need to do.</p>
        ${details}
        <p style="margin:0">${tableBtn(guestLink, "View your status")}</p>
      `);
      emailResult = { attempted: true, to: rec.email, sender: TABLE_FROM.email, ...(await sendEmail(apiKey, rec.email, `Waitlisted, position ${mine.position}, ${clean(edition.title, 60)}`, html, TABLE_FROM)) };
      try { await st.setJSON(kRsvp(ed, guest.gid), { ...rec, notifiedStatus: "wait" }); } catch (_) {}
    }

    // Internal notification on every response.
    if (isEmail(notifyTo)) {
      const verb = response === "yes" ? (mine.status === "seated" ? "is in, seated" : "is in, waitlist position " + mine.position) : "cannot make it";
      const html = tableShell(`
        <h2 style="margin:0 0 8px;font-size:20px;font-weight:normal">${esc(clean(guest.name, 80))} ${verb}.</h2>
        <p style="margin:0 0 6px">${esc(clean(edition.title, 80))}</p>
        ${response === "yes" && rec.role ? `<p style="margin:0 0 4px">Does: ${esc(clean(rec.role, 120))}</p>` : ""}
        ${rec.notes ? `<p style="margin:0 0 4px">Notes: ${esc(clean(rec.notes, 400))}</p>` : ""}
        <p style="margin:8px 0 0">Now: ${after.seatedCount} of ${cap} seated, ${after.waitCount} waiting.</p>
      `);
      await sendEmail(apiKey, notifyTo, `Table RSVP: ${clean(guest.name, 60)} ${response === "yes" ? "in" : "out"}`, html, TABLE_FROM);
    }
  }

  // BigQuery mirror (best-effort).
  await bqInsert("table_rsvps", {
    edition: ed,
    gid: guest.gid,
    name: guest.name || null,
    response,
    status: mine.status,
    position: mine.position || null,
    role: rec.role || null,
    has_notes: !!rec.notes,
    optin,
    seated_count: after.seatedCount,
    cap,
    created_at: new Date(rec.updatedAt).toISOString()
  });

  // Persist the email outcome on the guest record so the admin Standings can show, in plain
  // language, whether each guest's confirmation actually sent — no devtools or logs needed.
  try {
    const cur = await st.get(kRsvp(ed, guest.gid), { type: "json" }).catch(() => null);
    if (cur) await st.setJSON(kRsvp(ed, guest.gid), { ...cur, emailStatus: emailResult });
  } catch (_) {}

  console.log("table-rsvp", JSON.stringify({ ed, gid: guest.gid, response, status: mine.status, to: rec.email, sender: TABLE_FROM.email, email: emailResult }));

  return json({
    ok: true,
    response,
    status: mine.status,
    position: mine.position || null,
    email: emailResult,
    summary: { seatedCount: after.seatedCount, cap, full: after.full, waitCount: after.waitCount }
  });
};
