@echo off
setlocal
cd /d "%~dp0"
if not defined HERMES_WSL_DISTRO set "HERMES_WSL_DISTRO=Ubuntu"
echo Starting Hermes WebUI...
echo.
echo URL: http://127.0.0.1:4173
echo WSL distro: %HERMES_WSL_DISTRO%
echo Keep this window open while using the WebUI.
echo.
npm run start
