// Andiamo!: the bottles card in Apple Wallet and Google Wallet.
//
// One card per player, never one per bottle. It shows the bottles waiting for them and a QR the waiter scans,
// and it carries tonight's busiest venues where one of their bottles can be served. The phone matches those
// places on its own, so the card comes up on the lock screen near one of them. We never learn where anyone is.
//
// The card keeps itself current. Apple: when the card is added, the phone registers with /api/wallet/v1/...;
// when something changes we send that phone a silent push and it fetches the new card. Google: we edit the card
// through the Wallet API. Changes come from a bottle landing or being served (saveBottle), the QR being used,
// and the evening refresh of tonight's venues (outside-wallet-cron).
//
// Set up in the admin (Owner, Wallet page), not in Netlify: the signing key is made on the server and never leaves
// it; the owner uploads Apple's certificate and enters the Google issuer id. Kept in the store (settings/wallet).
// Google uses the records service account (GCP_SA_KEY) unless another key is uploaded.
// Env overrides, for tests: ANDIAMO_PASS_TYPE_ID, ANDIAMO_PASS_TEAM_ID, ANDIAMO_PASS_CERT_B64, ANDIAMO_PASS_KEY_B64,
// ANDIAMO_GW_ISSUER_ID, ANDIAMO_GW_SA_KEY.
import crypto from "node:crypto";
import {
  K, getJSON, listKeys, fetchAll, phoneKey, SITE, wine, allVenues, getBands, claimCheck, computeGlow, venuesByPopularity
} from "./_outside.mjs";
import { WALLET_ASSETS, WALLET_THUMBS } from "./_outside_wallet_assets.mjs";
import { WWDR_G4 } from "./_outside_wallet_wwdr.mjs";

const ORIGIN = () => { try { return new URL(SITE).origin; } catch { return "https://andiamo.ng"; } };
export const WS_BASE = () => ORIGIN() + "/api/wallet";
export const PASS_TYPE_ID = "pass.ng.andiamo.bottles";
const env = (k) => process.env[k] || "";
const unb64 = (k) => Buffer.from(env(k), "base64").toString("utf8");
const SETTINGS = "settings/wallet";

// ---------- setup: what's in place ----------
let memo = null;
export const forgetConfig = () => { memo = null; };
const envKey = () => ["ANDIAMO_PASS_CERT_B64", "ANDIAMO_PASS_TYPE_ID", "ANDIAMO_GW_ISSUER_ID", "ANDIAMO_GW_SA_KEY", "GCP_SA_KEY"].map((k) => env(k).length).join(",");
export async function walletConfig(s) {
  if (memo && memo.env === envKey() && Date.now() - memo.at < 60e3) return memo.cfg;
  const st = (await getJSON(s, SETTINGS)) || {};
  const a = st.apple || {}, g = st.google || {};
  const apple = env("ANDIAMO_PASS_CERT_B64") && env("ANDIAMO_PASS_KEY_B64")
    ? { passTypeId: env("ANDIAMO_PASS_TYPE_ID"), teamId: env("ANDIAMO_PASS_TEAM_ID"), certPem: unb64("ANDIAMO_PASS_CERT_B64"), keyPem: unb64("ANDIAMO_PASS_KEY_B64") }
    : a.certPem && a.keyPem ? { passTypeId: a.passTypeId, teamId: a.teamId, certPem: a.certPem, keyPem: a.keyPem, expires: a.expires } : null;
  let sa = null;
  try { sa = JSON.parse(env("ANDIAMO_GW_SA_KEY") || g.saKey || env("GCP_SA_KEY") || "null"); } catch {}
  const issuerId = env("ANDIAMO_GW_ISSUER_ID") || g.issuerId || "";
  const google = issuerId && sa && sa.private_key && sa.client_email ? { issuerId, sa } : null;
  const cfg = { apple, google };
  memo = { at: Date.now(), env: envKey(), cfg };
  return cfg;
}
export const appleOn = (cfg) => !!(cfg && cfg.apple);
export const googleOn = (cfg) => !!(cfg && cfg.google);

