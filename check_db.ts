import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ybtfepdqzbgmtlsiisvp.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlidGZlcGRxemJnbXRsc2lpc3ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzk2OTksImV4cCI6MjA4OTYxNTY5OX0.snBdoxPEfKhSxQrwBC3v8OgOCiuOFx8P1ESy_Cyshpc';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testQueries() {
  const { data: boxes, error } = await supabase
    .from('boxes')
    .select('id, box_number, product_items(id)')
    .eq('location', 'china')
    .limit(5);

  if (error) {
    console.error('Query Error:', error.message);
  } else {
    console.log('Boxes count:', boxes?.length);
    console.log('Sample box 1:', JSON.stringify(boxes?.[0], null, 2));
    console.log('Sample box 2:', JSON.stringify(boxes?.[1], null, 2));
  }
}
testQueries();
