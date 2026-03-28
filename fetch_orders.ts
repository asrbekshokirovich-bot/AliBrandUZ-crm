import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ybtfepdqzbgmtlsiisvp.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlidGZlcGRxemJnbXRsc2lpc3ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzk2OTksImV4cCI6MjA4OTYxNTY5OX0.snBdooxPEfKhSxQrwBC3v8OgOCiuOFx8P1ESy_CyshpcpY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkOrders() {
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email: 'asrbekshokirovich@gmail.com',
    password: 'Sadullaev$$@@##512'
  });

  if (authError) {
    console.error('Auth Error:', authError.message);
    return;
  }

  console.log('Successfully authenticated as:', auth.user.email);

  const { data: orders, error, count } = await supabase
    .from('marketplace_orders')
    .select('id, store_id, external_order_id, fulfillment_type, marketplace_stores!inner(name, platform)', { count: 'exact' });

  if (error) {
    console.error('Fetch Error:', error);
  } else {
    console.log(`Found ${count} orders!`);
    if (orders.length > 0) {
      console.log('Sample order:', orders[0]);
    }
  }

  // Debug: Select WITHOUT the inner join to see if that's the issue
  const { count: rawCount, error: err2 } = await supabase
    .from('marketplace_orders')
    .select('id', { count: 'exact', head: true });
    
  if (err2) {
    console.error('Raw Fetch Error:', err2);
  } else {
    console.log(`Raw count without JOIN: ${rawCount}`);
  }
}

checkOrders();
