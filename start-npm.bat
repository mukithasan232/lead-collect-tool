@echo off
set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
echo Starting LeadPulse AI via npm run dev...
cd /d "%~dp0"
call npm run dev
pause
