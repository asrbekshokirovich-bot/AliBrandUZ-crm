/**
 * Fetches all rows from a Supabase query, bypassing the default 1000-row limit.
 *
 * IMPORTANT: Supabase query builders are single-use objects. Calling .range()
 * on the same instance multiple times silently fails after the first page.
 *
 * This function accepts either:
 *  - A factory function `() => builder` (recommended for large datasets)
 *  - A direct builder (works fine when total rows < batchSize, i.e. < 1000)
 *
 * Usage:
 *   // Factory (safe for any size):
 *   fetchAllRows(() => supabase.from('boxes').select('*').order('created_at', { ascending: false }))
 *
 *   // Direct builder (OK if < 1000 rows expected, legacy-compatible):
 *   fetchAllRows(supabase.from('boxes').select('*'))
 */
export async function fetchAllRows<T = any>(
  queryBuilderOrFactory: any,
  batchSize = 1000
): Promise<T[]> {
  const isFactory = typeof queryBuilderOrFactory === 'function';

  // If fewer than batchSize rows expected, just run the query directly (no pagination needed)
  if (!isFactory) {
    const { data, error } = await queryBuilderOrFactory.range(0, batchSize - 1);
    if (error) throw error;
    return (data as T[]) ?? [];
  }

  // Factory mode: rebuild query per page to avoid single-use builder exhaustion
  let allRows: T[] = [];
  let from = 0;

  while (true) {
    const builder = queryBuilderOrFactory();
    const { data, error } = await builder.range(from, from + batchSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data as T[]);
    if (data.length < batchSize) break;
    from += batchSize;
  }

  return allRows;
}
