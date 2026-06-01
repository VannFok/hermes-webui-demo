param(
  [switch]$DryRun,
  [ValidateSet("Hidden", "Minimized", "Normal")]
  [string]$WindowStyle = "Hidden"
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$StartCmd = Join-Path $Root "start-hermes-webui.cmd"
$ProbeUrl = "http://127.0.0.1:4173/api/agents"
$LockPath = Join-Path $env:TEMP "hermes-webui-autostart.lock"

function Test-HermesWebUiRunning {
  try {
    $response = Invoke-WebRequest -Uri $ProbeUrl -UseBasicParsing -TimeoutSec 1
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300)
  } catch {
    return $false
  }
}

$lock = $null
try {
  $lock = [System.IO.File]::Open($LockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
} catch {
  exit 0
}

try {
  if (Test-HermesWebUiRunning) {
    if ($DryRun) { Write-Host "Hermes WebUI is already running." }
    exit 0
  }

  if ($DryRun) {
    Write-Host "Would start: $StartCmd"
    exit 0
  }

  Start-Process -FilePath $env:ComSpec -ArgumentList @("/c", "`"$StartCmd`"") -WorkingDirectory $Root -WindowStyle $WindowStyle
  Start-Sleep -Seconds 4
} finally {
  if ($lock) { $lock.Dispose() }
}