// ---------- who a card belongs to ----------
const mac = (x) => crypto.createHmac("sha256", env("OUTSIDE_SECRET") || "dev").update(x).digest("hex");
export const serialFor = (phone) => "an" + mac("wallet-serial:" + phoneKey(phone)).slice(0, 22);
export const authFor = (serial) => mac("wallet-auth:" + serial).slice(0, 40);
export const WK = {
  card: (serial) => "wc2/" + serial,                         // {phone, updatedAt, code, codeAt, google}
  byPhone: (phone) => "wph/" + phoneKey(phone),             // {serial}
  reg: (device, serial) => "wr/" + device + "/" + serial,    // a phone holding the card
  regPrefix: (device) => "wr/" + device + "/",
  dev: (device) => "wd/" + device,                           // {pushToken}
  holder: (serial, device) => "wh/" + serial + "/" + device, // the reverse, to push to every phone holding it
  holderPrefix: (serial) => "wh/" + serial + "/",
  cardPrefix: "wc2/"
};

// The card record, made the first time someone asks for it.
export async function cardFor(s, phone) {
  const serial = serialFor(phone);
  let c = await getJSON(s, WK.card(serial));
  if (!c) {
    c = { serial, phone, createdAt: Date.now(), updatedAt: Date.now() };
    await s.setJSON(WK.card(serial), c);
    await s.setJSON(WK.byPhone(phone), { serial });
  }
  return c;
}

// ---------- the QR on the card ----------
// The waiter scans it like the in-app QR; the board serves the oldest of their bottles that this venue can pour.
// It works once, then the card gets a new one. Codes older than a week are replaced in the evening refresh.
const ALPHA = "ACDEFGHJKMNPQRTUVWXY3479";
const newCode = () => Array.from(crypto.randomBytes(6), (x) => ALPHA[x % ALPHA.length]).join("");
const CODE_DAYS = 8;
async function ensureCode(s, c, { rotate = false } = {}) {
  const cur = c.code ? await getJSON(s, K.qr(c.code)) : null;
  const fresh = cur && cur.status === "ready" && cur.kind === "wallet" && cur.exp - Date.now() > 36 * 3600e3;
  if (fresh && !rotate) return c.code;
  if (cur && cur.status === "ready") await s.delete(K.qr(cur.code)).catch(() => {});
  const code = newCode();
  await s.setJSON(K.qr(code), { code, kind: "wallet", phone: c.phone, serial: c.serial, exp: Date.now() + CODE_DAYS * 864e5, status: "ready", at: Date.now() });
  c.code = code; c.codeAt = Date.now();
  return code;
}

// ---------- what the card says ----------
const firstName = (b) => (b.anon ? "Someone" : String(b.fromName || "A friend").trim().split(/\s+/)[0]);
async function bagOf(s, phone) {
  const keys = await listKeys(s, K.inboxPrefix(phone));
  return (await fetchAll(s, keys.map((k) => K.bottle(k.split("/").pop()))))
    .filter((b) => b && b.to === phone && ["waiting", "on_way"].includes(b.status)).sort((a, b) => a.createdAt - b.createdAt);
}

// Tonight's places for this card: live venues where one of their waiting bottles can be served without a top-up,
// lit ones first, then the busiest. Apple reads at most ten.
export async function placesFor(s, waiting) {
  if (!waiting.length) return [];
  const [venues, bands, glow] = await Promise.all([allVenues(s), getBands(s), computeGlow(s)]);
  const live = venues.filter((v) => v.active && !v.paused && typeof v.lat === "number" && typeof v.lng === "number");
  const ranked = await venuesByPopularity(s, live);
  const lit = (v) => (glow.glow && glow.glow[v.id] ? 1 : 0);
  const out = [];
  for (const v of ranked.sort((a, b) => lit(b) - lit(a))) {
    const b = waiting.find((x) => claimCheck(bands, x, v).ok);
    if (b) out.push({ v, b });
    if (out.length === 10) break;
  }
  return out;
}

