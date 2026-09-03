// Public read for the Amabile Table guest page. Token-gated: without a valid per-guest
// token it returns invited:false and NO guest data (a forwarded link that dropped the
// token, or a wrong token, cannot see the list or RSVP). Rate limited.
import { json } from "./_lib.mjs";
import {
  tstore, edId, tokenClean, clientIp, rateOk,
  loadEdition, loadGuests, guestByToken, loadRsvps, standings, statusOf,
  fmtDate, deadlinePassed
} from "./_table.mjs";

export default async (req, context) => {
  const url = new URL(req.url);
  const ed = edId(url.searchParams.get("e") || "");
  const token = tokenClean(url.searchParams.get("g") || "");
  const st = tstore();

  if (!(await rateOk(st, "table-data", clientIp(req, context), 40, 60000))) {
    return json({ ok: false, error: "rate" }, 429);
  }
  if (!ed) return json({ ok: false, error: "no_edition" }, 400);

  const edition = await loadEdition(st, ed);
  if (!edition) return json({ ok: false, error: "no_edition" }, 404);

  const pub = {
    edition: ed,
    title: edition.title || ("The Amabile Table — " + ed),
    dateISO: edition.dateISO || "",
    dateLabel: edition.dateISO ? fmtDate(edition.dateISO) : (edition.dateLabel || ""),
    timeLabel: edition.timeLabel || "",
    venue: edition.venue || "",
    address: edition.address || "",
    cap: edition.cap || 0,
    deadlineLabel: edition.deadlineLabel || "",
    closed: deadlinePassed(edition)
  };

  const guests = await loadGuests(st, ed);
  const guest = guestByToken(guests, token);

  const rsvps = await loadRsvps(st, ed);
  const stand = standings(rsvps, pub.cap);
  const summary = { seatedCount: stand.seatedCount, cap: stand.cap, full: stand.full, waitCount: stand.waitCount };

  // No valid token → the room is invisible. Enough to render an "invite only" message.
  if (!guest) return json({ ok: true, invited: false, edition: { title: pub.title }, summary });

  const mine = rsvps.find((r) => r.gid === guest.gid) || null;
  const your = mine
    ? {
        response: mine.response,
        email: mine.email || guest.email || "",
        mobile: mine.mobile || "",
        role: mine.role || "",
        notes: mine.notes || "",
        optin: !!mine.optin,
        ...statusOf(guest.gid, stand)
      }
    : { response: "", email: guest.email || "", mobile: "", role: "", notes: "", optin: false, status: "none" };

  return json({
    ok: true,
    invited: true,
    guest: { name: guest.name, gid: guest.gid },
    edition: pub,
    summary,
    your
  });
};
