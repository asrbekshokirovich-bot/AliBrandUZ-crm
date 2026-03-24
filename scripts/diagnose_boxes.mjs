import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://ybtfepdqzbgmtlsiisvp.supabase.co";
// Using anon key to simulate what browser does
const ANON_KEY = "sb_publishable_wk3pW4CAxzc90nks94MRHw_meKO-VWe";

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function diagnose() {
  console.log('=== BOXES DIAGNOSTIC (using anon/publishable key) ===\n');

  // 1. Count all boxes (no auth = RLS applies, should fail or return 0)
  const { count: totalCount, error: countError } = await supabase
    .from('boxes')
    .select('*', { count: 'exact', head: true });
  
  console.log(`1. Total boxes visible (unauthenticated): ${totalCount ?? 'ERROR'}`);
  if (countError) console.log(`   Error: ${countError.message} | Code: ${countError.code}`);

  // 2. Check if box_track_codes table exists
  const { data: tableCheck, error: tableError } = await supabase
    .from('box_track_codes')
    .select('id')
    .limit(1);
  
  if (tableError) {
    console.log(`\n2. box_track_codes: NOT ACCESSIBLE (${tableError.code}: ${tableError.message})`);
  } else {
    console.log(`\n2. box_track_codes: EXISTS AND ACCESSIBLE`);
  }

  // 3. Try the full join query (like Boxes.tsx does)
  const { data: fullData, error: fullError } = await supabase
    .from('boxes')
    .select(`
      id, box_number, status,
      box_track_codes(id, track_code)
    `)
    .order('created_at', { ascending: false })
    .limit(3);

  if (fullError) {
    console.log(`\n3. Full JOIN query ERROR: ${fullError.code} - ${fullError.message}`);
  } else {
    console.log(`\n3. Full JOIN query OK - returned ${fullData?.length} rows`);
  }

  console.log('\nDone. Note: unauthenticated queries should fail or return empty due to RLS.');
  console.log('The real queries happen after login in the browser.');
}

diagnose().catch(console.error);
