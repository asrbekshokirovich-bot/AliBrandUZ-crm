import { createClient } from "npm:@supabase/supabase-js";
import 'npm:dotenv/config';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.functions.invoke('manage-users', {
    body: { action: 'list-users' },
  });
  console.log("Error:", error?.message);
  if (error && typeof error.context?.text === 'function') {
    const text = await error.context.text();
    console.log("Response text:", text);
  }
}
run();
