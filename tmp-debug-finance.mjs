const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://ybtfepdqzbgmtlsiisvp.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_wc9DpbY-k9adrTmDysNrMw_RWWPK2fY';

async function run() {
  const key = SUPABASE_SERVICE_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/finance_transactions?select=*&limit=5&order=created_at.desc`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  });
  console.log("FINANCE_TRANSACTIONS:");
  console.log(await res.json());

  const res2 = await fetch(`${SUPABASE_URL}/rest/v1/marketplace_orders?select=*&limit=5&order=created_at.desc`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
  });
  console.log("MARKETPLACE_ORDERS:");
  const data2 = await res2.json();
  console.log(data2);
}
run();
