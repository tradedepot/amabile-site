// Outside: read-only lookups in the sales data, for linking venues to the outlet accounts we already have.
// Uses the same service account as _bq.mjs (GCP_SA_KEY, GCP_PROJECT_ID). Reads two tables only:
// retailoutlets (name, contact, location) and sales_facts (Amabile purchases). Never selects identity,
// bank or KYC columns. Every call fails soft: if BigQuery is not reachable, the admin can still link by hand.
//
// Env: OUTSIDE_SALES_DATASET (default "tradedepot")
import { BigQuery } from "@google-cloud/bigquery";

let _c = null, _tried = false;
function client() {
  if (_tried) return _c;
  _tried = true;
  try {
    const key = process.env.GCP_SA_KEY, projectId = process.env.GCP_PROJECT_ID;
    if (key && projectId) _c = new BigQuery({ projectId, credentials: JSON.parse(key) });
  } catch { _c = null; }
  return _c;
}
const T = (t) => "`" + process.env.GCP_PROJECT_ID + "." + (process.env.OUTSIDE_SALES_DATASET || "tradedepot") + "." + t + "`";
const digits = (s) => String(s || "").replace(/\D/g, "");

async function run(query, params) {
  const bq = client();
  if (!bq) return { ok: false, error: "not_configured", rows: [] };
  try {
    const [rows] = await bq.query({ query, params, location: process.env.OUTSIDE_BQ_LOCATION || undefined });
    return { ok: true, rows };
  } catch (e) {
    console.warn("outside bq", String(e).slice(0, 300));
    return { ok: false, error: "query_failed", rows: [] };
  }
}

const OUTLET_COLS = `ro._id AS id, ro.outletbusinessname AS name, ro.retailoutletnumber AS number, ro.contactperson AS contactPerson,
  ro.contactphone AS contactPhone, ro.lga AS lga, ro.streetname AS street, ro.outlettype AS type,
  ro.coordinates__latitude__double AS lat, ro.coordinates__longitude__double AS lng`;

// Outlets matching a name or a phone number, Amabile buyers first.
export async function searchOutlets(q) {
  const text = String(q || "").trim().toLowerCase().slice(0, 60);
  if (text.length < 2) return { ok: true, rows: [] };
  const ph = digits(text).slice(-10);
  const query = `
    WITH am AS (
      SELECT retailOutletId, MAX(wk_of) AS lastBought, ROUND(SUM(qty), 1) AS cases
      FROM ${T("sales_facts")} WHERE LOWER(brand) LIKE '%amabile%' AND wk_of >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)
      GROUP BY retailOutletId)
    SELECT ${OUTLET_COLS}, am.lastBought, am.cases
    FROM ${T("retailoutlets")} ro LEFT JOIN am ON am.retailOutletId = ro._id
    WHERE (LOWER(ro.outletbusinessname) LIKE @q ${ph.length >= 7 ? "OR REGEXP_REPLACE(IFNULL(ro.contactphone, ''), r'[^0-9]', '') LIKE @ph" : ""})
      AND ro.archivedat IS NULL
    ORDER BY am.lastBought IS NULL, am.lastBought DESC, ro.outletbusinessname
    LIMIT 25`;
  const params = { q: "%" + text + "%" };
  if (ph.length >= 7) params.ph = "%" + ph;
  const r = await run(query, params);
  return { ...r, rows: r.rows.map(tidy) };
}

// One outlet with its recent Amabile purchases.
export async function getOutlet(id, since) {
  const o = await run(`SELECT ${OUTLET_COLS} FROM ${T("retailoutlets")} ro WHERE ro._id = @id LIMIT 1`, { id: String(id) });
  if (!o.ok || !o.rows.length) return { ok: false, error: o.error || "not_found" };
  const p = await purchases(id, since);
  return { ok: true, outlet: tidy(o.rows[0]), purchases: p.rows };
}

// Amabile purchases by an outlet since a date (YYYY-MM-DD), newest first.
export async function purchases(id, since) {
  const r = await run(`
    SELECT CAST(wk_of AS STRING) AS week, product, ROUND(SUM(qty), 2) AS cases, ROUND(SUM(amount)) AS amount
    FROM ${T("sales_facts")}
    WHERE retailOutletId = @id AND LOWER(brand) LIKE '%amabile%' AND wk_of >= DATE(@since)
    GROUP BY wk_of, product ORDER BY wk_of DESC LIMIT 20`,
    { id: String(id), since: /^\d{4}-\d{2}-\d{2}$/.test(String(since || "")) ? since : "2025-01-01" });
  return r;
}

// Outlets whose contact phone matches a number (for suggesting a link when a venue registers).
export async function outletsByPhone(e164) {
  const ph = digits(e164).slice(-10);
  if (ph.length < 10) return { ok: true, rows: [] };
  const r = await run(`SELECT ${OUTLET_COLS} FROM ${T("retailoutlets")} ro
    WHERE REGEXP_REPLACE(IFNULL(ro.contactphone, ''), r'[^0-9]', '') LIKE @ph AND ro.archivedat IS NULL LIMIT 5`, { ph: "%" + ph });
  return { ...r, rows: r.rows.map(tidy) };
}

function tidy(r) {
  const v = (x) => (x && typeof x === "object" && "value" in x ? x.value : x);
  return {
    id: r.id, name: r.name || "", number: r.number || "", contactPerson: r.contactPerson || "", contactPhone: r.contactPhone || "",
    lga: r.lga || "", street: r.street || "", type: r.type || "",
    lat: typeof r.lat === "number" ? r.lat : null, lng: typeof r.lng === "number" ? r.lng : null,
    lastBought: r.lastBought ? String(v(r.lastBought)) : null, cases: r.cases != null ? Number(r.cases) : null
  };
}
