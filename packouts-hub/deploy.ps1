# Build and deploy packouts-hub to both hosting targets
# Usage: .\deploy.ps1

Write-Host "Building packouts-hub..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build failed!" -ForegroundColor Red; exit 1 }

# Copy build into packoutsaz/dist/hub/
Write-Host "Copying to packoutsaz..." -ForegroundColor Cyan
Remove-Item -Recurse -Force "$HOME\packoutsaz\dist\hub\assets" -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force "dist\*" "$HOME\packoutsaz\dist\hub\"

# Deploy both targets
Write-Host "Deploying packoutsaz (live site)..." -ForegroundColor Cyan
Push-Location "$HOME\packoutsaz"
npx firebase deploy --only hosting:packoutsaz
Pop-Location

Write-Host "Done! Hub is live at packoutsaz.com/hub" -ForegroundColor Green
