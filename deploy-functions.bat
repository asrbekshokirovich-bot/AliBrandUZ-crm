@echo off
echo ==========================================
echo   Supabase Edge Functions Deploy
echo ==========================================
echo.
echo STEP 1: Login to Supabase (browser will open)
npx supabase login
echo.
echo STEP 2: Deploying inventory-ai-query...
npx supabase functions deploy inventory-ai-query --project-ref qnbxnldkzuoydqgzagvu
echo.
echo STEP 3: Deploying save-inventory-tx...
npx supabase functions deploy save-inventory-tx --project-ref qnbxnldkzuoydqgzagvu
echo.
echo ==========================================
echo   DONE! Edge functions deployed.
echo ==========================================
pause
