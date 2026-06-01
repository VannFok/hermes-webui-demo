@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\uninstall-wsl-webui-autostart.ps1" %*
