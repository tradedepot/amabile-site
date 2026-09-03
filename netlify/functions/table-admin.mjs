// Private admin API for the Amabile Table. Gated by the TABLE_ADMIN_KEY env var, sent in
// the POST body (never in the query string) and checked on every action. Handles editions
// as DATA (create/update without a deploy) and bulk guest-list import from a spreadsheet
// paste, minting a collision-checked per-guest token for each row.
import { json, clean, INVITE_SITE } from "./_lib.mjs";
import {
  tstore, edId, kEdition, kGuests, loadEdition, loadGuests, loadRsvps,
  standings, mintToken, mintGid, fmtDate, deadlinePassed, kMetaPrefix
} from "./_table.mjs";

function authed(d) {
  const key = process.env.TABLE_ADMIN_KEY || "";
  return key && typeof d.k === "string" && d.k === key;
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
      title: clean(d.title, 120) || ("The Amabile Table — " + ed),
      dateISO: clean(d.dateISO, 10),           // YYYY-MM-DD
      timeLabel: clean(d.timeLabel, 60),
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
      notes: r.notes || "", optin: !!r.optin, at: r.updatedAt || r.at || 0, ...extra
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
        edition: ed, title: edition.title, dateISO: edition.dateISO || "",
        dateLabel: edition.dateISO ? fmtDate(edition.dateISO) : (edition.dateLabel || ""),
        timeLabel: edition.timeLabel || "", venue: edition.venue || "", address: edition.address || "",
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
