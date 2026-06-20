// Private aggregate view of the invite network (the "Circles" dashboard).
// Protected by CIRCLES_KEY env var. Reads everything from Blobs and rolls it up,
// including channel source, device, and the referral chain (parent_code → viral tree).
import { getStore } from "@netlify/blobs";
import { json, countRsvps } from "./_lib.mjs";

export default async (req) => {
  const url = new URL(req.url);
  const k = url.searchParams.get("k") || "";
  const ADMIN = process.env.CIRCLES_KEY || "";
  if (!ADMIN || k !== ADMIN) return json({ ok: false, error: "unauthorized" }, 401);

  const store = getStore("amabile-invites");
  const invList = await store.list({ prefix: "inv:" }).catch(() => ({ blobs: [] }));

  const invites = [];
  for (const b of invList.blobs || []) {
    const m = await store.get(b.key, { type: "json" }).catch(() => null);
    if (m) invites.push(m);
  }
  invites.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const totals = { invites: invites.length, rsvps: 0, in: 0, maybe: 0, out: 0 };
  const byVibe = {}, bySource = {}, byDevice = {}, hosts = {}, responders = {}, spawn = {}, codeHost = {};
  const recent = [];
  let loopCreates = 0;

  invites.forEach((inv) => { codeHost[inv.code] = inv.host || "—"; });

  for (const inv of invites) {
    const label = inv.vibeLabel || inv.vibe || "—";
    byVibe[label] = (byVibe[label] || 0) + 1;

    const src = (inv.source || "").trim() || "(direct)";
    bySource[src] = (bySource[src] || 0) + 1;
    byDevice[inv.device || "unknown"] = (byDevice[inv.device || "unknown"] || 0) + 1;
    if (inv.parent) { loopCreates++; spawn[inv.parent] = (spawn[inv.parent] || 0) + 1; }

    const r = (await store.get("rsvps:" + inv.code, { type: "json" }).catch(() => null)) || [];
    const c = countRsvps(r);
    totals.rsvps += r.length; totals.in += c.in; totals.maybe += c.maybe; totals.out += c.out;

    const h = inv.host || "—";
    hosts[h] = hosts[h] || { host: h, invites: 0, responders: 0, in: 0 };
    hosts[h].invites++; hosts[h].responders += r.length; hosts[h].in += c.in;

    r.forEach((x) => {
      const key = (x.name || "?").trim().toLowerCase();
      responders[key] = responders[key] || { name: x.name || "?", count: 0 };
      responders[key].count++;
    });

    if (recent.length < 25) recent.push({ code: inv.code, host: inv.host, vibe: inv.vibeLabel, source: inv.source, counts: c, createdAt: inv.createdAt,
      rsvps: r.map((x) => ({ name: x.name || "A friend", response: x.response, bringing: x.bringing || "", at: x.at })) });
  }

  const topHosts = Object.values(hosts).sort((a, b) => b.responders - a.responders).slice(0, 15);
  const topResponders = Object.values(responders).filter((x) => x.count > 1).sort((a, b) => b.count - a.count).slice(0, 15);
  const topSpawners = Object.keys(spawn)
    .map((code) => ({ code, host: codeHost[code] || code, spawned: spawn[code] }))
    .sort((a, b) => b.spawned - a.spawned).slice(0, 15);
  const loop = { loopCreates, seeded: invites.length - loopCreates, loopShare: invites.length ? loopCreates / invites.length : 0 };

  return json({ ok: true, totals, loop, byVibe, bySource, byDevice, topHosts, topResponders, topSpawners, recent });
};