export async function cardView(s, c) {
  const bag = await bagOf(s, c.phone);
  const waiting = bag.filter((b) => b.status === "waiting");
  const onWay = bag.filter((b) => b.status === "on_way");
  const places = await placesFor(s, waiting);
  const code = waiting.length ? await ensureCode(s, c) : null;
  const nm = (b) => (wine(b.wine) ? wine(b.wine).name : "Amabile");
  const item = (b) => ({ from: firstName(b), wine: b.wine, name: nm(b) });
  const line = (b) => `${nm(b)} from ${firstName(b)}`;
  return {
    count: waiting.length,
    top: waiting.length ? item(waiting[waiting.length - 1]) : null,
    others: waiting.slice(0, -1).reverse().map(item),
    onWay: onWay.map(line),
    places: places.map(({ v, b }) => ({ lat: v.lat, lng: v.lng, name: v.name, text: `${v.name} is on Andiamo. Your ${wine(b.wine) ? wine(b.wine).name : "bottle"} is waiting.` })),
    code, scanUrl: code ? SITE + "/board?q=" + code : null
  };
}

// ---------- Apple ----------
// Front: the logo (Andiamo! by Amabile di Rosa), how many bottles, the newest with its photo, up to four more,
// the QR. Back: how it works, what's on its way, tonight's places, a link to the app.
export function passJson(c, view, cfg) {
  const RED = "rgb(231, 69, 41)", CREAM = "rgb(255, 233, 214)", WHITE = "rgb(255, 255, 255)";
  const g = {
    headerFields: [{ key: "count", label: view.count === 1 ? "BOTTLE" : "BOTTLES", value: String(view.count), textAlignment: "PKTextAlignmentRight" }],
    primaryFields: view.top ? [{ key: "top", label: "FROM " + view.top.from.toUpperCase(), value: view.top.name }] : [{ key: "top", label: "NOTHING WAITING", value: "No bottles yet" }],
    secondaryFields: [], auxiliaryFields: [], backFields: []
  };
  // Four places on the front for the rest: two side by side, then two more. A fifth and beyond is counted.
  const rest = view.others, slots = rest.length > 4 ? rest.slice(0, 3) : rest;
  const fields = slots.map((o, i) => ({ key: "o" + i, label: "FROM " + o.from.toUpperCase(), value: o.name }));
  if (rest.length > 4) fields.push({ key: "o3", label: "AND", value: `${rest.length - 3} more` });
  g.secondaryFields = fields.slice(0, 2); g.auxiliaryFields = fields.slice(2, 4);
  if (view.count) g.backFields.push({ key: "how", label: "AT THE VENUE", value: "Show the QR on the front to the waiter. They scan it and a bottle comes to your table, already paid for. If you have more than one, they bring the one that venue serves." });
  else g.backFields.push({ key: "how", label: "ANDIAMO!", value: "When someone sends you a bottle it shows up here. Keep this card and it lets you know when you're near a spot that can serve it." });
  if (rest.length) g.backFields.push({ key: "all", label: "ALL WAITING", value: [view.top, ...rest].map((o) => `${o.name} from ${o.from}`).join("\n") });
  if (view.onWay.length) g.backFields.push({ key: "onway", label: "ON ITS WAY", value: view.onWay.join("\n") });
  if (view.places.length) g.backFields.push({ key: "where", label: "WHERE TONIGHT", value: view.places.map((p) => p.name).join(", ") });
  g.backFields.push({ key: "app", label: "OPEN ANDIAMO!", value: ORIGIN(), attributedValue: `<a href="${ORIGIN()}">Open Andiamo!</a>` });
  g.backFields.push({ key: "by", label: "", value: "Andiamo! is by Amabile di Rosa." });
  const p = {
    formatVersion: 1, passTypeIdentifier: cfg.apple.passTypeId, teamIdentifier: cfg.apple.teamId,
    serialNumber: c.serial, organizationName: "Andiamo!", description: "Your Andiamo! bottles",
    backgroundColor: RED, foregroundColor: WHITE, labelColor: CREAM, sharingProhibited: true,
    webServiceURL: WS_BASE(), authenticationToken: authFor(c.serial),
    generic: g
  };
  if (view.code) p.barcodes = [{ format: "PKBarcodeFormatQR", message: view.scanUrl, messageEncoding: "iso-8859-1", altText: "Show this to the waiter" }];
  if (view.places.length) { p.locations = view.places.map((x) => ({ latitude: x.lat, longitude: x.lng, relevantText: x.text })); p.maxDistance = 150; }
  return p;
}

