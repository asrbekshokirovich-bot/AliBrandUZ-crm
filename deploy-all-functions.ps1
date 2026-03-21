$env:PATH += ";$env:USERPROFILE\bin"
$PROJECT_REF = "ybtfepdqzbgmtlsiisvp"

$functions = Get-ChildItem -Path "supabase\functions" -Directory | Select-Object -ExpandProperty Name

$success = @()
$failed = @()

foreach ($fn in $functions) {
    Write-Host "Deploying: $fn" -ForegroundColor Cyan
    $result = supabase functions deploy $fn --project-ref $PROJECT_REF 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  OK: $fn" -ForegroundColor Green
        $success += $fn
    } else {
        Write-Host "  FAILED: $fn" -ForegroundColor Red
        Write-Host "  $result"
        $failed += $fn
    }
}

Write-Host "`n===== DEPLOY RESULTS =====" -ForegroundColor Yellow
Write-Host "SUCCESS ($($success.Count)):" -ForegroundColor Green
$success | ForEach-Object { Write-Host "  - $_" }
Write-Host "FAILED ($($failed.Count)):" -ForegroundColor Red
$failed | ForEach-Object { Write-Host "  - $_" }
