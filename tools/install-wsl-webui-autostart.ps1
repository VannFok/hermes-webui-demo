param(
  [string]$Distro,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
if (-not $Distro) {
  $Distro = if ($env:HERMES_WSL_DISTRO) { $env:HERMES_WSL_DISTRO } else { "Ubuntu" }
}

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$BootScript = Resolve-Path (Join-Path $PSScriptRoot "start-hermes-webui-if-needed.ps1")
$TempScript = Join-Path $Root ".install-wsl-webui-autostart.tmp.sh"

function ConvertTo-WslPath([string]$WindowsPath) {
  $full = [System.IO.Path]::GetFullPath($WindowsPath)
  if ($full -notmatch "^([A-Za-z]):\\(.*)$") {
    throw "Only local drive paths can be converted to WSL paths: $full"
  }
  $drive = $matches[1].ToLowerInvariant()
  $rest = $matches[2] -replace "\\", "/"
  return "/mnt/$drive/$rest"
}

$BootScriptWsl = ConvertTo-WslPath $BootScript
$Block = @"
# >>> hermes-webui-autostart >>>
if [ -z "`$HERMES_WEBUI_AUTOSTART_SKIP" ] && command -v powershell.exe >/dev/null 2>&1; then
  (
    HERMES_WEBUI_BOOT_PS="`$(wslpath -w '$BootScriptWsl' 2>/dev/null)"
    if [ -n "`$HERMES_WEBUI_BOOT_PS" ]; then
      powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "`$HERMES_WEBUI_BOOT_PS" >/dev/null 2>&1
    fi
  ) &
fi
# <<< hermes-webui-autostart <<<
"@

$BlockForBash = $Block -replace "'", "'\''"
$Bash = @"
#!/usr/bin/env bash
set -euo pipefail

marker_start='# >>> hermes-webui-autostart >>>'
marker_end='# <<< hermes-webui-autostart <<<'
block='$BlockForBash'

install_profile() {
  local file="`$1"
  touch "`$file"
  if grep -Fq "`$marker_start" "`$file"; then
    awk -v start="`$marker_start" -v end="`$marker_end" '
      `$0 == start { skip = 1; next }
      `$0 == end { skip = 0; next }
      !skip { print }
    ' "`$file" > "`$file.tmp"
    mv "`$file.tmp" "`$file"
  fi
  printf '\n%s\n' "`$block" >> "`$file"
  printf 'installed %s\n' "`$file"
}

install_profile "`$HOME/.bashrc"
if [ -f "`$HOME/.zshrc" ]; then
  install_profile "`$HOME/.zshrc"
fi
"@

if ($DryRun) {
  Write-Host "Distro: $Distro"
  Write-Host "Boot script: $BootScript"
  Write-Host ""
  Write-Host $Block
  exit 0
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($TempScript, $Bash, $utf8NoBom)
try {
  $TempScriptWsl = ConvertTo-WslPath $TempScript
  & wsl.exe -d $Distro -- bash $TempScriptWsl
} finally {
  Remove-Item -LiteralPath $TempScript -Force -ErrorAction SilentlyContinue
}
