// Andiamo! (formerly Outside): the game. A web app over an illustrated map of real Lagos.
(() => {
  const A = window.OutsideArt;
  const BASE = location.pathname.startsWith("/outside") ? "/outside" : "";
  const API = "/api/outside/";
  const PROJ = { LON0: 3.27, LAT0: 6.66, K: 10000, COS: Math.cos(6.53 * Math.PI / 180), W: 3477, H: 2600 };
  const DISTRICTS = [["LAGOS ISLAND", 1234, 2049], ["MARYLAND", 956, 829], ["OGBA", 703, 274], ["IKATE", 2171, 2307], ["VICTORIA ISLAND", 1550, 2300], ["AJAH", 2905, 1905], ["EBUTE METTA", 1149, 1737], ["SHOMOLU", 1013, 1216], ["SURULERE", 866, 1592], ["IKEJA", 811, 584], ["MAGODO", 1071, 419], ["GBAGADA", 1129, 1019], ["VGC", 2747, 1959], ["EKO ATLANTIC", 1471, 2470], ["LEKKI PHASE 2", 3062, 2062], ["IKOYI", 1570, 2077], ["FESTAC", 138, 1917], ["MAKOKO", 1215, 1642], ["LEKKI PHASE 1", 1992, 2186], ["ILUPEJU", 887, 1050], ["AKOKA", 1198, 1313], ["APAPA", 916, 2131], ["YABA", 1048, 1532], ["OJOTA", 1084, 729], ["KETU", 1210, 672], ["OBALENDE", 1353, 2109], ["BANANA ISLAND", 1817, 1958]];
  const P = (lng, lat) => [(lng - PROJ.LON0) * PROJ.COS * PROJ.K, (PROJ.LAT0 - lat) * PROJ.K];
  const $ = (q, el = document) => el.querySelector(q);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const naira = (n) => "₦" + Number(n || 0).toLocaleString("en-NG");
  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} }
  };
  const S = { token: LS.get("outside.token"), cfg: null, me: null, pendingBottle: null, invite: null, sheetTab: null };

  // ---------- icons ----------
  const ICON = {
    bottle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2h4v4c0 1 3 2 3 6v9a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-9c0-4 3-5 3-6z"/><path d="M8 13h8"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.8"/><path d="M16 14.6c2.7.2 4.6 1.9 5.3 4.9"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.2 6.3L20.5 10l-6.3 2.2L12 18.5l-2.2-6.3L3.5 10l6.3-1.7z"/><circle cx="19" cy="19" r="2"/></svg>'
  };
  document.querySelectorAll("[data-icon]").forEach((el) => (el.innerHTML = ICON[el.dataset.icon] || ""));

  // ---------- helpers ----------
  function toast(msg, ms = 2600) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), ms);
  }
  async function api(path, body) {
    const opt = { method: body ? "POST" : "GET", headers: { "content-type": "application/json" } };
    if (S.token) opt.headers.authorization = "Bearer " + S.token;
    if (body) opt.body = JSON.stringify(body);
    let r;
    try { r = await fetch(API + path, opt); } catch { return { ok: false, error: "offline" }; }
    const d = await r.json().catch(() => ({ ok: false, error: "server" }));
    if (r.status === 401 && path !== "auth/verify") { S.token = null; LS.del("outside.token"); }
    return d;
  }
  const isNight = () => false; // one map, day colours, all day
  const bandRank = (b) => (S.cfg ? S.cfg.bandOrder.indexOf(b) : 0);
  const bandName = (b) => (S.cfg && S.cfg.bandNames[b]) || b;
  // The real bottle, as a product tile. Illustrations stay for the map.
  const photo = (w, h) => `<img class="bph" src="/outside/img/bottle-${esc(w)}.jpg" alt="${esc(wineOf(w).label || "Amabile")}" style="height:${h}px" loading="lazy">`;
  // A drop is bottles, or something else from Amabile (card games, merch).
  const isItem = (d) => d && d.prize === "item";
  const dropArt = (d, size) => (isItem(d) ? A.prize(d.icon, size * 0.7) : A.bottle((d.wines || [])[0] || "rosso", size));
  const dropPic = (d, h) => (isItem(d) ? `<span class="prizepic" style="height:${h}px">${A.prize(d.icon, h * 0.62)}</span>` : photo((d.wines || [])[0] || "rosso", h));
  const ticketName = (t) => t.item || wineOf(t.wine).name;
  const spotName = (b) => { const n = bandName(b); return (/^[AEIOU]/i.test(n) ? "an " : "a ") + n + " spot"; };
  const wineOf = (id) => (S.cfg && S.cfg.wines.find((w) => w.id === id)) || { name: id, label: id };
  const venueOf = (id) => (S.cfg && S.cfg.venues.find((v) => v.id === id)) || null;
  const beaconOf = (id) => (S.cfg && (S.cfg.beacons || []).find((b) => b.id === id)) || { hex: "#F2B705", name: "Gold" };
  // A venue's level is per wine, worked out from its menu price on the server (levels); band is its headline level.
  const levelAt = (v, wineId) => (v.levels ? v.levels[wineId] : v.wines.includes(wineId) ? v.band : null);
  const claimableAt = (b, v) => v && v.wines.includes(b.wine) && bandRank(levelAt(v, b.wine)) <= bandRank(b.band);
  const timeShort = (t) => new Date(t).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" }).replace(" ", "").toLowerCase();
  const until = (t) => { const m = Math.max(0, Math.round((t - Date.now()) / 60000)); return m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m + "m"; };
  const ERR = {
    offline: "No connection. Try again in a moment.", phone: "Check the number and the country code.", slow_down: "Too many codes. Try again in a few minutes.",
    send_failed: "We couldn't send the code just now. Try again in a minute.", not_on_whatsapp: "That number isn't on WhatsApp. Check the number and the country code.", too_many: "Too many tries. Ask for a new code.", wrong_code: "That code isn't right.", expired: "That code has expired. Ask for a new one.",
    age: "Andiamo is for people 18 and over.", not_now: "This number can't sign in right now.", no_venue: "You're not at a partner venue yet. Your bottle keeps waiting.",
    not_stocked: "That venue doesn't stock this wine.", limit: "You've hit the limit for now.", not_out: "They're not outside any more.",
    gone: "All gone. Next time.", one_a_night: "One drop a night. Enjoy the rest of it.", not_here: "You need to be at the venue to claim this drop.",
    two_plus: "Drops are for tables of two or more.", not_yet: "Not live yet.", over: "This drop has ended.", band_price: "That level isn't open for this wine yet.",
    payment_init: "Payment didn't start. Try again.", not_stocked_there: "That wine isn't available where they are.", cant_send: "You can't send to this number.",
    self: "That's your own number.", signin: "Sign in first.", profile: "Finish your profile first.", server: "Something went wrong. Try again.",
    qr_expired: "That QR has expired. Show a fresh one.", gift_taken: "Someone has already opened and kept this one.", not_yours: "This bottle was sent to a different number.", code_unknown: "That code doesn't work.", code_expired: "That code has ended.", code_used: "That code has been used up.", gift_unknown: "This link doesn't work any more. Ask whoever sent it for a new one.", paused: "This venue isn't taking claims right now.", state: "This bottle isn't waiting any more."
  };
  // ---------- showing what needs fixing ----------
  // A field: red outline, a line under it saying what's wrong, brought into view and focused, a small nudge and a buzz. Typing in it clears it.
  function flag(el, text) {
    if (!el) return;
    const isInput = el.matches("input, select, textarea");
    const box = isInput ? (el.closest(".phonef") || el) : el;
    const host = box.closest(".tofield") || box.closest("label.field") || box;
    unflag(host);
    box.classList.add("bad");
    const p = document.createElement("p"); p.className = "ferr"; p.setAttribute("role", "alert"); p.textContent = text;
    host.insertAdjacentElement("afterend", p);
    box.classList.remove("nudge"); void box.offsetWidth; box.classList.add("nudge");
    try { navigator.vibrate && navigator.vibrate(60); } catch {}
    box.scrollIntoView({ block: "center", behavior: "smooth" });
    const inp = isInput ? el : el.querySelector("input:not([type=checkbox]):not([type=radio]), textarea");
    if (inp && !/checkbox|radio/.test(inp.type)) try { inp.focus({ preventScroll: true }); } catch {}
    const off = () => unflag(host);
    (isInput ? [el] : [...el.querySelectorAll("input, button, select")]).forEach((x) => { x.addEventListener("input", off, { once: true }); x.addEventListener("change", off, { once: true }); if (x.tagName === "BUTTON") x.addEventListener("click", off, { once: true }); });
  }
  function unflag(host) {
    const n = host.nextElementSibling; if (n && n.classList.contains("ferr")) n.remove();
    host.classList.remove("bad"); host.querySelectorAll(".bad").forEach((x) => x.classList.remove("bad"));
  }
  // Not one field (connection, payment, the venue): a red line by the button.
  function fail(where, text) {
    const m = where && (where.querySelector("#msg") || where.querySelector("#gm")); if (!m) return toast(text);
    m.textContent = text; m.classList.add("err"); m.classList.remove("nudge"); void m.offsetWidth; m.classList.add("nudge");
    try { navigator.vibrate && navigator.vibrate(60); } catch {}
  }
  function note(where, text) { const m = where && (where.querySelector("#msg") || where.querySelector("#gm")); if (m) { m.textContent = text; m.classList.remove("err"); } }
  // Server answers that belong to a field.
  const PHONE_ERR = ["phone", "self", "cant_send", "not_now"], CODE_ERR = ["wrong_code", "expired", "too_many"];

  const errMsg = (e) => ERR[e] || "Something went wrong.";

  function getLocation() {
    return new Promise((res) => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition(
        (p) => { const l = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }; S.lastLoc = { ...l, at: Date.now() }; res(l); },
        () => res(null), { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
    });
  }
  function e164(raw) {
    const s = String(raw || "").trim();
    let d = s.replace(/\D/g, "");
    const intl = s.startsWith("+") || s.startsWith("00");
    if (s.startsWith("00")) d = d.slice(2);
    if (!intl) {
      if (d.length === 11 && d.startsWith("0")) return "+234" + d.slice(1);
      if (d.length === 13 && d.startsWith("234")) return "+" + d;
      if (d.length === 10 && /^[789]/.test(d)) return "+234" + d;
      return null;
    }
    if (d.startsWith("2340")) d = "234" + d.slice(4);
    if (d.startsWith("234")) return d.length === 13 && /^234[789]/.test(d) ? "+" + d : null;
    if (d.length < 8 || d.length > 15 || d[0] === "0") return null;
    return "+" + d;
  }
  // Country code picker for phone numbers: a flag and code in the field, a native list behind it. Nigeria by default; the last one used is remembered.
  const CCS = [["234", "NG", "Nigeria"], ["233", "GH", "Ghana"], ["254", "KE", "Kenya"], ["27", "ZA", "South Africa"], ["225", "CI", "Côte d'Ivoire"], ["229", "BJ", "Benin"], ["228", "TG", "Togo"], ["237", "CM", "Cameroon"], ["221", "SN", "Senegal"],
    ["44", "GB", "United Kingdom"], ["1", "US", "United States, Canada"], ["353", "IE", "Ireland"], ["33", "FR", "France"], ["49", "DE", "Germany"], ["39", "IT", "Italy"], ["31", "NL", "Netherlands"], ["34", "ES", "Spain"], ["41", "CH", "Switzerland"],
    ["971", "AE", "United Arab Emirates"], ["974", "QA", "Qatar"], ["966", "SA", "Saudi Arabia"], ["61", "AU", "Australia"], ["86", "CN", "China"], ["91", "IN", "India"], ["55", "BR", "Brazil"]];
  const flagOf = (iso) => iso.replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
  const ccNow = () => { try { const c = localStorage.getItem("outside.cc"); return CCS.some(([k]) => k === c) ? c : "234"; } catch { return "234"; } };
  const ccLabel = (cc) => { const x = CCS.find(([k]) => k === cc) || CCS[0]; return `${flagOf(x[1])} +${x[0]}`; };
  const NG_HINT = "803 000 0000";
  const phoneField = (id, value = "") => {
    const cc = ccNow();
    return `<div class="phonef"><span class="ccbox"><span class="ccv" id="${id}_ccv">${ccLabel(cc)}</span><svg viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <select id="${id}_cc" aria-label="Country">${CCS.map(([k, iso, n]) => `<option value="${k}"${k === cc ? " selected" : ""}>${flagOf(iso)} ${esc(n)} +${k}</option>`).join("")}</select></span>
      <input id="${id}" type="tel" inputmode="tel" autocomplete="tel" placeholder="${cc === "234" ? NG_HINT : ""}" value="${esc(value)}"></div>`;
  };
  // What was typed, with its country code. A number typed with + or 00 keeps its own code.
  function phoneOf(root, id) {
    const raw = String((root.querySelector("#" + id) || {}).value || "").trim(), sel = root.querySelector("#" + id + "_cc");
    const cc = sel ? sel.value : "234";
    try { localStorage.setItem("outside.cc", cc); } catch {}
    const d = raw.replace(/\D/g, "");
    if (!d || raw.startsWith("+") || raw.startsWith("00") || cc === "234") return raw;
    return "+" + cc + d.replace(/^0+/, "");
  }
  function wirePhone(root, id) {
    const sel = root.querySelector("#" + id + "_cc"), inp = root.querySelector("#" + id), v = root.querySelector("#" + id + "_ccv"); if (!sel || !inp) return;
    sel.onchange = () => { v.textContent = ccLabel(sel.value); inp.placeholder = sel.value === "234" ? NG_HINT : ""; try { localStorage.setItem("outside.cc", sel.value); } catch {} inp.focus(); };
    // The code is already in the box, so a leading 0 is dropped as they type (0803 becomes 803).
    const trim = () => { const v0 = inp.value; if (/^\s*0/.test(v0)) inp.value = v0.replace(/^\s*0+/, ""); };
    inp.addEventListener("input", trim); trim();
  }
  async function numberHash(e) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("outside:" + e));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  }
  const hasPicker = () => "contacts" in navigator && "ContactsManager" in window;

  // ---------- modal and sheet ----------
  function modal(html, onMount) {
    const m = $("#modal"), c = $("#modalCard");
    c.innerHTML = '<button class="close" data-x aria-label="Close">×</button>' + html;
    c.dataset.kind = "";
    m.classList.add("open"); m.setAttribute("aria-hidden", "false");
    c.querySelector("[data-x]").onclick = closeModal;
    if (onMount) onMount(c);
    return c;
  }
  function closeModal() { $("#modal").classList.remove("open"); $("#modal").setAttribute("aria-hidden", "true"); }
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

  function openSheet(tab) {
    S.sheetTab = tab;
    document.querySelectorAll("#dock button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    const body = $("#sheetBody");
    body.innerHTML = { bottles: bottlesTab, friends: friendsTab, drops: dropsTab }[tab]();
    $("#sheet").classList.add("open");
    bindSheet(tab);
  }
  function closeSheet() { $("#sheet").classList.remove("open"); S.sheetTab = null; document.querySelectorAll("#dock button").forEach((b) => b.classList.remove("active")); }
  $("#sheet .grab").onclick = closeSheet;
  document.querySelectorAll("#dock button").forEach((b) => b.addEventListener("click", () => {
    const tab = b.dataset.tab;
    if (tab === "send") return sendFlow({});
    if (S.sheetTab === tab) return closeSheet();
    if (!S.me && tab !== "drops") return needSignIn(() => openSheet(tab), WHY[tab]);
    openSheet(tab);
  }));

  // ---------- map engine ----------
  const mapEl = $("#map"), world = $("#world"), layer = $("#layer"), base = $("#base");
  const view = { s: 0.4, x: 0, y: 0 };
  const limits = () => ({ min: Math.max(innerWidth / PROJ.W, innerHeight / PROJ.H), max: 5 });
  function clampView() {
    const { min, max } = limits();
    view.s = Math.min(max, Math.max(min, view.s));
    const w = PROJ.W * view.s, h = PROJ.H * view.s;
    view.x = Math.min(0, Math.max(innerWidth - w, view.x));
    view.y = Math.min(0, Math.max(innerHeight - h, view.y));
  }
  let raf = 0;
  function apply() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0; clampView();
      world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
      const inv = Math.min(1 / view.s, 3.2) * (view.s < 0.3 ? 0.75 : 1);
      world.style.setProperty("--inv", inv.toFixed(3));
      world.classList.toggle("far", view.s < 0.32);
    });
  }
  function zoomAt(f, cx, cy) {
    const { min, max } = limits();
    const ns = Math.min(max, Math.max(min, view.s * f));
    const k = ns / view.s;
    view.x = cx - (cx - view.x) * k; view.y = cy - (cy - view.y) * k; view.s = ns; apply();
  }
  function centerOn(lng, lat, s) {
    if (s) view.s = s;
    const [x, y] = P(lng, lat);
    view.x = innerWidth / 2 - x * view.s; view.y = innerHeight / 2 - y * view.s; apply();
  }
  // Fit the view to the partner venues, clear of the header (top) and the dock (bottom).
  function fitVenues() {
    const vs = ((S.cfg && S.cfg.venues) || []).filter((v) => v.lat && v.lng);
    if (!vs.length) return false;
    const xy = vs.map((v) => P(v.lng, v.lat));
    const x0 = Math.min(...xy.map((p) => p[0])), x1 = Math.max(...xy.map((p) => p[0]));
    const y0 = Math.min(...xy.map((p) => p[1])), y1 = Math.max(...xy.map((p) => p[1]));
    const padX = 140, top = 190, bottom = 170;
    const sc = Math.max(limits().min, Math.min(3, (innerWidth - 2 * padX) / Math.max(40, x1 - x0), (innerHeight - top - bottom) / Math.max(40, y1 - y0)));
    view.s = sc;
    view.x = innerWidth / 2 - ((x0 + x1) / 2) * sc;
    view.y = top + (innerHeight - top - bottom) / 2 - ((y0 + y1) / 2) * sc;
    apply();
    return true;
  }
  const pts = new Map(); let pinch = null, moved = false, downAt = 0;
  mapEl.addEventListener("pointerdown", (e) => {
    mapEl.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = false; downAt = Date.now();
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; }
    mapEl.classList.add("dragging");
  });
  mapEl.addEventListener("pointermove", (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const nx = e.clientX, ny = e.clientY;
    if (pts.size === 1) { view.x += nx - p.x; view.y += ny - p.y; if (Math.abs(nx - p.x) + Math.abs(ny - p.y) > 2) moved = true; apply(); }
    p.x = nx; p.y = ny;
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt(d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch.d = d; moved = true;
    }
  });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) mapEl.classList.remove("dragging"); };
  mapEl.addEventListener("pointerup", up); mapEl.addEventListener("pointercancel", up);
  mapEl.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
  mapEl.addEventListener("dblclick", (e) => zoomAt(1.8, e.clientX, e.clientY));
  addEventListener("resize", apply);
  layer.addEventListener("click", (e) => {
    if (moved) return;
    const mk = e.target.closest("[data-venue],[data-drop]");
    if (!mk) return;
    if (mk.dataset.drop) dropCard(mk.dataset.drop); else venueCard(mk.dataset.venue);
  });

  function setDayNight() {
    const night = isNight();
    document.body.classList.toggle("night", night); document.body.classList.toggle("day", !night);
    const src = BASE + "/map/basemap_" + (night ? "night" : "day") + ".svg";
    if (!base.src.endsWith(src)) base.src = src;
    base.width = PROJ.W; base.height = PROJ.H; world.style.width = PROJ.W + "px"; world.style.height = PROJ.H + "px";
  }

  function renderMap() {
    if (!S.cfg) return;
    const night = isNight();
    const bag = (S.me && S.me.bag) || [];
    const waiting = bag.filter((b) => b.status === "waiting");
    let h = "";
    for (const [n, x, y] of DISTRICTS) h += `<div class="mk district" style="left:${x}px;top:${y}px"><div class="lbl">${esc(n)}</div></div>`;
    for (const l of A.LANDMARKS) {
      const [x, y] = P(l.lng, l.lat);
      h += `<div class="mk landmark" style="left:${x}px;top:${y}px">${A.landmarkArt(l.art, 68)}<div class="lbl">${esc(l.name)}</div></div>`;
    }
    for (const v of S.cfg.venues) {
      const [x, y] = P(v.lng, v.lat);
      const glow = S.cfg.glow && S.cfg.glow[v.id];
      const can = waiting.some((b) => claimableAt(b, v));
      h += `<div class="mk venue${can ? " claimable" : ""}" data-venue="${v.id}" style="left:${x}px;top:${y}px">` +
        (glow ? `<div class="halo ${glow}"></div>` : "") +
        `<div class="art">${A.venueArt(v.art, night || !!glow, 58)}</div><div class="lbl">${esc(v.name)}</div></div>`;
    }
    for (const d of S.cfg.drops || []) {
      if (d.hidden || !d.venueId) continue;
      const v = venueOf(d.venueId); if (!v) continue;
      const [x, y] = P(v.lng, v.lat);
      const label = d.state === "live" ? `<b>${d.left} of ${d.bottles}</b><small>ends ${timeShort(d.end)}</small>` : `<b>Drop ${timeShort(d.start)}</b><small>${new Date(d.start).toLocaleDateString("en-NG", { weekday: "short", timeZone: "Africa/Lagos" })}</small>`;
      h += `<div class="mk drop ${d.state}" data-drop="${d.id}" style="left:${x}px;top:${y - 70}px"><div class="bubble">${dropArt(d, 34)}<div>${label}</div></div><div class="tail"></div></div>`;
    }
    layer.innerHTML = h;
    apply();
  }

  // ---------- top chrome ----------
  function renderChrome() {
    const me = S.me;
    $("#meBtn").innerHTML = me ? A.avatar(me.player.avatar, 52) : A.avatar({ skin: "s3", hair: "low", face: "smile", outfit: "ankara" }, 52);
    // Being outside shows as a halo on your own avatar. Tap it to switch it on or off (in the Me card).
    $("#meBtn").classList.toggle("outside", !!(me && me.light));

    const out = me ? me.circle.filter((c) => c.out) : [];
    // Friends outside live in the Friends tab, never on the map. The dock shows how many.
    const nOut = me ? me.circle.filter((c) => c.out).length : 0;
    $("#friendCount").textContent = nOut || "";

    const tickets = me ? me.tickets : [];
    $("#ticketBar").innerHTML = tickets.map((t) => {
      const bc = beaconOf(t.beacon);
      if (t.via === "qr") return `<div class="ticket"><div class="beacon" style="background:${bc.hex}"></div><div class="grow"><b>Your ${esc(ticketName(t))} is on its way</b><div class="muted">The waiter who scanned you is bringing it.</div></div></div>`;
      return `<div class="ticket"><div class="beacon" style="background:${bc.hex}"></div><div class="grow"><b>Your ${esc(ticketName(t))} is on its way</b><div class="muted">Code ${esc(t.code)} · tap Glow when you see the waiter</div></div>` +
        `<button class="btn small gold" data-glow="${t.ticketId}">Glow</button></div>`;
    }).join("");
    $("#ticketBar").querySelectorAll("[data-glow]").forEach((b) => (b.onclick = () => glow(tickets.find((t) => t.ticketId === b.dataset.glow))));
    const waiting = me ? me.bag.filter((b) => b.status === "waiting").length : 0;
    $("#bagCount").textContent = waiting || "";
    const live = (S.cfg && S.cfg.drops || []).filter((d) => d.state === "live").length;
    $("#dropCount").textContent = live || "";
  }
  $("#meBtn").onclick = () => (S.me ? meCard() : signIn(() => meCard(), WHY.me));

  // ---------- glow ----------
  let wake = null;
  async function glow(t) {
    if (!t) return;
    const bc = beaconOf(t.beacon), g = $("#glow");
    g.style.background = bc.hex;
    g.innerHTML = `<div class="name">${esc(S.me.player.name)}</div><div style="margin:18px 0">${t.item ? A.prize(t.icon, 120) : A.bottle(t.wine, 150)}</div><div class="hint">Hold your phone up. Code ${esc(t.code)}</div>` +
      `<div style="margin-top:22px;display:flex;gap:10px"><button class="btn ghost" data-rec>Got it</button><button class="btn ghost" data-close>Close</button></div>`;
    g.classList.add("open");
    try { wake = await navigator.wakeLock.request("screen"); } catch {}
    g.querySelector("[data-close]").onclick = stop;
    g.querySelector("[data-rec]").onclick = async () => { await api("received", { ticketId: t.ticketId, venueId: t.venueId }); stop(); await loadMe(); toast("Enjoy it. Cheers."); };
    function stop() { g.classList.remove("open"); try { wake && wake.release(); } catch {} }
  }

  // ---------- sign in ----------
  // Nothing asks for a number until it needs one. Each ask says why, in a line.
  const WHY = {
    bottles: "Bottles people send you are kept on your number.",
    friends: "Your people are the ones already in your phone.",
    me: "Your status and avatar live on your number.",
    pay: "Last step. So they know it's from you.",
    drop: "So it comes to your table.",
    switch: "Your bottles and people come with you."
  };
  function needSignIn(next, why) { if (S.me) return next(); signIn(next, why); }
  function signIn(next, why) {
    modal(`<h2>Your WhatsApp number</h2><p class="muted">${why ? esc(why) + " " : ""}We'll send you a code.</p>
      <label class="field"><span>Number</span>${phoneField("ph")}</label>
      <button class="btn block" id="go">Send code</button><p class="muted" id="msg"></p>`, (c) => {
      wirePhone(c, "ph");
      c.querySelector("#go").onclick = async () => {
        const phone = phoneOf(c, "ph");
        if (!c.querySelector("#ph").value.trim()) return flag(c.querySelector("#ph"), "Add your WhatsApp number.");
        if (!e164(phone)) return flag(c.querySelector("#ph"), errMsg("phone"));
        c.querySelector("#go").disabled = true;
        note(c, ""); const r = await api("auth/start", { phone });
        c.querySelector("#go").disabled = false;
        if (!r.ok) return PHONE_ERR.includes(r.error) || r.error === "send_failed" || r.error === "not_on_whatsapp" ? flag(c.querySelector("#ph"), errMsg(r.error)) : fail(c, errMsg(r.error));
        codeStep(phone, r.devCode, next);
      };
    });
  }
  function codeStep(phone, devCode, next) {
    modal(`<h2>Enter the code</h2><p class="muted">Sent to ${esc(phone)} on WhatsApp.${devCode ? " Test code: " + devCode : ""}</p>
      <label class="field"><span>Code</span><input id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 digits"></label>
      <button class="btn block" id="go">Continue</button><p class="muted" id="msg"></p>`, (c) => {
      c.querySelector("#go").onclick = async () => {
        const cd = c.querySelector("#cd");
        if (cd.value.replace(/\D/g, "").length < 6) return flag(cd, "Enter the 6-digit code from WhatsApp.");
        const r = await api("auth/verify", { phone, code: cd.value });
        if (!r.ok) return CODE_ERR.includes(r.error) ? flag(cd, errMsg(r.error)) : fail(c, errMsg(r.error));
        S.token = r.token; LS.set("outside.token", r.token); S.me = null;
        if (r.needsProfile) { S.suggestedName = r.suggestedName || ""; return profileStep(next); }
        await afterSignIn(); closeModal(); next && next();
      };
    });
  }
  const profileOpen = () => $("#modal").classList.contains("open") && $("#modalCard").dataset.kind === "profile";
  function profileStep(next, edit) {
    const cur = (S.me && S.me.player.avatar) || { skin: "s3", hair: "low", face: "smile", outfit: "ankara" };
    const av = { ...cur };
    const opts = (key, map) => Object.entries(map).map(([k, v]) =>
      key === "skin" ? `<button class="swatch${av.skin === k ? " on" : ""}" data-k="skin" data-v="${k}" style="background:${v}" aria-label="Skin tone"></button>`
        : `<button class="${av[key] === k ? "on" : ""}" data-k="${key}" data-v="${k}">${esc(typeof v === "string" ? v : v.label)}</button>`).join("");
    modal(`<h2>${edit ? "Your name and avatar" : "One more thing"}</h2>
      <label class="field"><span>First name</span><input id="nm" autocomplete="given-name" maxlength="24" value="${edit ? esc(S.me.player.name) : esc(S.suggestedName || "")}"></label>
      <div class="av-builder"><div class="av-preview" id="avp">${A.avatar(av, 120)}</div>
      <div class="opts">${opts("skin", A.SKINS)}</div><div class="opts">${opts("hair", A.HAIRS)}</div>
      <div class="opts">${opts("face", A.FACES)}</div><div class="opts">${opts("outfit", A.OUTFITS)}</div></div>
      <button class="btn block" id="go" style="margin-top:14px">${edit ? "Save" : "That's me"}</button><p class="muted" id="msg"></p>`, (c) => {
      c.dataset.kind = "profile";
      c.querySelectorAll(".opts button").forEach((b) => (b.onclick = () => {
        av[b.dataset.k] = b.dataset.v;
        b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
        c.querySelector("#avp").innerHTML = A.avatar(av, 120);
      }));
      c.querySelector("#go").onclick = async () => {
        if (!c.querySelector("#nm").value.trim() && !edit) return flag(c.querySelector("#nm"), "Add your first name.");
        const body = { name: c.querySelector("#nm").value || (edit ? S.me.player.name : ""), avatar: av };
        const r = await api("profile", body);
        if (!r.ok) return r.error === "name" ? flag(c.querySelector("#nm"), "Add your first name.") : fail(c, errMsg(r.error));

        await afterSignIn(); closeModal(); next && next();
      };
    });
  }
  async function afterSignIn() {
    await loadMe();
    if (S.invite) { await api("contacts", { hashes: [S.invite], invite: true }); S.invite = null; await loadMe(); toast("Added to your people."); }
    if (S.pendingBottle) bottleIntro(S.pendingBottle);
  }

  // ---------- data ----------
  async function loadConfig() {
    const r = await api("config");
    if (r.ok) { S.cfg = r; renderMap(); renderChrome(); }
  }
  // poll: the 30-second refresh. It updates what's on screen and never opens anything,
  // so it can't wipe a form someone is filling in.
  async function loadMe(poll) {
    if (!S.token) { S.me = null; renderChrome(); return; }
    const r = await api("me");
    if (r.ok && r.token) { S.token = r.token; LS.set("outside.token", r.token); }
    if (r.ok) S.me = r;
    else if (r.error === "profile") { S.me = null; if (!poll && !profileOpen()) profileStep(); }
    else S.me = null;
    renderChrome(); renderMap();
    // Redraw an open sheet, unless someone is typing in it.
    if (S.sheetTab && !(poll && $("#sheet").contains(document.activeElement))) openSheet(S.sheetTab);
    if (S.me) pushSync();
  }

  // ---------- bottles ----------
  function bottleIntro(id) {
    S.pendingBottle = null;
    const b = S.me && S.me.bag.find((x) => x.id === id);
    if (!b) return;
    const spots = S.cfg.venues.filter((v) => claimableAt(b, v));
    modal(`<div class="reveal">${photo(b.wine, 260)}<div class="wn">${esc(wineOf(b.wine).label)}<small>${esc(wineOf(b.wine).kind || "")}</small></div></div>
      <h2>${esc(b.from)}'s sending an Amabile to your table.</h2><p>For next time you're outside.</p>
      ${b.note ? `<p class="note" style="font-family:var(--serif);font-size:20px;color:var(--wine)">"${esc(b.note)}"</p>` : ""}
      <p class="muted">Claim it at any of the ${spots.length} spots outlined in gold on the map. When you're there, open Andiamo and tap Claim it.</p>
      <button class="btn block" data-x2>See the spots</button>${pingCard("intro")}`, (c) => {
      c.querySelector("[data-x2]").onclick = () => { closeModal(); focusSpots(spots); };
      bindPing(c, () => { const p = c.querySelector(".ping"); if (p) p.remove(); });
    });
  }
  function focusSpots(spots) {
    if (!spots.length) return;
    const lat = spots.reduce((n, v) => n + v.lat, 0) / spots.length, lng = spots.reduce((n, v) => n + v.lng, 0) / spots.length;
    centerOn(lng, lat, 0.75);
  }
  function bottlesTab() {
    const me = S.me; const bag = me.bag, sent = me.sent || [];
    const items = bag.map((b) => `<div class="bagcard"><div class="pic">${photo(b.wine, 132)}</div><div class="info">
      <div class="from">From <b>${esc(b.from)}</b></div><div class="wname">${esc(wineOf(b.wine).label)}</div>
      <div class="meta">${esc([wineOf(b.wine).kind, b.kind === "gift" ? bandName(b.band) + " spots and below" : ""].filter(Boolean).join(" · "))}</div>
      ${b.note ? `<div class="q">"${esc(b.note)}"</div>` : ""}
      ${b.status === "waiting"
        ? `<div class="acts"><button class="btn small" data-claim="${b.id}">Claim it</button><button class="btn small gold" data-qr="${b.id}">Show QR</button></div>
           <div class="links"><button class="link" data-spots="${b.id}">Where to claim</button><span>·</span><button class="link" data-more="${b.id}">More</button></div>`
        : `<div class="acts one"><span class="tag gold">On its way</span></div><div class="links"><button class="link" data-cancel="${b.id}">Not here any more</button></div>`}
      </div></div>`).join("");
    const s2 = sent.slice(0, 12).map((x) => {
      const isLink = x.via === "link" && x.giftUrl, isSelf = x.selfSend && x.giftUrl;
      return `<div class="item"><div class="bt ph">${photo(x.wine, 56)}</div><div class="grow"><h4>${isLink ? (x.forLabel ? "To " + esc(x.forLabel) : "Your card") : "To " + esc(x.toMasked)}</h4><div class="sub">${esc(wineOf(x.wine).name)}${isLink ? " · not opened yet" : isSelf ? selfLine(x) : ""}</div></div>` +
        (isLink || isSelf ? `<button class="btn small${isSelf && (x.shared || x.opened) ? " ghost" : " gold"}" data-gs="${x.id}">${isLink ? "Send it" : selfBtn(x)}</button>` : `<span class="tag${x.status === "Delivered" ? " gold" : ""}">${esc(x.status)}</span>`) + `</div>`;
    }).join("");
    return `<h2>My bottles</h2>${pingCard("bottles")}<h3>Sent to you</h3>${items ? `<div class="bags">${items}</div>${walletCard()}` : `<div class="empty"><div class="art">${A.bottle("rosato", 80, false)}</div>No bottles waiting. When someone sends you one, it lands here.</div>`}
      <h3>You sent</h3>${s2 ? `<div class="list">${s2}</div>` : `<p class="muted">Nothing yet. Tap Send to put a bottle on a friend's table.</p>`}`;
  }
  // The bottles card in Apple Wallet or Google Wallet. It comes up on the lock screen near a spot that can serve them.
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = () => /Android/i.test(navigator.userAgent);
  // Which Wallet buttons to show: the phone's own, or both where we can't tell. None once the card is on the phone.
  function walletKinds() {
    const w = (S.cfg && S.cfg.wallet) || {}, mine = (S.me && S.me.wallet) || {};
    const apple = w.apple && !mine.apple, google = (w.google || mine.googleOffer) && !mine.google;
    if (isIOS()) return apple ? ["apple"] : [];
    if (isAndroid()) return google ? ["google"] : [];
    return [apple && "apple", google && "google"].filter(Boolean);
  }
  // Apple's and Google's own buttons, as their guidelines ask: never redrawn.
  const BADGE = { apple: { src: "/outside/img/wallet/add-to-apple-wallet.svg", alt: "Add to Apple Wallet" }, google: { src: "/outside/img/wallet/add-to-google-wallet.svg", alt: "Add to Google Wallet" } };
  function walletCard() {
    const ks = walletKinds(); if (!ks.length) return "";
    return `<div class="wallet"><div class="wtop"><div class="wpass" aria-hidden="true"><i>Andiamo!</i><span></span><span></span><b><svg viewBox="0 0 21 21"><path fill="#2B1E17" d="M0 0h7v7H0zM2 2v3h3V2zM14 0h7v7h-7zm2 2v3h3V2zM0 14h7v7H0zm2 2v3h3v-3zM9 0h2v2H9zm0 4h3v3H9zm-1 4h2v3H8zm4 1h3v2h-3zm5 -1h2v2h-2zM9 13h2v2H9zm4 0h2v4h-2zm4 1h4v2h-4zM9 17h3v4H9zm8 2h4v2h-4z"/></svg></b></div>
      <div class="grow"><b>Keep your bottles in your Wallet.</b><small>It comes up on your lock screen when you're near a spot that can serve them.</small></div></div>
      <div class="wbadges">${ks.map((k) => `<button class="wbadge" data-wallet="${k}" aria-label="${BADGE[k].alt}"><img src="${BADGE[k].src}" alt="${BADGE[k].alt}" onerror="this.parentNode.classList.add('txt');this.replaceWith(document.createTextNode(this.alt))"></button>`).join("")}</div></div>`;
  }
  async function addToWallet(k, btn) {
    btn.disabled = true;
    const r = await api("wallet", { kind: k });
    btn.disabled = false;
    if (!r.ok) return toast(r.error === "wallet_off" ? "Wallet isn't available just yet." : "Couldn't open Wallet. Try again.");
    location.href = r.url;
  }

  function bindSheet(tab) {
    const body = $("#sheetBody");
    body.querySelectorAll("[data-wallet]").forEach((b) => (b.onclick = () => addToWallet(b.dataset.wallet, b)));
    body.querySelectorAll("[data-claim]").forEach((b) => (b.onclick = () => claimFlow(b.dataset.claim)));
    body.querySelectorAll("[data-qr]").forEach((b) => (b.onclick = () => qrFlow(b.dataset.qr)));
    body.querySelectorAll("[data-gs]").forEach((b) => (b.onclick = () => { closeSheet(); const x = S.me.sent.find((y) => y.id === b.dataset.gs); x && x.selfSend ? selfShare(x) : giftShare(x); }));
    body.querySelectorAll("[data-spots]").forEach((b) => (b.onclick = () => {
      const x = S.me.bag.find((y) => y.id === b.dataset.spots); closeSheet(); whereToClaim(x);
    }));
    body.querySelectorAll("[data-more]").forEach((b) => (b.onclick = () => bottleMore(b.dataset.more)));
    body.querySelectorAll("[data-cancel]").forEach((b) => (b.onclick = async () => { const r = await api("cancel", { bottleId: b.dataset.cancel }); if (!r.ok) toast(errMsg(r.error)); await loadMe(); }));
    bindPing(body, () => openSheet(S.sheetTab));
    if (tab === "friends") bindFriends(body);
    if (tab === "drops") body.querySelectorAll("[data-dropgo]").forEach((b) => (b.onclick = () => dropCard(b.dataset.dropgo)));
  }
  function bottleMore(id) {
    modal(`<h2>This bottle</h2><button class="btn block ghost" id="pass">Pass it on to someone</button><p></p><button class="btn block ghost" id="no">Not for me</button>`, (c) => {
      c.querySelector("#no").onclick = async () => { const r = await api("decline", { bottleId: id }); closeModal(); if (!r.ok) toast(errMsg(r.error)); else toast("Done. They won't be told."); loadMe(); };
      c.querySelector("#pass").onclick = () => modal(`<h2>Pass it on</h2><label class="field"><span>Their number</span>${phoneField("to")}</label><button class="btn block" id="go">Pass it on</button><p class="muted" id="msg"></p>`, (c2) => {
        wirePhone(c2, "to");
        c2.querySelector("#go").onclick = async () => {
          const to = phoneOf(c2, "to");
          if (!e164(to)) return flag(c2.querySelector("#to"), c2.querySelector("#to").value.trim() ? errMsg("phone") : "Add their number.");
          const r = await api("pass", { bottleId: id, to });
          if (!r.ok) return PHONE_ERR.includes(r.error) ? flag(c2.querySelector("#to"), errMsg(r.error)) : fail(c2, errMsg(r.error));
          closeModal(); toast("Passed on."); loadMe();
        };
      });
    });
  }

  // ---------- claim ----------
  function whereFields() {
    return `<label class="field"><span>Table number, if there's one</span><input id="tb" maxlength="12" inputmode="text" placeholder="e.g. 7"></label>
      <label class="field"><span>Where are you sitting?</span><input id="sp" maxlength="40" placeholder="by the DJ, white shirt"></label>`;
  }
  // Claim it: find which spot they're at first. Once that's settled, the table details and Bring it here.
  async function claimFlow(id, venueId) {
    const b = S.me.bag.find((x) => x.id === id); if (!b) return;
    closeSheet();
    modal(`<h2>Finding you...</h2><p class="muted">One moment.</p>`);
    const loc = await getLocation();
    if (!loc) return modal(`<h2>Turn on location</h2><p class="muted">Allow location for this site, then try again. Or call a waiter over and show your QR.</p>
      <button class="btn block" id="again">Try again</button><p></p><button class="btn block ghost" id="qr">Show your QR</button>`, (c) => {
      c.querySelector("#again").onclick = () => claimFlow(id, venueId);
      c.querySelector("#qr").onclick = () => qrFlow(id, false);
    });
    const r = await api("where", { ...loc, venueId });
    if (r.ok) return claimForm(b, r.venue.id, loc);
    if (r.error === "choose") return chooseVenue(r.venues, (vid) => claimForm(b, vid, loc), () => notHereYet(b));
    if (r.error === "confirm") return confirmVenue(r.venue, () => claimForm(b, r.venue.id, loc), () => notHereYet(b));
    if (r.error === "no_venue") return noSpotHere(b);
    closeModal(); toast(errMsg(r.error));
  }
  function claimForm(b, venueId, loc) {
    const id = b.id;
    modal(`<h2>Bring it here</h2>${whereFields()}
      <label class="toggle"><input type="checkbox" id="quiet"> Quiet claim: don't tell my people I'm outside</label>
      <button class="btn block" id="go">Bring it here</button><p class="muted" id="msg"></p>
      <p class="muted" style="text-align:center">Or call a waiter over: <button class="link" id="qr">show your QR</button></p>`, (c) => {
      c.querySelector("#qr").onclick = () => qrFlow(id, c.querySelector("#quiet").checked);
      // Sends the claim; when we ask which spot they're at, the answer re-sends the same details with that spot.
      const send = async (body) => {
        const r = await api("claim", body);
        if (r.ok) { closeModal(); await loadMe(); const t = S.me.tickets.find((x) => x.bottleId === id); toast("It's coming. Tap Glow when you see the waiter."); if (t) setTimeout(() => glowPrompt(t), 400); return r; }
        if (r.error === "choose") { chooseVenue(r.venues, (vid) => send({ ...body, venueId: vid }), () => notHereYet(b)); return r; }
        if (r.error === "confirm") { confirmVenue(r.venue, () => send({ ...body, venueId: r.venue.id }), () => notHereYet(b)); return r; }
        if (r.error === "band") { topupStep(b, r, body); return r; }
        if (r.error === "no_venue") { noSpotHere(b); return r; }
        const msg = r.error === "not_stocked" ? `${r.venue ? esc(r.venue.name) : "This venue"} doesn't stock ${esc(wineOf(b.wine).name)}. Your bottle keeps waiting.` : errMsg(r.error);
        if ($("#modalCard").contains(c.querySelector("#go"))) fail(c, msg); else toast(msg);
        return r;
      };
      c.querySelector("#go").onclick = async () => {
        const go = c.querySelector("#go"); go.disabled = true;
        await send({ bottleId: id, ...loc, venueId, table: c.querySelector("#tb").value, spot: c.querySelector("#sp").value, quiet: c.querySelector("#quiet").checked });
        go.disabled = false;
      };
    });
  }
  // Claim it found no spot on Andiamo where they are. Most people tap it from anywhere, so say why, then ask.
  function noSpotHere(b) {
    modal(`<h2>No Andiamo spot here</h2><p class="muted">Your bottle comes to your table at a spot on Andiamo. We couldn't find one where you are.</p>
      <h3>Are you out right now?</h3><p class="muted">At a bar, lounge or restaurant.</p>
      <button class="btn block" id="yes">Yes, I'm out</button><p></p><button class="btn block ghost" id="no">No, show me where to claim it</button>`, (c) => {
      c.querySelector("#yes").onclick = () => notHereYet(b);
      c.querySelector("#no").onclick = () => whereToClaim(b);
    });
  }
  // Where a bottle can be claimed: the spots that pour it at its level or below, nearest first.
  const kmBetween = (a, v) => { const R = 6371, r = Math.PI / 180, dLa = (v.lat - a.lat) * r, dLo = (v.lng - a.lng) * r;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(v.lat * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const kmText = (k) => k < 1 ? Math.max(100, Math.round(k * 10) * 100) + " m" : (k < 10 ? k.toFixed(1) : Math.round(k)) + " km";
  async function whereToClaim(b) {
    if (!b) return;
    const w = wineOf(b.wine).name, ok = S.cfg.venues.filter((v) => claimableAt(b, v));
    // None at its level: the spots a level up still serve it with a top-up.
    const up = ok.length ? [] : S.cfg.venues.filter((v) => v.wines.includes(b.wine));
    const all = ok.length ? ok : up;
    if (!all.length) return modal(`<h2>Nowhere to claim it yet</h2><p class="muted">No spot on Andiamo pours ${esc(w)} yet. We're adding spots all the time. Your bottle keeps waiting.</p>
      <button class="btn block ghost" data-x4>OK</button>`, (c) => (c.querySelector("[data-x4]").onclick = closeModal));
    let loc = S.lastLoc && Date.now() - S.lastLoc.at < 10 * 60e3 ? S.lastLoc : null;
    if (!loc) { modal(`<h2>Finding spots...</h2><p class="muted">One moment.</p>`); loc = await getLocation(); }
    const list = all.map((v) => ({ v, km: loc ? kmBetween(loc, v) : null })).sort((x, y) => (x.km == null ? 0 : x.km - y.km) || x.v.name.localeCompare(y.v.name));
    const far = loc && list[0].km > 25;
    const say = far ? `The nearest spot that pours ${esc(w)} is ${kmText(list[0].km)} away. Your bottle keeps waiting.`
      : up.length ? `No ${esc(bandName(b.band))} spot pours ${esc(w)} yet. These do, a level up: top up there and it comes to your table.`
      : `Spots that pour ${esc(w)}${loc ? ", nearest first" : ""}. Go to one and tap Claim it at your table.`;
    modal(`<h2>${far ? "Nowhere near you yet" : "Where to claim it"}</h2><p class="muted">${say}</p>
      <div class="list">${list.slice(0, 12).map(({ v, km }) => `<button class="item" data-v="${v.id}"><div class="bt">${A.venueArt(v.art, isNight(), 40)}</div><div class="grow" style="text-align:left"><h4>${esc(v.name)}</h4><div class="sub">${esc(v.area)}${km != null ? " · " + kmText(km) : ""}</div></div></button>`).join("")}</div>
      <p></p><button class="btn block ghost" id="onmap">See them on the map</button>`, (c) => {
      c.querySelectorAll("[data-v]").forEach((x) => (x.onclick = () => venueCard(x.dataset.v)));
      c.querySelector("#onmap").onclick = () => { closeModal(); focusSpots(list.map((x) => x.v)); };
    });
  }
  // The spot they're at isn't on Andiamo: it pops up for the guest to show the waiter. Nothing for the guest to do.
  // Never shows what was paid. Many of these spots already sell Amabile, so it tells them the bottle is theirs to serve.
  function notHereYet(b) {
    const url = "https://andiamo.ng/venue";
    modal(`<h2>Show this to the waiter</h2><p class="muted">This place isn't on Andiamo yet. Your bottle keeps waiting.</p>
      <div class="askcard"><div class="askk">For the manager</div>
        <p class="askh">This table has a bottle of ${esc(wineOf(b.wine).label)}, already paid for.</p>
        <p>Serve it and you get your full menu price. You just need to be on Andiamo. Already selling Amabile? This is money you're leaving on the table.</p>
        <div class="qrbox">${qrSvg(url)}</div><div class="askurl">andiamo.ng/venue</div></div>
      <button class="btn block ghost" data-x3>Find a spot to claim it</button>`, (c) => {
      c.querySelector("[data-x3]").onclick = () => whereToClaim(b);
    });
  }
  function chooseVenue(list, done, none) {
    modal(`<h2>Which one are you at?</h2><div class="list">${list.map((v) => `<button class="item" data-v="${v.id}"><div class="bt">${A.venueArt(v.art, isNight(), 40)}</div><div class="grow" style="text-align:left"><h4>${esc(v.name)}</h4><div class="sub">${esc(v.area)}</div></div></button>`).join("")}</div>
      ${none ? `<p></p><button class="btn block ghost" id="none">I'm somewhere else</button>` : ""}`, (c) => {
      c.querySelectorAll("[data-v]").forEach((b) => (b.onclick = () => { closeModal(); done(b.dataset.v); }));
      if (none) c.querySelector("#none").onclick = () => { closeModal(); none(); };
    });
  }
  // Exactly one spot nearby: make sure they're in it, not next door.
  function confirmVenue(v, yes, no) {
    modal(`<h2>Are you at ${esc(v.name)}?</h2><div class="list"><div class="item"><div class="bt">${A.venueArt(v.art, isNight(), 40)}</div><div class="grow" style="text-align:left"><h4>${esc(v.name)}</h4><div class="sub">${esc(v.area)}</div></div></div></div>
      <p></p><button class="btn block" id="yes">Yes, bring it to my table</button><p></p><button class="btn block ghost" id="no">No, I'm somewhere else</button>`, (c) => {
      c.querySelector("#yes").onclick = () => { closeModal(); yes(); };
      c.querySelector("#no").onclick = () => { closeModal(); no(); };
    });
  }
  function topupStep(b, r, body) {
    modal(`<h2>Top up to claim here</h2><p>This bottle fits ${esc(bandName(b.band))} spots. ${esc(r.venue.name)} is ${esc(spotName(r.venue.band))}.</p>
      <p><b>Top up ${naira(r.topup)}</b> and it comes to your table now, or keep it for another night.</p>
      <button class="btn block" id="go">Top up ${naira(r.topup)}</button><p></p><button class="btn block ghost" data-x3>Keep it for another night</button>`, (c) => {
      c.querySelector("[data-x3]").onclick = closeModal;
      c.querySelector("#go").onclick = async () => {
        const t = await api("topup", { ...body, venueId: r.venue.id });
        if (!t.ok) return toast(errMsg(t.error));
        location.href = t.authorization_url;
      };
    });
  }
  // ---------- a bottle sent as a link (Instagram, Snapchat) ----------
  // The sender gets a sealed card to send themselves. Opening it is staged; keeping it hands over to WhatsApp.
  // Snapchat's Creative Kit for the web: no app id needed. The card's page carries the sticker (snapchat:sticker).
  function snapButtons() {
    const els = document.getElementsByClassName("snapchat-creative-kit-share");
    if (window.snap && window.snap.creativekit) { try { window.snap.creativekit.initalizeShareButtons(els); } catch {} return; }
    if (document.getElementById("snapkit")) return;
    window.snapKitInit = () => { try { window.snap.creativekit.initalizeShareButtons(document.getElementsByClassName("snapchat-creative-kit-share")); } catch {} };
    const sc = document.createElement("script"); sc.id = "snapkit"; sc.src = "https://sdk.snapkit.com/js/v1/create.js";
    sc.onerror = () => [...document.querySelectorAll(".snapwrap")].forEach((w) => w.remove());
    document.head.appendChild(sc);
  }
  // A self-send goes from the sender's own WhatsApp. We know they tapped send, and when the link was opened.
  const selfLine = (x) => x.opened ? " · Opened" : x.shared ? " · Sent by you" : x.unreached ? " · couldn't reach them on WhatsApp" : " · Not sent yet";
  const selfBtn = (x) => x.shared || x.opened ? "Resend" : x.unreached ? "Send it yourself" : "Send it";
  function markShared(b) {
    if (!b || !b.id) return;
    api("shared", { bottleId: b.id }).catch(() => {});
    const x = S.me && (S.me.sent || []).find((y) => y.id === b.id);
    if (x) x.shared = true;
  }
  // The sender sends it themselves on WhatsApp. The link opens it; only the number it was sent to can keep it.
  function selfShare(b) {
    if (!b || !b.giftUrl) return;
    const url = b.giftUrl, text = "I'm sending an Amabile to your table. For next time you're outside. " + url;
    const wa = "https://wa.me/" + (b.waTo || "") + "?text=" + encodeURIComponent(text);
    modal(`<div class="sealcard">${A.envelope.closed()}</div>
      <h2>${b.shared || b.opened ? "Resend it to " + esc(b.toMasked || "them") : "Send it to " + esc(b.toMasked || "them") + (b.unreached ? " yourself" : "")}</h2>
      <p class="muted">${b.opened ? "They've opened it. Send the link again if they need it. Only their number can open it." : b.shared ? "Send the link again if they didn't get it. Only their number can open it." : b.unreached ? "We couldn't reach them on WhatsApp. Send them this link and they'll have it. Only their number can open it." : "Send them this link on WhatsApp. Only their number can open it."}</p>
      <div class="sharegrid"><a class="btn block" id="wa" href="${esc(wa)}" target="_blank" rel="noopener">Send on WhatsApp</a>
        <button class="btn block ghost" id="cp">Copy link</button></div>`, (c) => {
      c.querySelector("#wa").addEventListener("click", () => markShared(b));
      c.querySelector("#cp").onclick = async () => { markShared(b); try { await navigator.clipboard.writeText(url); toast("Copied."); } catch { prompt("Copy this link", url); } };
    });
  }
  function giftShare(b) {
    if (!b || !b.giftUrl) return;
    const url = b.giftUrl;
    modal(`<div class="sealcard">${A.envelope.closed()}</div>
      <h2>Send it to ${b.forLabel ? esc(b.forLabel) : "them"}</h2>
      <p class="muted">Send this card to ${b.forLabel ? esc(b.forLabel) : "them"} on Instagram or Snapchat. It can only be claimed once, so send it to ${b.forLabel ? esc(b.forLabel) : "them"} only.</p>
      <div class="sharegrid"><button class="btn block" id="sh">Send the card</button>
        <div class="snapwrap"><div class="snapchat-creative-kit-share" data-theme="light" data-size="large" data-text="true" data-share-url="${esc(url)}"></div></div>
        <button class="btn block ghost" id="cp">Copy link</button></div>
      <p class="fine" style="text-align:center">Sent it to the wrong person? <button class="link" id="nw">Get a new card</button><br>The old one stops working.</p>`, (c) => {
      c.querySelector("#sh").onclick = async () => {
        if (navigator.share) { try { await navigator.share({ title: "Something's coming to your table", text: "Something's coming to your table. Open it.", url }); } catch {} }
        else { try { await navigator.clipboard.writeText(url); toast("Link copied. Paste it in their DMs."); } catch {} }
      };
      c.querySelector("#cp").onclick = async () => { try { await navigator.clipboard.writeText(url); toast("Copied."); } catch { prompt("Copy this link", url); } };
      c.querySelector("#nw").onclick = async () => {
        const r = await api("gift-reissue", { bottleId: b.id });
        if (!r.ok) return toast(errMsg(r.error));
        await loadMe(); toast("New card ready. The old one no longer works."); giftShare({ ...b, giftUrl: r.url });
      };
      snapButtons();
    });
  }

  function corkPop() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)(), t = ac.currentTime;
      const n = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate), d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 6);
      const pop = ac.createBufferSource(); pop.buffer = n;
      const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.setValueAtTime(1400, t); bp.frequency.exponentialRampToValueAtTime(260, t + 0.12); bp.Q.value = 2.5;
      const g = ac.createGain(); g.gain.setValueAtTime(1.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      pop.connect(bp); bp.connect(g); g.connect(ac.destination); pop.start(t);
      const fz = ac.createBufferSource(); fz.buffer = n; const hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 5000;
      const g2 = ac.createGain(); g2.gain.setValueAtTime(0.0001, t + 0.1); g2.gain.exponentialRampToValueAtTime(0.25, t + 0.2); g2.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      fz.connect(hp); hp.connect(g2); g2.connect(ac.destination); fz.start(t + 0.1);
    } catch {}
    try { navigator.vibrate && navigator.vibrate(30); } catch {}
  }

  async function giftOpen(code) {
    const g = await api("gift?code=" + encodeURIComponent(code));
    const el = $("#gift");
    const close = () => { el.classList.remove("show", "compact"); el.innerHTML = ""; };
    if (!g.ok || ["gone", "taken", "not_ready", "not_yours", "sender"].includes(g.state)) {
      const T = { taken: ["Already opened", "Someone has already opened this one and kept it."], not_ready: ["Nearly there", "It's still on its way. Try the link again in a minute."],
        not_yours: ["Not this number", "This bottle was sent to a different number."], sender: ["You sent this one", "Send them the link on WhatsApp. Only their number can open it."] }[g.state] || ["This link doesn't work", "Ask whoever sent it for a new link."];
      el.innerHTML = `<div class="gtop">ANDIAMO!</div><div class="gstage"><div class="genv opened empty">${A.envelope.back("e-back")}${A.envelope.front("e-front")}${A.envelope.flap("e-flap")}</div></div>
        <div class="gcard"><h2>${T[0]}</h2><p>${T[1]}</p>
        ${g.state === "not_yours" ? `<button class="btn block" id="go2">Use another number</button><p></p><button class="btn block ghost" id="gx">See Andiamo</button>` : `<button class="btn block" id="gx">See Andiamo</button>`}</div>`;
      el.classList.add("show"); el.querySelector("#gx").onclick = close;
      const go2 = el.querySelector("#go2"); if (go2) go2.onclick = () => { close(); signIn(() => giftOpen(code), WHY.switch); };
      return;
    }
    const from = esc(g.from.split(/\s+/)[0]);
    el.innerHTML = `<div class="gtop">ANDIAMO!</div>
      <div class="gmsg"><h2>${from}'s sending you something.</h2><p>Tap the seal.</p></div>
      <div class="gstage"><div class="genv">${A.envelope.back("e-back")}<div class="gpocket"><img class="gbottle" src="/outside/img/bottle-${esc(g.wine)}.jpg" alt=""></div>${A.envelope.front("e-front")}${A.envelope.flap("e-flap")}
        <button class="gseal" aria-label="Break the seal">${A.envelope.seal("l", "e-seal l")}${A.envelope.seal("r", "e-seal r")}</button></div></div>
      <div class="gcard" hidden>
        <div class="wn">${esc(g.wineLabel)}</div>
        <h2>${from}'s sending an Amabile to your table.</h2><p>For next time you're outside.</p>
        ${g.note ? `<p class="q">"${esc(g.note)}"</p>` : ""}${g.forLabel ? `<p class="for">For ${esc(g.forLabel)}</p>` : ""}
        ${g.state === "mine" ? `<button class="btn block" id="gk">It's yours. See where to claim it</button>` : `<div class="gkeep"><button class="btn block" id="gk">Bank it</button></div>`}
        <p class="muted" id="gm"></p></div>`;
    el.classList.add("show");
    const env = el.querySelector(".genv"), card = el.querySelector(".gcard");
    const reveal = () => { el.querySelector(".gmsg").classList.add("gone"); card.hidden = false; requestAnimationFrame(() => card.classList.add("up")); };
    env.onclick = () => {
      if (env.classList.contains("open")) return;
      corkPop(); env.classList.add("open");
      setTimeout(reveal, matchMedia("(prefers-reduced-motion: reduce)").matches ? 50 : 1900);
    };
    const keep = async () => {
      const r = await api("gift-accept", { code });
      if (!r.ok && r.error === "not_yours") { await loadMe(); close(); return giftOpen(code); }
      if (!r.ok) return fail(el, errMsg(r.error));
      await loadMe(); close();
      modal(`<div class="reveal">${photo(g.wine, 220)}</div><h2>It's yours.</h2><p>Claim it from your waiter when next you're outside.</p>
        <button class="btn block" id="gb">See where to claim it</button>`, (c) => { c.querySelector("#gb").onclick = () => { closeModal(); openSheet("bottles"); }; });
    };
    // Keeping it asks only for what's needed, inline: the number to send it to, the code, and (first time) name and date of birth.
    const step = (html, mount) => { el.classList.add("compact"); const b = card.querySelector(".gkeep"); b.innerHTML = html; msg(""); mount(b); const i = b.querySelector("input"); if (i) i.focus(); };
    const msg = (t) => (t ? fail(card, t) : note(card, ""));
    const askNumber = () => step(`<label class="field"><span>Your WhatsApp number</span>${phoneField("gph")}</label>
      <button class="btn block" id="gn">Send me the code</button>`, (b) => {
      wirePhone(b, "gph");
      b.querySelector("#gn").onclick = async () => {
        const phone = phoneOf(b, "gph");
        if (!e164(phone)) return flag(b.querySelector("#gph"), b.querySelector("#gph").value.trim() ? errMsg("phone") : "Add your WhatsApp number.");
        const r = await api("auth/start", { phone });
        if (!r.ok) return PHONE_ERR.includes(r.error) || r.error === "send_failed" || r.error === "not_on_whatsapp" ? flag(b.querySelector("#gph"), errMsg(r.error)) : msg(errMsg(r.error));
        askCode(phone, r.devCode);
      };
    });
    const askCode = (phone, devCode) => step(`<label class="field"><span>Code from WhatsApp${devCode ? " (test: " + devCode + ")" : ""}</span><input id="gcd" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 digits"></label>
      <button class="btn block" id="gc">Confirm</button>`, (b) => {
      b.querySelector("#gc").onclick = async () => {
        const gcd = b.querySelector("#gcd");
        if (gcd.value.replace(/\D/g, "").length < 6) return flag(gcd, "Enter the 6-digit code from WhatsApp.");
        const r = await api("auth/verify", { phone, code: gcd.value });
        if (!r.ok) return CODE_ERR.includes(r.error) ? flag(gcd, errMsg(r.error)) : msg(errMsg(r.error));
        S.token = r.token; LS.set("outside.token", r.token);
        if (r.needsProfile) {
          // The name on their WhatsApp if Amabile has it, else the name the sender typed. No extra question. They can change it in Me.
          const given = r.suggestedName || String(g.forLabel || "").replace(/^@+/, "").trim().split(/\s+/)[0];
          if (!given) return askName();
          const p = await api("profile", { name: given.charAt(0).toUpperCase() + given.slice(1), avatar: { skin: "s3", hair: "low", face: "smile", outfit: "ankara" } });
          if (!p.ok) return askName();
        }
        keep();
      };
    });
    const askName = () => step(`<label class="field"><span>Your first name</span><input id="gnm" autocomplete="given-name" maxlength="24"></label>
      <button class="btn block" id="gs">Bank it</button>`, (b) => {
      b.querySelector("#gs").onclick = async () => {
        if (!b.querySelector("#gnm").value.trim()) return flag(b.querySelector("#gnm"), "Add your first name.");
        const r = await api("profile", { name: b.querySelector("#gnm").value, avatar: { skin: "s3", hair: "low", face: "smile", outfit: "ankara" } });
        if (!r.ok) return r.error === "name" ? flag(b.querySelector("#gnm"), "Add your first name.") : msg(errMsg(r.error));
        keep();
      };
    });
    el.querySelector("#gk").onclick = () => {
      if (g.state === "mine") { close(); return openSheet("bottles"); }
      if (S.token && S.me) return keep();
      askNumber();
    };
  }

  // ---------- claim by QR ----------
  // Call a runner over, show the QR, they scan it on the venue's board. No location needed: the board is the venue.
  function qrSvg(text) {
    if (!window.qrcode) return "";
    const q = window.qrcode(0, "M"); q.addData(text); q.make();
    const n = q.getModuleCount(), m = 2; let d = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x + m} ${y + m}h1v1h-1z`;
    return `<svg viewBox="0 0 ${n + 2 * m} ${n + 2 * m}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#1a0f0a"/></svg>`;
  }
  let qrTimer = null;
  async function qrFlow(id, quiet = false) {
    const b = S.me.bag.find((x) => x.id === id); if (!b) return;
    closeSheet(); clearInterval(qrTimer);
    const r = await api("qr", { bottleId: id, quiet });
    if (!r.ok) return toast(errMsg(r.error));
    const c = modal(`<h2>Show a waiter</h2><p class="muted">Call a waiter over and say you have a bottle to claim. They scan this and bring your ${esc(wineOf(b.wine).label)}.</p>
      <div class="qrbox" data-code="${esc(r.code)}">${qrSvg(r.url)}</div><div class="qrtxt">${esc(r.code)}</div>
      <label class="toggle"><input type="checkbox" id="quiet"${quiet ? " checked" : ""}> Quiet claim: don't tell my people I'm outside</label>
      <p class="muted" id="msg">Works once, at any partner venue, for the next 20 minutes.</p>`, (c) => {
      c.querySelector("#quiet").onchange = (e) => qrFlow(id, e.target.checked);
    });
    const live = () => $("#modal").classList.contains("open") && c.querySelector(`.qrbox[data-code="${r.code}"]`);
    qrTimer = setInterval(async () => {
      if (!live()) return clearInterval(qrTimer);
      const st = await api("qr-status?code=" + encodeURIComponent(r.code));
      if (!st.ok || !live()) return;
      if (st.status === "claimed") { clearInterval(qrTimer); closeModal(); await loadMe(); toast("Scanned. Your bottle is coming."); }
      else if (st.status === "topup") { clearInterval(qrTimer); qrTopup(b, r.code, st); }
      else if (st.status === "refused") fail(c, st.reason === "not_stocked" ? `${st.venue ? st.venue.name : "This venue"} doesn't have ${wineOf(b.wine).name} right now. Your bottle keeps waiting.` : errMsg(st.reason));
      else if (st.status === "expired") { clearInterval(qrTimer); qrFlow(id, quiet); }
    }, 2500);
  }
  function qrTopup(b, code, st) {
    modal(`<h2>Top up to claim here</h2><p>This bottle fits ${esc(bandName(b.band))} spots. ${esc(st.venue.name)} is ${esc(spotName(st.venue.band))}.</p>
      <p><b>Top up ${naira(st.topup)}</b> and the waiter brings it, or keep it for another night.</p>
      <button class="btn block" id="go">Top up ${naira(st.topup)}</button><p></p><button class="btn block ghost" data-x3>Keep it for another night</button>`, (c) => {
      c.querySelector("[data-x3]").onclick = closeModal;
      c.querySelector("#go").onclick = async () => {
        const t = await api("topup", { bottleId: b.id, qr: code });
        if (!t.ok) return toast(errMsg(t.error));
        location.href = t.authorization_url;
      };
    });
  }

  function glowPrompt(t) {
    modal(`<div class="empty"><div class="art"><div style="width:90px;height:90px;border-radius:50%;border:3px solid var(--ink);background:${beaconOf(t.beacon).hex}"></div></div></div>
      <h2>Your bottle is coming</h2><p>When you see the waiter come out, tap Glow and hold your phone up. Your colour is <b>${esc(beaconOf(t.beacon).name)}</b>.</p>
      <div class="code">${esc(t.code)}</div><p class="muted" style="text-align:center">Read this code to the waiter.</p>
      <button class="btn block gold" id="go">Glow</button>`, (c) => { c.querySelector("#go").onclick = () => { closeModal(); glow(t); }; });
  }

  // ---------- light ----------


  // ---------- send ----------
  function sendFlow(pre, resume) {
    closeSheet();
    const st = resume || { mode: pre.friend ? "light" : pre.table ? "table" : "number", friend: pre.friend || null, table: pre.table || "", to: "", forLabel: "", wine: null, band: "lounge", note: "", anon: false };
    const out = S.me ? S.me.circle.filter((c) => c.out) : [];
    const draw = () => {
      const wines = st.mode === "light" ? S.cfg.wines.filter((w) => (st.friend.wines || []).includes(w.id)) : S.cfg.wines.filter((w) => anyBand(w.id));
      if (!st.wine || !wines.some((w) => w.id === st.wine)) st.wine = wines[0] && wines[0].id;
      // A wine may only be sold at some levels (Spumante: Premium only). Keep the pick on a level it has.
      if ((st.mode === "number" || st.mode === "link") && st.wine && !bandPrice(st.band, st.wine)) {
        const ok = S.cfg.bandOrder.filter((b) => bandPrice(b, st.wine));
        if (ok.length) st.band = ok.includes("lounge") ? "lounge" : ok[0];
      }
      const price = priceFor(st);
      const due = st.code && price > 1 ? price - Math.min(price, st.code.kind === "naira" ? st.code.value : Math.round(price * st.code.value / 100)) : price;
      const who = st.mode === "light"
        ? `<div class="to-card"><div class="av">${A.avatar(st.friend.avatar, 48)}<i></i></div><div class="grow"><b>${esc(st.friend.name)}</b><small>Outside now, at ${esc(spotName(st.friend.band))}. Straight to their table.</small></div>${out.length || st.mode === "light" ? `<button class="link" id="other">Change</button>` : ""}</div>`
        : st.mode === "table" ? `<div class="to-card"><div class="grow"><b>Table ${esc(st.table)}</b><small>In this room, from you.</small></div></div>`
        : `<div class="seg"><button class="${st.mode === "number" ? "on" : ""}" data-m="number">Their number</button><button class="${st.mode === "link" ? "on" : ""}" data-m="link">Instagram or Snap</button></div>
           ${st.mode === "link" ? `<div class="tofield"><input id="forl" maxlength="40" autocomplete="off" placeholder="Their name, e.g. Tolu" value="${esc(st.forLabel)}"></div>
             <p class="hint">You'll get a sealed card to send to them on Instagram or Snapchat.</p>`
           : `<div class="tofield">${phoneField("to", st.to)}${hasPicker() ? `<button class="btn small ghost" id="pick">Contacts</button>` : ""}</div>
           ${out.length ? `<div class="outrow"><span>Outside now</span>${out.map((c) => `<button class="ochip" data-f="${c.key}"><span class="av">${A.avatar(c.avatar, 26)}</span>${esc(c.name)}</button>`).join("")}</div>` : ""}`}`;
      const bands = st.mode === "number" || st.mode === "link" ? S.cfg.bandOrder.filter((b) => bandPrice(b, st.wine)) : [];
      return `<h2>Send an Amabile</h2>
        <div class="sec"><div class="lab">To</div>${who}</div>
        <div class="sec"><div class="lab">Wine</div><div class="wpick">${wines.map((w) => `<button class="wcard${st.wine === w.id ? " on" : ""}" data-w="${w.id}"><span class="pic">${photo(w.id, 118)}</span><b>${esc(w.name)}</b>${w.kind ? `<small>${esc(w.kind)}</small>` : ""}</button>`).join("") || `<p class="muted">No wines available there right now.</p>`}</div></div>
        ${bands.length ? `<div class="sec"><div class="lab">Where they can claim it</div><div class="bandlist">${bands.map((b) => { const n = spotsFor(b, st.wine);
          return `<button class="bandrow${st.band === b ? " on" : ""}" data-b="${b}"><span class="rd"></span><span class="grow"><b>${esc(bandName(b))}</b><small>${n} spot${n === 1 ? "" : "s"}${examples(b, st.wine) ? " · " + esc(examples(b, st.wine)) : ""}</small></span><span class="pr">${naira(bandPrice(b, st.wine))}</span></button>`; }).join("")}</div></div>` : ""}
        <div class="sec"><div class="lab">A note <small>optional</small></div><textarea id="note" class="notebox" maxlength="140" placeholder="Happy birthday. Wish I was there.">${esc(st.note)}</textarea>
          ${st.mode === "number" ? `<label class="toggle"><input type="checkbox" id="self"${st.self ? " checked" : ""}> I'll send it to them myself</label>` : ""}
          ${st.mode === "link" || st.self ? "" : `<label class="toggle"><input type="checkbox" id="anon"${st.anon ? " checked" : ""}> Send anonymously</label>`}</div>
        <div class="sec codesec">${st.code ? `<div class="codeok"><span><b>${esc(st.code.code)}</b> · ${st.code.kind === "naira" ? naira(st.code.value) : st.code.value + "%"} off</span><button class="link" id="codeoff">Remove</button></div>`
          : st.codeOpen ? `<div class="tofield"><input id="codein" maxlength="20" autocomplete="off" autocapitalize="characters" placeholder="Code" value="${esc(st.codeText || "")}"><button class="btn small ghost" id="codego">Apply</button></div>`
          : `<button class="link" id="codeopen">Have a code?</button>`}</div>
        <div class="paybar"><button class="btn block" id="pay"${st.wine ? "" : " disabled"}>${!st.wine ? "Choose a wine" : price > 1 ? (due === 0 ? "Send it" : "Pay " + naira(due)) : "Continue to pay"}</button><p class="muted" id="msg"></p>
        <p class="fine">${st.mode === "link" ? "It can only be claimed once." : st.mode === "number" && st.self ? "You'll get a link to send them on WhatsApp. Only their number can open it." : "They claim it from their waiter when next they're outside."} ${st.mode === "link" ? "" : " You'll see Waiting, then Delivered. You never see where they are."}</p></div>`;
    };
    const mount = (c) => {
      const keep = () => { const n = c.querySelector("#note"); if (n) st.note = n.value; const t = c.querySelector("#to"); if (t) { st.to = t.value; st.toFull = phoneOf(c, "to"); } const f = c.querySelector("#forl"); if (f) st.forLabel = f.value; const a = c.querySelector("#anon"); if (a) st.anon = a.checked; const sf = c.querySelector("#self"); if (sf) st.self = sf.checked; const cd = c.querySelector("#codein"); if (cd) st.codeText = cd.value; };
      const redraw = () => { keep(); modal(draw(), mount); };
      c.querySelectorAll("[data-w]").forEach((b) => (b.onclick = () => { st.wine = b.dataset.w; redraw(); }));
      c.querySelectorAll("[data-b]").forEach((b) => (b.onclick = () => { st.band = b.dataset.b; redraw(); }));
      c.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => { keep(); st.mode = b.dataset.m; if (st.mode === "link") st.anon = false; redraw(); }));
      c.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { st.mode = "light"; st.friend = out.find((x) => x.key === b.dataset.f); redraw(); }));
      const oth = c.querySelector("#other"); if (oth) oth.onclick = () => { st.mode = "number"; st.friend = null; redraw(); };
      wirePhone(c, "to");
      const sf = c.querySelector("#self"); if (sf) sf.onchange = () => { st.self = sf.checked; if (st.self) st.anon = false; redraw(); };
      // The pay bar sticks to the bottom; bring the code into view above it.
      const toCode = () => { const mc = $("#modalCard"); if (mc) mc.scrollTo({ top: mc.scrollHeight, behavior: "smooth" }); };
      const hc = c.querySelector("#codeopen"); if (hc) hc.onclick = () => { st.codeOpen = true; redraw(); toCode(); setTimeout(() => { const i = document.querySelector("#codein"); if (i) i.focus(); }, 50); };
      const rc = c.querySelector("#codeoff"); if (rc) rc.onclick = () => { st.code = null; st.codeText = ""; st.codeOpen = true; redraw(); toCode(); };
      const applyCode = async () => {
        keep();
        const cd = c.querySelector("#codein");
        if (!String(st.codeText || "").trim()) return flag(cd, "Type your code.");
        if (!S.me) return signIn(() => sendFlow({}, { ...st, autocode: true }), WHY.pay);
        const r = await api("code", { code: st.codeText });
        if (!r.ok) return flag(c.querySelector("#codein"), errMsg(r.error));
        st.code = r.code; st.codeOpen = false; redraw(); toCode();
      };
      const ac = c.querySelector("#codego"); if (ac) ac.onclick = applyCode;
      const cdi = c.querySelector("#codein"); if (cdi) cdi.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); applyCode(); } };
      if (st.autocode) { delete st.autocode; applyCode(); }
      const pick = c.querySelector("#pick");
      if (pick) pick.onclick = async () => { try { const [ct] = await navigator.contacts.select(["tel", "name"], { multiple: false }); if (ct && ct.tel && ct.tel[0]) { c.querySelector("#to").value = ct.tel[0]; redraw(); } } catch {} };
      c.querySelector("#pay").onclick = async () => {
        keep();
        if (st.mode === "number" && !e164(st.toFull || st.to)) return flag(c.querySelector("#to"), String(st.to || "").trim() ? errMsg("phone") : "Add their number.");
        if (st.mode === "link" && !String(st.forLabel || "").trim()) return flag(c.querySelector("#forl"), "Add their name, so the card is for them.");
        if (!S.me) return signIn(() => sendFlow({}, { ...st, autopay: true }), WHY.pay);
        const body = { mode: st.mode, wine: st.wine, note: st.note, anon: st.anon };
        if (st.mode === "number") { if (!e164(st.toFull || st.to)) return flag(c.querySelector("#to"), errMsg("phone")); body.to = st.toFull || st.to; body.band = st.band; if (st.self) { body.self = true; body.anon = false; } }
        if (st.mode === "link") { body.forLabel = st.forLabel; body.band = st.band; body.anon = false; }
        if (st.mode === "light") body.toKey = st.friend.key;
        if (st.mode === "table") body.table = st.table;
        if (st.code) body.code = st.code.code;
        c.querySelector("#pay").disabled = true;
        const r = await api("send", body);
        if (!r.ok) {
          c.querySelector("#pay").disabled = false;
          if (/^code_/.test(r.error)) { st.code = null; st.codeOpen = true; redraw(); return flag(document.querySelector("#codein"), errMsg(r.error)); }
          return PHONE_ERR.includes(r.error) && c.querySelector("#to") ? flag(c.querySelector("#to"), errMsg(r.error)) : fail(c, errMsg(r.error));
        }
        if (r.paid) return paidReturn(r.ref);
        LS.set("outside.lastRef", r.ref);
        location.href = r.authorization_url;
      };
    };
    modal(draw(), (c) => {
      mount(c);
      if (st.autopay) { delete st.autopay; c.querySelector("#pay").click(); }
    });
  }
  const bandPrice = (b, wineId) => { const w = wineOf(wineId); const p = S.cfg.bands[w.family] && S.cfg.bands[w.family][b]; return p > 0 ? p : null; };
  const anyBand = (wineId) => S.cfg.bandOrder.some((b) => bandPrice(b, wineId));
  // Three names from the level itself, busiest first (the server sends venues in that order). Lines break only between names.
  const examples = (b, wineId) => S.cfg.venues.filter((v) => v.wines.includes(wineId) && levelAt(v, wineId) === b).slice(0, 3).map((v) => v.name.replace(/ /g, "\u00a0")).join(", ");
  const spotsFor = (b, wineId) => S.cfg.venues.filter((v) => v.wines.includes(wineId) && bandRank(levelAt(v, wineId)) <= bandRank(b)).length;
  function priceFor(st) {
    if (!st.wine) return 0;
    if (st.mode === "number" || st.mode === "link") return bandPrice(st.band, st.wine) || 0;
    if (st.mode === "light") return bandPrice(st.friend.band, st.wine) || 1; // VIP spots price at the venue; shown at checkout
    return 1;
  }

  async function paidReturn(ref, topup) {
    modal(`<h2>Checking payment...</h2><p class="muted">One moment.</p>`);
    for (let i = 0; i < 10; i++) {
      const r = await api("pay?ref=" + encodeURIComponent(ref));
      if (r.ok && r.paid) {
        await loadMe();
        if (topup) { closeModal(); const t = S.me.tickets.find((x) => x.bottleId === r.bottleId); toast("Topped up. It's coming."); if (t) glowPrompt(t); return; }
        if (r.bottle.via === "link" && r.bottle.giftUrl) return giftShare(r.bottle);
        if (r.bottle.selfSend && r.bottle.giftUrl) return selfShare(r.bottle);
        return modal(`<div class="reveal">${photo(r.bottle.wine, 220)}</div><h2>Sent.</h2>
          <p>${esc(r.bottle.toMasked)} gets it ${r.bottle.status === "Waiting" ? "the next time they're outside" : "at their table now"}. You'll see Delivered when it lands.</p>
          <button class="btn block" data-x4>Cheers</button>`, (c) => (c.querySelector("[data-x4]").onclick = closeModal));
      }
      await new Promise((res) => setTimeout(res, 2000));
    }
    modal(`<h2>Payment pending</h2><p>If you paid, it will show under You sent in a minute.</p>`);
  }

  // ---------- friends ----------
  function friendsTab() {
    const c = S.me.circle;
    // One list. People outside right now come first, lit; then everyone else.
    const rank = (x) => (x.out ? 0 : x.mutual ? 1 : 2);
    const people = c.filter((x) => x.mutual || x.out).sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name)));
    const pending = c.filter((x) => !x.mutual && !x.out);
    const row = (x) => `<div class="item${x.out ? " lit" : ""}"><div class="bt av">${A.avatar(x.avatar || {}, 44)}${x.out ? "<i></i>" : ""}</div>
      <div class="grow"><h4>${esc(x.name || x.phone)}${x.status ? ` <span class="lvl sm">${esc(x.status)}</span>` : ""}</h4><div class="sub">${x.out ? "Outside now, at " + esc(spotName(x.band)) : x.level === "hidden" ? "Hidden from your light" : "Sees your light"}</div></div>
      ${x.out ? `<button class="btn small" data-sendto="${x.key}">Send</button>` : ""}
      ${x.key ? `<button class="link" data-hide="${x.key}" data-level="${x.level === "hidden" ? "visible" : "hidden"}">${x.level === "hidden" ? "Unhide" : "Hide"}</button>` : ""}</div>`;
    const nOut = people.filter((x) => x.out).length;
    return `<h2>Your people</h2><p class="muted">Friends from your contacts who are on Andiamo and have your number too. No one can see where you are. They just know when you're outside.</p>
      <div class="row" style="flex-wrap:wrap;gap:8px;margin:10px 0">${hasPicker() ? `<button class="btn small" id="pickMany">Pick from contacts</button>` : ""}
      <button class="btn small ghost" id="addNum">Add a number</button><button class="btn small ghost" id="share">Share my link</button></div>
      ${people.length ? `<h3>${nOut ? nOut + " outside now" : "Nobody outside right now"}</h3><div class="list">${people.map(row).join("")}</div>` : `<p class="muted">Nobody yet. Pick friends from your contacts or share your link.</p>`}
      ${pending.length ? `<h3>Waiting for them</h3><div class="list">${pending.map((x) => `<div class="item"><div class="bt av">${A.avatar({}, 44)}</div><div class="grow"><h4>${esc(x.name || x.phone)}</h4><div class="sub">They need to add you back, or join Outside</div></div></div>`).join("")}</div>` : ""}`;
  }
  function bindFriends(body) {
    const pm = body.querySelector("#pickMany");
    if (pm) pm.onclick = async () => {
      try {
        const cts = await navigator.contacts.select(["tel"], { multiple: true });
        const nums = [...new Set(cts.flatMap((x) => x.tel || []).map(e164).filter(Boolean))];
        const hashes = await Promise.all(nums.map(numberHash));
        const r = await api("contacts", { hashes });
        toast(r.ok ? (r.matched ? r.matched + " already on Andiamo." : "Added. They'll appear when they join.") : errMsg(r.error));
        loadMe();
      } catch {}
    };
    body.querySelector("#addNum").onclick = () => modal(`<h2>Add a number</h2><label class="field"><span>Their number</span>${phoneField("n")}</label><button class="btn block" id="go">Add</button><p class="muted" id="msg"></p>`, (c) => {
      wirePhone(c, "n");
      c.querySelector("#go").onclick = async () => {
        const n = e164(phoneOf(c, "n")); if (!n) return flag(c.querySelector("#n"), c.querySelector("#n").value.trim() ? errMsg("phone") : "Add their number.");
        const r = await api("contacts", { hashes: [await numberHash(n)] });
        closeModal(); toast(r.ok ? (r.matched ? "Added." : "Added. They'll appear when they join and add you.") : errMsg(r.error)); loadMe();
      };
    });
    body.querySelector("#share").onclick = async () => {
      const url = location.origin + BASE + "/?f=" + S.me.player.invite;
      const text = "Add me on Andiamo. When I'm outside, you can send an Amabile to my table.";
      try { if (navigator.share) await navigator.share({ title: "Andiamo!", text, url }); else { await navigator.clipboard.writeText(url); toast("Link copied."); } } catch {}
    };
    body.querySelectorAll("[data-hide]").forEach((b) => (b.onclick = async () => { await api("circle", { key: b.dataset.hide, level: b.dataset.level }); loadMe(); }));
    body.querySelectorAll("[data-sendto]").forEach((b) => (b.onclick = () => sendFlow({ friend: S.me.circle.find((x) => x.key === b.dataset.sendto) })));
  }

  // ---------- drops ----------
  const KIND = { open: "First tables to claim", gathering: "Opens when the room fills up", hidden: "Find it from the clue", passiton: "Claim it, then send it to another table" };
  function dropsTab() {
    const ds = (S.cfg.drops || []).slice().sort((a, b) => a.start - b.start);
    if (!ds.length) return `<h2>Drops</h2><div class="empty"><div class="art">${A.bottle("bianco", 80)}</div>No drops right now. Amabile drops free bottles and cool stuff at real spots around Lagos. Check back on Friday.</div>`;
    return `<h2>Drops</h2><p class="muted">Free bottles and cool stuff from Amabile at real spots. Be there to claim one for your table.</p><div class="list">` + ds.map((d) => {
      const v = venueOf(d.venueId);
      return `<button class="item" data-dropgo="${d.id}" style="text-align:left"><div class="bt ph">${dropPic(d, 80)}</div><div class="grow"><h4>${d.hidden ? "Somewhere in Lagos" : esc(v ? v.name : "")}</h4>${isItem(d) ? `<div class="sub"><b>${esc(d.item)}</b></div>` : ""}
        <div class="sub">${esc(KIND[d.kind] || "")}${d.reward ? " · " + esc(d.reward) : ""}</div>
        <div class="row" style="margin-top:6px">${d.state === "live" ? `<span class="tag wine">Live · ${d.left} of ${d.bottles} left</span><span class="muted">ends ${timeShort(d.end)}</span>` : `<span class="tag">${new Date(d.start).toLocaleDateString("en-NG", { weekday: "long", timeZone: "Africa/Lagos" })} ${timeShort(d.start)}</span>`}</div></div></button>`;
    }).join("") + `</div>`;
  }
  function dropCard(id) {
    const d = (S.cfg.drops || []).find((x) => x.id === id); if (!d) return;
    const v = venueOf(d.venueId);
    closeSheet();
    modal(`<div class="reveal">${dropPic(d, 200)}</div>
      <h2>${d.hidden ? "A hidden drop" : "Drop at " + esc(v ? v.name : "")}</h2>${isItem(d) ? `<p><b>${esc(d.item)}</b>, free from Amabile.</p>` : ""}
      <p>${esc(KIND[d.kind] || "")}. ${d.state === "live" ? `<b>${d.left} of ${d.bottles}</b> left, ends ${timeShort(d.end)}.` : `Starts ${timeShort(d.start)}.`}</p>
      ${d.clue ? `<p class="note" style="font-family:var(--serif);font-size:19px;color:var(--wine)">${esc(d.clue)}</p>` : ""}
      ${d.kind === "gathering" ? `<p class="muted">Opens when ${d.gatheringLights} people are outside there.</p>` : ""}
      ${d.reward ? `<p class="muted">${esc(d.reward)}</p>` : ""}
      <p class="muted">One ${isItem(d) ? "" : "bottle "}per table of two or more, shared. One drop a night.</p>
      ${d.state === "live" ? `<button class="btn block" id="go">I'm here. Claim one</button>` : ""}
      ${v && !d.hidden ? `<p></p><a class="btn block ghost" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}">Directions</a>` : ""}`, (c) => {
      const go = c.querySelector("#go"); if (go) go.onclick = () => needSignIn(() => dropClaim(d), WHY.drop);
    });
  }
  function dropClaim(d) {
    modal(`<h2>Claim one</h2>${whereFields()}
      ${d.kind === "passiton" ? `<label class="field"><span>Which table gets it?</span><input id="pt" maxlength="12" placeholder="Another table in the room"></label>` : ""}
      ${(d.wines || []).length > 1 ? `<h3>Wine</h3><div class="chips">${d.wines.map((w, i) => `<button class="chip${i === 0 ? " on" : ""}" data-w="${w}">${esc(wineOf(w).name)}</button>`).join("")}</div>` : ""}
      <label class="toggle"><input type="checkbox" id="two"> There are at least two of us at the table</label>
      <button class="btn block" id="go">Claim</button><p class="muted" id="msg"></p>`, (c) => {
      let wine = (d.wines || [])[0];
      c.querySelectorAll("[data-w]").forEach((b) => (b.onclick = () => { wine = b.dataset.w; c.querySelectorAll("[data-w]").forEach((x) => x.classList.toggle("on", x === b)); }));
      c.querySelector("#go").onclick = async () => {
        if (!c.querySelector("#two").checked) return flag(c.querySelector("#two").closest(".toggle"), "Tick this to claim. Drops are for tables of two or more.");
        const pt = c.querySelector("#pt");
        if (pt && !pt.value.trim()) return flag(pt, "Say which table gets it.");
        note(c, "Finding you...");
        const loc = await getLocation();
        if (!loc) return fail(c, "Turn on location for this site, then try again.");
        const r = await api("drop", { dropId: d.id, ...loc, table: c.querySelector("#tb").value, spot: c.querySelector("#sp").value, twoPlus: true, wine, passTo: pt ? pt.value : "" });
        if (!r.ok) return r.error === "pass_table" && pt ? flag(pt, "Say which table gets it.") : fail(c, r.error === "locked" ? `Opens at ${r.need} people. ${r.here} here now.` : errMsg(r.error));
        await loadConfig(); await loadMe(); closeModal();
        const t = S.me.tickets.find((x) => x.ticketId === r.ticket.id);
        if (pt && pt.value) toast("Sent to table " + pt.value + ". Nice."); else if (t) glowPrompt(t);
        if (r.last) toast("Last one. " + (d.reward || ""), 4000);
      };
    });
  }

  // ---------- venue card ----------
  function venueCard(id) {
    const v = venueOf(id); if (!v) return;
    const bag = S.me ? S.me.bag.filter((b) => b.status === "waiting" && claimableAt(b, v)) : [];
    const glowNow = S.cfg.glow && S.cfg.glow[v.id];
    const drop = (S.cfg.drops || []).find((d) => d.venueId === v.id && d.state !== "gone");
    modal(`<div class="row"><div>${A.venueArt(v.art, isNight(), 84)}</div><div class="grow"><h2 style="margin:0">${esc(v.name)}</h2><div class="muted">${esc(v.area)} · ${esc(spotName(v.band))}</div>
      ${glowNow ? `<span class="tag gold">${glowNow === "blazing" ? "Blazing tonight" : glowNow === "bright" ? "Busy tonight" : "People outside here"}</span>` : ""}</div></div>
      ${v.tonight ? `<p>${esc(v.tonight)}</p>` : ""}
      <p class="muted">Pours ${v.wines.map((w) => esc(wineOf(w).name)).join(", ")}.</p>
      ${drop ? `<button class="item" data-d="${drop.id}" style="width:100%;text-align:left"><div class="bt">${dropArt(drop, 40)}</div><div class="grow"><h4>${isItem(drop) ? esc(drop.item) + " drop" : "Drop"} ${drop.state === "live" ? "live now" : timeShort(drop.start)}</h4><div class="sub">${drop.left} of ${drop.bottles} left</div></div></button>` : ""}
      ${bag.length ? `<h3>Claimable here</h3><div class="list">${bag.map((b) => `<div class="item"><div class="bt ph">${photo(b.wine, 56)}</div><div class="grow"><h4>From ${esc(b.from)}</h4></div><button class="btn small" data-c="${b.id}">Claim it</button></div>`).join("")}</div>` : ""}
      <p></p><a class="btn block ghost" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}">Directions</a>`, (c) => {
      c.querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => claimFlow(b.dataset.c, v.id)));
      c.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => dropCard(b.dataset.d)));
    });
  }

  // ---------- me ----------
  async function meCard() {
    const p = S.me.player;
    // Kept bare on purpose: nothing here suggests anyone can see where you are.
    const lv = S.cfg.levels || [];
    const cur = lv.filter((x) => (p.received || 0) >= x.at).pop() || { at: 0 }, nx = lv.find((x) => x.at > (p.received || 0));
    const pct = nx ? Math.round((((p.received || 0) - cur.at) / (nx.at - cur.at)) * 100) : 100;
    modal(`<div class="row"><div class="meav${S.me.light ? " outside" : ""}">${A.avatar(p.avatar, 96)}</div><div class="grow"><h2 style="margin:0">${esc(p.name)}</h2><span class="lvl">${esc(p.level || "JJC")}</span></div></div>
      <div class="status"><div class="n">${p.received || 0}</div><div class="grow"><b>bottle${p.received === 1 ? "" : "s"} sent to your table</b>
        <div class="bar"><i style="width:${pct}%"></i></div><small>${p.next ? `${p.toNext} more to <b>${esc(p.next)}</b>` : "As high as it goes."}</small></div></div>
      ${S.me.light ? `<div class="outnote"><b>No one can see where you are.</b> Your people just know you're outside tonight. <button class="link" id="lightOff">Turn off</button></div>` : ""}
      ${pingCard("me")}
      <p></p><button class="btn block ghost" id="look">Change my name or avatar</button>
      <p class="notyou">Not ${esc(p.name)}? <button class="link" id="out">Use another number</button></p>`, (c) => {
      c.querySelector("#look").onclick = () => profileStep(null, true);
      bindPing(c, () => meCard());
      const lf = c.querySelector("#lightOff"); if (lf) lf.onclick = async () => { await api("light", { on: false }); closeModal(); await loadMe(); toast("Done."); };
      // Someone else on this phone: ask for their number. This phone stays with the current person until the new code is confirmed.
      c.querySelector("#out").onclick = () => signIn(() => { renderMap(); meCard(); }, WHY.switch);
    });
  }


  // ---------- notifications ----------
  // A ping on this phone when someone sends you a bottle. Always alongside the WhatsApp message, never instead of it.
  // Android: one tap. iPhone: only once Andiamo is on the Home Screen (Apple's rule), so we say how.
  const PUSH = {
    supported: () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
    ios: /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    standalone: () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true
  };
  const BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>';
  // "on", "ask" (one tap away), "home" (iPhone, add to Home Screen first), "blocked", or "none" (can't on this browser).
  function pushState() {
    if (!S.cfg || !S.cfg.vapid || !S.me) return "none";
    if (PUSH.supported()) {
      if (Notification.permission === "denied") return "blocked";
      return Notification.permission === "granted" && !pushOff() ? "on" : "ask";
    }
    return PUSH.ios && !PUSH.standalone() ? "home" : "none";
  }
  const pushOff = () => LS.get("outside.pushOff") === "1"; // turned off here, though the browser still allows it
  const pingLater = () => { const t = Number(LS.get("outside.pingLater") || 0); return t && Date.now() - t < 14 * 864e5; };
  const b64u = (x) => { const r = atob((x + "=".repeat((4 - (x.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };
  const swReg = () => navigator.serviceWorker.register(BASE + "/sw.js", { scope: BASE + "/" });
  async function pushSubscribe() {
    const reg = await swReg(); await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(S.cfg.vapid) }));
    const r = await api("push", { sub: sub.toJSON() });
    if (!r.ok) throw new Error(r.error || "push");
    LS.del("outside.pushOff");
  }
  async function pushTurnOn() {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast(perm === "denied" ? "Notifications are blocked for Andiamo in your browser settings." : "Notifications not turned on."); return false; }
      await pushSubscribe();
      toast("Done. You'll get a ping when someone sends you a bottle.", 3200);
      return true;
    } catch { LS.set("outside.pushOff", "1"); toast("Couldn't turn on notifications on this phone."); return false; }
  }
  async function pushTurnOff() {
    try {
      const reg = await navigator.serviceWorker.getRegistration(BASE + "/");
      const sub = reg && (await reg.pushManager.getSubscription());
      if (sub) { await api("push", { off: true, endpoint: sub.endpoint }); await sub.unsubscribe(); }
    } catch {}
    LS.set("outside.pushOff", "1"); toast("Notifications off on this phone.");
  }
  // Allowed before on this phone: make sure this number gets the pings (a new sign-in, or the browser renewed it).
  async function pushSync() {
    if (S.pushSynced === S.token || pushOff() || !S.me || !S.cfg || !S.cfg.vapid || !PUSH.supported() || Notification.permission !== "granted") return;
    S.pushSynced = S.token;
    try { await pushSubscribe(); } catch {}
  }
  function pingCard(where) {
    const st = pushState();
    if (where !== "me" && (pingLater() || (st !== "ask" && st !== "home"))) return "";
    if (st === "ask") return `<div class="ping"><span class="pb">${BELL}</span><div class="grow"><b>Get a ping when someone sends you a bottle.</b><small>As well as the WhatsApp message.</small></div>
      <div class="pa"><button class="btn small" data-ping="on">Turn on</button>${where === "me" ? "" : `<button class="link" data-ping="later">Not now</button>`}</div></div>`;
    if (st === "home") return `<div class="ping"><span class="pb">${BELL}</span><div class="grow"><b>Get a ping when someone sends you a bottle.</b><small>On iPhone, tap Share, then Add to Home Screen, and open Andiamo from there.</small></div>
      ${where === "me" ? "" : `<div class="pa"><button class="link" data-ping="later">Got it</button></div>`}</div>`;
    if (where === "me" && st === "on") return `<div class="ping on"><span class="pb">${BELL}</span><div class="grow"><b>You'll get notifications when someone sends you a bottle.</b></div><div class="pa"><button class="link" data-ping="off">Turn off</button></div></div>`;
    if (where === "me" && st === "blocked") return `<div class="ping"><span class="pb">${BELL}</span><div class="grow"><b>Notifications are blocked for Andiamo.</b><small>Allow them in your browser settings to get a ping when someone sends you a bottle.</small></div></div>`;
    return "";
  }
  function bindPing(root, redraw) {
    root.querySelectorAll("[data-ping]").forEach((b) => (b.onclick = async () => {
      const a = b.dataset.ping;
      if (a === "later") LS.set("outside.pingLater", String(Date.now()));
      if (a === "on") { b.disabled = true; await pushTurnOn(); }
      if (a === "off") await pushTurnOff();
      redraw();
    }));
  }

  // ---------- boot ----------
  async function boot() {
    setDayNight();
    const url = new URL(location.href);
    const path = location.pathname.slice(BASE.length);
    const m = path.match(/^\/c\/([^/]+)/);
    if (url.searchParams.get("f")) S.invite = url.searchParams.get("f").replace(/[^0-9a-f]/g, "").slice(0, 32);
    await loadConfig();
    // Phones and upright tablets open on Victoria Island. Laptops (wide and landscape) open on every partner venue at once.
    const landscape = innerWidth >= 700 && innerWidth > innerHeight;
    if (!(landscape && fitVenues())) centerOn(3.428, 6.432, Math.max(limits().min, innerWidth / Math.min(420, innerWidth * 0.46)));
    if (m) {
      const r = await api("auth/link", { token: decodeURIComponent(m[1]) });
      history.replaceState(null, "", BASE + "/");
      if (r.ok) {
        S.token = r.token; LS.set("outside.token", r.token); S.pendingBottle = r.bottleId;
        if (r.needsProfile) return profileStep();
        await afterSignIn(); return;
      }
      toast("That link has expired. Sign in to see your bottles.");
    }
    if (S.token) await loadMe();
    if (S.invite && S.me) { await afterSignIn(); }
    else if (S.invite && !S.me) signIn(null, WHY.friends);
    const gc = url.searchParams.get("g");
    const paid = url.searchParams.get("paid") || url.searchParams.get("topup");
    const sentId = url.searchParams.get("sent");
    if (sentId && S.me) {
      // From the "we couldn't reach them" ping: straight to sending it yourself.
      history.replaceState(null, "", BASE + "/");
      const x = (S.me.sent || []).find((y) => y.id === sentId.replace(/[^a-z0-9]/gi, ""));
      if (x && x.selfSend) selfShare(x); else openSheet("bottles");
    } else if (gc) { history.replaceState(null, "", BASE + "/"); giftOpen(gc.replace(/[^a-z0-9]/gi, "").slice(0, 12)); }
    else if (paid) { history.replaceState(null, "", BASE + "/"); paidReturn(paid, !!url.searchParams.get("topup")); }
    else if (!S.token && !S.invite) welcome();
    setInterval(() => { setDayNight(); if (document.visibilityState === "visible") loadMe(true); }, 30000);
    setInterval(() => { if (document.visibilityState === "visible") loadConfig(); }, 60000);
  }
  function welcome() {
    modal(`<div class="hero"><div class="panel pop"></div><img class="popbottle" src="/outside/img/bottle-rosso-hero.png" alt="Amabile Rosso">
      <span class="a left">${A.avatar({ skin: "s3", hair: "straight", face: "glam", outfit: "nightout" }, 96)}</span>
      <span class="a right">${A.avatar({ skin: "s4", hair: "cap", face: "shades", outfit: "jersey" }, 96)}</span></div>
      <div class="welcome"><h2>Lagos, Andiamo!</h2><p>Send an Amabile to a friend's table.<br>Find free bottle drops and cool stuff from Amabile at real spots around the city.</p></div>
      <button class="btn block" id="go">Step outside</button>
      <p class="muted" style="font-size:12px;text-align:center">18+. Drink responsibly. <a href="https://andiamo.ng/privacy" target="_blank" rel="noopener" style="color:inherit">Privacy</a></p>`, (c) => {
      c.querySelector("#go").onclick = closeModal;
    });
  }
  boot();
})();
