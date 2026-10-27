// Outside: the game. A web app over an illustrated map of real Lagos.
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
  const lagosHour = () => (new Date().getUTCHours() + 1) % 24;
  const isNight = () => { const h = lagosHour(); return h >= 18 || h < 6; };
  const bandRank = (b) => (S.cfg ? S.cfg.bandOrder.indexOf(b) : 0);
  const bandName = (b) => (S.cfg && S.cfg.bandNames[b]) || b;
  // The real bottle, as a product tile. Illustrations stay for the map.
  const photo = (w, h) => `<img class="bph" src="/outside/img/bottle-${esc(w)}.jpg" alt="${esc(wineOf(w).label || "Amabile")}" style="height:${h}px" loading="lazy">`;
  const spotName = (b) => { const n = bandName(b); return (/^[AEIOU]/i.test(n) ? "an " : "a ") + n + " spot"; };
  const wineOf = (id) => (S.cfg && S.cfg.wines.find((w) => w.id === id)) || { name: id, label: id };
  const venueOf = (id) => (S.cfg && S.cfg.venues.find((v) => v.id === id)) || null;
  const beaconOf = (id) => (S.cfg && (S.cfg.beacons || []).find((b) => b.id === id)) || { hex: "#F2B705", name: "Gold" };
  const claimableAt = (b, v) => v && v.wines.includes(b.wine) && bandRank(v.band) <= bandRank(b.band);
  const timeShort = (t) => new Date(t).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Lagos" }).replace(" ", "").toLowerCase();
  const until = (t) => { const m = Math.max(0, Math.round((t - Date.now()) / 60000)); return m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m + "m"; };
  const ERR = {
    offline: "No connection. Try again in a moment.", phone: "That doesn't look like a Nigerian number.", slow_down: "Too many codes. Try again in a few minutes.",
    send_failed: "We couldn't send the code. Try again.", wrong_code: "That code isn't right.", expired: "That code has expired. Ask for a new one.",
    age: "Outside is for people 18 and over.", not_now: "This number can't sign in right now.", no_venue: "You're not at a partner venue yet. Your bottle keeps waiting.",
    not_stocked: "That venue doesn't stock this wine.", limit: "You've hit the limit for now.", not_out: "They're not outside any more.",
    gone: "All gone. Next time.", one_a_night: "One drop a night. Enjoy the rest of it.", not_here: "You need to be at the venue to claim this drop.",
    two_plus: "Drops are for tables of two or more.", not_yet: "Not live yet.", over: "This drop has ended.", band_price: "That level isn't open for this wine yet.",
    payment_init: "Payment didn't start. Try again.", not_stocked_there: "That wine isn't available where they are.", cant_send: "You can't send to this number.",
    self: "That's your own number.", signin: "Sign in first.", profile: "Finish your profile first.", server: "Something went wrong. Try again.",
    qr_expired: "That QR has expired. Show a fresh one.", paused: "This venue isn't taking claims right now.", state: "This bottle isn't waiting any more."
  };
  const errMsg = (e) => ERR[e] || "Something went wrong.";

  function getLocation() {
    return new Promise((res) => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition(
        (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
        () => res(null), { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
    });
  }
  function e164(raw) {
    const d = String(raw || "").replace(/\D/g, "");
    if (d.length === 11 && d.startsWith("0")) return "+234" + d.slice(1);
    if (d.length === 13 && d.startsWith("234")) return "+" + d;
    if (d.length === 10 && /^[789]/.test(d)) return "+234" + d;
    return null;
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
    if (tab === "send") return needSignIn(() => sendFlow({}));
    if (S.sheetTab === tab) return closeSheet();
    if (!S.me && tab !== "drops") return needSignIn(() => openSheet(tab));
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
      h += `<div class="mk drop ${d.state}" data-drop="${d.id}" style="left:${x}px;top:${y - 70}px"><div class="bubble">${A.bottle((d.wines || [])[0] || "rosso", 34)}<div>${label}</div></div><div class="tail"></div></div>`;
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
    $("#lightBar").innerHTML = !S.token || !me ? `<button class="pill" id="signInPill">Sign in</button>` : "";
    const si = $("#signInPill"); if (si) si.onclick = () => signIn();

    const out = me ? me.circle.filter((c) => c.out) : [];
    // Friends outside live in the Friends tab, never on the map. The dock shows how many.
    const nOut = me ? me.circle.filter((c) => c.out).length : 0;
    $("#friendCount").textContent = nOut || "";

    const tickets = me ? me.tickets : [];
    $("#ticketBar").innerHTML = tickets.map((t) => {
      const bc = beaconOf(t.beacon);
      if (t.via === "qr") return `<div class="ticket"><div class="beacon" style="background:${bc.hex}"></div><div class="grow"><b>Your ${esc(wineOf(t.wine).name)} is on its way</b><div class="muted">The runner who scanned you is bringing it.</div></div></div>`;
      return `<div class="ticket"><div class="beacon" style="background:${bc.hex}"></div><div class="grow"><b>Your ${esc(wineOf(t.wine).name)} is on its way</b><div class="muted">Code ${esc(t.code)} · tap Glow when you see the runner</div></div>` +
        `<button class="btn small gold" data-glow="${t.ticketId}">Glow</button></div>`;
    }).join("");
    $("#ticketBar").querySelectorAll("[data-glow]").forEach((b) => (b.onclick = () => glow(tickets.find((t) => t.ticketId === b.dataset.glow))));
    const waiting = me ? me.bag.filter((b) => b.status === "waiting").length : 0;
    $("#bagCount").textContent = waiting || "";
    const live = (S.cfg && S.cfg.drops || []).filter((d) => d.state === "live").length;
    $("#dropCount").textContent = live || "";
  }
  $("#meBtn").onclick = () => (S.me ? meCard() : signIn());

  // ---------- glow ----------
  let wake = null;
  async function glow(t) {
    if (!t) return;
    const bc = beaconOf(t.beacon), g = $("#glow");
    g.style.background = bc.hex;
    g.innerHTML = `<div class="name">${esc(S.me.player.name)}</div><div style="margin:18px 0">${A.bottle(t.wine, 150)}</div><div class="hint">Hold your phone up. Code ${esc(t.code)}</div>` +
      `<div style="margin-top:22px;display:flex;gap:10px"><button class="btn ghost" data-rec>Got it</button><button class="btn ghost" data-close>Close</button></div>`;
    g.classList.add("open");
    try { wake = await navigator.wakeLock.request("screen"); } catch {}
    g.querySelector("[data-close]").onclick = stop;
    g.querySelector("[data-rec]").onclick = async () => { await api("received", { ticketId: t.ticketId, venueId: t.venueId }); stop(); await loadMe(); toast("Enjoy it. Cheers."); };
    function stop() { g.classList.remove("open"); try { wake && wake.release(); } catch {} }
  }

  // ---------- sign in ----------
  function needSignIn(next) { if (S.me) return next(); signIn(next); }
  function signIn(next) {
    modal(`<h2>Sign in</h2><p class="muted">Your number is your account. We send a code on WhatsApp.</p>
      <label class="field"><span>Phone number</span><input id="ph" type="tel" inputmode="tel" placeholder="0803 000 0000" autocomplete="tel"></label>
      <button class="btn block" id="go">Send code</button><p class="muted" id="msg"></p><p class="muted" style="text-align:center">Own a venue? <a href="/outside/venue">Get it on the map</a></p>`, (c) => {
      c.querySelector("#go").onclick = async () => {
        const phone = c.querySelector("#ph").value;
        if (!e164(phone)) return (c.querySelector("#msg").textContent = errMsg("phone"));
        c.querySelector("#go").disabled = true;
        const r = await api("auth/start", { phone });
        c.querySelector("#go").disabled = false;
        if (!r.ok) return (c.querySelector("#msg").textContent = errMsg(r.error));
        codeStep(phone, r.devCode, next);
      };
    });
  }
  function codeStep(phone, devCode, next) {
    modal(`<h2>Enter the code</h2><p class="muted">Sent to ${esc(phone)} on WhatsApp.${devCode ? " Test code: " + devCode : ""}</p>
      <label class="field"><span>Code</span><input id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 digits"></label>
      <button class="btn block" id="go">Continue</button><p class="muted" id="msg"></p>`, (c) => {
      c.querySelector("#go").onclick = async () => {
        const r = await api("auth/verify", { phone, code: c.querySelector("#cd").value });
        if (!r.ok) return (c.querySelector("#msg").textContent = errMsg(r.error));
        S.token = r.token; LS.set("outside.token", r.token);
        if (r.needsProfile) return profileStep(next);
        await afterSignIn(); closeModal(); next && next();
      };
    });
  }
  function profileStep(next, edit) {
    const cur = (S.me && S.me.player.avatar) || { skin: "s3", hair: "low", face: "smile", outfit: "ankara" };
    const av = { ...cur };
    const opts = (key, map) => Object.entries(map).map(([k, v]) =>
      key === "skin" ? `<button class="swatch${av.skin === k ? " on" : ""}" data-k="skin" data-v="${k}" style="background:${v}" aria-label="Skin tone"></button>`
        : `<button class="${av[key] === k ? "on" : ""}" data-k="${key}" data-v="${k}">${esc(typeof v === "string" ? v : v.label)}</button>`).join("");
    modal(`<h2>${edit ? "Your avatar" : "One more thing"}</h2>
      ${edit ? "" : `<label class="field"><span>First name</span><input id="nm" autocomplete="given-name" maxlength="24"></label>
      <label class="field"><span>Date of birth</span><input id="dob" type="date"></label>`}
      <div class="av-builder"><div class="av-preview" id="avp">${A.avatar(av, 120)}</div>
      <div class="opts">${opts("skin", A.SKINS)}</div><div class="opts">${opts("hair", A.HAIRS)}</div>
      <div class="opts">${opts("face", A.FACES)}</div><div class="opts">${opts("outfit", A.OUTFITS)}</div></div>
      <button class="btn block" id="go" style="margin-top:14px">${edit ? "Save" : "Step outside"}</button><p class="muted" id="msg"></p>`, (c) => {
      c.querySelectorAll(".opts button").forEach((b) => (b.onclick = () => {
        av[b.dataset.k] = b.dataset.v;
        b.parentElement.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
        c.querySelector("#avp").innerHTML = A.avatar(av, 120);
      }));
      c.querySelector("#go").onclick = async () => {
        const body = edit ? { name: S.me.player.name, dob: S.dob || "", avatar: av } : { name: c.querySelector("#nm").value, dob: c.querySelector("#dob").value, avatar: av };
        if (edit && !S.dob) { body.dob = LS.get("outside.dob") || ""; }
        const r = await api("profile", body);
        if (!r.ok) return (c.querySelector("#msg").textContent = r.error === "name" ? "Add your first name." : errMsg(r.error));
        if (!edit) LS.set("outside.dob", body.dob);
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
  async function loadMe() {
    if (!S.token) { S.me = null; renderChrome(); return; }
    const r = await api("me");
    if (r.ok) S.me = r;
    else if (r.error === "profile") { S.me = null; profileStep(); }
    else S.me = null;
    renderChrome(); renderMap();
    if (S.sheetTab) openSheet(S.sheetTab);
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
      <p class="muted">Claim it at any of the ${spots.length} spots outlined in gold on the map. When you're there, open Outside and tap Bring it here.</p>
      <button class="btn block" data-x2>See the spots</button>`, (c) => {
      c.querySelector("[data-x2]").onclick = () => { closeModal(); focusSpots(spots); };
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
      <div class="meta">${esc(wineOf(b.wine).kind || "")}${b.kind === "gift" ? " · " + esc(bandName(b.band)) + " spots and below" : ""}</div>
      ${b.note ? `<div class="q">"${esc(b.note)}"</div>` : ""}
      ${b.status === "waiting"
        ? `<div class="acts"><button class="btn small" data-claim="${b.id}">Bring it here</button><button class="btn small gold" data-qr="${b.id}">Show QR</button></div>
           <div class="links"><button class="link" data-spots="${b.id}">Where to claim</button><span>·</span><button class="link" data-more="${b.id}">More</button></div>`
        : `<div class="acts one"><span class="tag gold">On its way</span></div><div class="links"><button class="link" data-cancel="${b.id}">Not here any more</button></div>`}
      </div></div>`).join("");
    const s2 = sent.slice(0, 12).map((x) => `<div class="item"><div class="bt ph">${photo(x.wine, 56)}</div><div class="grow"><h4>To ${esc(x.toMasked)}</h4><div class="sub">${esc(wineOf(x.wine).name)}</div></div><span class="tag${x.status === "Delivered" ? " gold" : ""}">${esc(x.status)}</span></div>`).join("");
    return `<h2>Your bottles</h2>${items ? `<div class="bags">${items}</div>` : `<div class="empty"><div class="art">${A.bottle("rosato", 80, false)}</div>No bottles waiting. When someone sends you one, it lands here.</div>`}
      <h3>You sent</h3>${s2 ? `<div class="list">${s2}</div>` : `<p class="muted">Nothing yet. Tap Send to put a bottle on a friend's table.</p>`}`;
  }
  function bindSheet(tab) {
    const body = $("#sheetBody");
    body.querySelectorAll("[data-claim]").forEach((b) => (b.onclick = () => claimFlow(b.dataset.claim)));
    body.querySelectorAll("[data-qr]").forEach((b) => (b.onclick = () => qrFlow(b.dataset.qr)));
    body.querySelectorAll("[data-spots]").forEach((b) => (b.onclick = () => {
      const x = S.me.bag.find((y) => y.id === b.dataset.spots); closeSheet(); focusSpots(S.cfg.venues.filter((v) => claimableAt(x, v)));
    }));
    body.querySelectorAll("[data-more]").forEach((b) => (b.onclick = () => bottleMore(b.dataset.more)));
    body.querySelectorAll("[data-cancel]").forEach((b) => (b.onclick = async () => { const r = await api("cancel", { bottleId: b.dataset.cancel }); if (!r.ok) toast(errMsg(r.error)); await loadMe(); }));
    if (tab === "friends") bindFriends(body);
    if (tab === "drops") body.querySelectorAll("[data-dropgo]").forEach((b) => (b.onclick = () => dropCard(b.dataset.dropgo)));
  }
  function bottleMore(id) {
    modal(`<h2>This bottle</h2><button class="btn block ghost" id="pass">Pass it on to someone</button><p></p><button class="btn block ghost" id="no">Not for me</button>`, (c) => {
      c.querySelector("#no").onclick = async () => { const r = await api("decline", { bottleId: id }); closeModal(); if (!r.ok) toast(errMsg(r.error)); else toast("Done. They won't be told."); loadMe(); };
      c.querySelector("#pass").onclick = () => modal(`<h2>Pass it on</h2><label class="field"><span>Their number</span><input id="to" type="tel" placeholder="0803 000 0000"></label><button class="btn block" id="go">Pass it on</button><p class="muted" id="msg"></p>`, (c2) => {
        c2.querySelector("#go").onclick = async () => {
          const r = await api("pass", { bottleId: id, to: c2.querySelector("#to").value });
          if (!r.ok) return (c2.querySelector("#msg").textContent = errMsg(r.error));
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
  function claimFlow(id, venueId) {
    const b = S.me.bag.find((x) => x.id === id); if (!b) return;
    closeSheet();
    modal(`<h2>Bring it here</h2><p class="muted">We check which venue you're at, once. No one can see where you are.</p>${whereFields()}
      <label class="toggle"><input type="checkbox" id="quiet"> Quiet claim: don't tell my people I'm outside</label>
      <button class="btn block" id="go">Bring it here</button><p class="muted" id="msg"></p>
      <p class="muted" style="text-align:center">Or call a runner over: <button class="link" id="qr">show your QR</button></p>`, (c) => {
      c.querySelector("#qr").onclick = () => qrFlow(id, c.querySelector("#quiet").checked);
      c.querySelector("#go").onclick = async () => {
        const go = c.querySelector("#go"); go.disabled = true; c.querySelector("#msg").textContent = "Finding you...";
        const loc = await getLocation();
        if (!loc) { go.disabled = false; return (c.querySelector("#msg").textContent = "Turn on location for this site, then try again."); }
        const body = { bottleId: id, ...loc, venueId, table: c.querySelector("#tb").value, spot: c.querySelector("#sp").value, quiet: c.querySelector("#quiet").checked };
        const r = await api("claim", body);
        go.disabled = false;
        if (r.ok) { closeModal(); await loadMe(); const t = S.me.tickets.find((x) => x.bottleId === id); toast("It's coming. Tap Glow when you see the runner."); if (t) setTimeout(() => glowPrompt(t), 400); return; }
        if (r.error === "choose") return chooseVenue(r.venues, (vid) => { venueId = vid; c.querySelector("#go").click(); });
        if (r.error === "band") return topupStep(b, r, body);
        c.querySelector("#msg").textContent = r.error === "no_venue" ? errMsg("no_venue") : r.error === "not_stocked" ? `${r.venue ? esc(r.venue.name) : "This venue"} doesn't stock ${esc(wineOf(b.wine).name)}. Your bottle keeps waiting.` : errMsg(r.error);
      };
    });
  }
  function chooseVenue(list, done) {
    modal(`<h2>Which one are you at?</h2><div class="list">${list.map((v) => `<button class="item" data-v="${v.id}"><div class="bt">${A.venueArt(v.art, isNight(), 40)}</div><div class="grow" style="text-align:left"><h4>${esc(v.name)}</h4><div class="sub">${esc(v.area)}</div></div></button>`).join("")}</div>`, (c) => {
      c.querySelectorAll("[data-v]").forEach((b) => (b.onclick = () => { closeModal(); done(b.dataset.v); }));
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
    const c = modal(`<h2>Show a runner</h2><p class="muted">Call a runner over and say you have a bottle to claim. They scan this and bring your ${esc(wineOf(b.wine).label)}.</p>
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
      else if (st.status === "refused") c.querySelector("#msg").textContent = st.reason === "not_stocked" ? `${st.venue ? st.venue.name : "This venue"} doesn't have ${wineOf(b.wine).name} right now. Your bottle keeps waiting.` : errMsg(st.reason);
      else if (st.status === "expired") { clearInterval(qrTimer); qrFlow(id, quiet); }
    }, 2500);
  }
  function qrTopup(b, code, st) {
    modal(`<h2>Top up to claim here</h2><p>This bottle fits ${esc(bandName(b.band))} spots. ${esc(st.venue.name)} is ${esc(spotName(st.venue.band))}.</p>
      <p><b>Top up ${naira(st.topup)}</b> and the runner brings it, or keep it for another night.</p>
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
      <h2>Your bottle is coming</h2><p>When you see the runner come out, tap Glow and hold your phone up. Your colour is <b>${esc(beaconOf(t.beacon).name)}</b>.</p>
      <div class="code">${esc(t.code)}</div><p class="muted" style="text-align:center">Read this code to the runner.</p>
      <button class="btn block gold" id="go">Glow</button>`, (c) => { c.querySelector("#go").onclick = () => { closeModal(); glow(t); }; });
  }

  // ---------- light ----------


  // ---------- send ----------
  function sendFlow(pre) {
    closeSheet();
    const st = { mode: pre.friend ? "light" : pre.table ? "table" : "number", friend: pre.friend || null, table: pre.table || "", to: "", wine: null, band: "lounge", note: "", anon: false };
    const out = S.me.circle.filter((c) => c.out);
    const draw = () => {
      const wines = st.mode === "light" ? S.cfg.wines.filter((w) => (st.friend.wines || []).includes(w.id)) : S.cfg.wines.filter((w) => anyBand(w.id));
      if (!st.wine || !wines.some((w) => w.id === st.wine)) st.wine = wines[0] && wines[0].id;
      const price = priceFor(st);
      const who = st.mode === "light"
        ? `<div class="to-card"><div class="av">${A.avatar(st.friend.avatar, 48)}<i></i></div><div class="grow"><b>${esc(st.friend.name)}</b><small>Outside now, at ${esc(spotName(st.friend.band))}. Straight to their table.</small></div>${out.length || st.mode === "light" ? `<button class="link" id="other">Change</button>` : ""}</div>`
        : st.mode === "table" ? `<div class="to-card"><div class="grow"><b>Table ${esc(st.table)}</b><small>In this room, from you.</small></div></div>`
        : `<div class="tofield"><input id="to" type="tel" inputmode="tel" placeholder="Their number, 0803 000 0000" value="${esc(st.to)}">${hasPicker() ? `<button class="btn small ghost" id="pick">Contacts</button>` : ""}</div>
           ${out.length ? `<div class="outrow"><span>Outside now</span>${out.map((c) => `<button class="ochip" data-f="${c.key}"><span class="av">${A.avatar(c.avatar, 26)}</span>${esc(c.name)}</button>`).join("")}</div>` : ""}`;
      const bands = st.mode === "number" ? S.cfg.bandOrder.filter((b) => bandPrice(b, st.wine)) : [];
      return `<h2>Send an Amabile</h2>
        <div class="sec"><div class="lab">To</div>${who}</div>
        <div class="sec"><div class="lab">Wine</div><div class="wpick">${wines.map((w) => `<button class="wcard${st.wine === w.id ? " on" : ""}" data-w="${w.id}"><span class="pic">${photo(w.id, 118)}</span><b>${esc(w.name)}</b><small>${esc(w.kind)}</small></button>`).join("") || `<p class="muted">No wines available there right now.</p>`}</div></div>
        ${bands.length ? `<div class="sec"><div class="lab">Where they can claim it</div><div class="bandlist">${bands.map((b) => { const n = spotsFor(b, st.wine);
          return `<button class="bandrow${st.band === b ? " on" : ""}" data-b="${b}"><span class="rd"></span><span class="grow"><b>${esc(bandName(b))} spots</b><small>${n} spot${n === 1 ? "" : "s"}${b !== bands[0] ? " and anywhere cheaper" : ""}</small></span><span class="pr">${naira(bandPrice(b, st.wine))}</span></button>`; }).join("")}</div></div>` : ""}
        <div class="sec"><div class="lab">A note <small>optional</small></div><textarea id="note" class="notebox" maxlength="140" placeholder="Happy birthday. Wish I was there.">${esc(st.note)}</textarea>
          <label class="toggle"><input type="checkbox" id="anon"${st.anon ? " checked" : ""}> Send anonymously</label></div>
        <div class="paybar"><button class="btn block" id="pay"${st.wine ? "" : " disabled"}>${!st.wine ? "Choose a wine" : price > 1 ? "Pay " + naira(price) : "Continue to pay"}</button><p class="muted" id="msg"></p>
        <p class="fine">They claim it at a partner venue next time they're outside. You'll see Waiting, then Delivered. You never see where they are.</p></div>`;
    };
    const mount = (c) => {
      const keep = () => { const n = c.querySelector("#note"); if (n) st.note = n.value; const t = c.querySelector("#to"); if (t) st.to = t.value; const a = c.querySelector("#anon"); if (a) st.anon = a.checked; };
      const redraw = () => { keep(); modal(draw(), mount); };
      c.querySelectorAll("[data-w]").forEach((b) => (b.onclick = () => { st.wine = b.dataset.w; redraw(); }));
      c.querySelectorAll("[data-b]").forEach((b) => (b.onclick = () => { st.band = b.dataset.b; redraw(); }));
      c.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { st.mode = "light"; st.friend = out.find((x) => x.key === b.dataset.f); redraw(); }));
      const oth = c.querySelector("#other"); if (oth) oth.onclick = () => { st.mode = "number"; st.friend = null; redraw(); };
      const pick = c.querySelector("#pick");
      if (pick) pick.onclick = async () => { try { const [ct] = await navigator.contacts.select(["tel", "name"], { multiple: false }); if (ct && ct.tel && ct.tel[0]) { st.to = ct.tel[0]; redraw(); } } catch {} };
      c.querySelector("#pay").onclick = async () => {
        keep();
        const body = { mode: st.mode, wine: st.wine, note: st.note, anon: st.anon };
        if (st.mode === "number") { if (!e164(st.to)) return (c.querySelector("#msg").textContent = errMsg("phone")); body.to = st.to; body.band = st.band; }
        if (st.mode === "light") body.toKey = st.friend.key;
        if (st.mode === "table") body.table = st.table;
        c.querySelector("#pay").disabled = true;
        const r = await api("send", body);
        if (!r.ok) { c.querySelector("#pay").disabled = false; return (c.querySelector("#msg").textContent = errMsg(r.error)); }
        LS.set("outside.lastRef", r.ref);
        location.href = r.authorization_url;
      };
    };
    modal(draw(), mount);
  }
  const bandPrice = (b, wineId) => { const w = wineOf(wineId); const p = S.cfg.bands[w.family] && S.cfg.bands[w.family][b]; return p > 0 ? p : null; };
  const anyBand = (wineId) => S.cfg.bandOrder.some((b) => bandPrice(b, wineId));
  const spotsFor = (b, wineId) => S.cfg.venues.filter((v) => v.wines.includes(wineId) && bandRank(v.band) <= bandRank(b)).length;
  function priceFor(st) {
    if (!st.wine) return 0;
    if (st.mode === "number") return bandPrice(st.band, st.wine) || 0;
    if (st.mode === "light") return bandPrice(st.friend.band, st.wine) || 1; // Odogwu spots price at the venue; shown at checkout
    return 1;
  }

  async function paidReturn(ref, topup) {
    modal(`<h2>Checking payment...</h2><p class="muted">One moment.</p>`);
    for (let i = 0; i < 10; i++) {
      const r = await api("pay?ref=" + encodeURIComponent(ref));
      if (r.ok && r.paid) {
        await loadMe();
        if (topup) { closeModal(); const t = S.me.tickets.find((x) => x.bottleId === r.bottleId); toast("Topped up. It's coming."); if (t) glowPrompt(t); return; }
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
      <div class="grow"><h4>${esc(x.name || x.phone)}</h4><div class="sub">${x.out ? "Outside now, at " + esc(spotName(x.band)) : x.level === "hidden" ? "Hidden from your light" : "Sees your light"}</div></div>
      ${x.out ? `<button class="btn small" data-sendto="${x.key}">Send</button>` : ""}
      ${x.key ? `<button class="link" data-hide="${x.key}" data-level="${x.level === "hidden" ? "visible" : "hidden"}">${x.level === "hidden" ? "Unhide" : "Hide"}</button>` : ""}</div>`;
    const nOut = people.filter((x) => x.out).length;
    return `<h2>Your people</h2><p class="muted">Friends from your contacts who are on Outside and have your number too. No one can see where you are. They just know when you're outside.</p>
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
        toast(r.ok ? (r.matched ? r.matched + " already on Outside." : "Added. They'll appear when they join.") : errMsg(r.error));
        loadMe();
      } catch {}
    };
    body.querySelector("#addNum").onclick = () => modal(`<h2>Add a number</h2><label class="field"><span>Their number</span><input id="n" type="tel" placeholder="0803 000 0000"></label><button class="btn block" id="go">Add</button><p class="muted" id="msg"></p>`, (c) => {
      c.querySelector("#go").onclick = async () => {
        const n = e164(c.querySelector("#n").value); if (!n) return (c.querySelector("#msg").textContent = errMsg("phone"));
        const r = await api("contacts", { hashes: [await numberHash(n)] });
        closeModal(); toast(r.ok ? (r.matched ? "Added." : "Added. They'll appear when they join and add you.") : errMsg(r.error)); loadMe();
      };
    });
    body.querySelector("#share").onclick = async () => {
      const url = location.origin + BASE + "/?f=" + S.me.player.invite;
      const text = "Add me on Outside. When I'm outside, you can send an Amabile to my table.";
      try { if (navigator.share) await navigator.share({ title: "Outside", text, url }); else { await navigator.clipboard.writeText(url); toast("Link copied."); } } catch {}
    };
    body.querySelectorAll("[data-hide]").forEach((b) => (b.onclick = async () => { await api("circle", { key: b.dataset.hide, level: b.dataset.level }); loadMe(); }));
    body.querySelectorAll("[data-sendto]").forEach((b) => (b.onclick = () => sendFlow({ friend: S.me.circle.find((x) => x.key === b.dataset.sendto) })));
  }

  // ---------- drops ----------
  const KIND = { open: "First tables to claim", gathering: "Opens when the room fills up", hidden: "Find it from the clue", passiton: "Claim it, then send it to another table" };
  function dropsTab() {
    const ds = (S.cfg.drops || []).slice().sort((a, b) => a.start - b.start);
    if (!ds.length) return `<h2>Drops</h2><div class="empty"><div class="art">${A.bottle("bianco", 80)}</div>No drops right now. Amabile places bottles at real spots around Lagos. Check back on Friday.</div>`;
    return `<h2>Drops</h2><p class="muted">Bottles placed at real spots. Be there to claim one for your table.</p><div class="list">` + ds.map((d) => {
      const v = venueOf(d.venueId);
      return `<button class="item" data-dropgo="${d.id}" style="text-align:left"><div class="bt ph">${photo((d.wines || [])[0] || "rosso", 80)}</div><div class="grow"><h4>${d.hidden ? "Somewhere in Lagos" : esc(v ? v.name : "")}</h4>
        <div class="sub">${esc(KIND[d.kind] || "")}${d.reward ? " · " + esc(d.reward) : ""}</div>
        <div class="row" style="margin-top:6px">${d.state === "live" ? `<span class="tag wine">Live · ${d.left} of ${d.bottles} left</span><span class="muted">ends ${timeShort(d.end)}</span>` : `<span class="tag">${new Date(d.start).toLocaleDateString("en-NG", { weekday: "long", timeZone: "Africa/Lagos" })} ${timeShort(d.start)}</span>`}</div></div></button>`;
    }).join("") + `</div>`;
  }
  function dropCard(id) {
    const d = (S.cfg.drops || []).find((x) => x.id === id); if (!d) return;
    const v = venueOf(d.venueId);
    closeSheet();
    modal(`<div class="reveal">${photo((d.wines || [])[0] || "rosso", 200)}</div>
      <h2>${d.hidden ? "A hidden drop" : "Drop at " + esc(v ? v.name : "")}</h2>
      <p>${esc(KIND[d.kind] || "")}. ${d.state === "live" ? `<b>${d.left} of ${d.bottles}</b> left, ends ${timeShort(d.end)}.` : `Starts ${timeShort(d.start)}.`}</p>
      ${d.clue ? `<p class="note" style="font-family:var(--serif);font-size:19px;color:var(--wine)">${esc(d.clue)}</p>` : ""}
      ${d.kind === "gathering" ? `<p class="muted">Opens when ${d.gatheringLights} people are outside there.</p>` : ""}
      ${d.reward ? `<p class="muted">${esc(d.reward)}</p>` : ""}
      <p class="muted">One bottle per table of two or more, shared. One drop a night.</p>
      ${d.state === "live" ? `<button class="btn block" id="go">I'm here. Claim one</button>` : ""}
      ${v && !d.hidden ? `<p></p><a class="btn block ghost" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}">Directions</a>` : ""}`, (c) => {
      const go = c.querySelector("#go"); if (go) go.onclick = () => needSignIn(() => dropClaim(d));
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
        if (!c.querySelector("#two").checked) return (c.querySelector("#msg").textContent = errMsg("two_plus"));
        c.querySelector("#msg").textContent = "Finding you...";
        const loc = await getLocation();
        if (!loc) return (c.querySelector("#msg").textContent = "Turn on location for this site, then try again.");
        const pt = c.querySelector("#pt");
        const r = await api("drop", { dropId: d.id, ...loc, table: c.querySelector("#tb").value, spot: c.querySelector("#sp").value, twoPlus: true, wine, passTo: pt ? pt.value : "" });
        if (!r.ok) return (c.querySelector("#msg").textContent = r.error === "locked" ? `Opens at ${r.need} people. ${r.here} here now.` : r.error === "pass_table" ? "Pick a table to pass it to." : errMsg(r.error));
        await loadConfig(); await loadMe(); closeModal();
        const t = S.me.tickets.find((x) => x.ticketId === r.ticket.id);
        if (pt && pt.value) toast("Sent to table " + pt.value + ". Nice."); else if (t) glowPrompt(t);
        if (r.last) toast("Last bottle. " + (d.reward || ""), 4000);
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
      ${drop ? `<button class="item" data-d="${drop.id}" style="width:100%;text-align:left"><div class="bt">${A.bottle("rosso", 40)}</div><div class="grow"><h4>Drop ${drop.state === "live" ? "live now" : timeShort(drop.start)}</h4><div class="sub">${drop.left} of ${drop.bottles} left</div></div></button>` : ""}
      ${bag.length ? `<h3>Claimable here</h3><div class="list">${bag.map((b) => `<div class="item"><div class="bt ph">${photo(b.wine, 56)}</div><div class="grow"><h4>From ${esc(b.from)}</h4></div><button class="btn small" data-c="${b.id}">Bring it here</button></div>`).join("")}</div>` : ""}
      <p></p><a class="btn block ghost" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}">Directions</a>`, (c) => {
      c.querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => claimFlow(b.dataset.c, v.id)));
      c.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => dropCard(b.dataset.d)));
    });
  }

  // ---------- me ----------
  async function meCard() {
    const p = S.me.player;
    // Kept bare on purpose: nothing here suggests anyone can see where you are.
    modal(`<div class="row"><div>${A.avatar(p.avatar, 96)}</div><div class="grow"><h2 style="margin:0">${esc(p.name)}</h2>
      <div class="muted" style="margin-top:6px">${p.sentCount || 0} bottles sent</div></div></div>
      ${S.me.light ? `<div class="outnote"><b>No one can see where you are.</b> Your people just know you're outside tonight. <button class="link" id="lightOff">Turn off</button></div>` : ""}
      <p></p><button class="btn block ghost" id="look">Change my avatar</button><p></p><button class="link" id="out">Sign out</button><p class="muted" style="text-align:center">Own a venue? <a href="/outside/venue">Get it on the map</a></p>`, (c) => {
      c.querySelector("#look").onclick = () => profileStep(null, true);
      const lf = c.querySelector("#lightOff"); if (lf) lf.onclick = async () => { await api("light", { on: false }); closeModal(); await loadMe(); toast("Done."); };
      c.querySelector("#out").onclick = () => { S.token = null; S.me = null; LS.del("outside.token"); closeModal(); renderChrome(); renderMap(); };
    });
  }


  // ---------- boot ----------
  async function boot() {
    setDayNight();
    const url = new URL(location.href);
    const path = location.pathname.slice(BASE.length);
    const m = path.match(/^\/c\/([^/]+)/);
    if (url.searchParams.get("f")) S.invite = url.searchParams.get("f").replace(/[^0-9a-f]/g, "").slice(0, 32);
    await loadConfig();
    centerOn(3.428, 6.432, Math.max(limits().min, innerWidth / 180));
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
    else if (S.invite && !S.me) signIn();
    const paid = url.searchParams.get("paid") || url.searchParams.get("topup");
    if (paid) { history.replaceState(null, "", BASE + "/"); paidReturn(paid, !!url.searchParams.get("topup")); }
    else if (!S.token && !S.invite) welcome();
    setInterval(() => { setDayNight(); if (document.visibilityState === "visible") loadMe(); }, 30000);
    setInterval(() => { if (document.visibilityState === "visible") loadConfig(); }, 60000);
  }
  function welcome() {
    modal(`<div class="empty"><div class="art">${A.avatar({ skin: "s2", hair: "gele", face: "grin", outfit: "owambe" }, 92)}${A.avatar({ skin: "s4", hair: "cap", face: "shades", outfit: "jersey" }, 92)}</div></div>
      <h2>Lagos is outside.</h2><p>Send a friend an Amabile. It comes to their table the next time they're out. Find drops at real spots around the city.</p>
      <button class="btn block" id="go">Sign in with your number</button><p></p><button class="btn block ghost" data-x5>Just look around</button>
      <p class="muted" style="font-size:12px;text-align:center">For people 18 and over. Drink responsibly.</p>`, (c) => {
      c.querySelector("#go").onclick = () => signIn();
      c.querySelector("[data-x5]").onclick = closeModal;
    });
  }
  boot();
})();
