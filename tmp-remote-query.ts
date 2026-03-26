import { createClient } from '@supabase/supabase-js';

const url = "https://yfvrinznjutxionsgczf.supabase.co";
const key = "sb_secret_wALM5X_heMBCSRmlsBFtTg_1OVLakMs";

const supabase = createClient(url, key);

async function run() {
  console.log("Querying Atlas Market (69508)...");
  const { data, error } = await supabase.from('marketplace_stores').select('id, name, shop_id, api_key_secret_name, is_active').eq('shop_id', '69508');
  console.log("Result:", data, error);
}

run();
