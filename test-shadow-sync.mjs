import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  console.log("Invoking v2-shadow-sync...");
  const auth = await supabase.auth.signInWithPassword({ email: 'info@alibrand.uz', password: 'password123' }); // Adjust if needed, or simply invoke without auth if not required
  const { data, error } = await supabase.functions.invoke('v2-shadow-sync');
  
  if (error) {
    console.error("Supabase Invoke Error Object:", error);
  } else {
    console.log("Success Data:", data);
  }
}

run();