// A store-only zip (no compression): what Wallet reads, with no zip library needed.
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function zipStore(files) {
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const local = [], central = []; let off = 0;
  for (const [name, data] of Object.entries(files)) {
    const nm = Buffer.from(name), c = crc(data), n = data.length;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0, 6); h.writeUInt16LE(0, 8);
    h.writeUInt32LE(0, 10); h.writeUInt32LE(c, 14); h.writeUInt32LE(n, 18); h.writeUInt32LE(n, 22); h.writeUInt16LE(nm.length, 26); h.writeUInt16LE(0, 28);
    local.push(h, nm, data);
    const e = Buffer.alloc(46); e.writeUInt32LE(0x02014b50, 0); e.writeUInt16LE(20, 4); e.writeUInt16LE(20, 6); e.writeUInt16LE(0, 8); e.writeUInt16LE(0, 10);
    e.writeUInt32LE(0, 12); e.writeUInt32LE(c, 16); e.writeUInt32LE(n, 20); e.writeUInt32LE(n, 24); e.writeUInt16LE(nm.length, 28);
    e.writeUInt16LE(0, 30); e.writeUInt16LE(0, 32); e.writeUInt16LE(0, 34); e.writeUInt16LE(0, 36); e.writeUInt32LE(0, 38); e.writeUInt32LE(off, 42);
    central.push(e, nm);
    off += 30 + nm.length + n;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...local, cd, end]);
}

async function signManifest(manifest, cfg) {
  const forge = (await import("node-forge")).default;
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifest.toString("utf8"), "utf8");
  const cert = forge.pki.certificateFromPem(cfg.apple.certPem);
  p7.addCertificate(cert);
  p7.addCertificate(forge.pki.certificateFromPem(env("ANDIAMO_PASS_WWDR_B64") ? unb64("ANDIAMO_PASS_WWDR_B64") : WWDR_G4));
  p7.addSigner({ key: forge.pki.privateKeyFromPem(cfg.apple.keyPem), certificate: cert, digestAlgorithm: forge.pki.oids.sha1,
    authenticatedAttributes: [{ type: forge.pki.oids.contentType, value: forge.pki.oids.data }, { type: forge.pki.oids.messageDigest }, { type: forge.pki.oids.signingTime, value: new Date() }] });
  p7.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary");
}

export async function buildPkpass(s, c) {
  const cfg = await walletConfig(s);
  const view = await cardView(s, c);
  await s.setJSON(WK.card(c.serial), c); // the code may have changed
  const files = { "pass.json": Buffer.from(JSON.stringify(passJson(c, view, cfg))) };
  for (const [name, b64] of Object.entries(WALLET_ASSETS)) files[name] = Buffer.from(b64, "base64");
  const th = view.top && WALLET_THUMBS[view.top.wine];
  if (th) for (const [name, b64] of Object.entries(th)) files[name] = Buffer.from(b64, "base64");
  const manifest = {};
  for (const [name, data] of Object.entries(files)) manifest[name] = crypto.createHash("sha1").update(data).digest("hex");
  files["manifest.json"] = Buffer.from(JSON.stringify(manifest));
  files["signature"] = await signManifest(files["manifest.json"], cfg);
  return zipStore(files);
}

