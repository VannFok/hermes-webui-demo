$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not $env:HERMES_WSL_DISTRO) {
  $env:HERMES_WSL_DISTRO = "Ubuntu"
}

Write-Host "Starting Hermes WebUI..."
Write-Host ""
Write-Host "URL: http://127.0.0.1:4173"
Write-Host "WSL distro: $env:HERMES_WSL_DISTRO"
Write-Host "Keep this window open while using the WebUI."
Write-Host ""

npm run start
