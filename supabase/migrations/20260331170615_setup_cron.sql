-- Ushbu kodni Supabase SQL xotirasiga kiritish kerak:

-- 1. pg_net va pg_cron extensionlarni yoqish
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Eski cronlar bo'lsa tozalash (xatolik bo'lmasligi uchun)
SELECT cron.unschedule('hourly_deep_sync');
SELECT cron.unschedule('frequent_dispatcher');

-- 3. Har 1 SOATDA "Mukammal Zanjir" Orkestratorini ishga tushirish
SELECT cron.schedule(
    'hourly_deep_sync',
    '0 * * * *', -- Har soatning boshida
    $$
    SELECT net.http_post(
        url := 'https://' || current_setting('request.headers')::json->>'host' || '/functions/v1/marketplace-auto-sync',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('request.jwt.claim.role') || '"}',
        body := '{"auto": true}'::jsonb
    );
    $$
);

-- 4. HAR 5 MINUTDA Dispetcherni qo'zg'atib turish (Agar oldingi ishlar tugallanmagan bo'lsa)
SELECT cron.schedule(
    'frequent_dispatcher',
    '*/5 * * * *', -- Har 5 minutda
    $$
    SELECT net.http_post(
        url := 'https://' || current_setting('request.headers')::json->>'host' || '/functions/v1/sync-dispatcher',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('request.jwt.claim.role') || '"}'
    );
    $$
);
