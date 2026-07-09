@echo off
title Anasiya Custom Order - Local Preview Tunnel
echo ===================================================
echo [1/3] Building latest code with Vite...
echo ===================================================
call npm run build
if %errorlevel% neq 0 (
  echo Build failed! Fix code issues and try again.
  pause
  exit /b %errorlevel%
)

echo.
echo ===================================================
echo [2/3] Launching local preview server (port 4173)...
echo ===================================================
start "" /b cmd /c "npm run preview"

echo Waiting for server to start...
timeout /t 3 /nobreak >nul

echo.
echo ===================================================
echo [3/3] Creating temporary public URL...
echo ===================================================
echo.
echo Note: If prompted, proceed to the URL.
echo Press Ctrl+C at any time in this window to stop the preview.
echo.
call npx -y localtunnel --port 4173
