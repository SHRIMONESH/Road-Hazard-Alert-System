Write-Host "`n═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  DIAGNOSTIC & FIX SCRIPT" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════`n" -ForegroundColor Cyan

# Step 1: Check if worker/ingestion.ts has the WRONG code
Write-Host "🔍 STEP 1: Checking current code..." -ForegroundColor Yellow

$hasOldFunction = Select-String -Path "worker/ingestion.ts" -Pattern "Processing detection data" -Quiet
$hasNewFunction = Select-String -Path "worker/ingestion.ts" -Pattern "Fetching detections for" -Quiet

Write-Host "`nCurrent Status:" -ForegroundColor Cyan
if ($hasOldFunction) {
    Write-Host "   ❌ OLD CODE DETECTED: 'Processing detection data' found" -ForegroundColor Red
    Write-Host "   This is the problem!" -ForegroundColor Red
} else {
    Write-Host "   ✓ Old code not found (good)" -ForegroundColor Green
}

if ($hasNewFunction) {
    Write-Host "   ✓ NEW CODE DETECTED: 'Fetching detections for' found" -ForegroundColor Green
} else {
    Write-Host "   ❌ NEW CODE MISSING: 'Fetching detections for' not found" -ForegroundColor Red
    Write-Host "   This confirms the file wasn't updated!" -ForegroundColor Red
}

# Step 2: Check function signatures
Write-Host "`n🔍 STEP 2: Checking function signatures..." -ForegroundColor Yellow

$hasFetchImageDetections = Select-String -Path "worker/ingestion.ts" -Pattern "async function fetchImageDetections" -Quiet
$hasFetchAllImageDetections = Select-String -Path "worker/ingestion.ts" -Pattern "async function fetchAllImageDetections" -Quiet
$hasOldExtract = Select-String -Path "worker/ingestion.ts" -Pattern "function extractDetections" -Quiet

Write-Host "`nFunction Check:" -ForegroundColor Cyan
if ($hasFetchImageDetections) {
    Write-Host "   ✓ fetchImageDetections() - Found" -ForegroundColor Green
} else {
    Write-Host "   ❌ fetchImageDetections() - MISSING" -ForegroundColor Red
}

if ($hasFetchAllImageDetections) {
    Write-Host "   ✓ fetchAllImageDetections() - Found" -ForegroundColor Green
} else {
    Write-Host "   ❌ fetchAllImageDetections() - MISSING" -ForegroundColor Red
}

if ($hasOldExtract) {
    Write-Host "   ❌ extractDetections() - STILL PRESENT (should be deleted)" -ForegroundColor Red
} else {
    Write-Host "   ✓ extractDetections() - Not found (good)" -ForegroundColor Green
}

# Step 3: Check file size
Write-Host "`n🔍 STEP 3: Checking file size..." -ForegroundColor Yellow
$fileSize = (Get-Item "worker/ingestion.ts").Length
Write-Host "   File size: $fileSize bytes" -ForegroundColor Cyan

if ($fileSize -lt 12000) {
    Write-Host "   ⚠️  File too small! Expected ~15-17KB" -ForegroundColor Yellow
    Write-Host "   This suggests the file wasn't fully updated" -ForegroundColor Yellow
} elseif ($fileSize -gt 20000) {
    Write-Host "   ⚠️  File too large! Expected ~15-17KB" -ForegroundColor Yellow
} else {
    Write-Host "   ✓ File size looks correct" -ForegroundColor Green
}

# Step 4: Determine what needs to be done
Write-Host "`n═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  DIAGNOSIS" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════`n" -ForegroundColor Cyan

if ($hasOldFunction -or $hasOldExtract -or -not $hasNewFunction) {
    Write-Host "❌ PROBLEM CONFIRMED: worker/ingestion.ts has OLD CODE" -ForegroundColor Red
    Write-Host "`nYou need to COMPLETELY REPLACE the file contents.`n" -ForegroundColor Yellow
    
    Write-Host "📋 MANUAL FIX REQUIRED:" -ForegroundColor Cyan
    Write-Host "   1. Open worker/ingestion.ts in VS Code" -ForegroundColor White
    Write-Host "   2. Press Ctrl+A (select all)" -ForegroundColor White
    Write-Host "   3. Press Delete" -ForegroundColor White
    Write-Host "   4. Copy the ENTIRE NEW CODE from Document 2" -ForegroundColor White
    Write-Host "   5. Paste into the empty file" -ForegroundColor White
    Write-Host "   6. Press Ctrl+S (save)" -ForegroundColor White
    Write-Host "   7. Run this script again to verify" -ForegroundColor White
    
    Write-Host "`n⚠️  WARNING: Copy-paste from Document 2 EXACTLY" -ForegroundColor Yellow
    Write-Host "   The code starts with:" -ForegroundColor White
    Write-Host "   // Import dotenv and configure it to load .env.local" -ForegroundColor Gray
    Write-Host "   import dotenv from 'dotenv';" -ForegroundColor Gray
    Write-Host "   ..." -ForegroundColor Gray
    Write-Host "   And ends with:" -ForegroundColor White
    Write-Host "   runIngestion();" -ForegroundColor Gray
    
    exit 1
    
} else {
    Write-Host "✅ CODE LOOKS GOOD!" -ForegroundColor Green
    Write-Host "`nNow let's clean and rebuild...`n" -ForegroundColor Cyan
    
    # Clean previous build
    Write-Host "🧹 Cleaning previous build..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force node_modules/.cache -ErrorAction SilentlyContinue
    
    # Verify tsconfig.worker.json
    if (-not (Test-Path "tsconfig.worker.json")) {
        Write-Host "❌ ERROR: tsconfig.worker.json is MISSING!" -ForegroundColor Red
        Write-Host "   Creating it now..." -ForegroundColor Yellow
        
        @"
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "target": "ES2020",
    "lib": ["ES2020"],
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./worker",
    "noEmit": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true
  },
  "include": ["worker/**/*"],
  "exclude": ["node_modules", "dist", ".next"]
}
"@ | Out-File -FilePath "tsconfig.worker.json" -Encoding UTF8
        Write-Host "   ✓ Created tsconfig.worker.json" -ForegroundColor Green
    }
    
    Write-Host "`n🔨 Building worker..." -ForegroundColor Yellow
    npm run build:worker
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ Build successful!" -ForegroundColor Green
        Write-Host "`nNow run: .\run-ingestion-worker.ps1" -ForegroundColor Cyan
    } else {
        Write-Host "`n❌ Build failed! Check errors above." -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n═══════════════════════════════════════════════`n" -ForegroundColor Cyan
