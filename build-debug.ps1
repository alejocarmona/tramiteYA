$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot

Write-Host "=== Step 0: Build Firebase Functions ===" -ForegroundColor Cyan
Set-Location "$ROOT\functions"
npm run build
if ($LASTEXITCODE -ne 0) { Set-Location $ROOT; Write-Host "ERROR: functions build failed" -ForegroundColor Red; exit 1 }
Set-Location $ROOT

Write-Host "=== Step 0.5: Deploy Firebase Functions ===" -ForegroundColor Cyan
firebase deploy --only functions
if ($LASTEXITCODE -ne 0) { Write-Host "WARNING: functions deploy failed (continuing build)" -ForegroundColor Yellow }

Write-Host "=== Step 1: npx cap sync android ===" -ForegroundColor Cyan
npx cap sync android
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: cap sync failed" -ForegroundColor Red; exit 1 }

Write-Host "=== Step 2: Gradle assembleDebug ===" -ForegroundColor Cyan
Set-Location "$ROOT\android"
.\gradlew assembleDebug
if ($LASTEXITCODE -ne 0) { Set-Location $ROOT; Write-Host "ERROR: Gradle build failed" -ForegroundColor Red; exit 1 }
Set-Location $ROOT

$apkPath = "$ROOT\android\app\build\outputs\apk\debug\app-debug.apk"

if (!(Test-Path $apkPath)) {
    Write-Host "ERROR: APK not found at $apkPath" -ForegroundColor Red
    exit 1
}

# Write-Host "=== Step 3: Install via ADB ===" -ForegroundColor Cyan
# $devices = adb devices 2>$null | Select-String "device$"
# if ($devices) {
#     adb install -r $apkPath
#     if ($LASTEXITCODE -ne 0) { Write-Host "WARNING: ADB install failed" -ForegroundColor Yellow }
#     else { Write-Host "APK installed successfully on device" -ForegroundColor Green }
# } else {
#     Write-Host "No ADB device connected. Install manually:" -ForegroundColor Yellow
# }

Write-Host ""
Write-Host "APK path: $apkPath" -ForegroundColor Green
Write-Host "BUILD SUCCESS" -ForegroundColor Green
