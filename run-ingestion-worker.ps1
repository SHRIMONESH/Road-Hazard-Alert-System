Write-Host "--- Starting Worker Pipeline ---" -ForegroundColor Cyan

# Clean previous build
Write-Host "Cleaning previous build..." -ForegroundColor Yellow
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue

# Build TypeScript with worker config
Write-Host "Building TypeScript with worker config..." -ForegroundColor Yellow
npx tsc --project tsconfig.worker.json

if ($LASTEXITCODE -ne 0) {
    Write-Host "âŒ TypeScript compilation failed!" -ForegroundColor Red
    exit 1
}

# Run the worker
Write-Host "Running Worker (dist/ingestion.js)..." -ForegroundColor Green
node dist/ingestion.js

Write-Host "--- Worker Execution Complete ---" -ForegroundColor Cyan
