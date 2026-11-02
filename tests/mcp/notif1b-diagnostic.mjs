// FIX-679a: explain only the planner's estimates after a failed cold-X gate.
// EXPLAIN ANALYZE executes the 30k-card query again and has exceeded the SQL
// job's ten-minute wall-clock timeout even with statement_timeout set in PGlite.
// This is a diagnostic helper, not a SQL sanitizer for untrusted input.
export function buildReadOnlyExplain(sql) {
  if (typeof sql !== 'string' || !/^\s*(select|with)\b/i.test(sql)) {
    throw new Error('diagnostic requires a read-only SELECT or WITH statement')
  }
  return 'explain (verbose, costs, settings) ' + sql.trim()
}
