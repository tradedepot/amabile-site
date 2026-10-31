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
// Env (Apple):  ANDIAMO_PASS_TYPE_ID  e.g. pass.ng.andiamo.bottles
//               ANDIAMO_PASS_TEAM_ID  Apple Developer team id
//               ANDIAMO_PASS_CERT_B64 / ANDIAMO_PASS_KEY_B64 / ANDIAMO_PASS_WWDR_B64   PEM, base64-encoded
// Env (Google): ANDIAMO_GW_ISSUER_ID  Google Wallet issuer id
//               ANDIAMO_GW_SA_KEY     service account JSON with access to that issuer
// Either side is off until its keys are set; the buttons only show for a side that is on.
import crypto from "node:crypto";
import {
  K, getJSON, listKeys, fetchAll, phoneKey, SITE, wine, allVenues, getBands, claimCheck, computeGlow, venuesByPopularity
} from "./_outside.mjs";
import { WALLET_ASSETS } from "./_outside_wallet_assets.mjs";

const ORIGIN = () => { try { return new URL(SITE).origin; } catch { return "https://andiamo.ng"; } };
export const WS_BASE = () => ORIGIN() + "/api/wallet";
const env = (k) => process.env[k] || "";
const pem = (k) => Buffer.from(env(k), "base64").toString("utf8");

export const appleReady = () => !!(env("ANDIAMO_PASS_TYPE_ID") && env("ANDIAMO_PASS_TEAM_ID") && env("ANDIAMO_PASS_CERT_B64") && env("ANDIAMO_PASS_KEY_B64") && env("ANDIAMO_PASS_WWDR_B64"));
export const googleReady = () => { if (!env("ANDIAMO_GW_ISSUER_ID") || !env("ANDIAMO_GW_SA_KEY")) return false; try { return !!JSON.parse(env("ANDIAMO_GW_SA_KEY")).private_key; } catch { return false; } };

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
  const line = (b) => `${wine(b.wine) ? wine(b.wine).name : "Amabile"} from ${firstName(b)}`;
  return {
    count: waiting.length,
    top: waiting.length ? (() => { const b = waiting[waiting.length - 1]; return { from: firstName(b), label: "FROM " + firstName(b).toUpperCase(), value: wine(b.wine) ? wine(b.wine).name : "Amabile" }; })() : null,
    others: waiting.slice(0, -1).reverse().map(line),
    onWay: onWay.map(line),
    places: places.map(({ v, b }) => ({ lat: v.lat, lng: v.lng, name: v.name, text: `${v.name} is on Andiamo. Your ${wine(b.wine) ? wine(b.wine).name : "bottle"} is waiting.` })),
    code, scanUrl: code ? SITE + "/board?q=" + code : null
  };
}

