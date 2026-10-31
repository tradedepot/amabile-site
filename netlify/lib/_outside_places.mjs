// Andiamo!: each venue's own Google Maps place, so Directions opens the venue (its name, photos, hours and
// entrance) rather than a pin. Matched by name near the venue's location with Google's Places API (New),
// using the records service account (GCP_SA_KEY). A match more than 250 m from the venue is not taken.
// The admin can correct it with the place ID. Without a match, Directions falls back to the coordinates.
import crypto from "node:crypto";
import { K, getJSON, listKeys, fetchAll, clean } from "./_outside.mjs";

const NEAR_M = 250;
const API = "https://places.googleapis.com/v1/";
const FIELDS = "id,displayName,formattedAddress,location,googleMapsUri";

let tok = null;
async function token() {
  if (tok && tok.exp > Date.now() + 60e3) return tok.v;
  let sa = null; try { sa = JSON.parse(process.env.GCP_SA_KEY || "null"); } catch {}
  if (!sa || !sa.private_key || !sa.client_email) throw Object.assign(new Error("no key"), { why: "no_key" });
  const b64u = (x) => Buffer.from(x).toString("base64url"), now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64u(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/cloud-platform", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const jwt = head + "." + body + "." + b64u(crypto.createSign("RSA-SHA256").update(head + "." + body).sign(sa.private_key));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + jwt });
  const d = await r.json().catch(() => ({}));
  if (!d.access_token) throw Object.assign(new Error("token " + r.status), { why: "no_key" });
  tok = { v: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return tok.v;
}
async function call(path, init = {}) {
  if (globalThis.__placesTest) return globalThis.__placesTest(path, init);
  const headers = { authorization: "Bearer " + (await token()), "x-goog-fieldmask": init.mask || FIELDS, "content-type": "application/json" };
  const r = await fetch(API + path, { method: init.body ? "POST" : "GET", headers, body: init.body ? JSON.stringify(init.body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (d.error && d.error.message) || "";
    console.warn("places", r.status, msg.slice(0, 200));
    throw Object.assign(new Error("places " + r.status), { why: /not been used|disabled|SERVICE_DISABLED/i.test(msg) ? "api_off" : r.status === 403 ? "not_allowed" : r.status === 404 || r.status === 400 ? "not_found" : "error" });
  }
  return d;
}

const metres = (a, b) => { const R = 6371e3, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lng - a.lng) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const view = (p, v) => ({ id: p.id, name: (p.displayName && p.displayName.text) || "", addr: p.formattedAddress || "", uri: p.googleMapsUri || "",
  m: p.location && v.lat != null ? Math.round(metres({ lat: v.lat, lng: v.lng }, { lat: p.location.latitude, lng: p.location.longitude })) : null });
const keyOf = (v) => [v.name, v.lat, v.lng].join("|");

// Google's best match for this venue: the nearest result within 250 m, or null.
export async function findPlace(v) {
  if (!v.name || v.lat == null || v.lng == null) return null;
  const d = await call("places:searchText", { body: { textQuery: v.name + (v.area ? ", " + v.area : ""), maxResultCount: 5,
    locationBias: { circle: { center: { latitude: v.lat, longitude: v.lng }, radius: 500 } } }, mask: FIELDS.split(",").map((f) => "places." + f).join(",") });
  const near = (d.places || []).map((p) => view(p, v)).filter((p) => p.m != null && p.m <= NEAR_M).sort((a, b) => a.m - b.m);
  return near[0] || null;
}

// Match one venue, unless it was set by hand or nothing that matters has changed. Changes v; the caller saves it.
export async function matchVenue(v, { force = false } = {}) {
  if (!force && v.place && (v.place.manual || v.place.for === keyOf(v))) return { changed: false };
  try {
    const p = await findPlace(v);
    v.place = p ? { ...p, for: keyOf(v), at: Date.now() } : { none: true, for: keyOf(v), at: Date.now() };
    return { changed: true, found: !!p };
  } catch (e) { return { changed: false, error: e.why || "error" }; }
}

// Admin: match every venue that has no place yet (or whose name or location changed).
export async function fillPlaces(s, { force = false } = {}) {
  const vs = (await fetchAll(s, (await listKeys(s, K.venuePrefix)))).filter((v) => v && v.id);
  let found = 0, none = 0, error = null;
  for (const v of vs) {
    const r = await matchVenue(v, { force });
    if (r.error) { error = r.error; break; }
    if (!r.changed) continue;
    await s.setJSON(K.venue(v.id), v);
    r.found ? found++ : none++;
  }
  return error ? { ok: false, error, found, none } : { ok: true, found, none };
}

// Admin: set the place by hand (a place ID), find it again, or clear it.
export async function setPlace(s, venueId, d) {
  const v = await getJSON(s, K.venue(clean(venueId, 20)));
  if (!v) return { ok: false, error: "not_found" };
  if (d.clear) delete v.place;
  else if (d.placeId) {
    const id = clean(d.placeId, 300).replace(/^.*place_id[:=]/, "").replace(/[^A-Za-z0-9_-]/g, "");
    if (!id) return { ok: false, error: "place_id" };
    try { const p = await call("places/" + id); v.place = { ...view(p, v), manual: true, at: Date.now() }; }
    catch (e) { return { ok: false, error: e.why === "not_found" ? "place_id" : e.why || "error" }; }
  } else {
    const r = await matchVenue(v, { force: true });
    if (r.error) return { ok: false, error: r.error };
  }
  v.updatedAt = Date.now();
  await s.setJSON(K.venue(v.id), v);
  return { ok: true, place: v.place || null };
}

// Directions to the venue: its Google place when we have one, otherwise its coordinates.
export const placeIdOf = (v) => (v && v.place && v.place.id) || "";
