import { createClient } from '@supabase/supabase-js';

const url = "https://yfvrinznjutxionsgczf.supabase.co";
const key = "sb_secret_wALM5X_heMBCSRmlsBFtTg_1OVLakMs";

// Try using anon key or the VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY from .env
import * as dotenv from 'dotenv';
dotenv.config();

const realUrl = process.env.VITE_SUPABASE_URL || url;
// We'll use the VITE_SUPABASE_PUBLISHABLE_KEY if available, but if it has RLS we might get 0 rows.
const realKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || key;

const supabase = createClient(realUrl, realKey);

async function run() {
  console.log("Querying Atlas Market (69508)...");
  const { data, error } = await supabase.from('marketplace_stores').select('id, name, shop_id, api_key_secret_name, is_active').eq('shop_id', '69508');
  console.log("Result:", data, error);
}

run();