// ---------- Apple ----------
export function passJson(c, view) {
  const RED = "rgb(231, 69, 41)", CREAM = "rgb(255, 233, 214)", WHITE = "rgb(255, 255, 255)";
  const g = {
    headerFields: [{ key: "count", label: "BOTTLES", value: String(view.count) }],
    primaryFields: view.top ? [{ key: "top", label: view.top.label, value: view.top.value }] : [{ key: "top", label: "ANDIAMO!", value: "No bottles yet" }],
    secondaryFields: [],
    auxiliaryFields: [],
    backFields: []
  };
  if (view.others.length) g.secondaryFields.push({ key: "more", label: "ALSO WAITING", value: view.others.slice(0, 2).join(", ") + (view.others.length > 2 ? ` +${view.others.length - 2}` : "") });
  if (view.onWay.length) g.auxiliaryFields.push({ key: "onway", label: "ON ITS WAY", value: view.onWay.join(", ") });
  if (view.count) g.backFields.push({ key: "how", label: "AT THE VENUE", value: "Show the QR on the front to the waiter. They scan it and your bottle comes to your table, already paid for." });
  else g.backFields.push({ key: "how", label: "ANDIAMO!", value: "When someone sends you a bottle it shows up here. Keep this card and it lets you know when you're near a spot that can serve it." });
  if (view.places.length) g.backFields.push({ key: "where", label: "WHERE TONIGHT", value: view.places.map((p) => p.name).join(", ") });
  g.backFields.push({ key: "app", label: "OPEN ANDIAMO!", value: ORIGIN(), attributedValue: `<a href="${ORIGIN()}">Open Andiamo!</a>` });
  const p = {
    formatVersion: 1, passTypeIdentifier: env("ANDIAMO_PASS_TYPE_ID"), teamIdentifier: env("ANDIAMO_PASS_TEAM_ID"),
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

async function signManifest(manifest) {
  const forge = (await import("node-forge")).default;
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifest.toString("utf8"), "utf8");
  const cert = forge.pki.certificateFromPem(pem("ANDIAMO_PASS_CERT_B64"));
  p7.addCertificate(cert);
  p7.addCertificate(forge.pki.certificateFromPem(pem("ANDIAMO_PASS_WWDR_B64")));
  p7.addSigner({ key: forge.pki.privateKeyFromPem(pem("ANDIAMO_PASS_KEY_B64")), certificate: cert, digestAlgorithm: forge.pki.oids.sha1,
    authenticatedAttributes: [{ type: forge.pki.oids.contentType, value: forge.pki.oids.data }, { type: forge.pki.oids.messageDigest }, { type: forge.pki.oids.signingTime, value: new Date() }] });
  p7.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary");
}

export async function buildPkpass(s, c) {
  const view = await cardView(s, c);
  await s.setJSON(WK.card(c.serial), c); // the code may have changed
  const files = { "pass.json": Buffer.from(JSON.stringify(passJson(c, view))) };
  for (const [name, b64] of Object.entries(WALLET_ASSETS)) files[name] = Buffer.from(b64, "base64");
  const manifest = {};
  for (const [name, data] of Object.entries(files)) manifest[name] = crypto.createHash("sha1").update(data).digest("hex");
  files["manifest.json"] = Buffer.from(JSON.stringify(manifest));
  files["signature"] = await signManifest(files["manifest.json"]);
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
async function apnsPush(tokens) {
  if (!tokens.length || !appleReady()) return { sent: 0 };
  if (globalThis.__apnsTest) { globalThis.__apnsTest.push(...tokens); return { sent: tokens.length }; } // tests only
  const http2 = await import("node:http2");
  const host = env("ANDIAMO_APNS_HOST") || "https://api.push.apple.com";
  return await new Promise((resolve) => {
    let sent = 0, done = 0, settled = false;
    const finish = () => { if (settled) return; settled = true; try { cl.close(); } catch {} resolve({ sent }); };
    const cl = http2.connect(host, { cert: pem("ANDIAMO_PASS_CERT_B64"), key: pem("ANDIAMO_PASS_KEY_B64") });
    cl.on("error", (e) => { console.warn("wallet apns", String(e).slice(0, 200)); finish(); });
    const timer = setTimeout(finish, 4000);
    for (const t of tokens) {
      const req = cl.request({ ":method": "POST", ":path": "/3/device/" + t, "apns-topic": env("ANDIAMO_PASS_TYPE_ID"), "content-type": "application/json" });
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
    const apple = await apnsPush(tokens);
    const google = c.google && googleReady() ? await googleUpdate(s, c).catch((e) => { console.warn("wallet google", String(e).slice(0, 200)); return null; }) : null;
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
const gsa = () => JSON.parse(env("ANDIAMO_GW_SA_KEY"));
const gjwt = (payload) => {
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" })), body = b64u(JSON.stringify(payload));
  return head + "." + body + "." + b64u(crypto.createSign("RSA-SHA256").update(head + "." + body).sign(gsa().private_key));
};
const classId = () => env("ANDIAMO_GW_ISSUER_ID") + ".andiamo_bottles";
const objectId = (c) => env("ANDIAMO_GW_ISSUER_ID") + "." + c.serial;
const IMG = (n) => ORIGIN() + "/outside/img/wallet/" + n;

export function googleObject(c, view) {
  const o = {
    id: objectId(c), classId: classId(), state: "ACTIVE", hexBackgroundColor: "#E74529",
    logo: { sourceUri: { uri: IMG("g-logo.png") }, contentDescription: { defaultValue: { language: "en-GB", value: "Andiamo!" } } },
    cardTitle: { defaultValue: { language: "en-GB", value: "Andiamo!" } },
    subheader: { defaultValue: { language: "en-GB", value: view.top ? "From " + view.top.from : "Andiamo!" } },
    header: { defaultValue: { language: "en-GB", value: view.top ? view.top.value : "No bottles yet" } },
    textModulesData: [{ id: "count", header: "Bottles", body: String(view.count) }],
    linksModuleData: { uris: [{ uri: ORIGIN(), description: "Open Andiamo!", id: "app" }] }
  };
  if (view.others.length) o.textModulesData.push({ id: "more", header: "Also waiting", body: view.others.join(", ") });
  if (view.onWay.length) o.textModulesData.push({ id: "onway", header: "On its way", body: view.onWay.join(", ") });
  if (view.code) o.barcode = { type: "QR_CODE", value: view.scanUrl, alternateText: "Show this to the waiter" };
  if (view.places.length) o.locations = view.places.map((p) => ({ latitude: p.lat, longitude: p.lng }));
  return o;
}
const googleClass = () => ({ id: classId(), issuerName: "Andiamo!", reviewStatus: "UNDER_REVIEW" });

async function googleToken() {
  const sa = gsa(), now = Math.floor(Date.now() / 1000);
  const assertion = gjwt({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/wallet_object.issuer", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + assertion });
  const d = await r.json().catch(() => ({}));
  if (!d.access_token) throw new Error("google token " + r.status);
  return d.access_token;
}
async function googleUpdate(s, c) {
  const view = await cardView(s, c);
  await s.setJSON(WK.card(c.serial), c);
  const tok = await googleToken();
  const r = await fetch("https://walletobjects.googleapis.com/walletobjects/v1/genericObject/" + encodeURIComponent(objectId(c)), {
    method: "PUT", headers: { authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify(googleObject(c, view)) });
  if (r.status === 404) return null; // not saved to a phone yet
  if (!r.ok) throw new Error("google update " + r.status);
  return true;
}
// The "Save to Google Wallet" link: the card itself rides in a signed token.
export async function googleSaveLink(s, c) {
  const view = await cardView(s, c);
  c.google = true; await s.setJSON(WK.card(c.serial), c);
  const sa = gsa();
  const jwt = gjwt({ iss: sa.client_email, aud: "google", typ: "savetowallet", origins: [ORIGIN()], iat: Math.floor(Date.now() / 1000),
    payload: { genericClasses: [googleClass()], genericObjects: [googleObject(c, view)] } });
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