// A link the app opens to add the card: signed, short-lived, so the card can't be fetched without the player.
export function addLink(serial) {
  const e = Date.now() + 15 * 60e3;
  return WS_BASE() + "/add?s=" + serial + "&e=" + e + "&m=" + mac("wallet-add:" + serial + ":" + e).slice(0, 32);
}
export function addLinkOk(serial, e, m) {
  if (!serial || !e || !m || Date.now() > Number(e)) return false;
  const want = mac("wallet-add:" + serial + ":" + e).slice(0, 32);
  return m.length === want.length && crypto.timingSafeEqual(Buffer.from(m), Buffer.from(want));
}

// The silent push that tells a phone to fetch the new card. Wallet pushes go through APNs with the pass certificate.
async function apnsPush(cfg, tokens) {
  if (!tokens.length || !appleOn(cfg)) return { sent: 0 };
  if (globalThis.__apnsTest) { globalThis.__apnsTest.push(...tokens); return { sent: tokens.length }; } // tests only
  const http2 = await import("node:http2");
  const host = env("ANDIAMO_APNS_HOST") || "https://api.push.apple.com";
  return await new Promise((resolve) => {
    let sent = 0, done = 0, settled = false;
    const finish = () => { if (settled) return; settled = true; try { cl.close(); } catch {} resolve({ sent }); };
    const cl = http2.connect(host, { cert: cfg.apple.certPem, key: cfg.apple.keyPem });
    cl.on("error", (e) => { console.warn("wallet apns", String(e).slice(0, 200)); finish(); });
    const timer = setTimeout(finish, 4000);
    for (const t of tokens) {
      const req = cl.request({ ":method": "POST", ":path": "/3/device/" + t, "apns-topic": cfg.apple.passTypeId, "content-type": "application/json" });
      req.on("response", (h) => { if (h[":status"] === 200) sent++; else console.warn("wallet apns status", h[":status"]); });
      req.on("close", () => { if (++done === tokens.length) { clearTimeout(timer); finish(); } });
      req.on("error", () => { if (++done === tokens.length) { clearTimeout(timer); finish(); } });
      req.end("{}");
    }
  });
}

// Something on the card changed: mark it and tell every phone and Google.
export async function touchCard(s, phone, { rotate = false } = {}) {
  try {
    const link = await getJSON(s, WK.byPhone(phone));
    if (!link) return { skip: "no_card" };
    const c = await getJSON(s, WK.card(link.serial));
    if (!c) return { skip: "no_card" };
    if (rotate) await ensureCode(s, c, { rotate: true });
    c.updatedAt = Date.now();
    await s.setJSON(WK.card(c.serial), c);
    const devices = (await listKeys(s, WK.holderPrefix(c.serial))).map((k) => k.split("/").pop());
    const tokens = (await fetchAll(s, devices.map((d) => WK.dev(d)))).map((x) => x.pushToken).filter(Boolean);
    const cfg = await walletConfig(s);
    const apple = await apnsPush(cfg, tokens);
    const google = c.google && googleOn(cfg) ? await googleUpdate(s, c, cfg).catch((e) => { console.warn("wallet google", String(e).slice(0, 200)); return null; }) : null;
    return { ok: true, apple: apple.sent, google: !!google };
  } catch (e) { console.warn("wallet touch", String(e).slice(0, 200)); return { skip: "error" }; }
}

