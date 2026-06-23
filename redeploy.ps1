#!/usr/bin/env pwsh
# One-command redeploy: rebuild the image and restart the container.
#
# VITE_GIPHY_KEY is inlined into the web bundle at BUILD time (not read at runtime), so it
# must be passed as a --build-arg on every build. This script reads it from .env for you.
# The runtime --env-file (apps/server/.env) still feeds the server its secrets at startup.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$envFile = Join-Path $root '.env'
$serverEnv = Join-Path $root 'apps/server/.env'

# Pull the public Giphy web key out of .env (trim stray CR/whitespace from CRLF files).
$line = Get-Content $envFile | Select-String '^VITE_GIPHY_KEY=' | Select-Object -First 1
if (-not $line) { throw "VITE_GIPHY_KEY not found in $envFile" }
$key = ($line.Line -replace '^VITE_GIPHY_KEY=', '').Trim()
if (-not $key) { throw "VITE_GIPHY_KEY is empty in $envFile" }

Write-Host 'Building image (Giphy key from .env)...' -ForegroundColor Cyan
docker build --build-arg VITE_GIPHY_KEY=$key -t tossit $root
if ($LASTEXITCODE -ne 0) { throw 'docker build failed — container NOT restarted' }

Write-Host 'Restarting container...' -ForegroundColor Cyan
docker rm -f tossit 2>$null | Out-Null
docker run -d --name tossit --restart unless-stopped -p 3000:3000 --env-file $serverEnv tossit
if ($LASTEXITCODE -ne 0) { throw 'docker run failed' }

Write-Host 'Done - Tossit is live on http://localhost:3000' -ForegroundColor Green
