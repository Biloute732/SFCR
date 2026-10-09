@echo off
rem Lance le Comparateur SFCR en local puis ouvre le navigateur sur http://localhost:5173
cd /d "%~dp0web"
if not exist node_modules (
  echo Premiere installation des dependances...
  call npm install
)
start "" http://localhost:5173
call npm run dev -- --port 5173
pause
