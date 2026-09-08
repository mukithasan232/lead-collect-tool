@echo off
title LeadPulse AI Local Server
echo Starting LeadPulse AI local server at http://localhost:3000 ...
powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"
pause