// ---------- Apple web service (called by the phones) ----------
export async function register(s, device, serial, pushToken) {
  const had = await getJSON(s, WK.reg(device, serial));
  await s.setJSON(WK.dev(device), { pushToken, at: Date.now() });
  await s.setJSON(WK.reg(device, serial), { at: Date.now() });
  await s.setJSON(WK.holder(serial, device), { at: Date.now() });
  return had ? 200 : 201;
}
export async function unregister(s, device, serial) {
  await s.delete(WK.reg(device, serial)).catch(() => {});
  await s.delete(WK.holder(serial, device)).catch(() => {});
  if (!(await listKeys(s, WK.regPrefix(device))).length) await s.delete(WK.dev(device)).catch(() => {});
}
export async function updatedSince(s, device, since) {
  const serials = (await listKeys(s, WK.regPrefix(device))).map((k) => k.split("/").pop());
  const cards = (await fetchAll(s, serials.map((x) => WK.card(x)))).filter(Boolean);
  const after = Number(since) || 0;
  const changed = cards.filter((c) => (c.updatedAt || 0) > after);
  if (!changed.length) return null;
  return { serialNumbers: changed.map((c) => c.serial), lastUpdated: String(Math.max(...cards.map((c) => c.updatedAt || 0))) };
}
export const isHolder = async (s, serial) => (await listKeys(s, WK.holderPrefix(serial))).length > 0;
// For the app: is the card already on an iPhone (Apple tells us), or was it sent to Google Wallet.
export async function walletState(s, phone) {
  const link = await getJSON(s, WK.byPhone(phone));
  if (!link) return { apple: false, google: false };
  const c = await getJSON(s, WK.card(link.serial));
  return { apple: await isHolder(s, link.serial), google: !!(c && c.google) };
}

// ---------- Google ----------
const b64u = (x) => Buffer.from(x).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const gjwt = (sa, payload) => {
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" })), body = b64u(JSON.stringify(payload));
  return head + "." + body + "." + b64u(crypto.createSign("RSA-SHA256").update(head + "." + body).sign(sa.private_key));
};
const classId = (cfg) => cfg.google.issuerId + ".andiamo_bottles";
const objectId = (cfg, c) => cfg.google.issuerId + "." + c.serial;
const IMG = (n) => ORIGIN() + "/outside/img/wallet/" + n;
const lang = (value) => ({ defaultValue: { language: "en-GB", value } });

export function googleObject(cfg, c, view) {
  const o = {
    id: objectId(cfg, c), classId: classId(cfg), state: "ACTIVE", hexBackgroundColor: "#E74529",
    logo: { sourceUri: { uri: IMG("g-logo.png") }, contentDescription: lang("Andiamo!") },
    cardTitle: lang("Andiamo! by Amabile di Rosa"),
    subheader: lang(view.top ? "From " + view.top.from : "Nothing waiting"),
    header: lang(view.top ? view.top.name : "No bottles yet"),
    textModulesData: [{ id: "count", header: view.count === 1 ? "Bottle" : "Bottles", body: String(view.count) }],
    linksModuleData: { uris: [{ uri: ORIGIN(), description: "Open Andiamo!", id: "app" }] }
  };
  if (view.top && WALLET_THUMBS[view.top.wine]) o.heroImage = { sourceUri: { uri: IMG("g-hero-" + view.top.wine + ".png") }, contentDescription: lang(view.top.name) };
  if (view.others.length) o.textModulesData.push({ id: "more", header: "Also waiting", body: view.others.map((x) => `${x.name} from ${x.from}`).join(", ") });
  if (view.onWay.length) o.textModulesData.push({ id: "onway", header: "On its way", body: view.onWay.join(", ") });
  if (view.code) o.barcode = { type: "QR_CODE", value: view.scanUrl, alternateText: "Show this to the waiter" };
  if (view.places.length) o.locations = view.places.map((p) => ({ latitude: p.lat, longitude: p.lng }));
  return o;
}
const googleClass = (cfg) => ({ id: classId(cfg), issuerName: "Andiamo!", reviewStatus: "UNDER_REVIEW" });

