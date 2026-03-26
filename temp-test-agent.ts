import * as fs from 'fs';
import { Readable } from 'stream';

// Load env vars
const lines = fs.readFileSync('.env.local', 'utf-8').split('\n').filter(Boolean);
lines.forEach(line => {
  const parts = line.split('=');
  if (parts.length > 1) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim().replace(/['"]/g, '');
    process.env[key] = val;
  }
});
try {
  const envLines = fs.readFileSync('.env', 'utf-8').split('\n').filter(Boolean);
  envLines.forEach(line => {
    const parts = line.split('=');
    if (parts.length > 1) {
      const key = parts[0].trim();
      if (!process.env[key]) {
         const val = parts.slice(1).join('=').trim().replace(/['"]/g, '');
         process.env[key] = val;
      }
    }
  });
} catch (e) {}

// Import the handler
import handler from './api/ceo-ai.ts';

// We need to pass a pseudo JWT token for verification.
// But wait, the handler verifies the token using Supabase JWT secret?
// No, verifyToken() decodes the payload directly WITHOUT verifying the secret signature!!
// Let's create a fake valid JWT token format: header.payload.signature
const fakePayload = {
  sub: "12345678-1234-1234-1234-123456789012",
  email: "test@example.com",
  role: "authenticated",
  exp: Math.floor(Date.now() / 1000) + 3600
};
const fakeToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." + Buffer.from(JSON.stringify(fakePayload)).toString('base64url') + ".fake_signature";

async function runTest() {
  console.log('--- STARTING AGENT E2E TEST ---');

  const req = new Request('http://localhost:3000/api/ceo-ai', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${fakeToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: "Toshkent omborida atr idishlardan qancha qolgan va uning logistika bilan hisoblangan tannarxi qancha?",
      conversationId: null
    })
  });

  const res = await handler(req);
  console.log('Response Status:', res.status);
  
  if (!res.ok) {
     const err = await res.text();
     console.error('Error Response:', err);
     return;
  }
  
  console.log('--- READING STREAM ---');
  const reader = res.body?.getReader();
  if (!reader) {
     console.error('No readable stream returned');
     return;
  }
  
  const decoder = new TextDecoder();
  let result = '';
  
  while (true) {
     const { done, value } = await reader.read();
     if (done) break;
     
     const chunk = decoder.decode(value, { stream: true });
     const lines = chunk.split('\\n');
     for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;
        try {
           const parsed = JSON.parse(data);
           const text = parsed.choices?.[0]?.delta?.content || '';
           if (text) {
             process.stdout.write(text);
             result += text;
           }
        } catch { /* ignore */ }
     }
  }
  
  console.log('\\n\\n--- TEST FINISHED ---');
}

runTest().catch(console.error);
