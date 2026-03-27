import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://ybtfepdqzbgmtlsiisvp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlidGZlcGRxemJnbXRsc2lpc3ZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzk2OTksImV4cCI6MjA4OTYxNTY5OX0.snBdooxPEfKhSxQrwBC3v8OgOCiuOFx8P1ESy_CyshpcpY'
);

async function run() {
  const { count, error } = await sb.from('marketplace_listings').select('*', { count: 'exact', head: true });
  console.log('Listings Count:', count);
  if (error) console.error(error);
}

run();
