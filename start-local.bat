@echo off
cd /d "%~dp0"
echo Starting Pairly locally...
echo.
echo Frontend: http://localhost:5173
echo API:      http://localhost:3001/api/health
echo.
npm run local
