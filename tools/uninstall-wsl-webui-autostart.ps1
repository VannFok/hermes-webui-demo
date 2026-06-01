param(
  [string]$Distro,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
if (-not $Distro) {
  $Distro = if ($env:HERMES_WSL_DISTRO) { $env:HERMES_WSL_DISTRO } else { "Ubuntu" }
}

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$TempScript = Join-Path $Root ".uninstall-wsl-webui-autostart.tmp.sh"

function ConvertTo-WslPath([string]$WindowsPath) {
  $full = [System.IO.Path]::GetFullPath($WindowsPath)
  if ($full -notmatch "^([A-Za-z]):\\(.*)$") {
    throw "Only local drive paths can be converted to WSL paths: $full"
  }
  $drive = $matches[1].ToLowerInvariant()
  $rest = $matches[2] -replace "\\", "/"
  return "/mnt/$drive/$rest"
}

$Bash = @'
#!/usr/bin/env bash
set -euo pipefail

marker_start='# >>> hermes-webui-autostart >>>'
marker_end='# <<< hermes-webui-autostart <<<'

uninstall_profile() {
  local file="$1"
  [ -f "$file" ] || return 0
  if grep -Fq "$marker_start" "$file"; then
    awk -v start="$marker_start" -v end="$marker_end" '
      $0 == start { skip = 1; next }
      $0 == end { skip = 0; next }
      !skip { print }
    ' "$file" > "$file.tmp"
    mv "$file.tmp" "$file"
    printf 'removed %s\n' "$file"
  fi
}

uninstall_profile "$HOME/.bashrc"
uninstall_profile "$HOME/.zshrc"
'@

if ($DryRun) {
  Write-Host "Distro: $Distro"
  Write-Host "Would remove Hermes WebUI autostart block from ~/.bashrc and ~/.zshrc."
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
