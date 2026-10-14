// Generic reporter for "feature's DB table/RPC/column is missing" errors.
// Any Supabase error classified as missing-schema is logged once, clearly,
// with the object name and the migration hint (docs/LESSONS.md).
const reported = new Set();

export function missingObjectName(err) {
  const msg = String(err?.message || err?.details || '');
  const m =
    msg.match(/table '([^']+)'/i) ||
    msg.match(/function ([\w.]+)/i) ||
    msg.match(/relation "([^"]+)"/i) ||
    msg.match(/column '([^']+)'/i) ||
    msg.match(/column "?([\w.]+)"? does not exist/i);
  return m ? m[1] : 'unknown';
}

export function reportMissingSchema(err, kind = 'table') {
  const name = missingObjectName(err);
  const key = `${kind}:${name}:${err?.code || ''}`;
  if (reported.has(key)) return false;
  reported.add(key);
  try {
    console.error(
      `[Senders] Missing DB ${kind} "${name}" (code ${err?.code || 'n/a'}). ` +
        'The feature using it is disabled until the matching supabase/migrations file is applied.',
      err
    );
  } catch {
    /* console unavailable */
  }
  return true;
}

export function _resetMissingSchemaReports() {
  reported.clear();
}
