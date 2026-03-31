const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://ybtfepdqzbgmtlsiisvp.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_wc9DpbY-k9adrTmDysNrMw_RWWPK2fY';

async function getTableCount(table, filterQuery = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${filterQuery}`;
  const res = await fetch(url, {
    method: 'HEAD',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'count=exact'
    }
  });
  if (!res.ok) {
    console.error(`Error fetching ${url}: ${res.status} ${res.statusText}`);
    return 0;
  }
  const range = res.headers.get('content-range');
  return range ? parseInt(range.split('/')[1] || "0", 10) : 0;
}

async function test() {
  const d = new Date();
  d.setUTCHours(d.getUTCHours() + 5);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCHours(d.getUTCHours() - 5);
  const startOfDay = d.toISOString();

  console.log('Testing startOfDay:', startOfDay);
  const verificationsToday = await getTableCount('verification_sessions', `status=eq.completed&created_at=gte.${startOfDay}`);
  console.log('verificationsToday count:', verificationsToday);

  const chinaItemsCount = await getTableCount('product_items', 'status=in.(pending,ordered,in_china,packing)&box_id=is.null');
  console.log('chinaItemsCount count:', chinaItemsCount);

  // Raw select to see what actually exists
  const vRes = await fetch(`${SUPABASE_URL}/rest/v1/verification_sessions?select=id,status,created_at&limit=10`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  const vData = await vRes.json();
  console.log('Recent 10 verifications:', vData);
  
}

test().catch(console.error);
