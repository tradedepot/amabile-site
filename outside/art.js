// Outside: the illustration kit. Avatars, venue buildings, landmarks and the bottle.
// Flat, warm, chunky outlines. Brand palette: wine #7d1d1d, gold #c9a15a, cream #efe4cf, ink #3a2a20.
(function (g) {
  const INK = "#3a2a20", WINE = "#7d1d1d", GOLD = "#c9a15a", CREAM = "#fffdf7";

  // ---------- avatars ----------
  const SKINS = { s1: "#F3CBA5", s2: "#DDA57A", s3: "#BD7D50", s4: "#8F5B3A", s5: "#5C3A25" };
  const OUTFITS = {
    ankara:    { base: "#E74529", label: "Ankara" },
    agbada:    { base: "#F4EEDC", label: "Agbada" },
    jersey:    { base: "#1F8A4C", label: "Jersey" },
    corporate: { base: "#2B3550", label: "Corporate" },
    owambe:    { base: "#C9A15A", label: "Owambe lace" },
    street:    { base: "#4D7396", label: "Street" },
    nightout:  { base: "#2a1b1b", label: "Night out" }
  };
  const HAIRS = { low: "Low cut", afro: "Afro", braids: "Braids", straight: "Bone straight", bun: "Bun", gele: "Gele", cap: "Cap", bald: "Clean" };
  const FACES = { smile: "Smile", grin: "Big grin", glam: "Glam", shades: "Shades", wink: "Wink" };

  function outfit(id) {
    const o = OUTFITS[id] || OUTFITS.ankara;
    let s = `<path d="M18 120 C20 92 36 82 60 82 C84 82 100 92 102 120 Z" fill="${o.base}" stroke="${INK}" stroke-width="3"/>`;
    if (id === "ankara") s += `<g fill="#F4C542" stroke="${INK}" stroke-width="1.5"><path d="M34 100 l6 -8 l6 8 z"/><path d="M70 104 l6 -8 l6 8 z"/><circle cx="54" cy="110" r="3.5" fill="#2B7A9B"/><circle cx="88" cy="98" r="3" fill="#2B7A9B"/><path d="M28 114 l5 -6 l5 6 z"/></g>`;
    if (id === "agbada") s += `<path d="M44 84 C50 100 70 100 76 84" fill="none" stroke="${GOLD}" stroke-width="4"/><path d="M52 92 l8 14 l8 -14" fill="none" stroke="${GOLD}" stroke-width="3"/><circle cx="60" cy="108" r="2.5" fill="${GOLD}"/>`;
    if (id === "jersey") s += `<path d="M30 92 L30 120 M90 92 L90 120" stroke="#fff" stroke-width="6"/><path d="M48 84 L60 96 L72 84" fill="none" stroke="#fff" stroke-width="4"/><text x="60" y="114" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="12" fill="#fff">9</text>`;
    if (id === "corporate") s += `<path d="M48 84 L60 100 L72 84" fill="#fff" stroke="${INK}" stroke-width="2"/><path d="M57 96 L60 116 L63 96 Z" fill="${WINE}" stroke="${INK}" stroke-width="1.5"/>`;
    if (id === "owambe") s += `<g fill="none" stroke="#fff6dc" stroke-width="1.6" opacity=".9"><circle cx="38" cy="102" r="5"/><circle cx="60" cy="108" r="5"/><circle cx="82" cy="102" r="5"/><circle cx="49" cy="114" r="4"/><circle cx="71" cy="114" r="4"/></g>`;
    if (id === "nightout") s += `<path d="M40 86 C46 98 74 98 80 86" fill="none" stroke="${GOLD}" stroke-width="2.5"/><circle cx="60" cy="97" r="3.2" fill="${GOLD}" stroke="${INK}" stroke-width="1.2"/><path d="M38 84 L42 120 M82 84 L78 120" stroke="#4a2e2e" stroke-width="2"/>`;
    if (id === "street") s += `<path d="M42 84 C46 96 74 96 78 84" fill="none" stroke="${INK}" stroke-width="2.5"/><path d="M54 92 L54 106 M66 92 L66 106" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>`;
    return s;
  }
  function hairBack(id) {
    if (id === "afro") return `<circle cx="60" cy="46" r="31" fill="#2a1a12" stroke="${INK}" stroke-width="3"/>`;
    if (id === "straight") return `<path d="M34 40 C28 62 26 84 24 98 L44 98 C40 84 38 66 40 52 Z M86 40 C92 62 94 84 96 98 L76 98 C80 84 82 66 80 52 Z" fill="#1d120c" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
    if (id === "braids") return `<path d="M33 46 C30 70 32 86 36 92 M87 46 C90 70 88 86 84 92" stroke="#2a1a12" stroke-width="7" stroke-linecap="round" fill="none"/>`;
    return "";
  }
  function hairFront(id) {
    switch (id) {
      case "low": return `<path d="M37 44 C38 26 82 26 83 44 C76 36 44 36 37 44 Z" fill="#2a1a12" stroke="${INK}" stroke-width="2.5"/>`;
      case "afro": return `<path d="M36 46 C40 30 80 30 84 46 C74 38 46 38 36 46 Z" fill="#2a1a12"/>`;
      case "braids": return `<path d="M36 46 C38 24 82 24 84 46 C76 36 44 36 36 46 Z" fill="#2a1a12" stroke="${INK}" stroke-width="2.5"/><path d="M48 30 L46 40 M60 28 L60 38 M72 30 L74 40" stroke="#5a3a26" stroke-width="2"/>`;
      case "straight": return `<path d="M35 50 C30 22 90 22 85 50 C82 38 70 30 61 31 L59 31 C50 30 38 38 35 50 Z" fill="#1d120c" stroke="${INK}" stroke-width="2.5"/><path d="M60 26 L60 32" stroke="#4a3426" stroke-width="2"/><path d="M48 30 C44 33 41 37 40 42" stroke="#4a3426" stroke-width="1.6" fill="none" opacity=".8"/>`;
      case "gele": return `<path d="M30 42 C26 16 60 6 74 14 C92 10 98 30 88 44 C76 34 44 34 30 42 Z" fill="${WINE}" stroke="${INK}" stroke-width="3"/><path d="M40 24 C52 18 70 18 84 26 M36 34 C52 26 72 26 88 36" fill="none" stroke="${GOLD}" stroke-width="2.5"/><path d="M78 12 C90 2 100 12 92 20" fill="${WINE}" stroke="${INK}" stroke-width="2.5"/>`;
      case "cap": return `<path d="M36 42 C36 22 84 22 84 42 Z" fill="${WINE}" stroke="${INK}" stroke-width="3"/><path d="M80 40 C92 40 100 42 102 46 L82 46 Z" fill="${WINE}" stroke="${INK}" stroke-width="2.5"/><circle cx="60" cy="24" r="3" fill="${GOLD}"/>`;
      case "bun": return `<circle cx="60" cy="18" r="10" fill="#2a1a12" stroke="${INK}" stroke-width="2.5"/><path d="M36 46 C38 24 82 24 84 46 C76 36 44 36 36 46 Z" fill="#2a1a12" stroke="${INK}" stroke-width="2.5"/>`;
      default: return `<path d="M44 30 C50 27 54 28 56 30" stroke="#fff" stroke-width="2" opacity=".5" fill="none" stroke-linecap="round"/>`;
    }
  }
  function face(id) {
    const eyes = id === "shades"
      ? `<rect x="40" y="46" width="17" height="10" rx="4" fill="${INK}"/><rect x="63" y="46" width="17" height="10" rx="4" fill="${INK}"/><path d="M57 50 L63 50" stroke="${INK}" stroke-width="2.5"/><path d="M43 48 L48 48" stroke="#fff" stroke-width="1.5" opacity=".6"/>`
      : id === "wink"
        ? `<circle cx="49" cy="51" r="3.6" fill="${INK}"/><path d="M66 51 C68 48 74 48 76 51" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`
        : `<circle cx="49" cy="51" r="3.6" fill="${INK}"/><circle cx="71" cy="51" r="3.6" fill="${INK}"/><circle cx="50.2" cy="49.8" r="1.1" fill="#fff"/><circle cx="72.2" cy="49.8" r="1.1" fill="#fff"/>`;
    const mouth = id === "grin"
      ? `<path d="M48 62 C52 74 68 74 72 62 Z" fill="#fff" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`
      : id === "glam"
        ? `<path d="M50 63 C54 60 58 61 60 62.5 C62 61 66 60 70 63 C66 70 54 70 50 63 Z" fill="#B3263A" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`
        : `<path d="M50 63 C55 69 65 69 70 63" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    // Glam: lashes, lipstick and gold drop earrings.
    const lashes = id === "glam" ? `<path d="M44.5 47.5 L42.5 45 M47.5 46.5 L46.5 43.5 M75.5 47.5 L77.5 45 M72.5 46.5 L73.5 43.5" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>` : "";
    const ears = id === "glam" ? `<circle cx="36" cy="62" r="2.2" fill="${GOLD}" stroke="${INK}" stroke-width="1.2"/><path d="M36 64 L36 70" stroke="${GOLD}" stroke-width="2"/><circle cx="36" cy="72" r="3.2" fill="${GOLD}" stroke="${INK}" stroke-width="1.4"/>` +
      `<circle cx="84" cy="62" r="2.2" fill="${GOLD}" stroke="${INK}" stroke-width="1.2"/><path d="M84 64 L84 70" stroke="${GOLD}" stroke-width="2"/><circle cx="84" cy="72" r="3.2" fill="${GOLD}" stroke="${INK}" stroke-width="1.4"/>` : "";
    return eyes + lashes + mouth + ears + `<circle cx="42" cy="61" r="4" fill="#E88C79" opacity="${id === "glam" ? ".7" : ".45"}"/><circle cx="78" cy="61" r="4" fill="#E88C79" opacity="${id === "glam" ? ".7" : ".45"}"/>`;
  }
  function avatar(a, size = 120) {
    a = a || {};
    const skin = SKINS[a.skin] || SKINS.s3;
    const bg = { ankara: "#FBE3C8", agbada: "#E9DCC0", jersey: "#D6EBDC", corporate: "#DCE3F0", owambe: "#F6E7C4", street: "#DCE8F2", nightout: "#F6D9DC" }[a.outfit] || "#F6E7C4";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="Avatar">` +
      `<defs><clipPath id="ac"><circle cx="60" cy="60" r="58"/></clipPath></defs>` +
      `<circle cx="60" cy="60" r="58" fill="${bg}"/>` +
      `<g clip-path="url(#ac)">${hairBack(a.hair)}${outfit(a.outfit)}` +
      `<rect x="51" y="70" width="18" height="16" rx="6" fill="${skin}" stroke="${INK}" stroke-width="3"/>` +
      `<ellipse cx="60" cy="52" rx="24" ry="26" fill="${skin}" stroke="${INK}" stroke-width="3"/>` +
      `<ellipse cx="36" cy="54" rx="4" ry="6" fill="${skin}" stroke="${INK}" stroke-width="2.5"/><ellipse cx="84" cy="54" rx="4" ry="6" fill="${skin}" stroke="${INK}" stroke-width="2.5"/>` +
      `${face(a.face)}${hairFront(a.hair)}</g>` +
      `<circle cx="60" cy="60" r="58" fill="none" stroke="${INK}" stroke-width="3"/></svg>`;
  }

  // ---------- venue buildings (64 x 64) ----------
  const win = (x, y, lit) => `<rect x="${x}" y="${y}" width="7" height="7" rx="1.5" fill="${lit ? "#FFD27A" : "#9fb7c6"}" stroke="${INK}" stroke-width="1.5"/>`;
  const VENUE = {
    lounge: (lit) => `<rect x="10" y="22" width="44" height="34" rx="4" fill="#E9B7A6" stroke="${INK}" stroke-width="3"/>` +
      `<rect x="14" y="12" width="36" height="12" rx="3" fill="${WINE}" stroke="${INK}" stroke-width="3"/><text x="32" y="21.5" text-anchor="middle" font-family="Georgia,serif" font-size="6.6" font-weight="700" letter-spacing=".3" fill="${lit ? "#FFD27A" : CREAM}">LOUNGE</text>` +
      `${win(16, 30, lit)}${win(28, 30, lit)}${win(40, 30, lit)}<rect x="26" y="42" width="12" height="14" rx="2" fill="${INK}"/><path d="M44 44 l4 0 l-2 4 z M46 48 l0 4" stroke="${GOLD}" stroke-width="1.8" fill="${GOLD}"/>`,
    restaurant: (lit) => `<rect x="10" y="24" width="44" height="32" rx="4" fill="#F2DDB8" stroke="${INK}" stroke-width="3"/>` +
      `<path d="M8 24 L56 24 L52 14 L12 14 Z" fill="#E74529" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M18 14 L16 24 M28 14 L27 24 M38 14 L37 24 M48 14 L48 24" stroke="#fff" stroke-width="3"/>` +
      `${win(16, 32, lit)}${win(41, 32, lit)}<rect x="27" y="40" width="10" height="16" rx="2" fill="${INK}"/>`,
    hotel: (lit) => `<rect x="16" y="6" width="32" height="50" rx="3" fill="#CFE0EA" stroke="${INK}" stroke-width="3"/>` +
      `${win(21, 12, lit)}${win(36, 12, lit)}${win(21, 23, !lit)}${win(36, 23, lit)}${win(21, 34, lit)}${win(36, 34, !lit)}` +
      `<rect x="27" y="45" width="10" height="11" rx="2" fill="${INK}"/><circle cx="32" cy="6" r="5" fill="${GOLD}" stroke="${INK}" stroke-width="2"/><text x="32" y="8.6" text-anchor="middle" font-family="Arial" font-weight="900" font-size="7" fill="${INK}">H</text>`,
    rooftop: (lit) => `<rect x="12" y="20" width="40" height="36" rx="3" fill="#D9D2E9" stroke="${INK}" stroke-width="3"/>` +
      `${win(17, 27, lit)}${win(28, 27, lit)}${win(39, 27, lit)}${win(17, 39, lit)}${win(28, 39, !lit)}${win(39, 39, lit)}` +
      `<path d="M20 20 L20 10 M44 20 L44 10" stroke="${INK}" stroke-width="2"/><path d="M12 10 C20 2 28 2 30 10 Z M34 10 C40 2 50 2 54 10 Z" fill="${WINE}" stroke="${INK}" stroke-width="2.5"/>` +
      `<path d="M14 20 Q32 14 50 20" stroke="${GOLD}" stroke-width="2" fill="none" stroke-dasharray="1 4" stroke-linecap="round"/>`,
    beach: (lit) => `<path d="M4 56 Q32 46 60 56 Z" fill="#F3D79C" stroke="${INK}" stroke-width="3"/>` +
      `<path d="M14 54 L14 30 L36 30 L36 54" fill="#E8C48A" stroke="${INK}" stroke-width="3"/><path d="M8 32 L25 18 L42 32 Z" fill="#B97A3E" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M48 54 C47 42 49 32 52 24" stroke="#8a5a32" stroke-width="4" fill="none"/><path d="M52 24 C44 18 40 22 38 26 M52 24 C58 16 62 20 63 24 M52 24 C50 14 56 12 58 14" stroke="#2E8B57" stroke-width="5" fill="none" stroke-linecap="round"/>` +
      `${lit ? `<circle cx="20" cy="38" r="2" fill="#FFD27A"/><circle cx="30" cy="38" r="2" fill="#FFD27A"/>` : ""}`,
    brewery: (lit) => `<rect x="8" y="26" width="34" height="30" rx="3" fill="#E7C9A0" stroke="${INK}" stroke-width="3"/><path d="M6 26 L25 12 L44 26 Z" fill="#8B4A2B" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
      `<ellipse cx="50" cy="46" rx="9" ry="10" fill="#B9773E" stroke="${INK}" stroke-width="3"/><path d="M41 42 L59 42 M41 50 L59 50" stroke="${INK}" stroke-width="2"/>${win(14, 33, lit)}${win(28, 33, lit)}<rect x="20" y="44" width="10" height="12" rx="2" fill="${INK}"/>`,
    club: (lit) => `<rect x="10" y="20" width="44" height="36" rx="4" fill="#3F2A4F" stroke="${INK}" stroke-width="3"/><circle cx="32" cy="12" r="8" fill="#cfd6de" stroke="${INK}" stroke-width="2.5"/>` +
      `<path d="M26 10 L38 10 M25 14 L39 14 M32 4 L32 20" stroke="#8d9aa6" stroke-width="1.2"/>` +
      `<path d="M14 30 L50 30" stroke="${lit ? "#FF6FB5" : "#7a5a8a"}" stroke-width="4" stroke-linecap="round"/><path d="M14 38 L50 38" stroke="${lit ? "#6FE3FF" : "#5a6a8a"}" stroke-width="4" stroke-linecap="round"/><rect x="26" y="44" width="12" height="12" rx="2" fill="${INK}"/>`,
    garden: (lit) => `<path d="M6 56 L58 56" stroke="${INK}" stroke-width="3"/><circle cx="20" cy="30" r="14" fill="#5FAF6A" stroke="${INK}" stroke-width="3"/><path d="M20 44 L20 56" stroke="#8a5a32" stroke-width="5"/>` +
      `<rect x="34" y="34" width="22" height="22" rx="3" fill="#F2DDB8" stroke="${INK}" stroke-width="3"/><path d="M30 34 L45 24 L60 34 Z" fill="#7d9f5a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M6 20 Q22 30 36 22 Q48 16 60 22" fill="none" stroke="${INK}" stroke-width="1.2"/>${[10, 18, 26, 34, 42, 50, 58].map((x, i) => `<circle cx="${x}" cy="${20 + (i % 2 ? 4 : 1)}" r="2.2" fill="${lit ? "#FFD27A" : "#e8dcc0"}"/>`).join("")}`
  };
  function venueArt(kind, lit, size = 64) {
    const f = VENUE[kind] || VENUE.lounge;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}"><ellipse cx="32" cy="58" rx="26" ry="4" fill="#000" opacity=".12"/>${f(lit)}</svg>`;
  }

  // ---------- landmarks (96 x 96) ----------
  const LANDMARKS = [
    { id: "nat-theatre", name: "National Theatre", lat: 6.47647, lng: 3.36949, art: "theatre" },
    { id: "stadium", name: "National Stadium", lat: 6.49708, lng: 3.36498, art: "stadium" },
    { id: "third-mainland", name: "Third Mainland Bridge", lat: 6.4952, lng: 3.3969, art: "bridge" },
    { id: "link-bridge", name: "Lekki-Ikoyi Link Bridge", lat: 6.4491, lng: 3.4568, art: "cable" },
    { id: "tbs", name: "Tafawa Balewa Square", lat: 6.4475, lng: 3.3995, art: "horses" },
    { id: "civic", name: "Civic Centre", lat: 6.44012, lng: 3.43087, art: "civic" },
    { id: "eko-atlantic", name: "Eko Atlantic", lat: 6.4135, lng: 3.4180, art: "towers" },
    { id: "icm", name: "Ikeja City Mall", lat: 6.61432, lng: 3.3578, art: "mall" },
    { id: "unilag", name: "Unilag", lat: 6.5120, lng: 3.3941, art: "cap" },
    { id: "airport", name: "Airport", lat: 6.5774, lng: 3.3212, art: "plane" },
    { id: "elegushi", name: "Elegushi Beach", lat: 6.4228, lng: 3.4805, art: "palms" }
  ];
  const LM = {
    theatre: `<path d="M12 70 L84 70 L78 58 C70 40 26 40 18 58 Z" fill="#E9D8B4" stroke="${INK}" stroke-width="3"/><path d="M16 58 C30 30 66 30 80 58" fill="none" stroke="${INK}" stroke-width="3"/><path d="M22 52 C34 34 62 34 74 52" fill="#2E6F63" stroke="${INK}" stroke-width="2.5"/><path d="M30 64 L30 70 M48 64 L48 70 M66 64 L66 70" stroke="${INK}" stroke-width="3"/><circle cx="48" cy="40" r="3" fill="${GOLD}"/>`,
    stadium: `<ellipse cx="48" cy="58" rx="38" ry="16" fill="#D8DDE2" stroke="${INK}" stroke-width="3"/><ellipse cx="48" cy="56" rx="26" ry="9" fill="#5FAF6A" stroke="${INK}" stroke-width="2.5"/><path d="M48 47 L48 65 M22 56 L74 56" stroke="#fff" stroke-width="1.5"/><path d="M14 52 L10 30 M82 52 L86 30" stroke="${INK}" stroke-width="3"/><circle cx="10" cy="28" r="4" fill="#FFD27A" stroke="${INK}" stroke-width="2"/><circle cx="86" cy="28" r="4" fill="#FFD27A" stroke="${INK}" stroke-width="2"/>`,
    bridge: `<path d="M4 54 L92 54" stroke="${INK}" stroke-width="6" stroke-linecap="round"/><path d="M4 54 L92 54" stroke="#F4EEDC" stroke-width="3" stroke-linecap="round"/>${[14, 30, 46, 62, 78].map((x) => `<path d="M${x} 56 L${x} 72" stroke="${INK}" stroke-width="4"/>`).join("")}<path d="M2 72 Q24 66 48 72 T94 72" fill="none" stroke="#5FA6A6" stroke-width="3"/><rect x="58" y="44" width="16" height="8" rx="3" fill="#F4C542" stroke="${INK}" stroke-width="2"/><circle cx="62" cy="53" r="2" fill="${INK}"/><circle cx="71" cy="53" r="2" fill="${INK}"/>`,
    cable: `<path d="M6 62 L90 62" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M48 62 L48 14" stroke="${INK}" stroke-width="5"/><path d="M48 16 L12 62 M48 22 L22 62 M48 28 L32 62 M48 16 L84 62 M48 22 L74 62 M48 28 L64 62" stroke="${INK}" stroke-width="1.6"/><path d="M48 14 L48 62" stroke="#fff" stroke-width="2"/>${[14, 24, 34, 44, 52, 62, 72, 82].map((x, i) => `<circle cx="${x}" cy="66" r="1.6" fill="${["#6FE3FF", "#FF6FB5", "#FFD27A"][i % 3]}"/>`).join("")}<path d="M2 76 Q24 70 48 76 T94 76" fill="none" stroke="#5FA6A6" stroke-width="3"/>`,
    horses: `<rect x="14" y="58" width="68" height="12" rx="2" fill="#E9D8B4" stroke="${INK}" stroke-width="3"/><path d="M24 58 C22 44 30 36 36 40 L38 34 L42 40 C46 42 46 50 42 58 M54 58 C52 44 60 36 66 40 L68 34 L72 40 C76 42 76 50 72 58" fill="#F4EEDC" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><path d="M28 50 L28 58 M60 50 L60 58" stroke="${INK}" stroke-width="2.5"/>`,
    civic: `<rect x="14" y="40" width="68" height="30" rx="3" fill="#F4EEDC" stroke="${INK}" stroke-width="3"/><path d="M10 40 C30 18 66 18 86 40 Z" fill="#9FD3D0" stroke="${INK}" stroke-width="3"/>${[22, 34, 46, 58, 70].map((x) => `<rect x="${x}" y="48" width="6" height="14" rx="1.5" fill="#9fb7c6" stroke="${INK}" stroke-width="1.5"/>`).join("")}`,
    towers: `<rect x="14" y="30" width="18" height="40" rx="2" fill="#B9D4E4" stroke="${INK}" stroke-width="3"/><rect x="38" y="14" width="20" height="56" rx="2" fill="#CFE0EA" stroke="${INK}" stroke-width="3"/><rect x="64" y="38" width="16" height="32" rx="2" fill="#B9D4E4" stroke="${INK}" stroke-width="3"/>${[20, 30, 40, 50, 60].map((y) => `<path d="M42 ${y} L54 ${y}" stroke="#7aa0b8" stroke-width="2"/>`).join("")}<path d="M48 14 L48 6" stroke="${INK}" stroke-width="2"/><circle cx="48" cy="5" r="2" fill="#E74529"/>`,
    mall: `<rect x="12" y="34" width="72" height="36" rx="4" fill="#F2DDB8" stroke="${INK}" stroke-width="3"/><path d="M34 34 C34 22 62 22 62 34" fill="none" stroke="${INK}" stroke-width="3"/><rect x="32" y="34" width="32" height="20" rx="3" fill="${WINE}" stroke="${INK}" stroke-width="2.5"/><path d="M38 34 C38 28 58 28 58 34" fill="none" stroke="${GOLD}" stroke-width="2.5"/><rect x="18" y="56" width="60" height="14" fill="#9fb7c6" stroke="${INK}" stroke-width="2"/>`,
    cap: `<path d="M14 40 L48 26 L82 40 L48 54 Z" fill="${INK}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M28 46 L28 60 C38 68 58 68 68 60 L68 46" fill="#2a2a3a" stroke="${INK}" stroke-width="3"/><path d="M78 42 L78 62" stroke="${GOLD}" stroke-width="3"/><circle cx="78" cy="64" r="3.5" fill="${GOLD}"/>`,
    plane: `<path d="M10 52 L78 40 C88 38 92 44 84 48 L20 62 Z" fill="#F4EEDC" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M40 48 L30 26 L40 26 L56 45 Z M44 56 L36 72 L46 72 L58 54 Z" fill="#CFE0EA" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><path d="M12 52 L6 40 L14 40 L22 50 Z" fill="${WINE}" stroke="${INK}" stroke-width="2.5"/>`,
    palms: `<path d="M4 72 Q48 58 92 72 Z" fill="#F3D79C" stroke="${INK}" stroke-width="3"/><path d="M30 70 C28 52 32 38 38 28 M64 70 C64 56 60 46 56 38" stroke="#8a5a32" stroke-width="5" fill="none"/><path d="M38 28 C28 20 20 26 18 30 M38 28 C46 18 56 20 58 26 M38 28 C36 16 44 12 48 14 M56 38 C48 30 42 34 40 38 M56 38 C62 30 72 32 74 36" stroke="#2E8B57" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M66 64 L70 50 L80 52" fill="#E74529" stroke="${INK}" stroke-width="2"/>`
  };
  function landmarkArt(kind, size = 72) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="${size}" height="${size}"><ellipse cx="48" cy="74" rx="36" ry="5" fill="#000" opacity=".1"/>${LM[kind] || ""}</svg>`;
  }

  // ---------- the bottle ----------
  const WINE_COLOURS = { rosso: "#8E1B2B", bianco: "#E9E3A8", rosato: "#F2A0A6", "sp-rose": "#F4B4B4", "sp-bianco": "#F1EBC4" };
  function bottle(wineId = "rosso", size = 48, ribbon = true) {
    const c = WINE_COLOURS[wineId] || WINE_COLOURS.rosso;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 96" width="${size / 2}" height="${size}">` +
      `<path d="M18 4 L30 4 L30 22 C30 28 38 32 38 44 L38 86 C38 90 35 92 32 92 L16 92 C13 92 10 90 10 86 L10 44 C10 32 18 28 18 22 Z" fill="${c}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
      `<rect x="16" y="2" width="16" height="10" rx="2" fill="${GOLD}" stroke="${INK}" stroke-width="2.5"/>` +
      `<rect x="13" y="52" width="22" height="22" rx="3" fill="${CREAM}" stroke="${INK}" stroke-width="2"/><path d="M18 60 L30 60 M18 66 L28 66" stroke="${WINE}" stroke-width="2"/>` +
      `<path d="M15 40 C15 34 18 32 20 30" stroke="#fff" stroke-width="2.5" opacity=".5" fill="none" stroke-linecap="round"/>` +
      (ribbon ? `<path d="M10 46 L38 46" stroke="${GOLD}" stroke-width="4"/><path d="M24 46 L18 56 M24 46 L30 56" stroke="${GOLD}" stroke-width="3"/>` : "") +
      `</svg>`;
  }

  // ---------- things Amabile drops that aren't bottles ----------
  function prize(kind = "cards", size = 48) {
    const cards = `<g transform="rotate(-14 30 52)"><rect x="12" y="20" width="30" height="42" rx="5" fill="#fff" stroke="${INK}" stroke-width="3"/><text x="20" y="34" font-family="Georgia,serif" font-weight="700" font-size="11" fill="${WINE}">A</text><path d="M27 46 C24 42 20 44 22 48 L27 53 L32 48 C34 44 30 42 27 46 Z" fill="#E74529"/></g>` +
      `<g transform="rotate(10 40 52)"><rect x="24" y="18" width="30" height="42" rx="5" fill="${WINE}" stroke="${INK}" stroke-width="3"/><rect x="28.5" y="22.5" width="21" height="33" rx="3" fill="none" stroke="${GOLD}" stroke-width="1.8"/><text x="39" y="44" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="13" fill="${GOLD}">A</text></g>`;
    const gift = `<rect x="12" y="30" width="40" height="30" rx="4" fill="#E74529" stroke="${INK}" stroke-width="3"/><rect x="8" y="22" width="48" height="11" rx="3" fill="#E74529" stroke="${INK}" stroke-width="3"/><path d="M32 22 L32 60" stroke="${GOLD}" stroke-width="5"/><path d="M32 22 C24 10 14 14 20 20 C24 23 30 22 32 22 C34 22 40 23 44 20 C50 14 40 10 32 22 Z" fill="${GOLD}" stroke="${INK}" stroke-width="2.5"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 70" width="${size}" height="${size * 70 / 64}">${kind === "gift" ? gift : cards}</svg>`;
  }

  // ---------- the sealed envelope (a bottle sent as a link) ----------
  // One drawing, in parts, so the game can break the seal and open the flap. viewBox 0 0 400 320.
  const PAPER = "#F3E3C5", PAPER_D = "#E6CFA6", PAPER_L = "#FAEED8", WAX = "#8E1B22", WAX_D = "#5b1414";
  const ENV_VB = "0 0 400 320";
  const envBack = () => `<rect x="40" y="100" width="320" height="200" rx="16" fill="${PAPER_D}" stroke="${INK}" stroke-width="6"/>` +
    `<path d="M52 112 L200 214 L348 112" fill="none" stroke="${INK}" stroke-width="3" opacity=".18"/>`;
  const envFront = () => `<path d="M40 114 L200 222 L360 114 L360 284 Q360 300 344 300 L56 300 Q40 300 40 284 Z" fill="${PAPER}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>` +
    `<path d="M44 296 L172 206 M356 296 L228 206" stroke="${INK}" stroke-width="3" opacity=".22" fill="none" stroke-linecap="round"/>`;
  const envFlap = () => `<path d="M40 114 Q40 100 56 100 L344 100 Q360 100 360 114 L214 224 Q200 234 186 224 Z" fill="${PAPER_L}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`;
  function sealPath(cx, cy, r1, r2, n) {
    let d = "";
    for (let i = 0; i <= n * 2; i++) {
      const a = (Math.PI * i) / n, r = i % 2 ? r2 : r1;
      d += (i ? "L" : "M") + (cx + r * Math.cos(a)).toFixed(1) + " " + (cy + r * Math.sin(a)).toFixed(1);
    }
    return d + "Z";
  }
  // side: "both" (whole seal), "l" or "r" (halves, split along a crack).
  function envSeal(side = "both") {
    const crack = "M200 178 L194 196 L206 210 L196 226 L207 240 L199 266";
    const clipL = `M120 150 L200 150 ${crack.replace(/^M200 178/, "L200 178")} L200 290 L120 290 Z`;
    const clipR = `M280 150 L200 150 ${crack.replace(/^M200 178/, "L200 178")} L200 290 L280 290 Z`;
    const id = "sc" + side + Math.floor(Math.random() * 1e6);
    const body = `<path d="${sealPath(200, 222, 40, 35, 14)}" fill="${WAX}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
      `<circle cx="200" cy="222" r="25" fill="none" stroke="${WAX_D}" stroke-width="3"/>` +
      `<text x="200" y="234" text-anchor="middle" font-family="DM Serif Display, Georgia, serif" font-size="34" fill="#E9CF9B">A</text>` +
      `<path d="M182 206 Q188 200 196 199" stroke="#fff" stroke-width="3" opacity=".35" fill="none" stroke-linecap="round"/>`;
    if (side === "both") return body;
    return `<defs><clipPath id="${id}"><path d="${side === "l" ? clipL : clipR}"/></clipPath></defs><g clip-path="url(#${id})">${body}</g>`;
  }
  const envSvg = (inner, cls = "", w = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ENV_VB}"${w ? ` width="${w}"` : ""}${cls ? ` class="${cls}"` : ""}>${inner}</svg>`;
  const envelope = {
    back: (c) => envSvg(envBack(), c), front: (c) => envSvg(envFront(), c), flap: (c) => envSvg(envFlap(), c),
    seal: (side, c) => envSvg(envSeal(side), c),
    closed: (w) => envSvg(envBack() + envFront() + envFlap() + envSeal("both"), "", w),
    inner: () => envBack() + envFront() + envFlap() + envSeal("both")
  };

  g.OutsideArt = { avatar, venueArt, landmarkArt, bottle, prize, envelope, LANDMARKS, SKINS, OUTFITS, HAIRS, FACES, VENUE_KINDS: Object.keys(VENUE) };
})(typeof window !== "undefined" ? window : globalThis);
