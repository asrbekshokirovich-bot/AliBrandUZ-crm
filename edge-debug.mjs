import dotenv from 'dotenv';
dotenv.config();

const url = "https://ybtfepdqzbgmtlsiisvp.supabase.co/functions/v1/db-check";
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("Invoking db-check...");
try {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    }
  });

  console.log("Status:", res.status);
  const data = await res.json();
  console.log("Response:", JSON.stringify(data, null, 2));
} catch (error) {
  console.error("Fetch error:", error);
}
