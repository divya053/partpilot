@echo off
REM PartPilot — launch API (4100) and Web (5173) in separate windows.
REM Requires XAMPP MySQL running with a "partpilot" database.

echo Starting PartPilot...
echo   API -> http://localhost:4100
echo   Web -> http://localhost:5173
echo.

cd /d "%~dp0server"
if not exist node_modules ( echo Installing API deps... & call npm install )
start "PartPilot API" cmd /k "npm start"

cd /d "%~dp0client"
if not exist node_modules ( echo Installing Web deps... & call npm install )
start "PartPilot Web" cmd /k "npm run dev"

echo.
echo Two windows opened. When Vite is ready, open http://localhost:5173
