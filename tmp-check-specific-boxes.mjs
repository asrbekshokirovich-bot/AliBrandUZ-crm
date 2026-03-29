import fs from 'fs';

function readEnv() {
  const env = fs.readFileSync('.env', 'utf8');
  const url = 'https://ybtfepdqzbgmtlsiisvp.supabase.co';
  const keyMatch = env.match(/VITE_SUPABASE_PUBLISHABLE_KEY=["']?([^"'\r\n]+)["']?/);
  if (!keyMatch) throw new Error("Key not found");
  return { url, key: keyMatch[1] };
}

const { url, key } = readEnv();

async function run() {
  const res = await fetch(`${url}/rest/v1/boxes?box_number=in.(BOX-1774688306810-RG5DWM,BOX-1774688305403-CRZ6Y2)&select=id,box_number,status,location`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`
    }
  });
  console.log("BOXES:");
  const data = await res.json();
  console.log(data);
}
run();
