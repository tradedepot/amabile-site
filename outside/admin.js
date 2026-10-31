// Andiamo! admin console. The team signs in with Google (tradedepot.co, on the team list); each role sees only its own part.
// The root password (ANDIAMO_ADMIN_KEY) also gets in, as owner. Talks to /api/outside-admin.
(() => {
  const API = "/api/outside-admin";
  const A = window.OutsideArt;
  const SS = { get(k) { try { return sessionStorage.getItem(k); } catch { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch {} }, del(k) { try { sessionStorage.removeItem(k); } catch {} } };
  const LS = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} }, del(k) { try { localStorage.removeItem(k); } catch {} } };
  let ak = SS.get("outside.ak") || "", at = LS.get("andiamo.at") || "", ME = null, page = "overview";
  // What this person may do, as the server told us. The server checks every call again.
  const can = (a) => !!ME && (ME.can === "*" || (ME.can || []).includes(a));
  const D = {};

  // ---------- names ----------
  const BAND_NAMES = { everyday: "Bene", lounge: "Molto Bene", premium: "Benissimo", top: "Mamma Mia!" };
  const STAGE = { requested: "Requested", visit_booked: "Visit booked", listed: "Listed", stocked: "Stock noted", live: "Live", declined: "Declined", paused: "Offline" };
  const VKIND = { lounge: "Lounge or bar", restaurant: "Restaurant", hotel: "Hotel", rooftop: "Rooftop", beach: "Beach", brewery: "Brewery", club: "Club", garden: "Garden or terrace" };
  const ROLE = { owner: "Owner", manager: "Manager", other: "Other" };
  const ARTS = ["lounge", "restaurant", "hotel", "rooftop", "beach", "brewery", "club", "garden"];
  const BST = { pending: ["Awaiting payment", ""], link: ["Card shared", "gold"], waiting: ["Waiting", "gold"], topup: ["Needs top-up", "warn"], on_way: ["On the way", "red"], claimed: ["Delivered", "ok"], served: ["Delivered", "ok"], paid: ["Paid", "gold"],
    review: ["Review", "warn"], refused: ["Refused", "warn"], declined: ["Declined", ""], cancelled: ["Cancelled", ""] };
  const ICON = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    drops: '<path d="M12 3l2.2 5.3L20 9l-4.4 3.8L17 19l-5-3-5 3 1.4-6.2L4 9l5.8-.7z"/>',
    venues: '<path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/><path d="M4 21h16"/>',
    requests: '<path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',
    bottles: '<path d="M10 2h4v4l1.5 3V21a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V9L10 6z"/><path d="M8.5 13h7"/>',
    payouts: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16" cy="14.5" r="1.4"/>',
    prices: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
    team: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c3 .2 5 2.5 5 5.8"/>',
    codes: '<path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z"/><path d="M10 9l4 6M10 9.5h.01M14 14.5h.01"/>',
    gaps: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    flame: '<path d="M12 22c4 0 7-2.7 7-6.6 0-3.6-2.6-6-4-8.4-.5 2-1.6 3.2-3 3.6C12.5 7.6 11 4.6 8.6 2 8.7 6.2 5 8.6 5 13.4 5 18.3 8 22 12 22z"/>',
    open: '<path d="M4 20h16"/><path d="M6 20V9l6-5 6 5v11"/><path d="M10 20v-5h4v5"/>',
    gathering: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M14 14.3c.6-.2 1.3-.3 2-.3 3.3 0 6 2.7 6 6"/>',
    hidden: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/><path d="M11 8v3l2 2"/>',
    passiton: '<path d="M4 12h13"/><path d="M13 6l6 6-6 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/>', send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>', refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
    chat: '<path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.4A8.5 8.5 0 1 1 21 11.5z"/>', tick: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>',
    wallet: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 10h18"/><path d="M16 15h2"/>',
    ext: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    download: '<path d="M12 4v12"/><path d="M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'
  };
  const ic = (n, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[n] || ""}</svg>`;
  const DKIND = {
    open: { t: "Open", s: "First tables to claim get it.", p: "First tables to claim" },
    gathering: { t: "Gathering", s: "Locked until the room fills up. Builds a crowd.", p: "Opens when the room fills up" },
    hidden: { t: "Hidden", s: "Players only get a clue. They hunt for the spot.", p: "Find it from the clue" },
    passiton: { t: "Pass it on", s: "Claim it, then send it to another table.", p: "Claim it, then send it to another table" }
  };
  const ITEMS = ["Amabile playing cards", "Amabile tote bag", "Amabile cap", "Amabile fan"];
  const REWARDS = ["Suya platter for the last table", "A second bottle for the last table", "Small chops for the last table"];

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const naira = (n) => "₦" + Math.round(Number(n) || 0).toLocaleString("en-NG");
  const $ = (id) => document.getElementById(id);
  // Phone numbers: a flag and country code in the field, a native list behind it, as in the guest app. Nigeria by default.
  const CCS = [["234", "NG", "Nigeria"], ["233", "GH", "Ghana"], ["254", "KE", "Kenya"], ["27", "ZA", "South Africa"], ["225", "CI", "Côte d'Ivoire"], ["229", "BJ", "Benin"], ["228", "TG", "Togo"], ["237", "CM", "Cameroon"], ["221", "SN", "Senegal"],
    ["44", "GB", "United Kingdom"], ["1", "US", "United States, Canada"], ["353", "IE", "Ireland"], ["33", "FR", "France"], ["49", "DE", "Germany"], ["39", "IT", "Italy"], ["31", "NL", "Netherlands"], ["34", "ES", "Spain"], ["41", "CH", "Switzerland"],
    ["971", "AE", "United Arab Emirates"], ["974", "QA", "Qatar"], ["966", "SA", "Saudi Arabia"], ["61", "AU", "Australia"], ["86", "CN", "China"], ["91", "IN", "India"], ["55", "BR", "Brazil"]];
  const flagOf = (iso) => iso.replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
  const ccLabel = (cc) => { const x = CCS.find(([k]) => k === cc) || CCS[0]; return `${flagOf(x[1])} +${x[0]}`; };
  const splitPhone = (v) => { const t = String(v || "").trim(), d = t.replace(/\D/g, ""); if (!t.startsWith("+")) return ["234", t]; const x = [...CCS].sort((a, b) => b[0].length - a[0].length).find(([k]) => d.startsWith(k)); return x ? [x[0], d.slice(x[0].length)] : ["234", t]; };
  const phoneField = (id, value = "", ph = "803 000 0000") => {
    const [cc, rest] = splitPhone(value);
    return `<div class="phonef"><span class="ccbox"><span id="${id}_ccv">${ccLabel(cc)}</span><svg viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <select id="${id}_cc" aria-label="Country">${CCS.map(([k, iso, n]) => `<option value="${k}"${k === cc ? " selected" : ""}>${flagOf(iso)} ${esc(n)} +${k}</option>`).join("")}</select></span>
      <input id="${id}" type="tel" inputmode="tel" placeholder="${cc === "234" ? esc(ph) : ""}" value="${esc(rest)}"></div>`;
  };
  // What was typed, with its country code. Typed with + or 00, it keeps its own.
  const phoneOf = (id) => { const inp = $(id), sel = $(id + "_cc"); const raw = String(inp && inp.value || "").trim(), d = raw.replace(/\D/g, ""); if (!d) return ""; if (raw.startsWith("+") || raw.startsWith("00")) return raw; return "+" + (sel ? sel.value : "234") + d.replace(/^0+/, ""); };
  function wirePhone(id) {
    const sel = $(id + "_cc"), inp = $(id), v = $(id + "_ccv"); if (!sel || !inp) return;
    sel.onchange = () => { v.textContent = ccLabel(sel.value); inp.placeholder = sel.value === "234" ? "803 000 0000" : ""; inp.focus(); };
    const trim = () => { if (/^\s*0/.test(inp.value)) inp.value = inp.value.replace(/^\s*0+/, ""); };
    inp.addEventListener("input", trim); trim();
  }
  const LAG = 3600e3, DAY = 86400e3;
  const lagosDayNo = (t) => Math.floor((t + LAG) / DAY);
  const dayOffset = (t) => lagosDayNo(t) - lagosDayNo(Date.now());
  const lagosMidnight = (off) => (lagosDayNo(Date.now()) + off) * DAY - LAG;
  const fmt = (t, o) => new Date(t).toLocaleString("en-GB", { timeZone: "Africa/Lagos", ...o });
  const tm = (t) => fmt(t, { hour: "numeric", minute: "2-digit", hour12: true }).replace(":00", "").replace(" ", "").toLowerCase();
  const dayName = (off, long) => off === 0 ? "Today" : off === 1 ? "Tomorrow" : off === -1 ? "Yesterday" : fmt(lagosMidnight(off) + 12 * 3600e3, { weekday: long ? "long" : "short" });
  const dayIn = (off) => off === 0 ? "tonight" : off === 1 ? "tomorrow" : "on " + dayName(off, true);
  const dayLong = (t) => { const o = dayOffset(t); return o >= -1 && o <= 1 ? dayName(o) : fmt(t, { weekday: "short", day: "numeric", month: "short" }); };
  const range = (a, b) => `${dayLong(a)}, ${tm(a)} to ${tm(b)}`;
  const weekday = (off) => new Date(lagosMidnight(off) + LAG + 12 * 3600e3).getUTCDay();
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? m + "m ago" : m < 1440 ? Math.round(m / 60) + "h ago" : Math.round(m / 1440) + "d ago"; };
  const plural = (n, a, b) => n + " " + (n === 1 ? a : b || a + "s");
  const wineOf = (id) => (D.venues && D.venues.wines || []).find((w) => w.id === id) || { id, name: id, label: id };
  // A venue's level for a wine: the lowest level whose gift price covers its menu price, else the top level.
  const levelOf = (wineId, price) => {
    const b = (D.venues && D.venues.bands && D.venues.bands[wineOf(wineId).family || "frizzante"]) || {};
    for (const k of (D.venues && D.venues.bandOrder) || []) if (b[k] > 0 && b[k] >= price) return k;
    return "top";
  };
  const wineNames = (ids) => { const n = (ids || []).map((w) => wineOf(w).name); return n.length <= 1 ? n.join("") : n.slice(0, -1).join(", ") + " and " + n[n.length - 1]; };
  const photo = (w, cls = "") => `<img class="${cls}" src="/outside/img/bottle-${esc(w)}.jpg" alt="">`;
  const vArt = (v, lit) => `<span class="vart">${A ? A.venueArt((v && v.art) || "lounge", !!lit, 42) : ""}</span>`;
  const venuesAll = () => (D.venues && D.venues.venues) || [];
  const venueById = (id) => venuesAll().find((v) => v.id === id);
  const vName = (id) => (venueById(id) || {}).name || "A venue";
  const glowOf = (id) => (D.glow && D.glow.glow && D.glow.glow[id]) || "";
  const GLOW = { warm: "People out there", bright: "Busy right now", blazing: "Packed right now" };
  const dropState = (d) => d.status === "cancelled" ? "cancelled" : Date.now() > d.end ? "done" : Date.now() >= d.start ? "live" : "soon";
  const dropPic = (d) => d.prize === "item" ? (A ? A.prize(d.icon, 46) : "") : photo((d.wines || [])[0] || "rosso");
  const lagosHour = () => (new Date().getUTCHours() + 1) % 24;

  async function call(body) {
    try {
      const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...(at ? { at } : {}), ...(ak ? { ak } : {}), ...body }) });
      const d = await r.json().catch(() => ({ ok: false, error: "server" }));
      if (r.status === 401) { signOut(); login(ak ? "That password didn't work." : "Sign in again."); throw new Error("auth"); }
      if (r.status === 403 && d.error === "forbidden") toast("That's not part of your role.");
      return d;
    } catch (e) { if (e.message === "auth") throw e; return { ok: false, error: "network" }; }
  }
  const LOAD = {
    venues: () => call({ action: "venues" }), drops: () => call({ action: "drops" }), bottles: () => call({ action: "bottles" }),
    ledger: () => call({ action: "ledger" }), codes: () => call({ action: "codes" }), balance: () => call({ action: "balance" }), requests: () => call({ action: "requests" }), unmet: () => call({ action: "unmet" }), glow: () => call({ action: "glow" }), team: () => call({ action: "team" }), activity: () => call({ action: "activity" }), wa: () => call({ action: "wa-status" }), wallet: () => call({ action: "wallet-status" })
  };
  const ACT = { wa: "wa-status", wallet: "wallet-status" };
  async function load(...all) {
    const keys = all.filter((k) => can(ACT[k] || k));
    const rs = await Promise.all(keys.map((k) => LOAD[k]()));
    keys.forEach((k, i) => {
      const r = rs[i];
      if (k === "venues") D.venues = r.ok ? r : D.venues || { venues: [], wines: [], bands: {}, bandOrder: [] };
      else if (k === "glow") D.glow = r.ok ? r.glow : { glow: {} };
      else if (k === "wa") D.wa = r.ok ? r.wa : null;
      else if (k === "wallet") D.wallet = r.ok ? r.wallet : null;
      else if (k === "balance") D.balance = r.ok ? r.balance : null;
      else if (k === "team") D.team = r.ok ? r : null;
      else if (k === "ledger") { D.ledger = r.ok ? r.ledger || [] : D.ledger || []; D.ledgerAuto = !!(r.ok && r.auto); }
      else D[k] = r.ok ? r[k === "ledger" ? "ledger" : k] || [] : D[k] || [];
    });
    navCounts();
  }

  // A field that needs fixing: red outline, a line under it, brought into view and focused, a nudge. Changing it clears it.
  function flag(el, text) {
    if (!el) return toast(text);
    const input = el; el = el.closest(".phonef") || el;
    unflag(el);
    el.classList.add("bad");
    const p = document.createElement("p"); p.className = "ferr"; p.setAttribute("role", "alert"); p.textContent = text;
    el.insertAdjacentElement("afterend", p);
    el.classList.remove("nudge"); void el.offsetWidth; el.classList.add("nudge");
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    if (input.matches("input, select, textarea")) try { input.focus({ preventScroll: true }); } catch {}
    const off = () => unflag(el);
    ["input", "change", "click"].forEach((ev) => el.addEventListener(ev, off, { once: true }));
  }
  function unflag(el) { const n = el.nextElementSibling; if (n && n.classList.contains("ferr")) n.remove(); el.classList.remove("bad"); }
  function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
  function dialog({ title, html = "", input, okText = "OK", cancel = "Cancel", danger }) {
    return new Promise((res) => {
      const el = document.createElement("div"); el.className = "dlg";
      el.innerHTML = `<div class="card"><h2>${esc(title)}</h2>${html ? `<p class="muted" style="margin:0 0 12px">${html}</p>` : ""}${input ? `<input id="dlgin" placeholder="${esc(input)}">` : ""}
        <div class="row" style="justify-content:flex-end;margin-top:18px">${cancel ? `<button class="btn sec" data-x>${esc(cancel)}</button>` : ""}<button class="btn${danger ? " dark" : ""}" data-ok>${esc(okText)}</button></div></div>`;
      document.body.appendChild(el);
      const done = (v) => { el.remove(); res(v); };
      el.querySelector("[data-ok]").onclick = () => done(input ? el.querySelector("#dlgin").value : true);
      const x = el.querySelector("[data-x]"); if (x) x.onclick = () => done(input ? null : false);
      el.onclick = (e) => { if (e.target === el) done(input ? null : false); };
      const i = el.querySelector("#dlgin"); if (i) { i.focus(); i.onkeydown = (e) => { if (e.key === "Enter") done(i.value); }; }
    });
  }

  // ---------- login and frame ----------
  const root = document.getElementById("root");
  function signOut() { at = ""; ak = ""; ME = null; LS.del("andiamo.at"); SS.del("outside.ak"); try { window.google && google.accounts.id.disableAutoSelect(); } catch {} }
  async function start() {
    const r = await call({ action: "me" });
    if (!r.ok) return login();
    ME = r.me; frame(); nav("overview");
  }
  // Sign in with Google. Only tradedepot.co accounts on the team list get in. The root password is a fallback.
  function login(msg) {
    root.innerHTML = `<div class="login"><div class="lgbox">
      <div class="lgart"><div class="lgmark">Andiamo!</div><div class="lgsub">Admin console</div><div class="rings"><i></i><i></i><i></i><b></b></div></div>
      <div class="lgform"><h1>Welcome back</h1><p class="lead">Sign in with your TradeDepot Google account.</p>
        <div id="gbtn" class="gbtn"></div>
        <div class="lgor">or</div>
        <button class="lgalt" id="pw"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>Use the root password</button>
        <div class="lgpw" id="pwbox" hidden><input id="k" type="password" placeholder="Root password" aria-label="Root password" autocomplete="current-password"><button class="btn" id="go">Sign in</button></div>
        <p class="ferr" id="gerr" hidden></p>
      </div></div></div>`;
    const err = (t) => { const e = $("gerr"); e.textContent = t; e.hidden = !t; };
    const E = { not_on_team: "You're not on the Andiamo team yet. Ask Kachi to add you.", not_tradedepot: "Use your TradeDepot account (@tradedepot.co).", google: "Google sign-in didn't work. Try again.", network: "You're offline. Try again." };
    const onCred = async (resp) => {
      err("");
      const r = await call({ action: "google", credential: resp.credential }).catch(() => ({ ok: false, error: "network" }));
      if (!r.ok) return err(E[r.error] || E.google);
      at = r.token; LS.set("andiamo.at", at); ME = r.me; frame(); nav("overview");
    };
    const mount = async () => {
      const h = await call({ action: "hello" }).catch(() => null);
      if (!h || !h.ok || !window.google || !google.accounts) return err("Google sign-in didn't load. Check your connection.");
      google.accounts.id.initialize({ client_id: h.clientId, callback: onCred, hd: "tradedepot.co", ux_mode: "popup", auto_select: false });
      google.accounts.id.renderButton($("gbtn"), { theme: "outline", size: "large", shape: "pill", text: "signin_with", width: Math.min(400, $("gbtn").clientWidth || 320) });
    };
    if (window.google && google.accounts) mount();
    else if (!document.getElementById("gsi")) { const sc = document.createElement("script"); sc.id = "gsi"; sc.src = "https://accounts.google.com/gsi/client"; sc.async = true; sc.onload = mount; sc.onerror = () => err("Google sign-in didn't load. Check your connection."); document.head.appendChild(sc); }
    else document.getElementById("gsi").addEventListener("load", mount);
    $("pw").onclick = () => { $("pwbox").hidden = false; $("pw").hidden = true; $("k").focus(); };
    const go = async () => {
      if (!$("k").value) { err("Enter the root password."); return $("k").focus(); }
      ak = $("k").value; at = ""; $("go").disabled = true;
      try { const r = await call({ action: "me" }); if (r.ok) { SS.set("outside.ak", ak); ME = r.me; frame(); nav("overview"); } else err("That password didn't work."); } catch {}
      if ($("go")) $("go").disabled = false;
    };
    $("go").onclick = go; $("k").onkeydown = (e) => { if (e.key === "Enter") go(); };
    if (msg) err(msg);
  }
  const PAGES = [["overview", "Overview", "home"], ["drops", "Drops", "drops"], ["venues", "Venues", "venues"], ["requests", "Requests", "requests"], ["bottles", "Bottles", "bottles"], ["payouts", "Payouts", "payouts"], ["prices", "Prices", "prices"], ["codes", "Codes", "codes"], ["gaps", "Gaps", "gaps"], ["whatsapp", "WhatsApp", "chat"], ["wallet", "Wallet", "wallet"], ["team", "Team", "team"]];
  // A page shows when the person can do its main thing.
  const PAGE_NEEDS = { overview: "venues", drops: "drop-save", venues: "venues", requests: "requests", bottles: "bottles", payouts: "ledger", prices: "bands-save", codes: "codes", gaps: "unmet", whatsapp: "wa-status", wallet: "wallet-status", team: "team" };
  const myPages = () => PAGES.filter(([k]) => can(PAGE_NEEDS[k]));
  function frame() {
    root.innerHTML = `<div class="app"><aside class="side"><div class="brand"><span class="logo">Andiamo!</span><span class="by">Admin console</span></div>
      <nav class="nav">${myPages().map(([k, n, i]) => `<button data-nav="${k}">${ic(i)}<span>${n}</span><span class="ct" id="ct-${k}" hidden></span></button>`).join("")}</nav>
      <button class="navout" id="signout2">Sign out</button>
      <div class="side-foot"><div class="who"><b>${esc(ME.name)}</b><span>${esc(ME.roleName)}${ME.breakGlass ? "" : " · " + esc(ME.email)}</span></div><div>Lagos <b id="clock"></b></div><button id="signout">Sign out</button></div></aside>
      <main class="main"><div class="page" id="page"></div></main></div>`;
    root.querySelectorAll("[data-nav]").forEach((b) => (b.onclick = () => nav(b.dataset.nav)));
    $("signout").onclick = $("signout2").onclick = () => { signOut(); login(); };
    const clock = () => { const c = $("clock"); if (c) c.textContent = fmt(Date.now(), { weekday: "short", hour: "numeric", minute: "2-digit", hour12: true }); };
    clock(); setInterval(clock, 30000);
  }
  function navCounts() {
    const set = (k, n) => { const el = $("ct-" + k); if (el) { el.hidden = !n; el.textContent = n; } };
    if (D.requests) set("requests", D.requests.filter((r) => r.stage === "requested").length);
    if (D.drops) set("drops", D.drops.filter((d) => dropState(d) === "live").length);
  }
  const P = () => $("page");
  async function nav(p, opts) {
    if (!myPages().some(([k]) => k === p)) p = "overview";
    page = p; P().classList.remove("ro"); window.scrollTo(0, 0);
    root.querySelectorAll("[data-nav]").forEach((b) => b.classList.toggle("on", b.dataset.nav === p));
    P().innerHTML = `<div class="spin">Loading...</div>`;
    try {
      if (p === "overview") { await load("venues", "drops", "bottles", "ledger", "requests", "unmet", "glow"); overview(); }
      if (p === "drops") { await load("venues", "drops", "glow"); drops(opts); }
      if (p === "venues") { await load("venues"); venues(); }
      if (p === "requests") { await load("requests", "venues"); requests(); }
      if (p === "bottles") { await load("bottles", "venues"); bottles(); }
      if (p === "payouts") { await load("ledger", "balance"); payouts(); }
      if (p === "prices") { await load("venues"); prices(); }
      if (p === "codes") { await load("codes"); codes(opts); }
      if (p === "gaps") { await load("unmet", "venues"); gaps(); }
      if (p === "whatsapp") { await load("wa"); whatsapp(); }
      if (p === "wallet") { await load("wallet"); wallet(); }
      if (p === "team") { await load("team", "activity"); team(); }
    } catch {}
  }
  const head = (title, sub, acts = "") => `<div class="ph"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div><div class="acts">${acts}</div></div>`;

  // ---------- overview ----------
  function overview() {
    const vs = venuesAll(), live = vs.filter((v) => v.active), ds = D.drops || [], bs = D.bottles || [], led = D.ledger || [], rq = D.requests || [];
    const wk = Date.now() - 7 * DAY;
    const sent = bs.filter((b) => b.createdAt > wk && !["pending", "cancelled"].includes(b.status));
    const delivered = bs.filter((b) => b.createdAt > wk && ["served", "claimed"].includes(b.status));
    const owed = led.reduce((n, r) => n + r.owed, 0);
    const liveDrops = ds.filter((d) => dropState(d) === "live");
    const weekDrops = ds.filter((d) => d.status !== "cancelled" && dayOffset(d.start) >= 0 && dayOffset(d.start) < 7);
    const glowing = Object.entries((D.glow && D.glow.glow) || {}).map(([id, g]) => ({ v: venueById(id), g })).filter((x) => x.v);
    const h = lagosHour(), hello = h >= 5 && h < 12 ? "Good morning" : h >= 12 && h < 17 ? "Good afternoon" : "Good evening";
    const todo = suggestions();
    P().innerHTML = head(hello, liveDrops.length ? `${plural(liveDrops.length, "drop")} live right now${glowing.length ? `, ${plural(glowing.length, "venue")} busy` : ""}.` : glowing.length ? `${plural(glowing.length, "venue")} busy right now.` : "Here's what needs you today.",
      can("drop-save") ? `<button class="btn" data-go="drops">${ic("plus")} New drop</button>` : "") +
      `<div class="kpis">
        <div class="kpi${liveDrops.length ? " hot" : ""}"><div class="k">Live drops</div><div class="v">${liveDrops.length}</div><div class="s">${weekDrops.length} planned this week</div></div>
        ${can("bottles") ? `<div class="kpi"><div class="k">Bottles sent</div><div class="v">${sent.length}</div><div class="s">Last 7 days</div></div>
        <div class="kpi"><div class="k">Delivered</div><div class="v">${delivered.length}</div><div class="s">${sent.length ? Math.round(100 * delivered.length / sent.length) + "% of sends" : "Last 7 days"}</div></div>` : ""}
        <div class="kpi"><div class="k">Venues live</div><div class="v">${live.length}</div><div class="s">${vs.length - live.length} in the pipeline</div></div>
        ${can("ledger") ? `<div class="kpi"><div class="k">Owed to venues</div><div class="v money">${naira(owed)}</div><div class="s">${plural(led.filter((r) => r.owed).length, "venue")}</div></div>` : ""}
      </div>
      <div class="two"><div class="card"><div class="ch"><h2>Do this next</h2><span class="muted">${todo.length ? plural(todo.length, "thing") : ""}</span></div>
        <div class="todo">${todo.map((t, i) => `<div class="it"><div class="ic ${t.tone || ""}">${ic(t.icon)}</div><div class="tx"><b>${t.title}</b><span>${t.text}</span></div><button class="btn sm${i ? " sec" : ""}" data-todo="${i}">${esc(t.cta)}</button></div>`).join("")
          || `<div class="empty"><b>All clear.</b><br>Nothing is waiting on you. Plan the weekend's drops while it's quiet.</div>`}</div></div>
      <div><div class="card"><div class="ch"><h2>Tonight</h2>${liveDrops.length ? '<span class="pill live"><span class="dot"></span>Live</span>' : ""}</div>
        ${liveDrops.map((d) => `<div style="margin-bottom:14px"><div class="row" style="justify-content:space-between"><b>${esc(vName(d.venueId))}</b><span class="faint">ends ${tm(d.end)}</span></div>
          <div class="bar" style="margin:8px 0 4px"><i style="width:${Math.min(100, 100 * d.taken / d.bottles)}%"></i></div><div class="faint">${d.taken} of ${d.bottles} claimed · ${esc(DKIND[d.kind].t)}</div></div>`).join("")}
        ${glowing.length ? `<div class="faint" style="margin:6px 0 2px;font-weight:800">BUSY RIGHT NOW</div>${glowing.map((x) => `<div class="buzz"><span class="glowdot ${x.g}"></span><b style="flex:1">${esc(x.v.name)}</b><span class="faint">${GLOW[x.g]}</span></div>`).join("")}` : ""}
        ${!liveDrops.length && !glowing.length ? `<div class="empty" style="padding:18px 0">Quiet so far. Busy venues show here as people tap Glow.</div>` : ""}</div>
      ${can("bottles") ? `<div class="card"><div class="ch"><h2>Latest bottles</h2><button class="lnk" data-go="bottles">See all</button></div><div class="feed">
        ${bs.slice(0, 6).map((b) => `<div class="fi">${photo(b.wine, "thumb")}<div style="flex:1;min-width:0"><b>${esc(b.from || "Someone")}</b> <span class="muted">to ${esc(b.to || "a card link")}</span><div class="faint">${esc(wineOf(b.wine).name)} · ${ago(b.createdAt)}</div></div>${bpill(b.status)}</div>`).join("")
          || `<div class="empty" style="padding:18px 0">No bottles sent yet.</div>`}</div></div>` : ""}</div></div>`;
    P().querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => nav(b.dataset.go)));
    P().querySelectorAll("[data-todo]").forEach((b) => (b.onclick = () => todo[+b.dataset.todo].go()));
  }
  const bpill = (s) => { const [n, c] = BST[s] || [s, ""]; return `<span class="pill ${c}">${esc(n)}</span>`; };

  // What deserves attention, most useful first.
  function suggestions() {
    const out = [], vs = venuesAll(), ds = D.drops || [], rq = D.requests || [], led = D.ledger || [], bs = D.bottles || [];
    const fresh = rq.filter((r) => r.stage === "requested");
    if (fresh.length) out.push({ icon: "requests", title: `${plural(fresh.length, "venue")} asked to join`, text: `${esc(fresh.slice(0, 2).map((r) => r.name).join(", "))}${fresh.length > 2 ? " and more" : ""}. Book a visit with Anita or Aylor.`, cta: "Book visits", go: () => nav("requests") });
    const ready = vs.filter((v) => !v.active && v.checks && !v.checks.missing.length && v.stage !== "paused");
    if (ready.length) out.push({ icon: "venues", tone: "ok", title: `${esc(ready[0].name)} is ready to go live`, text: "Location, level and prices are in. One tap puts it on the map.", cta: "Open venue", go: () => { nav("venues").then(() => venueForm(ready[0])); } });
    const stuck = vs.filter((v) => !v.active && v.checks && v.checks.missing.length && v.stage !== "paused");
    if (stuck.length) out.push({ icon: "alert", tone: "gold", title: `${plural(stuck.length, "venue")} not live yet`, text: `${esc(stuck[0].name)} still needs ${esc(stuck[0].checks.missing.join(", "))}.`, cta: "Finish", go: () => { nav("venues").then(() => venueForm(stuck[0])); } });
    const weekend = [];
    for (let i = 0; i < 7; i++) if ([5, 6].includes(weekday(i))) weekend.push(i);
    const bare = weekend.filter((i) => !ds.some((d) => d.status !== "cancelled" && dayOffset(d.start) === i));
    if (vs.some((v) => v.active) && bare.length) out.push({ icon: "drops", title: `Nothing dropping ${dayIn(bare[0])}`, text: "Friday and Saturday nights are when people are out. We've lined up ideas.", cta: "Plan a drop", go: () => nav("drops") });
    const owed = led.filter((r) => r.owed);
    if (owed.length) out.push({ icon: "cash", tone: "ink", title: `${naira(owed.reduce((n, r) => n + r.owed, 0))} owed to ${plural(owed.length, "venue")}`, text: `${esc(owed[0].name)} is owed the most. Pay by transfer, then mark it paid.`, cta: "Pay venues", go: () => nav("payouts") });
    const pfail = led.reduce((n, r) => n + ((r.failed || []).length), 0);
    if (pfail) out.unshift({ icon: "cash", tone: "gold", title: `${plural(pfail, "payout")} to venues failed`, text: `${esc((led.find((r) => (r.failed || []).length) || {}).name || "A venue")} is waiting. Check the reason and send it again.`, cta: "Fix payouts", go: () => nav("payouts") });
    const failed = bs.filter((b) => b.notice && !b.notice.ok && Date.now() - b.createdAt < 3 * DAY);
    if (failed.length) out.push({ icon: "send", tone: "gold", title: `${plural(failed.length, "bottle message")} didn't go out`, text: "The recipient wasn't told on WhatsApp. Check the template and token.", cta: "See bottles", go: () => nav("bottles") });
    const hot = gapCells().filter((c) => c.n >= 3);
    if (hot.length) out.push({ icon: "gaps", tone: "ink", title: `${plural(hot[0].n, "person", "people")} tried to claim where we have no venue`, text: "One spot keeps coming up. Worth listing a venue there.", cta: "See where", go: () => nav("gaps") });
    return out;
  }

  // ---------- drops ----------
  let B = null; // the drop being built
  const newB = (o = {}) => ({ venueId: "", prize: "bottle", wines: ["rosso", "bianco"], item: "", icon: "cards", kind: "open", lights: 15, clue: "", day: nextBigNight(), hour: 21, len: 3, count: 20, reward: "", ...o });
  function nextBigNight() { for (let i = 0; i < 7; i++) if (weekday(i) === 5) return i; return 0; }
  function bTimes() {
    const now = Date.now();
    let start = B.hour === "now" ? Math.ceil(now / 300000) * 300000 : lagosMidnight(B.day) + B.hour * 3600e3;
    const cap = lagosMidnight(B.day + (B.hour === "now" && lagosHour() < 6 ? 0 : 1)) + 2 * 3600e3;
    let end = B.len === "late" ? cap : start + B.len * 3600e3;
    if (end > cap) end = cap;
    return { start, end };
  }
  function bCheck() {
    const { start, end } = bTimes();
    if (!B.venueId) return { msg: "Pick a venue.", at: "#bvenues" };
    if (B.prize === "bottle" && !B.wines.length) return { msg: "Pick at least one wine.", at: "#bwines" };
    if (B.prize === "item" && !B.item.trim()) return { msg: "Say what's dropping. Players see this.", at: "#bitem" };
    if (B.kind === "hidden" && !B.clue.trim()) return { msg: "Write the clue players will see.", at: "#bclue" };
    if (end <= start) return { msg: "That end time is before the start.", at: "#bwhen" };
    if (end < Date.now()) return { msg: "That time has already passed. Pick a later start.", at: "#bwhen" };
    return null;
  }


  function ideas() {
    const vs = venuesAll().filter((v) => v.active), ds = (D.drops || []).filter((d) => d.status !== "cancelled");
    if (!vs.length) return [];
    const nights = [];
    for (let i = 0; i < 7; i++) if ([4, 5, 6].includes(weekday(i)) && !ds.some((d) => dayOffset(d.start) === i) && !(i === 0 && lagosHour() >= 23)) nights.push(i);
    const big = nights.filter((i) => [5, 6].includes(weekday(i)));
    for (let i = 1; i < 7 && nights.length < 3; i++) if (!nights.includes(i) && !ds.some((d) => dayOffset(d.start) === i) && [0, 3].includes(weekday(i))) nights.push(i);
    while (nights.length < 3 && big.length) nights.push(big[nights.length % big.length]);
    nights.sort((a, b) => a - b);
    const last = (id) => ds.filter((d) => d.venueId === id && dropState(d) === "done").sort((a, b) => b.start - a.start)[0];
    const score = (v) => ({ blazing: 6, bright: 4, warm: 2 }[glowOf(v.id)] || 0) + (last(v.id) ? 0 : 3) + (ds.some((d) => d.venueId === v.id && dayOffset(d.start) >= 0) ? -5 : 0) + Math.random();
    const ranked = vs.map((v) => ({ v, s: score(v) })).sort((a, b) => b.s - a.s).map((x) => x.v);
    const out = [];
    nights.slice(0, 3).forEach((day, i) => {
      const v = ranked[i % ranked.length]; if (!v) return;
      const l = last(v.id), g = glowOf(v.id), dow = weekday(day);
      const o = { venueId: v.id, day, hour: [5, 6].includes(dow) ? 21 : 20, len: 3, kind: "open", prize: "bottle", wines: ["rosso", "bianco"], count: 20 };
      let why = "Never had a drop. Put it on the map.";
      if (l && l.taken >= l.bottles) { o.count = Math.min(60, l.bottles + 10); why = `Last drop ran out (${l.taken} of ${l.bottles}). Go bigger.`; }
      else if (l && l.taken < l.bottles / 2) { o.kind = "gathering"; o.lights = 12; why = `Last drop was slow (${l.taken} of ${l.bottles}). A Gathering drop fills the room first.`; }
      else if (l) why = `Last drop: ${l.taken} of ${l.bottles} claimed. Keep the rhythm.`;
      if (g) why = `${GLOW[g]}. Strike while it's busy.` + (l && l.taken >= l.bottles ? ` Last one ran out.` : "");
      if (i === 2) { o.prize = "item"; o.item = "Amabile playing cards"; o.icon = "cards"; o.kind = "gathering"; o.lights = 15; o.count = 15; why = "Mix it up. Playing cards keep the table playing and the bottle open."; }
      out.push({ o, v, why });
    });
    return out;
  }
  const ideaWhat = (o) => `${o.prize === "item" ? o.count + " × " + o.item : o.count + " bottles of " + wineNames(o.wines)} · ${DKIND[o.kind].t}${o.kind === "gathering" ? " at " + o.lights + " people" : ""}`;

  function drops(opts = {}) {
    const ds = D.drops || [], vs = venuesAll().filter((v) => v.active);
    if (opts.preset) B = newB(opts.preset); else if (!B) B = newB({ venueId: vs[0] ? vs[0].id : "" });
    const days = [...Array(7)].map((_, i) => i);
    const idea = ideas();
    const tab = opts.tab || (ds.some((d) => dropState(d) === "live") ? "live" : "soon");
    P().innerHTML = head("Drops", "Free bottles and cool stuff at real spots. Plan the week, then watch it go.", `<button class="btn sec" id="refresh">${ic("refresh")} Refresh</button><button class="btn" id="tobuild">${ic("plus")} New drop</button>`) +
      `<div class="card" style="padding:16px"><div class="ch"><h2>This week</h2><span class="muted">Tap an empty night to plan it.</span></div><div class="week">${days.map((i) => {
        const dd = ds.filter((d) => dayOffset(d.start) === i).sort((a, b) => a.start - b.start), big = [5, 6].includes(weekday(i));
        return `<div class="day${big ? " big" : ""}${i === 0 ? " today" : ""}${dd.length ? "" : " empty-day"}"><div class="dh"><span class="dn">${dayName(i)}</span><span class="dd">${fmt(lagosMidnight(i) + 12 * 3600e3, { day: "numeric" })}</span></div>
          ${big ? `<span class="tagl">${weekday(i) === 5 ? "Big night" : "Big night"}</span>` : ""}
          ${dd.map((d) => { const st = dropState(d); return `<button class="dchip ${st}" data-dd="${d.id}"><span class="tm">${tm(d.start)} to ${tm(d.end)}${st === "live" ? " · LIVE" : ""}</span><span class="vn">${esc(vName(d.venueId))}</span>
            <span class="kd">${ic(d.kind, "")}${esc(d.prize === "item" ? d.item : DKIND[d.kind].t)}</span>${st !== "soon" && st !== "cancelled" ? `<span class="bar"><i style="width:${Math.min(100, 100 * d.taken / d.bottles)}%"></i></span><span class="tm">${d.taken} of ${d.bottles}</span>` : `<span class="tm">${d.bottles} ${d.prize === "item" ? "to give" : "bottles"}</span>`}</button>`; }).join("")}
          <button class="addslot" data-newday="${i}">${dd.length ? "+ Another" : ic("plus") + "<span>Plan a drop</span>"}</button></div>`; }).join("")}</div></div>` +
      (idea.length ? `<div style="margin:26px 0 12px" class="row"><h2 style="font-size:24px">Ideas for this week</h2><span class="muted">Based on who's busy and how past drops went.</span></div>
        <div class="ideas">${idea.map((x, i) => `<div class="idea"><div class="top">${vArt(x.v, !!glowOf(x.v.id))}<div><div class="when">${dayName(x.o.day, true)} · ${x.o.hour > 12 ? x.o.hour - 12 : x.o.hour}pm</div><h3>${esc(x.v.name)}</h3></div></div>
          <div class="what">${esc(ideaWhat(x.o))}</div><div class="why">${ic("bulb")}<span>${esc(x.why)}</span></div><button class="btn sm" data-idea="${i}">Set it up</button></div>`).join("")}</div>` : "") +
      `<div class="card" id="builder" style="margin-top:26px"><div class="ch"><h2>Plan a drop</h2><button class="lnk dim" id="breset">Start over</button></div><div class="builder"><div id="bsteps"></div><div class="pv"><div class="cap">What players see</div><div class="phone"><div class="screen"><div class="mapbg"></div><div class="pill-top"><b>Andiamo!</b><small>BY AMABILE DI ROSA</small></div><div id="bprev"></div></div></div></div></div></div>` +
      `<div class="card"><div class="ch"><h2>All drops</h2><div class="seg" id="dseg">${[["live", "Live now"], ["soon", "Coming up"], ["done", "Past"]].map(([k, n]) => `<button data-tab="${k}" class="${k === tab ? "on" : ""}">${n} <small>${ds.filter((d) => (k === "done" ? ["done", "cancelled"].includes(dropState(d)) : dropState(d) === k)).length}</small></button>`).join("")}</div></div><div id="dlist"></div></div>`;
    renderBuilder(); dlist(tab);
    $("refresh").onclick = () => nav("drops", { tab });
    $("tobuild").onclick = () => $("builder").scrollIntoView({ behavior: "smooth" });
    $("breset").onclick = () => { B = newB({ venueId: vs[0] ? vs[0].id : "" }); renderBuilder(); };
    P().querySelectorAll("[data-newday]").forEach((b) => (b.onclick = () => { B.day = +b.dataset.newday; B.hour = B.day === 0 && lagosHour() >= 21 ? "now" : 21; renderBuilder(); $("builder").scrollIntoView({ behavior: "smooth" }); }));
    P().querySelectorAll("[data-idea]").forEach((b) => (b.onclick = () => { B = newB(idea[+b.dataset.idea].o); renderBuilder(); $("builder").scrollIntoView({ behavior: "smooth" }); }));
    P().querySelectorAll("[data-dd]").forEach((b) => (b.onclick = () => { const d = ds.find((x) => x.id === b.dataset.dd); const st = dropState(d); dlist(st === "cancelled" ? "done" : st); document.querySelectorAll("#dseg button").forEach((x) => x.classList.toggle("on", x.dataset.tab === (st === "cancelled" ? "done" : st))); $("dlist").scrollIntoView({ behavior: "smooth", block: "center" }); }));
    document.querySelectorAll("#dseg button").forEach((b) => (b.onclick = () => { document.querySelectorAll("#dseg button").forEach((x) => x.classList.toggle("on", x === b)); dlist(b.dataset.tab); }));
  }

  function dlist(tab) {
    const ds = (D.drops || []).filter((d) => tab === "done" ? ["done", "cancelled"].includes(dropState(d)) : dropState(d) === tab).sort((a, b) => tab === "done" ? b.start - a.start : a.start - b.start);
    $("dlist").innerHTML = ds.length ? `<div class="dlist">${ds.map((d) => { const st = dropState(d), pct = Math.min(100, 100 * d.taken / d.bottles);
      return `<div class="drow"><div class="pic">${dropPic(d)}</div><div><b>${esc(vName(d.venueId))}</b><div class="muted">${esc(d.prize === "item" ? d.item : wineNames(d.wines))} · ${esc(DKIND[d.kind].t)}${d.kind === "gathering" ? ", opens at " + d.gatheringLights : ""}</div></div>
        <div><div style="font-weight:800">${range(d.start, d.end)}</div><div class="faint">${st === "live" ? "ends in " + Math.max(1, Math.round((d.end - Date.now()) / 60000)) + " min" : st === "soon" ? "starts " + (dayOffset(d.start) === 0 ? "in " + Math.max(1, Math.round((d.start - Date.now()) / 60000)) + " min" : dayLong(d.start)) : ""}${d.reward ? (st === "live" || st === "soon" ? " · " : "") + esc(d.reward) : ""}</div></div>
        <div>${st === "cancelled" ? '<span class="pill">Cancelled</span>' : `<div class="bar${st === "done" ? (d.taken >= d.bottles ? " ok" : " dim") : ""}"><i style="width:${pct}%"></i></div><div class="faint" style="margin-top:5px">${d.taken} of ${d.bottles} claimed${st === "done" && d.taken >= d.bottles ? " · ran out" : ""}</div>`}</div>
        <div class="acts">${st === "live" ? '<span class="pill live"><span class="dot"></span>Live</span>' : ""}<button class="btn sm sec" data-again="${d.id}">Run again</button>${st === "live" || st === "soon" ? `<button class="btn sm sec" data-cancel="${d.id}">Cancel</button>` : ""}</div></div>`; }).join("")}</div>`
      : `<div class="empty">${tab === "live" ? "Nothing live right now." : tab === "soon" ? "Nothing planned. Use an idea above, or tap a night." : "No past drops yet."}</div>`;
    $("dlist").querySelectorAll("[data-again]").forEach((b) => (b.onclick = () => {
      const d = D.drops.find((x) => x.id === b.dataset.again), off = Math.max(dayOffset(d.start) + 7 * Math.max(1, Math.ceil(-dayOffset(d.start) / 7 + 0.01)), 0);
      const sh = Number(fmt(d.start, { hour: "numeric", hour12: false })) % 24, len = Math.max(1, Math.round((d.end - d.start) / 3600e3));
      B = newB({ venueId: d.venueId, prize: d.prize, wines: d.wines && d.wines.length ? d.wines : ["rosso"], item: d.item || "", icon: d.icon || "cards", kind: d.kind, lights: d.gatheringLights || 15, clue: d.clue || "", day: Math.min(6, off), hour: sh >= 18 ? sh : 21, len: len > 4 ? "late" : len, count: d.taken >= d.bottles ? Math.min(60, d.bottles + 10) : d.bottles, reward: d.reward || "" });
      renderBuilder(); $("builder").scrollIntoView({ behavior: "smooth" }); toast(d.taken >= d.bottles ? "Copied, with 10 more. The last one ran out." : "Copied. Check the night and schedule it.");
    }));
    $("dlist").querySelectorAll("[data-cancel]").forEach((b) => (b.onclick = async () => {
      const d = D.drops.find((x) => x.id === b.dataset.cancel);
      if (!(await dialog({ title: "Cancel this drop?", html: `${esc(vName(d.venueId))}, ${esc(range(d.start, d.end))}. It disappears from the map straight away.`, okText: "Cancel drop", cancel: "Keep it", danger: true }))) return;
      await call({ action: "drop-cancel", id: d.id }); toast("Drop cancelled."); nav("drops", { tab });
    }));
  }

  function renderBuilder() {
    const vs = venuesAll().filter((v) => v.active), W = (D.venues && D.venues.wines) || [];
    const v = venueById(B.venueId);
    const fee = (v && v.runnerFee) || 1000;
    const days = [...Array(7)].map((_, i) => i);
    const hours = [18, 19, 20, 21, 22, 23];
    const n = (k, done) => `<span class="num${done ? " done" : ""}">${k}</span>`;
    const { start, end } = bTimes();
    $("bsteps").innerHTML = !vs.length ? `<div class="empty"><b>No live venues yet.</b><br>A drop needs a venue on the map. <button class="lnk" id="golive">Go to venues</button></div>` : `
      <div class="step"><div class="sh">${n(1, B.venueId)}<h3>Where</h3><span class="muted">${vs.length} live ${vs.length === 1 ? "venue" : "venues"}</span></div>
        <div class="tiles" id="bvenues">${vs.map((x) => { const g = glowOf(x.id); return `<button class="tile venue${x.id === B.venueId ? " on" : ""}" data-v="${x.id}">${vArt(x, !!g)}<div style="min-width:0"><b>${esc(x.name)}</b><span style="display:block">${esc(x.area || "")}${x.area ? " · " : ""}${BAND_NAMES[x.band] || ""}</span>${g ? `<span class="glowtag"><span class="glowdot ${g}" style="width:7px;height:7px"></span>${GLOW[g]}</span>` : ""}</div></button>`; }).join("")}</div></div>
      <div class="step"><div class="sh">${n(2, 1)}<h3>What's dropping</h3></div>
        <div class="tiles big"><button class="tile bigt${B.prize === "bottle" ? " on" : ""}" data-prize="bottle"><span class="pic">${photo("rosso")}</span><div><b>Bottles</b><span style="display:block">One per table, shared</span></div></button>
          <button class="tile bigt${B.prize === "item" ? " on" : ""}" data-prize="item"><span class="pic">${A ? A.prize("cards", 46) : ""}</span><div><b>Something else</b><span style="display:block">Playing cards, merch, a surprise</span></div></button></div>
        ${B.prize === "bottle" ? `<div class="extra"><label class="lb">Which wines? Players get one of these.</label><div class="tiles wines" id="bwines">${W.map((w) => `<button class="tile wine${B.wines.includes(w.id) ? " on" : ""}" data-w="${w.id}">${photo(w.id)}<b>${esc(w.name)}</b></button>`).join("")}</div></div>`
        : `<div class="extra"><label class="lb">What is it? Players see this.</label><input id="bitem" maxlength="40" value="${esc(B.item)}" placeholder="Amabile playing cards"><div class="chips" style="margin-top:10px">${ITEMS.map((x) => `<button class="chip${B.item === x ? " on" : ""}" data-itemq="${esc(x)}">${esc(x)}</button>`).join("")}</div>
          <label class="lb">Picture on the map</label><div class="chips">${[["cards", "Cards"], ["gift", "Gift box"]].map(([k, t]) => `<button class="chip${B.icon === k ? " on" : ""}" data-icon="${k}">${t}</button>`).join("")}</div></div>`}</div>
      <div class="step"><div class="sh">${n(3, 1)}<h3>How it plays</h3></div>
        <div class="tiles">${Object.entries(DKIND).map(([k, x]) => `<button class="tile kind${B.kind === k ? " on" : ""}" data-kind="${k}"><span class="ki">${ic(k)}</span><b>${x.t}</b><span>${x.s}</span></button>`).join("")}</div>
        ${B.kind === "gathering" ? `<div class="extra"><label class="lb">Opens when this many people are outside there</label><div class="range"><input type="range" id="blights" min="5" max="60" step="1" value="${B.lights}"><output id="blo">${B.lights}</output></div><div class="faint">Most rooms hit 10 to 20 on a busy night.</div></div>` : ""}
        ${B.kind === "hidden" ? `<div class="extra"><label class="lb">The clue</label><textarea id="bclue" maxlength="140" placeholder="Where the lagoon meets the lights, look for the red door.">${esc(B.clue)}</textarea><div class="faint">The venue's name stays secret until someone claims.</div></div>` : ""}</div>
      <div class="step"><div class="sh">${n(4, 1)}<h3>When</h3><span class="muted">Lagos time. Ends by 2am.</span></div>
        <div class="whenrow" id="bwhen"><span class="lbl2">Night</span><div class="chips">${days.map((i) => `<button class="chip red${B.day === i ? " on" : ""}" data-day="${i}">${dayName(i)}${[5, 6].includes(weekday(i)) ? " " + ic("flame", "").replace('class=""', 'style="width:13px;height:13px;vertical-align:-2px"') : ""}</button>`).join("")}</div>
          <span class="lbl2">Starts</span><div class="chips">${B.day === 0 ? `<button class="chip${B.hour === "now" ? " on" : ""}" data-hour="now">Now</button>` : ""}${hours.map((h) => `<button class="chip${B.hour === h ? " on" : ""}" data-hour="${h}" ${B.day === 0 && lagosMidnight(0) + h * 3600e3 + 3600e3 < Date.now() ? "disabled style='opacity:.35'" : ""}>${h - 12}pm</button>`).join("")}</div>
          <span class="lbl2">Runs for</span><div class="chips">${[[1, "1 hour"], [2, "2 hours"], [3, "3 hours"], [4, "4 hours"], ["late", "Till 2am"]].map(([k, t]) => `<button class="chip${B.len === k ? " on" : ""}" data-len="${k}">${t}</button>`).join("")}</div>
          <div class="faint" style="font-weight:800;color:var(--ink)">${range(start, end)}</div></div></div>
      <div class="step"><div class="sh">${n(5, 1)}<h3>How many</h3></div>
        <div class="row" style="gap:16px"><div class="stepper"><button data-cnt="-5">−</button><input id="bcount" inputmode="numeric" value="${B.count}"><button data-cnt="5">+</button></div>
          <div class="chips">${[10, 20, 30, 50].map((x) => `<button class="chip${B.count === x ? " on" : ""}" data-cq="${x}">${x}</button>`).join("")}</div></div>
        <div class="cost">${ic("cash", "").replace('class=""', 'style="width:18px;height:18px"')}<span>The venue is owed <b class="money" id="bfee">${naira(fee * B.count)}</b> in runner fees if all go (${naira(fee)} each).</span></div>
        <label class="lb">Something for the last table? Optional.</label><input id="breward" maxlength="80" value="${esc(B.reward)}" placeholder="Suya platter for the last table">
        <div class="chips" style="margin-top:10px">${REWARDS.map((x) => `<button class="chip${B.reward === x ? " on" : ""}" data-rw="${esc(x)}">${esc(x.replace(" for the last table", ""))}</button>`).join("")}</div></div>
      <div class="summary"><p id="bsum"></p><button class="btn lg" id="bsave">Schedule drop</button></div>`;
    const S = $("bsteps"), re = () => renderBuilder();
    const gl = $("golive"); if (gl) gl.onclick = () => nav("venues");
    S.querySelectorAll("[data-v]").forEach((b) => (b.onclick = () => { B.venueId = b.dataset.v; re(); }));
    S.querySelectorAll("[data-prize]").forEach((b) => (b.onclick = () => { B.prize = b.dataset.prize; if (B.prize === "item" && !B.item) B.item = ITEMS[0]; re(); }));
    S.querySelectorAll("[data-w]").forEach((b) => (b.onclick = () => { const w = b.dataset.w; B.wines = B.wines.includes(w) ? B.wines.filter((x) => x !== w) : [...B.wines, w]; re(); }));
    S.querySelectorAll("[data-itemq]").forEach((b) => (b.onclick = () => { B.item = b.dataset.itemq; re(); }));
    S.querySelectorAll("[data-icon]").forEach((b) => (b.onclick = () => { B.icon = b.dataset.icon; re(); }));
    S.querySelectorAll("[data-kind]").forEach((b) => (b.onclick = () => { B.kind = b.dataset.kind; re(); }));
    S.querySelectorAll("[data-day]").forEach((b) => (b.onclick = () => { B.day = +b.dataset.day; if (B.hour === "now" && B.day) B.hour = 21; if (B.day === 0 && B.hour !== "now" && lagosMidnight(0) + (B.hour + 1) * 3600e3 < Date.now()) B.hour = "now"; re(); }));
    S.querySelectorAll("[data-hour]").forEach((b) => (b.onclick = () => { B.hour = b.dataset.hour === "now" ? "now" : +b.dataset.hour; re(); }));
    S.querySelectorAll("[data-len]").forEach((b) => (b.onclick = () => { B.len = b.dataset.len === "late" ? "late" : +b.dataset.len; re(); }));
    S.querySelectorAll("[data-cnt]").forEach((b) => (b.onclick = () => { B.count = Math.max(1, Math.min(200, B.count + +b.dataset.cnt)); re(); }));
    S.querySelectorAll("[data-cq]").forEach((b) => (b.onclick = () => { B.count = +b.dataset.cq; re(); }));
    S.querySelectorAll("[data-rw]").forEach((b) => (b.onclick = () => { B.reward = B.reward === b.dataset.rw ? "" : b.dataset.rw; re(); }));
    const bind = (id, k, f = (x) => x) => { const el = $(id); if (el) el.oninput = () => { B[k] = f(el.value); live(); }; };
    bind("bitem", "item"); bind("bclue", "clue"); bind("breward", "reward");
    bind("bcount", "count", (x) => Math.max(1, Math.min(200, parseInt(x, 10) || 1)));
    const lr = $("blights"); if (lr) lr.oninput = () => { B.lights = +lr.value; $("blo").textContent = lr.value; live(); };
    const live = () => { preview(); summary(); const f = $("bfee"); if (f) f.textContent = naira(fee * B.count); };
    const sv = $("bsave");
    if (sv) sv.onclick = async () => {
      const err = bCheck(); if (err) return flag(document.querySelector(err.at), err.msg);
      const t = bTimes(); sv.disabled = true;
      const r = await call({ action: "drop-save", drop: { venueId: B.venueId, kind: B.kind, start: new Date(t.start).toISOString(), end: new Date(t.end).toISOString(), bottles: B.count, prize: B.prize, item: B.item, icon: B.icon, gatheringLights: B.lights, wines: B.wines, clue: B.clue, reward: B.reward } });
      sv.disabled = false;
      if (!r.ok) return toast(r.error === "after_2am" ? "Drops must end by 2am." : r.error === "times" ? "Check the start and end." : r.error === "item" ? "Say what's dropping." : "Couldn't save: " + r.error);
      toast("Scheduled. It's on the map."); B = null; nav("drops", { tab: dayOffset(t.start) === 0 && t.start <= Date.now() ? "live" : "soon" });
    };
    live();
  }
  function summary() {
    const el = $("bsum"); if (!el) return;
    const v = venueById(B.venueId), { start, end } = bTimes(), err = (bCheck() || {}).msg;
    const what = B.prize === "item" ? `${B.count} × <b>${esc(B.item || "something")}</b>` : `<b>${B.count} bottles</b> of ${esc(wineNames(B.wines) || "...")}`;
    el.innerHTML = `${what} at <b>${esc(v ? v.name : "...")}</b>, ${esc(range(start, end))}. ${esc(DKIND[B.kind].p)}${B.kind === "gathering" ? ` (${B.lights} people)` : ""}.${err ? `<span class="err">${esc(err)}</span>` : ""}`;
  }
  function preview() {
    const el = $("bprev"); if (!el) return;
    const v = venueById(B.venueId), { start, end } = bTimes(), isLive = start <= Date.now();
    const pic = B.prize === "item" ? (A ? A.prize(B.icon, 96) : "") : photo(B.wines[0] || "rosso");
    el.innerHTML = `<div class="gcard"><div class="rv">${pic}</div>
      <h4>${B.kind === "hidden" ? "A hidden drop" : "Drop at " + esc(v ? v.name : "...")}</h4>${B.prize === "item" ? `<p><b>${esc(B.item || "...")}</b>, free from Amabile.</p>` : ""}
      <p>${esc(DKIND[B.kind].p)}. ${isLive ? `<b>${B.count} of ${B.count}</b> left, ends ${tm(end)}.` : `Starts ${esc(dayIn(dayOffset(start)) === "tonight" ? "tonight" : dayIn(dayOffset(start)).replace(/^on /, ""))}, ${tm(start)}.`}</p>
      ${B.kind === "hidden" && B.clue ? `<p class="clue">${esc(B.clue)}</p>` : ""}${B.kind === "gathering" ? `<p class="gm">Opens when ${B.lights} people are outside there.</p>` : ""}
      ${B.reward ? `<p class="gm">${esc(B.reward)}</p>` : ""}<p class="gm">One ${B.prize === "item" ? "" : "bottle "}per table of two or more, shared. One drop a night.</p>
      ${isLive ? `<div class="gb">I'm here. Claim one</div>` : B.kind === "hidden" ? "" : `<div class="gb">Directions</div>`}</div>`;
  }

  // ---------- venues ----------
  let vFilter = "all";
  function venues(flash) {
    const all = venuesAll().slice().sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
    const vs = all.filter((v) => vFilter === "all" || (vFilter === "live" ? v.active : !v.active));
    P().innerHTML = head("Venues", `${all.filter((v) => v.active).length} live on the map, ${all.filter((v) => !v.active).length} getting there.`, `<button class="btn" id="new">${ic("plus")} Add a venue</button>`) + (flash || "") +
      `<div class="row" style="margin-bottom:16px;justify-content:space-between"><div class="seg">${[["all", "All"], ["live", "Live"], ["not", "Not live"]].map(([k, n]) => `<button data-vf="${k}" class="${vFilter === k ? "on" : ""}">${n}</button>`).join("")}</div><input id="vq" placeholder="Search venues" style="max-width:260px"></div>
      <div class="vgrid" id="vg">${vs.map((v) => `<div class="vcard" data-e="${v.id}" data-name="${esc((v.name + " " + (v.area || "")).toLowerCase())}"><div class="top">${vArt(v, !!glowOf(v.id))}<div style="min-width:0"><h3>${esc(v.name)}</h3><div class="muted">${esc(v.area || "No area yet")}</div></div></div>
        <div class="meta">${v.active ? '<span class="pill ok"><span class="dot"></span>Live</span>' : `<span class="pill${v.stage === "paused" ? "" : " gold"}">${esc(STAGE[v.stage] || "Not live")}</span>`}<span class="pill">${BAND_NAMES[v.band] || "No level"}</span>${v.paused ? '<span class="pill warn">Paused by venue</span>' : ""}${v.outlet ? '<span class="pill">Account linked</span>' : ""}</div>
        ${!v.active && v.checks && v.checks.missing.length ? `<div class="need">Needs ${esc(v.checks.missing.join(", "))}</div>` : ""}
        <div class="foot"><button class="btn sm sec" data-open="${v.id}">Open</button>${v.active ? `<a class="btn sm sec" href="/outside/board?v=${esc(v.id)}" target="_blank" onclick="event.stopPropagation()">Runner board</a>` : ""}</div></div>`).join("")
        || `<div class="empty">No venues here yet.</div>`}</div>`;
    if (can("venue-save")) $("new").onclick = () => venueForm({}); else $("new").hidden = true;
    P().querySelectorAll("[data-vf]").forEach((b) => (b.onclick = () => { vFilter = b.dataset.vf; venues(); }));
    $("vq").oninput = () => { const q = $("vq").value.toLowerCase(); P().querySelectorAll(".vcard").forEach((c) => (c.style.display = c.dataset.name.includes(q) ? "" : "none")); };
    P().querySelectorAll("[data-e]").forEach((c) => (c.onclick = () => venueForm(venueById(c.dataset.e))));
    P().querySelectorAll("[data-k]").forEach((b) => (b.onclick = async (e) => {
      e.stopPropagation();
      if (!(await dialog({ title: "Issue new board codes?", html: "The old runner and manager codes stop working straight away.", okText: "Issue new codes", danger: true }))) return;
      const r = await call({ action: "venue-keys", id: b.dataset.k }); if (r.ok) venues(keysNote(r, vName(b.dataset.k)));
    }));
  }
  const keysNote = (r, name) => `<div class="note keys"><b>Board codes for ${esc(name)}.</b> Shown once. Save them now.<br><span class="muted">Board link</span> <a href="${esc(r.board)}" target="_blank">${esc(r.board)}</a><div class="row" style="margin-top:10px;gap:18px"><span>Runner <b class="code">${esc(r.keys.runner)}</b></span><span>Manager <b class="code">${esc(r.keys.manager)}</b></span></div></div>`;
  async function reopenVenue(id, flash) { await load("venues"); venueForm(venueById(id), flash); }
  function venueForm(v, flash) {
    page = "venues"; root.querySelectorAll("[data-nav]").forEach((b) => b.classList.toggle("on", b.dataset.nav === "venues"));
    const W = (D.venues && D.venues.wines) || [], ch = v.checks || { missing: [], warnings: [] };
    const NEED = ["location", "menu prices"];
    window.scrollTo(0, 0);
    // View only for roles that can't change venues: the page shows, its controls don't.
    P().classList.toggle("ro", !can("venue-save"));
    P().innerHTML = `<button class="lnk dim" id="back" style="margin-bottom:12px">← ${v.requestId ? "Requests" : "Venues"}</button>` + head(v.id ? esc(v.name) : "Add a venue", v.id ? `${esc(v.area || "")}${v.area ? " · " : ""}${BAND_NAMES[v.band] || ""}` : "Fill in what you have. The rest can wait for the visit.",
      v.id ? (v.active ? '<span class="pill ok"><span class="dot"></span>Live</span>' : `<span class="pill gold">${esc(STAGE[v.stage] || "Not live")}</span>`) : "") + (flash || "") +
      `<div class="form2"><div><div class="card"><div class="ch"><h2>Basics</h2></div>
        <div class="grid"><div><label class="lb">Name</label><input id="name" value="${esc(v.name || "")}"></div><div><label class="lb">Area</label><input id="area" value="${esc(v.area || "")}" placeholder="Victoria Island"></div>
        <div><label class="lb">Tables</label><input id="tables" inputmode="numeric" value="${v.tables || 20}"></div></div>
        <label class="lb">Building on the map</label><div class="chips">${ARTS.map((a) => `<button class="chip${(v.art || "lounge") === a ? " on" : ""}" data-art="${a}" style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px 5px 6px">${A ? A.venueArt(a, false, 26) : ""}${esc(VKIND[a].split(" ")[0])}</button>`).join("")}</div><input type="hidden" id="art" value="${esc(v.art || "lounge")}">
        <label class="lb">Tonight (players see this)</label><input id="tonight" value="${esc(v.tonight || "")}" placeholder="DJ from 9pm"></div>
      <div class="card"><div class="ch"><h2>Menu prices</h2><span class="muted">Per bottle. Blank if they don't stock it. The level follows from the price.</span></div>
        <div class="grid">${W.map((w) => `<div><label class="lb">${esc(w.name)}</label><div class="money-in"><input data-p="${w.id}" inputmode="numeric" value="${(v.prices && v.prices[w.id]) || ""}"></div><div class="faint lvlof" data-lv="${w.id}"></div></div>`).join("")}</div>
        <div class="grid"><div><label class="lb">Runner fee per drop handover</label><div class="money-in"><input id="fee" inputmode="numeric" value="${v.runnerFee || 1000}"></div></div></div></div>
      <div class="card"><div class="ch"><h2>Location</h2>${v.locationFrom === "outlet" ? '<span class="pill">From the linked account</span>' : ""}</div>
        <p class="muted" style="margin:0 0 12px">Stand inside and tap Use my location, or paste a Google Maps link.</p>
        <div class="row"><button class="btn sec" id="here">${ic("gaps")} Use my location</button><input id="gm" placeholder="Paste a Google Maps link" style="flex:1;min-width:220px"></div>
        <div class="grid"><div><label class="lb">Latitude</label><input id="lat" value="${v.lat ?? ""}"></div><div><label class="lb">Longitude</label><input id="lng" value="${v.lng ?? ""}"></div><div><label class="lb">Radius, metres</label><input id="radius" value="${v.radius || 60}"></div></div>
        ${v.lat ? `<p style="margin:12px 0 0"><a target="_blank" href="https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}">Check it on Google Maps</a></p>` : ""}</div>
      <div class="card"><div class="ch"><h2>Manager</h2></div><div class="grid"><div><label class="lb">Name</label><input id="cn" value="${esc((v.contact || {}).name || "")}"></div><div><label class="lb">Phone</label><input id="cp" value="${esc((v.contact || {}).phone || "")}"></div></div></div>
      <div class="row" style="margin-top:16px"><button class="btn lg" id="save">Save venue</button><span class="muted" id="msg"></span></div></div>
      <div>${v.id ? `<div class="card"><div class="ch"><h2>${v.active ? "Live" : "Go live"}</h2></div>
          ${v.active ? `<p style="margin:0 0 12px">On the map since ${v.liveAt ? esc(dayLong(v.liveAt)) : "launch"}.</p><div class="row"><a class="btn sec sm" target="_blank" href="/outside/board?v=${esc(v.id)}">Runner board</a><button class="btn sec sm" id="off">Take offline</button></div>`
          : `<div class="check">${NEED.map((k) => `<div class="${ch.missing.includes(k) ? "n" : "y"}"><i>${ch.missing.includes(k) ? "!" : "✓"}</i>${k[0].toUpperCase() + k.slice(1)}</div>`).join("")}${ch.missing.filter((k) => !NEED.includes(k)).map((k) => `<div class="n"><i>!</i>${esc(k)}</div>`).join("")}${(ch.warnings || []).map((k) => `<div class="w"><i>·</i>${esc(k[0].toUpperCase() + k.slice(1))}, worth adding</div>`).join("")}</div>
             <button class="btn" id="live" style="width:100%"${ch.missing.length ? " disabled" : ""}>Go live</button>${ch.missing.length ? '<p class="faint" style="margin:8px 0 0">Save the missing pieces first.</p>' : ""}`}</div>
        ${v.id ? `<div class="card"><div class="ch"><h2>Runner board</h2><span class="muted">Who can sign in</span></div><div id="team"></div></div>` : ""}
        <div class="card"><div class="ch"><h2>Payout account</h2>${v.payout && v.payout.recipient ? '<span class="pill ok">Verified</span>' : ""}</div><div id="payacct"></div></div>
        <div class="card"><div class="ch"><h2>Outlet account</h2></div>
          ${v.outlet ? `<p style="margin:0 0 10px"><b>${esc(v.outlet.name)}</b> #${esc(v.outlet.number)}<br><span class="muted">${esc(v.outlet.contactPerson || "")} ${esc(v.outlet.contactPhone || "")}</span></p><button class="btn sm sec" id="unlink">Unlink</button>` : `<p class="muted" style="margin:0 0 10px">Link the account we already hold. It fills in location and contact, and finds their orders in the sales data.</p>`}
          <div class="row" style="margin-top:10px"><input id="oq" placeholder="Outlet name or phone" style="flex:1"><button class="btn sm sec" id="os">Search</button></div><div id="ores"></div></div>
        <div class="card"><div class="ch"><h2>How they get Amabile</h2></div>
          ${v.supply ? `<p style="margin:0 0 10px">${v.supply.source === "sales" ? `From us, in the sales data: <b>${v.supply.cases} cases</b>, week of ${esc(v.supply.week)}${v.supply.amount ? ", " + naira(v.supply.amount) : ""}.`
            : v.supply.source === "manual" ? `From us: order <b>${esc(v.supply.ref)}</b>${v.supply.cases ? ", " + v.supply.cases + " cases" : ""}${v.supply.amount ? ", " + naira(v.supply.amount) : ""}${v.supply.date ? ", " + esc(v.supply.date) : ""}.`
            : `Through <b>${esc(v.supply.supplier)}</b>${v.supply.note ? ". " + esc(v.supply.note) : ""}.`}</p>` : v.purchase ? `<p>From us: order <b>${esc(v.purchase.ref || v.purchase.week || "")}</b>.</p>` : `<p class="muted" style="margin:0 0 10px">Optional. It doesn't stop the venue going live.</p>`}
          <button class="btn sm sec" id="fromsales"${v.outlet ? "" : " disabled"}>Find it in the sales data</button>${v.outlet ? "" : '<div class="faint" style="margin-top:6px">Link the outlet account first.</div>'}
          <label class="lb">Or record an order from us</label><div class="grid" style="grid-template-columns:1fr 1fr"><input id="pref" placeholder="Order reference"><input id="pcases" inputmode="numeric" placeholder="Cases"><input id="pamt" inputmode="numeric" placeholder="Amount ₦" style="margin-top:8px"><input id="pdate" type="date" style="margin-top:8px"></div>
          <button class="btn sm sec" id="precord" style="margin-top:10px">Record order</button>
          <label class="lb">Or they buy from another supplier</label><input id="osup" list="sups" placeholder="Distributor or wholesaler"><datalist id="sups">${[...new Set(venuesAll().map((x) => x.supply && x.supply.supplier).filter(Boolean))].map((n) => `<option>${esc(n)}</option>`).join("")}</datalist>
          <input id="onote" placeholder="Note, e.g. Rosso only, reorders monthly" style="margin-top:8px"><button class="btn sm sec" id="orecord" style="margin-top:10px">Save supplier</button></div>` : `<div class="card"><h2 style="margin-bottom:8px">Next</h2><p class="muted" style="margin:0">Save, then link the outlet account, note how they get Amabile and take it live.</p></div>`}</div></div>`;
    $("back").onclick = () => (v.requestId ? nav("requests") : nav("venues"));
    // Each wine's level, worked out from its menu price as it's typed (the same rule the game uses).
    const showLevels = () => document.querySelectorAll("[data-p]").forEach((i) => {
      const el = P().querySelector(`[data-lv="${i.dataset.p}"]`), p = Number(i.value.replace(/[^\d.]/g, ""));
      if (el) el.textContent = p > 0 ? BAND_NAMES[levelOf(i.dataset.p, p)] : "";
    });
    document.querySelectorAll("[data-p]").forEach((i) => i.addEventListener("input", showLevels)); showLevels();
    P().querySelectorAll("[data-art]").forEach((b) => (b.onclick = () => { $("art").value = b.dataset.art; P().querySelectorAll("[data-art]").forEach((x) => x.classList.toggle("on", x === b)); }));
    $("here").onclick = () => navigator.geolocation.getCurrentPosition((p) => { $("lat").value = p.coords.latitude.toFixed(6); $("lng").value = p.coords.longitude.toFixed(6); toast("Location set, about " + Math.round(p.coords.accuracy) + "m. Save to keep it."); }, () => toast("Location not available."), { enableHighAccuracy: true, timeout: 15000 });
    $("gm").oninput = () => { const m = $("gm").value.match(/(-?\d{1,2}\.\d{3,})[, ]+(-?\d{1,3}\.\d{3,})/) || $("gm").value.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/); if (m) { $("lat").value = m[1]; $("lng").value = m[2]; toast("Location read from the link. Save to keep it."); } };
    $("save").onclick = async () => {
      if (!$("name").value.trim()) return flag($("name"), "Add the venue's name.");
      const bad = [...document.querySelectorAll("[data-p]")].find((i) => i.value.trim() && !/^[\d,.\s₦]+$/.test(i.value)); if (bad) return flag(bad, "Numbers only, e.g. 50000.");
      const prices = {}; document.querySelectorAll("[data-p]").forEach((i) => (prices[i.dataset.p] = i.value));
      const venue = { id: v.id, name: $("name").value, area: $("area").value, art: $("art").value, prices,
        lat: $("lat").value === "" ? null : Number($("lat").value), lng: $("lng").value === "" ? null : Number($("lng").value), radius: Number($("radius").value), tables: Number($("tables").value), runnerFee: $("fee").value, tonight: $("tonight").value,
        contact: { name: $("cn").value, phone: $("cp").value }, active: !!v.active };
      const r = await call({ action: "venue-save", venue });
      if (!r.ok) return ($("msg").textContent = "Couldn't save: " + r.error);
      toast("Saved."); reopenVenue(r.venue.id);
    };
    if (!v.id) return;
    $("os").onclick = async () => {
      $("ores").innerHTML = `<p class="faint">Searching...</p>`;
      const r = await call({ action: "outlet-search", q: $("oq").value });
      if (!r.ok) return ($("ores").innerHTML = `<p class="faint">${r.error === "not_configured" ? "The sales data isn't connected on this site yet." : "Search failed."}</p>`);
      $("ores").innerHTML = r.rows.length ? r.rows.map((o) => `<div class="fi" style="display:flex;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line-2)"><div style="flex:1;min-width:0"><b>${esc(o.name)}</b> <span class="faint">#${esc(o.number)}</span><div class="faint">${esc(o.contactPerson)} ${esc(o.contactPhone)} · ${esc(o.lga)}</div><div class="faint">${o.lastBought ? esc(o.cases) + " cases, last " + esc(o.lastBought) : "No purchases in a year"}</div></div><button class="btn sm" data-l="${esc(o.id)}">Link</button></div>`).join("") : `<p class="faint">No outlet found.</p>`;
      $("ores").querySelectorAll("[data-l]").forEach((b) => (b.onclick = async () => {
        const x = await call({ action: "venue-link", venueId: v.id, outletId: b.dataset.l });
        reopenVenue(v.id, x.ok ? `<div class="note">Linked. ${x.venue.locationFrom === "outlet" ? "Location taken from the account." : ""}</div>` : `<div class="note red">Couldn't link: ${esc(x.error)}</div>`);
      }));
    };
    payAccount(v); teamCard(v);
    const ul = $("unlink"); if (ul) ul.onclick = async () => { await call({ action: "venue-link", venueId: v.id, outletId: "" }); reopenVenue(v.id); };
    $("fromsales").onclick = async () => {
      const x = await call({ action: "venue-supply", venueId: v.id, fromSales: true });
      reopenVenue(v.id, x.ok ? `<div class="note">Order found in the sales data.</div>` : `<div class="note red">${x.error === "no_purchase_found" ? "No Amabile purchase found for this account since " + esc(x.since) + ". Sales data can lag a few days. Record the order reference, or name their supplier." : "Couldn't check: " + esc(x.error)}</div>`);
    };
    $("precord").onclick = async () => {
      const x = await call({ action: "venue-supply", venueId: v.id, ref: $("pref").value, cases: $("pcases").value, amount: $("pamt").value, date: $("pdate").value });
      reopenVenue(v.id, x.ok ? `<div class="note">Order recorded.</div>` : `<div class="note red">${x.error === "order_ref" ? "Add the order reference." : "Couldn't record: " + esc(x.error)}</div>`);
    };
    $("orecord").onclick = async () => {
      const x = await call({ action: "venue-supply", venueId: v.id, via: "other", supplier: $("osup").value, note: $("onote").value });
      reopenVenue(v.id, x.ok ? `<div class="note">Supplier saved.</div>` : `<div class="note red">${x.error === "supplier" ? "Add the supplier's name." : "Couldn't save: " + esc(x.error)}</div>`);
    };
    const lv = $("live"); if (lv) lv.onclick = async () => {
      const x = await call({ action: "venue-live", venueId: v.id });
      if (!x.ok) return reopenVenue(v.id, `<div class="note red">Not ready: ${esc((x.missing || []).join(", ") || x.error)}</div>`);
      reopenVenue(v.id, `<div class="note">${esc(v.name)} is live on the map. ${(x.venue.staff || []).length ? esc(x.venue.staff[0].name) + " signs in once at " + esc(location.host) + "/board on the bar phone with their WhatsApp number. Runners use that phone." : "Add the manager under Team so they can open the runner board."}${x.warnings && x.warnings.length ? " Still worth adding: " + esc(x.warnings.join(", ")) + "." : ""}</div>`);
    };
    const off = $("off"); if (off) off.onclick = async () => { if (!(await dialog({ title: "Take it off the map?", html: `${esc(v.name)} disappears for players. Waiting bottles can't be claimed there.`, okText: "Take offline", danger: true }))) return; await call({ action: "venue-off", venueId: v.id }); reopenVenue(v.id); };
  }

  // People who can open the venue's runner board. They sign in at /board with their own WhatsApp number.
  function teamCard(v) {
    const el = $("team"); if (!el) return;
    const staff = v.staff || [];
    el.innerHTML = `${staff.length ? staff.map((m) => `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line-2)"><div style="flex:1;min-width:0"><b>${esc(m.name)}</b><div class="faint">${esc(m.phone)}</div></div><button class="lnk dim" data-srm="${esc(m.phone)}">Remove</button></div>`).join("")
        : `<p class="muted" style="margin:0 0 6px">No one yet. ${v.contact && v.contact.phone ? "The manager's number is added when the venue goes live." : "Add the manager's number."}</p>`}
      <label class="lb">Name</label><input id="sname" maxlength="30">
      <label class="lb">WhatsApp number</label>${phoneField("sphone")}
      <button class="btn sm sec" id="sadd" style="margin-top:10px">Let them sign in</button>
      <p class="faint" style="margin:10px 0 0">Usually just the manager. They sign in once at ${esc(location.host)}/board on the bar phone and it stays signed in. Runners use that phone; they don't sign in.</p>`;
    wirePhone("sphone");
    $("sadd").onclick = async () => {
      if (!$("sname").value.trim()) return flag($("sname"), "Add their name.");
      if (!phoneOf("sphone")) return flag($("sphone"), "Add their WhatsApp number.");
      const r = await call({ action: "staff-add", venueId: v.id, name: $("sname").value, phone: phoneOf("sphone"), role: "manager" });
      if (!r.ok) return flag($("sphone"), r.error === "phone" ? "Check the number and the country code." : "Couldn't add them: " + r.error);
      toast($("sname").value.trim() + " added."); v.staff = r.staff; teamCard(v);
    };
    el.querySelectorAll("[data-srm]").forEach((b) => (b.onclick = async () => {
      const m = staff.find((x) => x.phone === b.dataset.srm);
      if (!(await dialog({ title: `Remove ${m.name}?`, html: "They can't open the runner board from now on.", okText: "Remove", danger: true }))) return;
      const r = await call({ action: "staff-remove", venueId: v.id, phone: m.phone });
      if (r.ok) { v.staff = r.staff; teamCard(v); toast(m.name + " removed."); }
    }));
  }

  // The venue's bank account, checked with the bank and registered with Paystack so we can pay them the moment a bottle is served.
  async function payAccount(v, editing) {
    const el = $("payacct"); if (!el) return;
    const p = v.payout || {};
    if (p.recipient && !editing) {
      el.innerHTML = `<p style="margin:0 0 4px"><b>${esc(p.name)}</b></p><p class="muted" style="margin:0 0 12px">${esc(p.bank)} · ${esc(p.account)}</p><p class="faint" style="margin:0 0 12px">Every bottle served here is paid to this account straight away.</p><button class="btn sm sec" id="pchange">Change account</button>`;
      $("pchange").onclick = () => payAccount(v, true); return;
    }
    el.innerHTML = `<p class="muted" style="margin:0 0 4px">We check the name with the bank before saving.</p><label class="lb">Bank</label><select id="pbank"><option value="">Loading banks...</option></select>
      <label class="lb">Account number</label><input id="pacct" inputmode="numeric" maxlength="10" placeholder="10 digits" value="${esc(p.account || "")}">
      <div class="row" style="margin-top:12px"><button class="btn sm" id="pverify">Check and save</button>${p.recipient ? '<button class="btn sm sec" id="pcancel">Cancel</button>' : ""}</div><p class="faint" id="pmsg" style="margin:10px 0 0"></p>`;
    if (!D.banks) { const r = await call({ action: "banks" }); D.banks = r.ok ? r.banks : []; }
    const sel = $("pbank"); if (!sel) return;
    sel.innerHTML = D.banks.length ? `<option value="">Choose the bank</option>` + D.banks.map((b) => `<option value="${esc(b.code)}"${b.code === p.bankCode ? " selected" : ""}>${esc(b.name)}</option>`).join("") : `<option value="">Couldn't load banks from Paystack</option>`;
    const cn = $("pcancel"); if (cn) cn.onclick = () => payAccount(v);
    $("pverify").onclick = async () => {
      const bankCode = $("pbank").value, account = $("pacct").value.replace(/\D/g, "");
      if (!bankCode) return flag($("pbank"), "Choose the bank.");
      if (account.length !== 10) return flag($("pacct"), "Account numbers have 10 digits.");
      $("pverify").disabled = true; $("pmsg").textContent = "Checking with the bank...";
      const fail = (r) => { $("pverify").disabled = false; r.error === "resolve" ? ($("pmsg").textContent = "", flag($("pacct"), "The bank doesn't recognise that account. Check the number and the bank.")) : $("pmsg").textContent = r.error === "recipient" ? "Paystack couldn't add the account: " + (r.message || "try again") : "Couldn't check: " + r.error; };
      const q = await call({ action: "payout-resolve", bankCode, account });
      if (!q.ok) return fail(q);
      $("pmsg").textContent = ""; $("pverify").disabled = false;
      if (!(await dialog({ title: "Is this " + (v.name || "the venue") + "'s account?", html: `<b>${esc(q.name)}</b><br>${esc(q.bank)} · ${esc(q.account)}`, okText: "Yes, save it", cancel: "No" }))) return;
      $("pverify").disabled = true; $("pmsg").textContent = "Saving...";
      const r = await call({ action: "payout-account", venueId: v.id, bankCode, account });
      if (!r.ok) return fail(r);
      toast("Payout account saved."); reopenVenue(v.id);
    };
  }

  // ---------- requests ----------
  let showDeclined = false;
  function requests() {
    const rs = D.requests || [];
    const cols = [["requested", "New", ["requested", "submitted", "sent_back"]], ["visit_booked", "Visit booked", ["visit_booked"]], ["listed", "Listed", ["listed", "stocked", "paused"]], ["live", "Live", ["live"]]];
    const declined = rs.filter((r) => r.stage === "declined");
    P().innerHTML = head("Requests", "Venues asking to join, from first message to live.", `<a class="btn sec" href="/outside/venue" target="_blank">Public sign-up page</a>`) +
      `<div class="pipe">${cols.map(([k, n, st]) => { const list = rs.filter((r) => st.includes(r.stage)).sort((a, b) => b.createdAt - a.createdAt);
        return `<div class="col"><div class="colh"><span>${n}</span><span class="n">${list.length}</span></div>${list.map(rcard).join("") || `<div class="faint" style="padding:8px 4px">Nothing here.</div>`}</div>`; }).join("")}</div>
      ${declined.length ? `<p style="margin-top:16px"><button class="lnk dim" id="dec">${showDeclined ? "Hide" : "Show"} declined (${declined.length})</button></p>${showDeclined ? `<div class="pipe" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">${declined.map(rcard).join("")}</div>` : ""}` : ""}`;
    P().querySelectorAll("[data-o]").forEach((b) => (b.onclick = () => requestCard(rs.find((r) => r.id === b.dataset.o))));
    const dc = $("dec"); if (dc) dc.onclick = () => { showDeclined = !showDeclined; requests(); };
  }
  const rcard = (r) => `<div class="rcard" data-o="${r.id}"><b>${esc(r.name)}</b><span class="muted">${esc(VKIND[r.kind] || r.kind)} · ${esc(r.area)}</span>
    ${r.source === "onboard" ? `<span class="pill${r.stage === "sent_back" ? "" : r.store && r.store.payout && !r.store.payout.matches ? " warn" : " red"}" style="align-self:flex-start;margin-top:4px">${r.stage === "sent_back" ? "Sent back" : r.stage === "submitted" ? "To approve" : "Onboarded"} · ${esc(r.onboarderName)}${r.company && r.company !== "Amabile" ? ", " + esc(r.company) : ""}</span>` : ""}
    <span class="faint">${esc(r.contactName)} · asked ${ago(r.createdAt)}</span>${r.visit && r.visit.date ? `<span class="pill gold" style="align-self:flex-start;margin-top:4px">${esc(r.visit.by)} · ${esc(r.visit.date)}</span>` : ""}
    ${r.stocksAmabile === "yes" ? '<span class="pill ok" style="align-self:flex-start;margin-top:4px">Stocks Amabile</span>' : ""}</div>`;
  function requestCard(r) {
    if (r.source === "onboard") return submissionCard(r);
    const row = (k, val) => (val ? `<dt>${esc(k)}</dt><dd>${val}</dd>` : "");
    const venue = r.venueId ? venueById(r.venueId) : null;
    P().innerHTML = `<button class="lnk dim" id="back" style="margin-bottom:12px">← Requests</button>` + head(esc(r.name), `${esc(VKIND[r.kind] || r.kind)} · ${esc(r.area)} · asked ${ago(r.createdAt)}`, `<span class="pill${r.stage === "live" ? " ok" : r.stage === "declined" ? "" : " gold"}">${STAGE[r.stage] || r.stage}</span>`) +
      `<div class="form2"><div class="card"><dl class="kv">${row("Address", esc(r.address))}${row("Map", r.mapsLink ? `<a target="_blank" href="${esc(r.mapsLink)}">Open</a>` : "")}${row("Instagram", r.instagram ? `<a target="_blank" href="https://instagram.com/${esc(r.instagram)}">@${esc(r.instagram)}</a>` : "")}
        ${row("Contact", esc(r.contactName) + " · " + esc(ROLE[r.role] || ""))}${row("Phone", `<a href="https://wa.me/${esc(String(r.phone || "").replace(/\D/g, ""))}" target="_blank">${esc(r.phone)}</a>`)}${row("Email", esc(r.email))}
        ${row("Tables", r.tables || "")}${row("Open", esc(r.nights))}${row("Stocks Amabile", { yes: "Yes", no: "No", not_sure: "Not sure" }[r.stocksAmabile])}${row("Best time to visit", esc(r.visitTime))}${row("Their note", esc(r.note))}
        ${row("Maybe our account", (r.suggested || []).map((o) => `${esc(o.name)} #${esc(o.number)} · ${esc(o.lga)}`).join("<br>"))}
        ${row("Our records", r.records ? [esc(r.records.name), esc(r.records.type), r.records.cases ? r.records.cases + " cases this year" : "", r.records.accounts > 1 ? r.records.accounts + " accounts" : ""].filter(Boolean).join(" · ") : "")}
        ${row("Menu prices", r.prices ? Object.entries(r.prices).map(([k, v]) => `${esc(wineOf(k).name)} ${naira(v)}`).join(" · ") : "")}
        ${row("Also asked", (r.others || []).map((o) => `${esc(o.contactName)} · <a href="https://wa.me/${esc(String(o.phone).replace(/\D/g, ""))}" target="_blank">${esc(o.phone)}</a>`).join("<br>"))}</dl></div>
      <div><div class="card"><div class="ch"><h2>1. Book the visit</h2></div><label class="lb" style="margin-top:0">Who visits</label><div class="chips" id="who">${["Anita", "Aylor"].map((n) => `<button class="chip${(r.visit || {}).by === n ? " on" : ""}" data-by="${n}">${n}</button>`).join("")}</div><input id="vb" value="${esc((r.visit || {}).by || "")}" style="margin-top:8px" placeholder="Or someone else">
          <label class="lb">When</label><input id="vd" value="${esc((r.visit || {}).date || "")}" placeholder="Tue 4 Nov, 3pm"><label class="lb">Note</label><input id="vn" value="${esc((r.visit || {}).note || "")}"><p style="margin:14px 0 0"><button class="btn" id="book">Save visit</button></p></div>
        <div class="card"><div class="ch"><h2>2. List the venue</h2></div>${venue ? `<p style="margin:0 0 10px">Listed as <b>${esc(venue.name)}</b>.</p><button class="btn" id="openv">Open the venue</button>` : `<p class="muted" style="margin:0 0 12px">Creates the venue, not live yet. Location, prices and the account are finished on the venue page, usually during the visit.</p><button class="btn" id="list">List this venue</button>`}</div>
        <div class="card"><div class="ch"><h2>Notes</h2></div><textarea id="on" placeholder="Only the team sees this">${esc(r.opsNote || "")}</textarea>
          <div class="row" style="margin-top:12px"><button class="btn sec sm" id="savenote">Save notes</button>${r.stage === "declined" ? `<button class="btn sec sm" id="reopen">Reopen</button>` : `<button class="btn sec sm" id="decline">Decline</button>`}</div></div></div></div>`;
    if (!can("request-list")) ["list", "decline", "reopen"].forEach((id) => { const b = $(id); if (b) b.hidden = true; });
    const reload = async (id) => { await load("requests", "venues"); requestCard(D.requests.find((x) => x.id === id)); };
    $("back").onclick = () => nav("requests");
    P().querySelectorAll("[data-by]").forEach((b) => (b.onclick = () => { $("vb").value = b.dataset.by; P().querySelectorAll("[data-by]").forEach((x) => x.classList.toggle("on", x === b)); }));
    $("book").onclick = async () => { await call({ action: "request-update", id: r.id, visit: { by: $("vb").value, date: $("vd").value, note: $("vn").value } }); toast("Visit saved."); reload(r.id); };
    $("savenote").onclick = async () => { await call({ action: "request-update", id: r.id, note: $("on").value }); toast("Notes saved."); };
    const dc = $("decline"); if (dc) dc.onclick = async () => { const why = await dialog({ title: "Decline this venue?", html: "Kept internal. They aren't told.", input: "Reason", okText: "Decline", danger: true }); if (why === null) return; await call({ action: "request-update", id: r.id, decline: why || "Declined" }); reload(r.id); };
    const ro = $("reopen"); if (ro) ro.onclick = async () => { await call({ action: "request-update", id: r.id, reopen: true }); reload(r.id); };
    const ls = $("list"); if (ls) ls.onclick = async () => { const x = await call({ action: "request-list", id: r.id }); if (x.ok) { await load("venues"); venueForm(venueById(x.venueId)); } };
    const ov = $("openv"); if (ov) ov.onclick = () => venueForm(venue);
  }

  // ---------- bottles ----------
  let bFilter = "all";
  function bottles() {
    const all = D.bottles || [];
    const groups = { all: () => true, waiting: (b) => ["waiting", "link", "topup"].includes(b.status), on_way: (b) => b.status === "on_way", claimed: (b) => ["served", "claimed"].includes(b.status), other: (b) => !["waiting", "link", "topup", "on_way", "claimed", "served"].includes(b.status) };
    const bs = all.filter(groups[bFilter]);
    const failed = all.filter((b) => b.notice && !b.notice.ok).length;
    P().innerHTML = head("Bottles", `The last ${all.length} sent.${failed ? ` ${plural(failed, "WhatsApp message")} didn't go out.` : ""}`) +
      `<div class="seg" style="margin-bottom:16px">${[["all", "All"], ["waiting", "Waiting"], ["on_way", "On the way"], ["claimed", "Delivered"], ["other", "Other"]].map(([k, n]) => `<button data-bf="${k}" class="${bFilter === k ? "on" : ""}">${n} <small>${all.filter(groups[k]).length}</small></button>`).join("")}</div>
      <div class="card"><div class="tw"><table class="t"><tr><th></th><th>From</th><th>To</th><th>Level</th><th>Paid</th><th>Status</th><th>WhatsApp</th><th>When</th></tr>
      ${bs.map((b) => `<tr><td style="width:44px">${photo(b.wine, "thumb")}</td><td><b>${esc(b.from || "Someone")}</b><div class="faint">${esc(wineOf(b.wine).name)}</div></td><td>${esc(b.to || "Card link")}${b.venueId ? `<div class="faint">at ${esc(vName(b.venueId))}</div>` : ""}</td><td>${BAND_NAMES[b.band] || ""}</td><td class="money">${b.price ? naira(b.charged != null ? b.charged : b.price) : ""}${b.code ? `<div class="faint">${esc(b.code)}</div>` : ""}</td><td>${bpill(b.status)}</td>
        <td>${b.notice ? (b.notice.ok ? '<span class="pill ok">Sent</span>' : `<span class="pill warn" title="${esc(b.notice.skip || (b.notice.error && b.notice.error.message) || "")}">Not sent</span>`) : '<span class="faint">·</span>'}</td><td class="faint" style="white-space:nowrap">${ago(b.createdAt)}</td></tr>`).join("") || `<tr><td colspan="8"><div class="empty">Nothing here.</div></td></tr>`}</table></div></div>`;
    P().querySelectorAll("[data-bf]").forEach((b) => (b.onclick = () => { bFilter = b.dataset.bf; bottles(); }));
  }

  // ---------- payouts ----------
  function payouts() {
    const rows = D.ledger || [], auto = D.ledgerAuto, owing = rows.filter((r) => r.lines);
    const waiting = owing.reduce((n, r) => n + r.owed, 0), onWay = owing.reduce((n, r) => n + r.pending, 0), failedN = owing.reduce((n, r) => n + r.failed.length, 0);
    const today = rows.reduce((n, r) => n + (r.paidToday || 0), 0), noAcct = rows.filter((r) => !r.payout.verified).length;
    P().innerHTML = head("Payouts", auto ? "Venues are paid to their bank the moment a bottle is served." : "Automatic payouts are off. Pay by transfer, then mark it paid.",
        auto ? '<span class="pill ok"><span class="dot"></span>Automatic payouts on</span>' : '<span class="pill warn">Automatic payouts off</span>') +
      `<div class="kpis" style="grid-template-columns:repeat(4,1fr)"><div class="kpi${failedN ? " hot" : ""}"><div class="k">Still owed</div><div class="v money">${naira(waiting)}</div><div class="s">${failedN ? plural(failedN, "payout") + " failed" : plural(owing.length, "venue")}</div></div>
        <div class="kpi"><div class="k">On the way</div><div class="v">${onWay}</div><div class="s">Waiting for the bank</div></div>
        <div class="kpi"><div class="k">Paid last 24h</div><div class="v money">${naira(today)}</div><div class="s">${rows.reduce((n, r) => n + (r.paidTodayAuto || 0), 0)} sent automatically</div></div>
        <div class="kpi"><div class="k">Paystack balance</div><div class="v money">${D.balance == null ? "·" : naira(D.balance)}</div><div class="s">${D.balance != null && D.balance < waiting ? "Too low to pay what's owed" : "Payouts come from here"}</div></div></div>
      ${auto && noAcct ? `<div class="note">${plural(noAcct, "venue")} ${noAcct === 1 ? "has" : "have"} no verified account, so ${noAcct === 1 ? "it" : "they"} can't be paid automatically. Add it on the venue's page.</div>` : ""}
      <div class="card"><div class="tw"><table class="t"><tr><th>Venue</th><th>Owed</th><th>For</th><th>Account</th><th></th></tr>
      ${owing.map((r) => `<tr><td><b>${esc(r.name)}</b>${r.pending ? `<div><span class="pill gold" style="margin-top:4px">${r.pending} on the way</span></div>` : ""}${r.failed.length ? `<div class="faint" style="color:var(--red-2);margin-top:4px">Failed: ${esc(r.failed[0].error || "unknown")}</div>` : ""}</td>
        <td class="money"><b style="font-size:16px">${naira(r.owed)}</b></td><td class="muted">${plural(r.menu, "gift")} · ${plural(r.drops, "drop handover")}</td>
        <td>${r.payout.verified ? `${esc(r.payout.name)}<div class="faint">${esc(r.payout.bank)} ${esc(r.payout.account)}</div>` : `<button class="lnk" data-acct="${r.venueId}">Add a verified account</button>`}</td>
        <td style="text-align:right;white-space:nowrap">${r.keys.length && r.payout.verified ? `<button class="btn sm" data-send="${r.venueId}">${r.failed.length ? "Send again" : "Pay now"}</button> ` : ""}${r.keys.length ? `<button class="btn sm sec" data-p="${r.venueId}">Mark paid</button>` : ""}</td></tr>`).join("")
        || `<tr><td colspan="5"><div class="empty"><b>All square.</b><br>Nothing owed to any venue.</div></td></tr>`}</table></div></div>`;
    P().querySelectorAll("[data-acct]").forEach((b) => (b.onclick = async () => { await load("venues"); venueForm(venueById(b.dataset.acct)); }));
    P().querySelectorAll("[data-send]").forEach((b) => (b.onclick = async () => {
      const r = rows.find((x) => x.venueId === b.dataset.send);
      if (!(await dialog({ title: `Pay ${r.name} now?`, html: `${naira(r.sendable)} to ${esc(r.payout.name)}, ${esc(r.payout.bank)} ${esc(r.payout.account)}, through Paystack.`, okText: "Send it" }))) return;
      b.disabled = true; const x = await call({ action: "payout-send", keys: r.keys });
      toast(x.failed && x.failed.length ? `${x.sent} sent, ${x.failed.length} failed.` : `${plural(x.sent || 0, "payout")} sent.`); nav("payouts");
    }));
    P().querySelectorAll("[data-p]").forEach((b) => (b.onclick = async () => {
      const r = rows.find((x) => x.venueId === b.dataset.p);
      const ref = await dialog({ title: `Paid ${r.name} by hand?`, html: `Only for money you've already sent yourself. Add the transfer reference.`, input: "Transfer reference", okText: "Mark paid" });
      if (ref === null) return;
      await call({ action: "ledger-paid", keys: r.keys, ref }); toast("Marked paid."); nav("payouts");
    }));
  }

  // ---------- prices ----------
  function prices() {
    const b = D.venues.bands || {}, order = D.venues.bandOrder || [];
    P().innerHTML = head("Prices", "What a sender pays for a waiting bottle at each level. It can be claimed at that level or below.") +
      Object.keys(b).map((fam) => `<div class="card"><div class="ch"><h2>${fam === "spumante" ? "Spumante" : "Frizzante"}</h2><span class="muted">${fam === "spumante" ? "Spumante Rosé and Spumante Bianco" : "Rosso, Bianco and Rosato"}</span></div>
        <div class="grid">${order.map((k) => `<div><label class="lb">${BAND_NAMES[k]}</label><div class="money-in"><input data-f="${fam}" data-b="${k}" inputmode="numeric" value="${b[fam][k] || ""}" placeholder="${k === "top" ? "Venue's own price" : "Not offered"}"></div></div>`).join("")}</div></div>`).join("") +
      `<div class="row" style="margin-top:16px"><button class="btn lg" id="save">Save prices</button><span class="muted">Blank means not offered at that level. Mamma Mia! sends are priced at the venue.</span></div>`;
    $("save").onclick = async () => {
      const out = {}; document.querySelectorAll("[data-f]").forEach((i) => { out[i.dataset.f] = out[i.dataset.f] || {}; out[i.dataset.f][i.dataset.b] = i.value; });
      const r = await call({ action: "bands-save", bands: out }); toast(r.ok ? "Prices saved." : "Couldn't save.");
    };
  }

  // ---------- codes ----------
  // Discount codes at checkout. Money off what the sender pays; the venue is still paid its full menu price.
  function codes(edit) {
    const cs = D.codes || [];
    const off = (c) => (c.kind === "naira" ? naira(c.value) : c.value + "%") + " off";
    const until = (c) => (c.expires ? "until " + fmt(c.expires, { day: "numeric", month: "short" }) : "");
    const who = (c) => (c.phones && c.phones.length ? (c.phones.length === 1 ? "Only " + esc(c.phones[0]) : "Only " + c.phones.length + " numbers") : "Anyone");
    const E = edit || null;
    P().innerHTML = head("Codes", "Discount codes senders type at checkout. The venue is still paid its full menu price.", E ? "" : `<button class="btn" id="new">${ic("plus")}<span>New code</span></button>`) +
      (E ? `<div class="card"><div class="ch"><h2>${E.code ? esc(E.code) : "New code"}</h2></div>
        <div class="grid">
          <div><label class="lb">Code</label><input id="cc" maxlength="20" value="${esc(E.code || "")}" placeholder="DISC20"${E.code ? " disabled" : ""} style="text-transform:uppercase"></div>
          <div><label class="lb">Discount</label><div class="row" style="flex-wrap:nowrap"><input id="cv" inputmode="numeric" value="${E.value || ""}" placeholder="20" style="min-width:0">
            <div class="seg"><button data-k="pct" class="${E.kind !== "naira" ? "on" : ""}">%</button><button data-k="naira" class="${E.kind === "naira" ? "on" : ""}">₦</button></div></div></div>
          <div><label class="lb">Uses in total</label><input id="cm" inputmode="numeric" value="${E.maxUses || ""}" placeholder="No limit"></div>
          <div><label class="lb">Uses per person</label><input id="cp" inputmode="numeric" value="${E.perPerson || ""}" placeholder="No limit"></div>
          <div><label class="lb">Works until</label><input id="ce" type="date" value="${E.expires ? new Date(E.expires + 3600e3).toISOString().slice(0, 10) : ""}"></div>
        </div>
        <label class="lb">Only these WhatsApp numbers</label><input id="cn" value="${esc((E.phones || []).join(", "))}" placeholder="Anyone can use it. Add numbers to keep it to them, e.g. 0803 000 0000">
        <label class="lb">Note</label><input id="ct" maxlength="80" value="${esc(E.note || "")}" placeholder="What it's for">
        <div class="row" style="margin-top:16px"><button class="btn lg" id="save">Save code</button><button class="btn sec" id="back">Cancel</button></div></div>`
      : `<div class="card"><div class="tw"><table class="t"><tr><th>Code</th><th>Discount</th><th>Who</th><th>Used</th><th>Status</th><th></th></tr>
        ${cs.map((c) => `<tr><td><b>${esc(c.code)}</b>${c.note ? `<div class="faint">${esc(c.note)}</div>` : ""}</td><td>${off(c)}<div class="faint">${until(c)}</div></td><td>${who(c)}</td>
          <td>${c.uses || 0}${c.maxUses ? " of " + c.maxUses : ""}</td><td>${c.active ? (c.expires && Date.now() > c.expires ? '<span class="pill">Ended</span>' : '<span class="pill ok">On</span>') : '<span class="pill">Off</span>'}</td>
          <td style="text-align:right;white-space:nowrap"><button class="btn sm sec" data-ed="${esc(c.code)}">Edit</button> <button class="btn sm sec" data-on="${esc(c.code)}">${c.active ? "Turn off" : "Turn on"}</button></td></tr>`).join("")
          || `<tr><td colspan="6"><div class="empty"><b>No codes yet.</b><br>Make one to give money off at checkout.</div></td></tr>`}</table></div></div>`);
    if (!E) {
      $("new").onclick = () => codes({ kind: "pct", isNew: true });
      P().querySelectorAll("[data-ed]").forEach((b) => (b.onclick = () => codes(cs.find((c) => c.code === b.dataset.ed))));
      P().querySelectorAll("[data-on]").forEach((b) => (b.onclick = async () => {
        const c = cs.find((x) => x.code === b.dataset.on); const r = await call({ action: "code-active", code: c.code, active: !c.active });
        if (!r.ok) return toast("Couldn't change it."); toast(r.code.active ? "Code is on." : "Code is off."); await load("codes"); codes();
      }));
      return;
    }
    let kind = E.kind || "pct";
    P().querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => { kind = b.dataset.k; P().querySelectorAll("[data-k]").forEach((x) => x.classList.toggle("on", x === b)); }));
    $("back").onclick = () => codes();
    $("save").onclick = async () => {
      const code = { code: $("cc").value, kind, value: $("cv").value, maxUses: $("cm").value, perPerson: $("cp").value, expires: $("ce").value, phones: $("cn").value, note: $("ct").value, isNew: !!E.isNew, active: E.active !== false };
      const r = await call({ action: "code-save", code });
      if (!r.ok) {
        const M = { code: [$("cc"), "Use at least 4 letters or numbers."], exists: [$("cc"), "That code already exists."], value: [$("cv"), kind === "pct" ? "Between 1 and 100." : "At least ₦100."], phone: [$("cn"), "Check this number: " + (r.bad || "")] }[r.error];
        return M ? flag(M[0], M[1]) : toast("Couldn't save.");
      }
      toast("Saved."); await load("codes"); codes();
    };
  }

  // ---------- stores from the onboard app ----------
  // Everything the onboarder sent, the bank's name for the account next to the store's, and the decision.
  function submissionCard(r) {
    const x = r.store || {}, p = x.payout, venue = r.venueId ? venueById(r.venueId) : null, W = (D.venues && D.venues.wines) || [];
    const row = (k, val) => (val ? `<dt>${esc(k)}</dt><dd>${val}</dd>` : "");
    const decide = r.stage === "submitted" && can("submission-approve");
    P().innerHTML = `<button class="lnk dim" id="back" style="margin-bottom:12px">← Requests</button>` + head(esc(r.name), `${esc(VKIND[r.kind] || r.kind)} · ${esc(r.area)} · from ${esc(r.onboarderName)}${r.company ? ", " + esc(r.company) : ""} · sent ${ago(r.updatedAt || r.createdAt)}`,
      `<span class="pill${r.stage === "live" ? " ok" : r.stage === "submitted" ? " gold" : ""}">${{ submitted: "To approve", sent_back: "Sent back", live: "Live", declined: "Declined" }[r.stage] || esc(r.stage)}</span>`) +
      `<div class="form2"><div><div class="card"><div class="ch"><h2>The store</h2></div><dl class="kv">
        ${row("Where", x.lat != null ? `<a target="_blank" href="https://www.google.com/maps/search/?api=1&query=${x.lat},${x.lng}">Open the pin</a> <span class="faint">to about ${x.acc || "?"} m</span>` : "")}
        ${row("Menu prices", W.filter((w) => x.prices && x.prices[w.id]).map((w) => `${esc(w.name)} <b>${naira(x.prices[w.id])}</b>`).join("<br>") + (x.taxIncluded ? '<div class="faint">Including VAT and service</div>' : ""))}
        ${row("Manager", `${esc(x.managerName)} · <a target="_blank" href="https://wa.me/${esc(String(x.managerPhone || "").replace(/\D/g, ""))}">${esc(x.managerPhone)}</a>`)}
        ${row("Bar phones", (x.barPhones || []).map(esc).join("<br>"))}
        ${row("Menu photo", x.hasPhoto ? `<button class="lnk" id="photo">Show the photo</button><div id="photobox"></div>` : "")}
        ${row("Sent by", `${esc(r.onboarderName)}${r.company ? ", " + esc(r.company) : ""} · <a target="_blank" href="https://wa.me/${esc(String(r.submittedBy || "").replace(/\D/g, ""))}">${esc(r.submittedBy)}</a>`)}
        ${row("Note sent back", r.returnNote ? esc(r.returnNote) : "")}</dl></div></div>
      <div><div class="card"><div class="ch"><h2>Bank account</h2>${p ? (p.matches ? '<span class="pill ok">Name matches</span>' : '<span class="pill warn">Name doesn\'t match</span>') : ""}</div>
        ${p ? `<p style="margin:0 0 4px"><b>${esc(p.accountName)}</b></p><p class="muted" style="margin:0">${esc(p.bank)} · ••••••${esc(String(p.account).slice(-4))}</p>
          ${p.matches ? "" : `<div class="note red" style="margin-top:12px">The bank says this account belongs to <b>${esc(p.accountName)}</b>, not ${esc(r.name)}. Call the manager before you approve.</div>`}`
          : `<p class="muted" style="margin:0">No account yet. The store can go live; it can't be paid until ops adds one.</p>`}
        ${r.payoutError ? `<div class="note red" style="margin-top:12px">Paystack didn't take the account. Add it on the venue page.</div>` : ""}</div>
      ${decide ? `<div class="card"><div class="ch"><h2>Decision</h2></div>
        ${p && !p.matches ? `<label style="display:flex;gap:8px;align-items:flex-start;font-weight:700;margin:0 0 12px"><input type="checkbox" id="cm" style="margin-top:3px"> I've spoken to the manager. This account is theirs.</label>` : ""}
        <button class="btn" id="ok" style="width:100%">Approve and put it live</button>
        <label class="lb">Or send it back with what to fix</label><textarea id="note" placeholder="e.g. Rosso is ₦50,000 on their menu"></textarea>
        <div class="row" style="margin-top:10px"><button class="btn sec" id="ret">Send back</button><button class="btn sec" id="dec">Decline</button></div></div>`
        : venue ? `<div class="card"><button class="btn" id="openv" style="width:100%">Open the venue</button></div>` : ""}</div></div>`;
    $("back").onclick = () => nav("requests");
    const reload = async () => { await load("requests", "venues"); requestCard(D.requests.find((y) => y.id === r.id)); };
    const ph = $("photo"); if (ph) ph.onclick = async () => { const q = await call({ action: "submission-photo", id: r.id }); $("photobox").innerHTML = q.ok && q.photo ? `<img src="${q.photo}" alt="Menu" style="max-width:100%;border-radius:12px;margin-top:8px">` : '<span class="faint">No photo.</span>'; };
    const ov = $("openv"); if (ov) ov.onclick = () => venueForm(venue);
    if (!decide) return;
    $("ok").onclick = async () => {
      if (p && !p.matches && !$("cm").checked) return flag($("cm").parentElement, "Tick this once you've spoken to the manager.");
      $("ok").disabled = true;
      const q = await call({ action: "submission-approve", id: r.id, confirmMismatch: !!(p && !p.matches && $("cm").checked) });
      $("ok").disabled = false;
      if (!q.ok) return toast(q.error === "mismatch" ? "Confirm the bank account first." : q.error === "not_ready" ? "It's missing " + (q.missing || []).join(", ") + "." : "Couldn't approve it.");
      toast(q.payoutError ? "Live. Add the bank account on the venue page." : r.name + " is live."); reload();
    };
    $("ret").onclick = async () => {
      if (!$("note").value.trim()) return flag($("note"), "Say what to fix. The onboarder sees this.");
      const q = await call({ action: "submission-return", id: r.id, note: $("note").value }); if (!q.ok) return toast("Couldn't send it back.");
      toast("Sent back to " + r.onboarderName + "."); reload();
    };
    $("dec").onclick = async () => {
      const why = await dialog({ title: "Decline this store?", html: "Kept internal. The onboarder sees it as not taken.", input: "Reason", okText: "Decline", danger: true }); if (why === null) return;
      await call({ action: "request-update", id: r.id, decline: why || "Declined" }); reload();
    };
  }

  // ---------- team ----------
  // Owner only. Who signs in to admin and in what role, who can add stores in the onboard app, and who changed what.
  const ROLE_HELP = { owner: "Everything", ops: "Everything except Team and WhatsApp setup", field: "Drops, requests, venues to view, bottles, gaps", growth: "Drops, venues to view, gaps", finance: "Payouts, bottles, venues to view" };
  const ACT_NAMES = { "sign-in": "Signed in", "venue-save": "Saved venue", "venue-live": "Took live", "venue-off": "Took offline", "payout-account": "Set payout account", "payout-send": "Sent payout", "ledger-paid": "Marked paid",
    "code-save": "Saved code", "code-active": "Turned code on or off", "bands-save": "Changed prices", "drop-save": "Saved drop", "drop-cancel": "Cancelled drop", "request-update": "Updated request", "request-list": "Listed venue",
    "staff-add": "Added runner number", "staff-remove": "Removed runner number", "team-save": "Saved team member", "team-remove": "Removed team member", "onb-save": "Saved onboarder", "onb-remove": "Removed onboarder", "venue-keys": "New board codes", "venue-link": "Linked account", "venue-supply": "Recorded supply" };
  let teamTab = "team";
  function team() {
    const T = D.team || { team: [], onboarders: [], roles: [], roleNames: {} }, acts = D.activity || [];
    const roleSel = (id, cur) => `<select id="${id}">${T.roles.map((r) => `<option value="${r}"${r === cur ? " selected" : ""}>${esc(T.roleNames[r])}</option>`).join("")}</select>`;
    P().innerHTML = head("Team", "Who signs in, what each person sees, and who changed what.") +
      `<div class="seg" style="margin-bottom:16px">${[["team", "Admin team", T.team.length], ["onb", "Onboarders", T.onboarders.length], ["act", "Activity", acts.length]].map(([k, n, c]) => `<button data-tt="${k}" class="${teamTab === k ? "on" : ""}">${n} <small>${c}</small></button>`).join("")}</div>` +
      (teamTab === "team" ? `<div class="card"><div class="ch"><h2>Admin team</h2><span class="muted">TradeDepot Google accounts only</span></div>
        <div class="tw"><table class="t"><tr><th>Person</th><th>Role</th><th>Sees</th><th></th></tr>
        ${T.team.map((m) => `<tr><td><b>${esc(m.name || m.email.split("@")[0])}</b><div class="faint">${esc(m.email)}</div></td>
          <td>${m.fixed ? '<span class="pill red">Owner</span>' : roleSel("r-" + m.email, m.role)}</td><td class="faint">${esc(ROLE_HELP[m.role] || "")}</td>
          <td style="text-align:right;white-space:nowrap">${m.fixed ? "" : `<button class="btn sm sec" data-rm="${esc(m.email)}">Remove</button>`}</td></tr>`).join("")}</table></div>
        <div class="addline"><input id="ne" placeholder="name@tradedepot.co" autocomplete="off"><input id="nn" placeholder="First name">${roleSel("nr", "field")}<button class="btn" id="nadd">Add</button></div></div>`
      : teamTab === "onb" ? `<div class="card"><div class="ch"><h2>Onboarders</h2><span class="muted">Sign in with WhatsApp at andiamo.ng/onboard to add stores</span></div>
        <div class="tw"><table class="t"><tr><th>Person</th><th>Company</th><th>Stores they add</th><th></th></tr>
        ${T.onboarders.map((o) => `<tr><td><b>${esc(o.name)}</b><div class="faint">${esc(o.phone)}</div></td><td>${esc(o.company || "")}</td>
          <td><label class="tgl"><input type="checkbox" data-auto="${esc(o.phone)}"${o.auto ? " checked" : ""}> Go live without approval</label><div class="faint">A bank name that doesn't match the venue always waits for approval.</div></td>
          <td style="text-align:right"><button class="btn sm sec" data-ro="${esc(o.phone)}">Remove</button></td></tr>`).join("") || `<tr><td colspan="4"><div class="empty">No onboarders yet.</div></td></tr>`}</table></div>
        <div class="addline"><div>${phoneField("op", "", "WhatsApp number")}</div><input id="on2" placeholder="Name"><input id="oc" placeholder="Company"><button class="btn" id="oadd">Add</button></div></div>`
      : `<div class="card"><div class="ch"><h2>Activity</h2><span class="muted">The last ${acts.length} changes and sign-ins</span></div>
        <div class="tw"><table class="t"><tr><th>When</th><th>Who</th><th>What</th><th></th></tr>
        ${acts.map((x) => `<tr><td class="faint" style="white-space:nowrap">${ago(x.at)}</td><td><b>${esc(x.name || x.by)}</b><div class="faint">${esc(x.by)}</div></td><td>${esc(ACT_NAMES[x.action] || x.action)}</td><td class="faint">${esc(x.target || "")}</td></tr>`).join("") || `<tr><td colspan="4"><div class="empty">Nothing yet.</div></td></tr>`}</table></div></div>`);
    P().querySelectorAll("[data-tt]").forEach((b) => (b.onclick = () => { teamTab = b.dataset.tt; team(); }));
    const again = async (msg) => { toast(msg); await load("team", "activity"); team(); };
    if (teamTab === "team") {
      T.team.filter((m) => !m.fixed).forEach((m) => { const el = $("r-" + m.email); if (el) el.onchange = async () => { const r = await call({ action: "team-save", member: { ...m, role: el.value } }); r.ok ? again(`${m.name || m.email} is now ${T.roleNames[el.value]}.`) : toast("Couldn't change it."); }; });
      P().querySelectorAll("[data-rm]").forEach((b) => (b.onclick = async () => {
        if (!(await dialog({ title: "Remove " + b.dataset.rm + "?", html: "They're signed out straight away.", okText: "Remove", danger: true }))) return;
        const r = await call({ action: "team-remove", email: b.dataset.rm }); r.ok ? again("Removed.") : toast("Couldn't remove.");
      }));
      $("nadd").onclick = async () => {
        const r = await call({ action: "team-save", member: { email: $("ne").value, name: $("nn").value, role: $("nr").value } });
        if (!r.ok) return r.error === "email" ? flag($("ne"), "Use a @tradedepot.co address.") : toast("Couldn't add.");
        again("Added. They can sign in now.");
      };
    } else if (teamTab === "onb") {
      P().querySelectorAll("[data-auto]").forEach((c) => (c.onchange = async () => { const o = T.onboarders.find((x) => x.phone === c.dataset.auto); const r = await call({ action: "onb-save", onboarder: { ...o, auto: c.checked } }); r.ok ? again(c.checked ? `${o.name}'s stores go live without approval.` : `${o.name}'s stores wait for approval.`) : toast("Couldn't change it."); }));
      P().querySelectorAll("[data-ro]").forEach((b) => (b.onclick = async () => {
        if (!(await dialog({ title: "Remove this onboarder?", html: "They can't add stores any more. Stores they added stay.", okText: "Remove", danger: true }))) return;
        const r = await call({ action: "onb-remove", phone: b.dataset.ro }); r.ok ? again("Removed.") : toast("Couldn't remove.");
      }));
      wirePhone("op");
      $("oadd").onclick = async () => {
        if (!phoneOf("op")) return flag($("op"), "Add their WhatsApp number.");
        const r = await call({ action: "onb-save", onboarder: { phone: phoneOf("op"), name: $("on2").value, company: $("oc").value, auto: false } });
        if (!r.ok) return r.error === "phone" ? flag($("op"), "Check the number and the country code.") : r.error === "name" ? flag($("on2"), "Add their name.") : toast("Couldn't add.");
        again("Added. Their stores wait for approval until you tick it.");
      };
    }
  }

  // ---------- gaps ----------
  function gapCells() {
    const cells = {};
    for (const u of D.unmet || []) { if (typeof u.lat !== "number") continue; const k = u.lat.toFixed(2) + "," + u.lng.toFixed(2); (cells[k] = cells[k] || { k, n: 0, last: 0 }).n++; cells[k].last = Math.max(cells[k].last, u.at || u.createdAt || 0); }
    return Object.values(cells).sort((a, b) => b.n - a.n);
  }
  function gaps() {
    const cells = gapCells(), max = cells.length ? cells[0].n : 1, total = (D.unmet || []).length;
    const near = (k) => { const [la, ln] = k.split(",").map(Number); let best = null, bd = 1e9; for (const v of venuesAll()) { if (!v.lat) continue; const d = Math.hypot((v.lat - la) * 111, (v.lng - ln) * 109); if (d < bd) { bd = d; best = v; } } return best ? `${bd.toFixed(1)}km from ${esc(best.name)}` : ""; };
    P().innerHTML = head("Gaps", "Where people tried to claim a bottle with no venue nearby. Each row is a square about 1km across.") +
      `<div class="card">${cells.length ? `<div class="ch"><h2>${plural(total, "attempt")}</h2><span class="muted">Top of the list is where to sign a venue next.</span></div>` + cells.slice(0, 40).map((c, i) => `<div class="gap"><span class="rk">${i + 1}</span><div><b>${plural(c.n, "attempt")}</b><div class="faint">${near(c.k)}</div></div>
        <div class="bar"><i style="width:${Math.max(6, 100 * c.n / max)}%"></i></div><a class="btn sm sec" target="_blank" href="https://www.google.com/maps/search/?api=1&query=${c.k}">Open map</a></div>`).join("")
        : `<div class="empty"><b>No gaps yet.</b><br>When someone tries to claim far from every venue, the spot shows up here.</div>`}</div>`;
  }

  // ---------- wallet ----------
  // The bottles card in Apple Wallet and Google Wallet. Set up here, never in Netlify: the signing key is made on
  // the server and stays there; only the request goes to Apple.
  const APPLE = { id: "https://developer.apple.com/account/resources/identifiers/add/passTypeId", cert: "https://developer.apple.com/account/resources/certificates/add" };
  const GOOGLE = { console: "https://pay.google.com/business/console", api: "https://console.cloud.google.com/apis/library/walletobjects.googleapis.com?project=tradedepot-retail-167113" };
  const WERR = { no_request: "Download the request first (step 2).", not_a_certificate: "That isn't a certificate. Upload the pass.cer file Apple gave you.",
    other_request: "That certificate was made from a different request. Make a new one in Apple from the request in step 2.",
    not_a_pass_certificate: "That isn't a Pass Type ID certificate. In Apple, choose Pass Type ID Certificate.", expired: "That certificate has expired. Make a new one in Apple.",
    issuer: "Check the issuer ID. It's the long number at the top of the Pay & Wallet Console.", sa_key: "That key file isn't a Google service account key.",
    google_signin: "Google didn't let the service account in. Check steps 2 and 3, then try again." };
  const GDESIGN = { api_off: "Google Wallet API isn't on in Google Cloud yet (step 2).", not_user: "The service account isn't on the console's Users list yet (step 3). Invites can take a few minutes." };
  const linkBtn = (href, t) => `<a class="btn sm sec" href="${href}" target="_blank" rel="noopener">${ic("ext")}${t}</a>`;
  const copyBtn = (v) => `<button class="btn sm sec" data-copy="${esc(v)}">${ic("copy")}Copy</button>`;
  function wallet() {
    const w = D.wallet;
    const acts = `<button class="btn sm sec" id="wlrefresh">${ic("refresh")}Check again</button>`;
    if (!w) { P().innerHTML = head("Wallet", "", acts) + `<div class="card"><div class="empty"><b>Couldn't load Wallet.</b><br>Try again in a moment.</div></div>`; $("wlrefresh").onclick = () => nav("wallet"); return; }
    const a = w.apple, g = w.google;
    const ast = (done) => (done ? "ok" : "todo");
    const appleSteps = [
      { t: "Make the Andiamo pass ID in Apple", st: ast(a.on), d: `Add a <b>Pass Type ID</b>. Description <b>Andiamo</b>, identifier <code class="k">${esc(a.passTypeId)}</code>.`, act: linkBtn(APPLE.id, "Open Apple") + copyBtn(a.passTypeId) },
      { t: "Download our request", st: ast(a.requested || a.on), d: "A small file for Apple. Our signing key stays on our server; only this request leaves it.", act: `<button class="btn sm" id="wlcsr">${ic("download")}Download request</button>` },
      { t: "Make the certificate in Apple", st: ast(a.on), d: `Choose <b>Pass Type ID Certificate</b>, pick <b>${esc(a.passTypeId)}</b>, upload the request, then download the certificate (<b>pass.cer</b>).`, act: linkBtn(APPLE.cert, "Open Apple") },
      { t: "Upload the certificate here", st: ast(a.on), d: a.on ? "Done. iPhones can add the card." : "The pass.cer file from Apple.", act: `<label class="btn sm${a.on ? " sec" : ""}" style="cursor:pointer">${ic("upload")}${a.on ? "Replace" : "Upload pass.cer"}<input type="file" id="wlcer" accept=".cer,.pem,.crt,application/x-x509-ca-cert,application/pkix-cert" hidden></label>` }
    ];
    const googleSteps = [
      { t: "Open a Google Wallet issuer account", st: ast(g.on), d: "In the Pay & Wallet Console, open <b>Google Wallet API</b> and sign up as an issuer. The <b>Issuer ID</b> is the long number at the top.", act: linkBtn(GOOGLE.console, "Open Google") },
      { t: "Turn on the Google Wallet API", st: ast(g.on), d: "In Google Cloud, for the project our records already use, press <b>Enable</b>.", act: linkBtn(GOOGLE.api, "Open Google Cloud") },
      { t: "Let our service account in", st: ast(g.on), d: g.email ? `In the Pay & Wallet Console, <b>Users</b>, invite <code class="k">${esc(g.email)}</code> as <b>Developer</b>.` : "Add a service account key below first.", act: g.email ? copyBtn(g.email) : "" },
      { t: "Enter the issuer ID", st: ast(g.on), d: `<div class="wlrow"><input id="wliss" inputmode="numeric" placeholder="3388000000012345678" value="${esc(g.issuerId)}"><button class="btn sm" id="wlgo">${g.on ? "Save" : "Turn on"}</button></div><p class="wlerr" id="wlerr" role="alert" hidden></p>`, act: "" },
      ...(g.on ? [{ t: "Card design at Google", st: ast(g.design), d: g.design ? "Made. Google reviews it when you ask for publishing." : (GDESIGN[g.designWhy] || (g.designWhy ? esc(g.designWhy) : "Not made yet.")) + " Then press Save above.", act: "" }] : [])
    ];
    const card = (title, sub, on, steps, extra = "", top = "") => { const todo = steps.filter((x) => x.st === "todo").length;
      return `<div class="card"${top}><div class="ready"><div class="big ${on ? "ok" : ""}">${ic(on ? "tick" : "wallet")}</div><div><h2>${title}</h2><p class="muted">${on ? sub : plural(todo, "step") + " to go. " + sub}</p></div></div>
        <div class="chk">${steps.map((x, i) => `<div class="ci${x.st === "ok" ? " done" : ""}"><span class="st ${x.st}">${x.st === "ok" ? ic("tick") : i + 1}</span><div><b>${x.t}</b><div class="d">${x.d}</div></div><div class="act wlact">${x.act || ""}</div></div>`).join("")}</div>${extra}</div>`; };
    const aExtra = a.on ? `<dl class="kv" style="margin-top:14px"><dt>Pass type</dt><dd>${esc(a.passTypeId)}</dd><dt>Team</dt><dd>${esc(a.teamId)}</dd><dt>Certificate valid until</dt><dd>${a.expires ? fmt(Date.parse(a.expires), { day: "numeric", month: "short", year: "numeric" }) : "·"}</dd><dt>Updates</dt><dd><code class="k">${esc(a.webService)}</code></dd></dl>` : "";
    const gExtra = `<p class="muted" style="margin:14px 0 0">${g.on ? "Until Google approves Andiamo, only people on the console's Users list can add the card. To publish: in the Google Wallet API page of the console, complete the business profile (Update), then Request publishing access. Google replies by email in 2 to 3 days." : "Google lets only test accounts add the card until it approves Andiamo for publishing."}</p>
      <details class="wlmore"><summary>Use a different service account</summary><p class="muted">Only if you'd rather not use ${esc(g.email || "the records account")}. Upload its JSON key.</p><label class="btn sm sec" style="cursor:pointer">${ic("upload")}Upload key<input type="file" id="wlsa" accept=".json,application/json" hidden></label></details>`;
    P().innerHTML = head("Wallet", "The Andiamo! bottles card in Apple Wallet and Google Wallet. " + plural(w.cards, "card") + " made so far.", acts) +
      `<div class="two wlgrid">${card("Apple Wallet", a.on ? "iPhones can add the card." : "Then iPhones can add the card.", a.on, appleSteps, aExtra)}${card("Google Wallet", g.on ? "Android phones can add the card." : "Then Android phones can add the card.", g.on, googleSteps, gExtra)}</div>`;
    $("wlrefresh").onclick = () => nav("wallet");
    P().querySelectorAll("[data-copy]").forEach((b) => (b.onclick = () => { try { navigator.clipboard.writeText(b.dataset.copy).then(() => toast("Copied."), () => toast("Couldn't copy.")); } catch { toast("Couldn't copy."); } }));
    $("wlcsr").onclick = async () => {
      const r = await call({ action: "wallet-request" });
      if (!r.ok) return toast("Couldn't make the request. Try again.");
      const u = URL.createObjectURL(new Blob([r.csr], { type: "application/pkcs10" })), x = document.createElement("a");
      x.href = u; x.download = "Andiamo.certSigningRequest"; document.body.appendChild(x); x.click(); x.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000);
      toast("Downloaded. Now make the certificate in Apple."); D.wallet.apple.requested = true; wallet();
    };
    const readB64 = (f) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.readAsDataURL(f); });
    $("wlcer").onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = await call({ action: "wallet-apple-cert", file: await readB64(f) });
      if (!r.ok) return toast(WERR[r.error] || "Couldn't use that file.");
      toast("Apple Wallet is on."); nav("wallet");
    };
    const gErr = (t) => { const e = $("wlerr"); e.textContent = t; e.hidden = !t; };
    $("wliss").oninput = () => gErr("");
    $("wlgo").onclick = async () => {
      gErr(""); $("wlgo").disabled = true;
      const r = await call({ action: "wallet-google", issuerId: $("wliss").value });
      $("wlgo").disabled = false;
      if (!r.ok) return gErr(WERR[r.error] || "Couldn't save it.");
      toast(r.design && r.design.ok ? "Google Wallet is on." : "Saved, but Google hasn't taken the card design yet."); nav("wallet");
    };
    $("wlsa").onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (!$("wliss").value) return gErr("Enter the issuer ID first.");
      const r = await call({ action: "wallet-google", issuerId: $("wliss").value, saKey: await f.text() });
      if (!r.ok) return toast(WERR[r.error] || "Couldn't use that key.");
      toast("Saved. Invite " + r.email + " in the console."); nav("wallet");
    };
  }

  // ---------- whatsapp ----------
  // Everything Meta needs, checked live, in the order it gets done. Ticks for done, a clock for "with Meta", a number for "to do".
  const META_HINT = {
    190: "The token has expired or was revoked. Make a new one for the system user and put it in WA_TOKEN.",
    10: "The token is missing a permission. Give the system user whatsapp_business_messaging and whatsapp_business_management, then make a new token.",
    200: "The token is missing a permission. Give the system user whatsapp_business_messaging and whatsapp_business_management, then make a new token.",
    131030: "That number isn't on the app's test list. Add it in Meta, or switch the app to Live.",
    131026: "Couldn't deliver. Check the number is on WhatsApp.",
    132001: "Meta can't find that template in that language. Check the name and OUTSIDE_TPL_LANG.",
    132000: "The template's blanks don't match what we send. Check it was set up as in the handoff.",
    132012: "The template's blanks don't match what we send. Check it was set up as in the handoff.",
    132015: "Meta has paused this template.", 132016: "Meta has turned this template off.",
    133005: "Wrong PIN. The number already has a two-step PIN. Use that one, or turn it off in WhatsApp Manager first.",
    133006: "Meta wants the number verified again. Do it in WhatsApp Manager.",
    133010: "The number isn't registered yet.",
    131031: "Meta has locked this account. Check WhatsApp Manager.", 368: "Meta has restricted this account. Check WhatsApp Manager."
  };
  const metaSays = (e) => (e ? META_HINT[e.code] || e.message || "Meta said no." : "");
  const metaRaw = (e) => (e && META_HINT[e.code] && e.message ? `Meta: ${e.message} (${e.code})` : "");
  const kc = (t) => `<code class="k">${esc(t)}</code>`;
  const QUALITY = { GREEN: "High", YELLOW: "Medium", RED: "Low" };
  const TIER = { TIER_50: "50", TIER_250: "250", TIER_1K: "1,000", TIER_10K: "10,000", TIER_100K: "100,000" };
  const TPL_HOW = { code: "category Authentication, with a copy code button", bottle: "category Utility, with the image header and the Claim it button" };

  function waSteps(w) {
    const env = Object.fromEntries((w.env || []).map((e) => [e.key, e]));
    const n = w.number && !w.number.error ? w.number : null, tok = w.token || {};
    const tpls = Array.isArray(w.templates) ? w.templates : null, lang = (w.want && w.want.lang) || "en";
    const apps = Array.isArray(w.apps) ? w.apps : null;
    const upstream = (x) => (x && x.error ? esc(metaSays(x.error)) : "Fix the token first.");
    const S = [];
    S.push({ k: "token", t: "Token", st: tok.ok ? "ok" : "todo",
      d: tok.ok ? `Works${tok.name ? ", for " + esc(tok.name) : ""}.` : env.WA_TOKEN.set ? esc(metaSays(tok.error)) : `Put the system user's permanent token in ${kc("WA_TOKEN")} in Netlify, then redeploy.`,
      m: tok.ok ? "" : esc(metaRaw(tok.error)) });
    S.push({ k: "number", t: "The number", st: n ? "ok" : "todo",
      d: n ? `${esc(n.display_phone_number || "")}${n.verified_name ? " · " + esc(n.verified_name) : ""}` : !env.WA_PHONE_ID.set ? `Put the Phone number ID, from WhatsApp, API Setup, in ${kc("WA_PHONE_ID")}.` : !tok.ok ? "Fix the token first." : esc(metaSays(w.number && w.number.error)),
      m: n || !w.number ? "" : esc(metaRaw(w.number.error)) });
    const ns = n && n.name_status, nameOk = ["APPROVED", "AVAILABLE_WITHOUT_REVIEW"].includes(ns);
    S.push({ k: "name", t: "Display name", st: !n ? "todo" : nameOk ? "ok" : ["DECLINED", "EXPIRED"].includes(ns) ? "todo" : "wait",
      d: !n ? "Shows once the number is connected." : nameOk ? `People see <b>${esc(n.verified_name)}</b>.` : ns === "DECLINED" ? "Meta declined the name. Change it in WhatsApp Manager and send it again." : ns === "EXPIRED" ? "The name approval expired. Send it again in WhatsApp Manager." : `Meta is reviewing “${esc(n.verified_name || "")}”. Usually a day or two.` });
    const reg = n && n.platform_type === "CLOUD_API";
    S.push({ k: "register", t: "Registered for sending", st: reg ? "ok" : "todo",
      d: reg ? `Done${n.status ? ", " + esc(String(n.status).toLowerCase()) : ""}.` : !n ? "Needs the number first." : "Register the number once, with a 6-digit PIN you choose.",
      act: !reg && n ? `<button class="btn sm" data-wa="register">Register</button>` : "" });
    for (const [key, envKey, label] of [["code", "OUTSIDE_TPL_CODE", "Sign-in code template"], ["bottle", "OUTSIDE_TPL_BOTTLE", "Bottle notice template"]]) {
      const name = env[envKey].value, all = (tpls || []).filter((x) => x.name === name), t = all.find((x) => x.language === lang);
      let st = "todo", d;
      if (!name) d = `Set ${kc(envKey)} to ${kc("andiamo_" + key)} in Netlify.`;
      else if (!tpls) d = upstream(w.templates || w.waba);
      else if (!t && all.length) d = `${kc(name)} is in ${esc(all.map((x) => x.language).join(", "))}, but ${kc("OUTSIDE_TPL_LANG")} is ${esc(lang)}. Make them match.`;
      else if (!t) d = `No template called ${kc(name)} yet. Create it in WhatsApp Manager, ${TPL_HOW[key]}.`;
      else if (t.status === "APPROVED") { st = "ok"; d = `${kc(name)} is approved.`; }
      else if (["PENDING", "IN_APPEAL"].includes(t.status)) { st = "wait"; d = `${kc(name)} is with Meta for review.`; }
      else d = `${kc(name)} is ${esc(String(t.status).toLowerCase())}${t.reason ? ": " + esc(t.reason.toLowerCase().replace(/_/g, " ")) : ""}. Fix it in WhatsApp Manager.`;
      S.push({ k: key, t: label, st, d });
    }
    const hookSt = !env.WA_VERIFY_TOKEN.set || !apps || !apps.length ? "todo" : w.lastHook ? "ok" : "wait";
    S.push({ k: "hook", t: "Webhook", st: hookSt,
      d: !env.WA_VERIFY_TOKEN.set ? `Set ${kc("WA_VERIFY_TOKEN")} in Netlify. Then add the webhook in the Meta app with the URL on the right and the same word, and subscribe to messages.`
        : !apps ? upstream(w.apps && w.apps.error ? w.apps : w.waba)
        : !apps.length ? "The app isn't subscribed to the WhatsApp account, so Meta won't send us messages or delivery updates."
        : w.lastHook ? `Working. Last heard from Meta ${ago(w.lastHook.at)}.` : "Nothing from Meta yet. Send a test below: if it shows Delivered, the webhook works.",
      act: apps && !apps.length ? `<button class="btn sm" data-wa="subscribe">Subscribe the app</button>` : "" });
    S.push({ k: "secret", t: "Signature check", st: env.WA_APP_SECRET.set ? "ok" : "todo",
      d: env.WA_APP_SECRET.set ? "We only accept messages signed by Meta." : `Put the app secret, from App settings, Basic, in ${kc("WA_APP_SECRET")}.` });
    const sandbox = n && n.account_mode === "SANDBOX";
    S.push({ k: "live", t: "Live", st: !w.dev && !sandbox ? "ok" : "todo",
      d: w.dev ? `${kc("OUTSIDE_DEV")} is on, so sign-in codes show on screen. Delete it in Netlify, then redeploy.` : sandbox ? "The Meta app is in Development, so only test numbers get messages. Switch it to Live." : "Codes only go to WhatsApp." });
    return S;
  }

  D.waTests = D.waTests || [];
  let waTimer = null;
  function whatsapp() {
    const w = D.wa;
    const acts = `<button class="btn sm sec" id="wrefresh">${ic("refresh")}Check again</button>`;
    if (!w) { P().innerHTML = head("WhatsApp", "", acts) + `<div class="card"><div class="empty"><b>Couldn't run the check.</b><br>Try again in a moment.</div></div>`; $("wrefresh").onclick = () => nav("whatsapp"); return; }
    const steps = waSteps(w), todo = steps.filter((x) => x.st === "todo").length, wait = steps.filter((x) => x.st === "wait").length;
    const ready = !todo && !wait, n = w.number && !w.number.error ? w.number : null;
    const title = ready ? "Ready" : todo ? plural(todo, "thing") + " to do" : "Waiting on Meta";
    const line = ready ? "Sign-in codes and bottle notices are going out." : todo ? `Nobody can sign in until these are done.${wait ? " " + plural(wait, "more is", "more are") + " with Meta." : ""}` : "Nothing for you to do. Meta is reviewing.";
    let no = 0;
    const tpls = Array.isArray(w.templates) ? w.templates : [];
    const tplPill = (st) => `<span class="pill ${st === "APPROVED" ? "ok" : ["PENDING", "IN_APPEAL"].includes(st) ? "gold" : "warn"}">${esc(String(st || "").toLowerCase().replace(/_/g, " "))}</span>`;
    P().innerHTML = head("WhatsApp", "Sign-in codes and bottle notices. Checked live with Meta.", acts) +
      `<div class="card"><div class="ready"><div class="big ${ready ? "ok" : todo ? "" : "wait"}">${ic(ready ? "tick" : todo ? "chat" : "clock")}</div><div><h2>${title}</h2><p class="muted">${line}</p></div></div>
        <div class="chk">${steps.map((x) => { if (x.st === "todo") no++; return `<div class="ci${x.st === "ok" ? " done" : ""}" data-k="${x.k}"><span class="st ${x.st}">${x.st === "ok" ? ic("tick") : x.st === "wait" ? ic("clock") : no}</span>
          <div><b>${x.t}</b><div class="d">${x.d}</div>${x.m ? `<div class="m">${x.m}</div>` : ""}<div class="fixbox"></div></div><div class="act">${x.act || ""}</div></div>`; }).join("")}</div></div>
      <div class="two" style="margin-top:16px">
        <div class="card"><div class="ch"><h2>Send a test</h2></div><p class="muted" style="margin:-6px 0 0">The real message, to any WhatsApp number. Use your own.</p>
          <label class="lb">Message</label><div class="seg" id="wkind"><button data-k="code" class="on">Sign-in code</button><button data-k="bottle">Bottle notice</button></div>
          <label class="lb">WhatsApp number</label>${phoneField("wphone", SS.get("outside.wtest") || "")}
          <button class="btn" id="wsend" style="margin-top:14px">${ic("send")}Send test</button>
          <div class="tests" id="wtests"></div></div>
        <div class="card" style="margin-top:0"><div class="ch"><h2>Details</h2></div><dl class="kv">
          <dt>Number</dt><dd>${n ? esc(n.display_phone_number || "") : '<span class="faint">Not connected</span>'}</dd>
          <dt>Name</dt><dd>${n && n.verified_name ? esc(n.verified_name) : '<span class="faint">·</span>'}</dd>
          <dt>Quality</dt><dd>${n ? QUALITY[n.quality_rating] || "Not rated yet" : '<span class="faint">·</span>'}</dd>
          <dt>Daily limit</dt><dd>${n && n.messaging_limit_tier ? (n.messaging_limit_tier === "TIER_UNLIMITED" ? "No limit" : (TIER[n.messaging_limit_tier] || esc(n.messaging_limit_tier)) + " people a day") : '<span class="faint">·</span>'}</dd>
          <dt>WhatsApp account</dt><dd>${w.waba && w.waba.id ? esc(w.waba.name || w.waba.id) : '<span class="faint">Not found</span>'}</dd>
          <dt>Webhook URL</dt><dd><div class="copyrow"><code class="k" id="whook">${esc(w.hookUrl)}</code><button class="btn sm sec" id="wcopy">${ic("copy")}Copy</button></div></dd>
          <dt>Verify token</dt><dd>${w.env.find((e) => e.key === "WA_VERIFY_TOKEN").set ? "Set in Netlify" : '<span class="faint">Not set</span>'}</dd></dl>
          <h3 style="font-size:19px;margin:22px 0 8px">Templates</h3>
          ${tpls.length ? `<div class="tw"><table class="t"><tr><th>Name</th><th>Language</th><th class="hm">Type</th><th></th></tr>${tpls.map((t) => `<tr><td><b>${esc(t.name)}</b></td><td class="muted">${esc(t.language)}</td><td class="muted hm">${esc(String(t.category || "").toLowerCase())}</td><td style="text-align:right">${tplPill(t.status)}</td></tr>`).join("")}</table></div>`
            : `<p class="muted" style="margin:0">${Array.isArray(w.templates) ? "None yet." : "Shows once the token works."}</p>`}</div>
      </div>`;
    $("wrefresh").onclick = () => nav("whatsapp");
    $("wcopy").onclick = () => { try { navigator.clipboard.writeText(w.hookUrl).then(() => toast("Copied."), () => toast("Couldn't copy.")); } catch { toast("Couldn't copy."); } };
    let kind = "code";
    $("wkind").querySelectorAll("button").forEach((b) => (b.onclick = () => { kind = b.dataset.k; $("wkind").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); }));
    wirePhone("wphone");
    $("wsend").onclick = async () => {
      const ph = phoneOf("wphone");
      if (!ph) return flag($("wphone"), "Add the number to send it to.");
      $("wsend").disabled = true;
      const r = await call({ action: "wa-test", kind, phone: ph });
      $("wsend").disabled = false;
      if (!r.ok) return flag($("wphone"), r.error === "phone" ? "Check the number and the country code." : r.error === "no_template" ? "Set the template name in Netlify first." : r.error === "no_whatsapp" ? "Add the token and the Phone number ID first." : metaSays(r.meta));
      SS.set("outside.wtest", ph);
      D.waTests.unshift({ id: r.id, kind, to: r.to, at: Date.now(), status: "accepted" });
      renderTests(); pollTests();
    };
    P().querySelectorAll("[data-wa=register]").forEach((b) => (b.onclick = () => {
      const box = P().querySelector('.ci[data-k="register"] .fixbox'); b.hidden = true;
      box.innerHTML = `<div class="fix"><input id="wpin" inputmode="numeric" maxlength="6" placeholder="6 digits" autocomplete="off"><button class="btn sm" id="wreg">Register</button></div>
        <p class="faint" style="margin:8px 0 0">The PIN becomes the number's two-step PIN, so keep it somewhere safe. If the number already has one, use that.</p>`;
      $("wpin").focus();
      $("wreg").onclick = async () => {
        const pin = $("wpin").value.replace(/\D/g, "");
        if (pin.length !== 6) return flag($("wpin"), "Use 6 digits.");
        $("wreg").disabled = true;
        const r = await call({ action: "wa-register", pin });
        if (!r.ok) { $("wreg").disabled = false; return flag($("wpin"), r.error === "pin" ? "Use 6 digits." : metaSays(r.meta)); }
        toast("Registered. Keep that PIN."); nav("whatsapp");
      };
    }));
    P().querySelectorAll("[data-wa=subscribe]").forEach((b) => (b.onclick = async () => {
      b.disabled = true; const r = await call({ action: "wa-subscribe" });
      if (!r.ok) { b.disabled = false; return toast(metaSays(r.meta)); }
      toast("Subscribed."); nav("whatsapp");
    }));
    renderTests(); pollTests();
  }
  const TSTEPS = [["accepted", "Accepted"], ["sent", "Sent"], ["delivered", "Delivered"], ["read", "Read"]];
  function renderTests() {
    const el = $("wtests"); if (!el) return;
    el.innerHTML = D.waTests.slice(0, 5).map((t) => {
      const failed = t.status === "failed", rank = TSTEPS.findIndex(([k]) => k === t.status);
      const stale = t.status === "accepted" && Date.now() - t.at > 60000;
      return `<div class="tr"><div class="row"><b>${t.kind === "code" ? "Sign-in code" : "Bottle notice"} to ${esc(t.to)}</b><span class="faint">${tm(t.at)}</span></div>
        ${failed ? `<p class="ferr">${esc(t.error || "It didn't reach them.")}</p>` : `<div class="trail">${TSTEPS.map(([, nm], i) => `<span class="${i <= rank ? "on" : ""}">${nm}</span>`).join("")}</div>`}
        ${stale ? `<p class="faint" style="margin:8px 0 0">No word back from Meta. If it arrived on the phone, the webhook isn't reaching us yet.</p>` : ""}</div>`;
    }).join("");
  }
  function pollTests() {
    if (waTimer) return;
    waTimer = setInterval(async () => {
      const open = D.waTests.filter((t) => !["read", "failed"].includes(t.status) && Date.now() - t.at < 180000);
      if (!open.length || page !== "whatsapp") { clearInterval(waTimer); waTimer = null; renderTests(); return; }
      for (const t of open) { const r = await call({ action: "wa-test-status", id: t.id }); if (r.ok && r.test) Object.assign(t, { status: r.test.status, error: r.test.error }); }
      renderTests();
    }, 2500);
  }

  // ---------- start ----------
  if (at || ak) start().catch(() => {}); else login();
})();
