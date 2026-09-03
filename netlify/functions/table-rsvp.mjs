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
  fmtDate, deadlinePassed
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
  const role = clean(d.role, 120);      // "what you do" — feeds the seating plan
  const notes = clean(d.notes, 400);    // dietary / access
  const optin = !!d.optin;

  if (response === "yes") {
    if (!isEmail(email)) return json({ ok: false, error: "bad_email" }, 400);
    if (!mobile) return json({ ok: false, error: "no_mobile" }, 400);
    if (!role) return json({ ok: false, error: "no_role" }, 400);
  }

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
    email: email || (existing && existing.email) || guest.email || "",
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

  // Recompute after the write.
  const after = standings(await loadRsvps(st, ed), cap);
  const mine = statusOf(guest.gid, after);
  const afterSeated = seatedGids(after);

  const apiKey = process.env.BREVO_API_KEY;
  const notifyTo = process.env.TABLE_NOTIFY_EMAIL || "";
  const guestLink = `${INVITE_SITE}/table/${encodeURIComponent(ed)}?g=${encodeURIComponent(token)}`;
  const whenBits = [after && edition.dateISO ? fmtDate(edition.dateISO) : "", edition.timeLabel || "", edition.venue || ""]
    .filter(Boolean).join(" · ");

  // Promotion: guests who moved into the seated set as a result of this change (a drop-out
  // freed a seat). Email each once. Skip the actor themselves.
  if (apiKey && response === "no" && wasYes) {
    for (const r of after.seated) {
      if (r.gid === guest.gid) continue;
      if (!beforeSeated.has(r.gid) && afterSeated.has(r.gid) && r.notifiedStatus !== "seated" && isEmail(r.email)) {
        const html = shell(`
          <h2 style="margin:0 0 8px;font-size:22px;color:#2a1207">A seat just opened — you're in 🎉</h2>
          <p style="margin:0 0 12px;color:#6a4634">Good news: a place at <b>${clean(edition.title, 80)}</b> has come free and it's yours. This seat is reserved for you specifically — no plus-ones, seating is planned per person.</p>
          <p style="margin:0 0 16px;color:#6a4634">${whenBits}</p>
          <p style="margin:0">${button(guestLink, "Confirm you're still coming →")}</p>
        `);
        await sendEmail(apiKey, r.email, `You're off the waitlist — ${clean(edition.title, 60)}`, html);
        try { await st.setJSON(kRsvp(ed, r.gid), { ...r, notifiedStatus: "seated" }); } catch (_) {}
      }
    }
  }

  // Emails to the responding guest.
  if (apiKey) {
    if (response === "yes" && mine.status === "seated" && isEmail(rec.email)) {
      const html = shell(`
        <h2 style="margin:0 0 8px;font-size:22px;color:#2a1207">Your seat is saved 🍷</h2>
        <p style="margin:0 0 6px;color:#6a4634">See you at <b>${clean(edition.title, 80)}</b>. This seat is reserved for <b>${clean(guest.name, 80)}</b> — it's a seated lunch planned per person, so there are no plus-ones.</p>
        <p style="margin:12px 0 6px"><b>When</b> · ${clean(whenBits, 200)}</p>
        ${edition.address ? `<p style="margin:0 0 12px;color:#6a4634"><b>Where</b> · ${clean(edition.address, 160)}</p>` : ""}
        <p style="margin:12px 0 16px;color:#6a4634">Plans change — you can update your answer any time here:</p>
        <p style="margin:0">${button(guestLink, "View or change your RSVP →")}</p>
      `);
      await sendEmail(apiKey, rec.email, `You're in — ${clean(edition.title, 60)} 🍷`, html);
      try { await st.setJSON(kRsvp(ed, guest.gid), { ...rec, notifiedStatus: "seated" }); } catch (_) {}
    } else if (response === "yes" && mine.status === "wait" && isEmail(rec.email)) {
      const html = shell(`
        <h2 style="margin:0 0 8px;font-size:22px;color:#2a1207">You're on the waitlist — no. ${mine.position}</h2>
        <p style="margin:0 0 12px;color:#6a4634"><b>${clean(edition.title, 80)}</b> is full for now, so we've saved you a place in line at <b>position ${mine.position}</b>. If a seat frees up we'll email you automatically — you don't need to do anything.</p>
        <p style="margin:0 0 16px;color:#6a4634">${clean(whenBits, 200)}</p>
        <p style="margin:0">${button(guestLink, "View your status →")}</p>
      `);
      await sendEmail(apiKey, rec.email, `Waitlisted (no. ${mine.position}) — ${clean(edition.title, 60)}`, html);
      try { await st.setJSON(kRsvp(ed, guest.gid), { ...rec, notifiedStatus: "wait" }); } catch (_) {}
    }

    // Internal notification on every response.
    if (isEmail(notifyTo)) {
      const verb = response === "yes" ? (mine.status === "seated" ? "is IN (seated)" : "is IN (waitlist no. " + mine.position + ")") : "can't make it";
      const html = shell(`
        <h2 style="margin:0 0 6px;font-size:20px;color:#2a1207">${clean(guest.name, 80)} ${verb}</h2>
        <p style="margin:0 0 6px;color:#6a4634">${clean(edition.title, 80)}</p>
        ${response === "yes" ? `<p style="margin:0 0 4px;color:#6a4634">Does: ${clean(rec.role, 120)}</p>` : ""}
        ${rec.notes ? `<p style="margin:0 0 4px;color:#6a4634">Notes: ${clean(rec.notes, 400)}</p>` : ""}
        <p style="margin:8px 0 0;color:#6a4634">Now: <b>${after.seatedCount}/${cap} seated</b> · ${after.waitCount} waiting</p>
      `);
      await sendEmail(apiKey, notifyTo, `Table RSVP — ${clean(guest.name, 60)} ${response === "yes" ? "in" : "out"}`, html);
    }

    // Opt-in → newsletter contact (tagged for the Table, never the viral loop).
    if (optin && isEmail(rec.email)) {
      const lid = process.env.BREVO_LIST_ID;
      const attrs = { FIRSTNAME: clean(guest.name, 80), SOURCE: "amabile-table", CAMPAIGN: clean(edition.title, 80) };
      async function addContact(a) {
        const b = { email: rec.email, attributes: a, updateEnabled: true };
        if (lid) b.listIds = [Number(lid)];
        const r = await fetch("https://api.brevo.com/v3/contacts", {
          method: "POST", headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(b)
        });
        return { ok: r.ok || r.status === 204, text: r.ok ? "" : await r.text() };
      }
      try { const res = await addContact(attrs); if (!res.ok && /attribute/i.test(res.text)) await addContact({ FIRSTNAME: clean(guest.name, 80) }); } catch (_) {}
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

  return json({
    ok: true,
    response,
    status: mine.status,
    position: mine.position || null,
    summary: { seatedCount: after.seatedCount, cap, full: after.full, waitCount: after.waitCount }
  });
};
