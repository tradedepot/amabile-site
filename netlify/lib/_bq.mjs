// Best-effort streaming insert into BigQuery. Never throws into the request path:
// if BigQuery isn't configured or a write fails, the invite/RSVP still succeeds.
//
// Required Netlify env vars (Site config → Environment variables):
//   GCP_PROJECT_ID   e.g. tradedepot-retail-167113
//   BQ_DATASET       e.g. amabile
//   GCP_SA_KEY       the FULL service-account JSON key (paste as one value)
import { BigQuery } from "@google-cloud/bigquery";

let _bq = null;
let _tried = false;

function client() {
  if (_tried) return _bq;
  _tried = true;
  const keyJson = process.env.GCP_SA_KEY;
  const projectId = process.env.GCP_PROJECT_ID;
  if (!keyJson || !projectId) return null;
  try {
    _bq = new BigQuery({ projectId, credentials: JSON.parse(keyJson) });
  } catch (e) {
    _bq = null;
  }
  return _bq;
}

export async function bqInsert(table, row) {
  const bq = client();
  const dataset = process.env.BQ_DATASET;
  if (!bq || !dataset) return; // not configured → skip silently
  try {
    await bq.dataset(dataset).table(table).insert([row]);
  } catch (e) {
    // best-effort: swallow (e.g. transient errors, schema drift)
  }
}
