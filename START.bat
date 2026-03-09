@echo off
echo.
echo  ==========================================
echo   Mini Games Platform - Starting Server
echo  ==========================================
echo.

cd /d "%~dp0backend"

:: Check if node_modules exists
if not exist "node_modules" (
  echo  [Installing dependencies...]
  npm install
  echo.
)

echo  [Server starting on http://localhost:3000]
echo  [Press Ctrl+C to stop]
echo.
start "" "http://localhost:3000"
node server.js
pause
