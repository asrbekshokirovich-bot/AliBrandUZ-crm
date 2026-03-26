import * as fs from 'fs';

// Read local env
const lines = fs.readFileSync('.env.local', 'utf-8').split('\n').filter(Boolean);
let openAiKey = '';
lines.forEach(line => {
  if (line.includes('OPENAI_API_KEY')) {
    openAiKey = line.split('=')[1].trim().replace(/['"]/g, '');
  }
});
// Fallback if not in .env.local
if (!openAiKey) {
  try {
    const envLines = fs.readFileSync('.env', 'utf-8').split('\n').filter(Boolean);
    envLines.forEach(line => {
      if (line.includes('OPENAI_API_KEY')) {
        openAiKey = line.split('=')[1].trim().replace(/['"]/g, '');
      }
    });
  } catch (e) {}
}

const SUPABASE_URL = "https://yfvrinznjutxionsgczf.supabase.co"; // Valid production DB? Wait! No, ybtfepdqzbgmtlsiisvp is what ceo-ai uses!
const SUPABASE_KEY = "sb_secret_wALM5X_heMBCSRmlsBFtTg_1OVLakMs"; // Service Role Key

async function testAI() {
  if (!openAiKey) {
    console.log('❌ OPENAI_API_KEY not found in .env.local or .env');
    return;
  }
  
  console.log('✅ Found API Key starting with:', openAiKey.substring(0, 7));
  console.log('--- Testing OpenAI Simple Connection ---');
  
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openAiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Salom, test!' }]
    })
  });
  
  const text = await res.text();
  console.log('Response status:', res.status);
  if (!res.ok) {
     console.log('Error:', text);
  } else {
     const data = JSON.parse(text);
     console.log('✅ OpenAI works. Final output:', data.choices[0].message.content);
  }
}

testAI().catch(console.error);