async function googleToken(cfg) {
  const sa = cfg.google.sa, now = Math.floor(Date.now() / 1000);
  const assertion = gjwt(sa, { iss: sa.client_email, scope: "https://www.googleapis.com/auth/wallet_object.issuer", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + assertion });
  const d = await r.json().catch(() => ({}));
  if (!d.access_token) throw new Error("google token " + r.status);
  return d.access_token;
}
async function googleUpdate(s, c, cfg) {
  const view = await cardView(s, c);
  await s.setJSON(WK.card(c.serial), c);
  const tok = await googleToken(cfg);
  const r = await fetch("https://walletobjects.googleapis.com/walletobjects/v1/genericObject/" + encodeURIComponent(objectId(cfg, c)), {
    method: "PUT", headers: { authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify(googleObject(cfg, c, view)) });
  if (r.status === 404) return null; // not saved to a phone yet
  if (!r.ok) throw new Error("google update " + r.status);
  return true;
}
// The "Save to Google Wallet" link: the card itself rides in a signed token.
export async function googleSaveLink(s, c) {
  const cfg = await walletConfig(s);
  const view = await cardView(s, c);
  c.google = true; await s.setJSON(WK.card(c.serial), c);
  const sa = cfg.google.sa;
  const jwt = gjwt(sa, { iss: sa.client_email, aud: "google", typ: "savetowallet", origins: [ORIGIN()], iat: Math.floor(Date.now() / 1000),
    payload: { genericClasses: [googleClass(cfg)], genericObjects: [googleObject(cfg, c, view)] } });
  return "https://pay.google.com/gp/v/save/" + jwt;
}

// ---------- the evening refresh ----------
// Tonight's places change, and old QR codes are replaced. Only cards on a phone with a bottle waiting.
export async function eveningRefresh(s) {
  const cards = await fetchAll(s, await listKeys(s, WK.cardPrefix));
  let touched = 0;
  for (const c of cards) {
    if (!c || !(c.google || await isHolder(s, c.serial))) continue;
    const waiting = (await bagOf(s, c.phone)).some((b) => b.status === "waiting");
    if (!waiting) continue;
    const old = !c.codeAt || Date.now() - c.codeAt > 6 * 864e5;
    await touchCard(s, c.phone, { rotate: old });
    touched++;
  }
  return { touched };
}

// ---------- setup, from the admin (Owner) ----------
// Apple: we make the signing key here and hand out only the request (CSR) for Apple. The owner gets the certificate
// from Apple and uploads it; we check it was made from our request and read the pass type and team from it.
async function settings(s) { return (await getJSON(s, SETTINGS)) || {}; }
async function saveSettings(s, st) { await s.setJSON(SETTINGS, st); forgetConfig(); }

export async function appleRequest(s) {
  const forge = (await import("node-forge")).default;
  const st = await settings(s);
  st.apple = st.apple || {};
  if (!st.apple.keyPem) {
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    st.apple = { keyPem: privateKey, at: Date.now() };
  }
  if (!st.apple.csrPem) {
    const key = forge.pki.privateKeyFromPem(st.apple.keyPem);
    const csr = forge.pki.createCertificationRequest();
    csr.publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
    csr.setSubject([{ name: "commonName", value: "Andiamo Wallet" }, { name: "countryName", value: "NG" }]);
    csr.sign(key, forge.md.sha256.create());
    st.apple.csrPem = forge.pki.certificationRequestToPem(csr);
  }
  await saveSettings(s, st);
  return { ok: true, csr: st.apple.csrPem, passTypeId: PASS_TYPE_ID };
}

// The certificate Apple gave back (.cer, DER or PEM, as base64 of the file).
export async function appleCert(s, fileB64) {
  const forge = (await import("node-forge")).default;
  const st = await settings(s);
  if (!st.apple || !st.apple.keyPem) return { ok: false, error: "no_request" };
  let cert;
  try {
    const raw = Buffer.from(String(fileB64 || ""), "base64");
    const txt = raw.toString("utf8");
    cert = txt.includes("BEGIN CERTIFICATE") ? forge.pki.certificateFromPem(txt) : forge.pki.certificateFromAsn1(forge.asn1.fromDer(raw.toString("binary")));
  } catch { return { ok: false, error: "not_a_certificate" }; }
  const key = forge.pki.privateKeyFromPem(st.apple.keyPem);
  if (cert.publicKey.n.compareTo(key.n) !== 0) return { ok: false, error: "other_request" };
  const attr = (sn) => { const a = cert.subject.attributes.find((x) => x.shortName === sn || x.name === sn || x.type === sn); return a ? String(a.value) : ""; };
  const passTypeId = attr("0.9.2342.19200300.100.1.1") || (attr("CN").match(/pass\.[\w.-]+/) || [""])[0];
  const teamId = attr("OU");
  if (!/^pass\./.test(passTypeId) || !teamId) return { ok: false, error: "not_a_pass_certificate" };
  if (cert.validity.notAfter < new Date()) return { ok: false, error: "expired" };
  st.apple.certPem = forge.pki.certificateToPem(cert);
  st.apple.passTypeId = passTypeId; st.apple.teamId = teamId; st.apple.expires = cert.validity.notAfter.toISOString(); st.apple.certAt = Date.now();
  await saveSettings(s, st);
  return { ok: true, passTypeId, teamId, expires: st.apple.expires };
}

// Google: the issuer id from the Pay & Wallet Console, and optionally another service account key. We check the
// account can sign in to the Wallet API before saving.
export async function googleSetup(s, { issuerId, saKey }) {
  const id = String(issuerId || "").replace(/\D/g, "");
  if (id.length < 10) return { ok: false, error: "issuer" };
  let sa = null;
  if (saKey) { try { sa = JSON.parse(saKey); } catch { return { ok: false, error: "sa_key" }; } if (!sa.private_key || !sa.client_email) return { ok: false, error: "sa_key" }; }
  const use = sa || (() => { try { return JSON.parse(env("GCP_SA_KEY") || "null"); } catch { return null; } })();
  if (!use || !use.private_key) return { ok: false, error: "sa_key" };
  const gcfg = { google: { issuerId: id, sa: use } };
  let tok;
  try { tok = await googleToken(gcfg); } catch { return { ok: false, error: "google_signin" }; }
  // Make the card design (class) now, so Google has something to review when publishing is requested.
  const cr = await fetch("https://walletobjects.googleapis.com/walletobjects/v1/genericClass", {
    method: "POST", headers: { authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify(googleClass(gcfg)) }).catch(() => null);
  if (cr && !cr.ok && cr.status !== 409) { const t = await cr.text().catch(() => ""); console.warn("wallet google class", cr.status, t.slice(0, 200)); if (cr.status === 401 || cr.status === 403) return { ok: false, error: "google_signin" }; }
  const st = await settings(s);
  st.google = { issuerId: id, ...(sa ? { saKey } : {}), at: Date.now() };
  await saveSettings(s, st);
  return { ok: true, issuerId: id, email: use.client_email };
}

// What the admin shows. Never a key.
export async function walletAdminStatus(s) {
  const st = await settings(s), cfg = await walletConfig(s);
  let defaultEmail = ""; try { defaultEmail = JSON.parse(env("GCP_SA_KEY") || "null").client_email || ""; } catch {}
  const cards = await listKeys(s, WK.cardPrefix);
  const a = st.apple || {};
  return {
    apple: { on: appleOn(cfg), requested: !!a.csrPem, passTypeId: (cfg.apple && cfg.apple.passTypeId) || PASS_TYPE_ID, teamId: (cfg.apple && cfg.apple.teamId) || "", expires: (cfg.apple && cfg.apple.expires) || a.expires || null, webService: WS_BASE() },
    google: { on: googleOn(cfg), issuerId: (cfg.google && cfg.google.issuerId) || "", email: (cfg.google && cfg.google.sa.client_email) || defaultEmail, ownKey: !!(st.google && st.google.saKey) },
    cards: cards.length
  };
}
export async function walletReset(s, kind) {
  const st = await settings(s);
  if (kind === "apple") delete st.apple; else if (kind === "google") delete st.google; else return { ok: false, error: "kind" };
  await saveSettings(s, st);
  return { ok: true };
}
