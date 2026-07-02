@echo off
setlocal
cd /d "%~dp0"

echo Starting Unpissed local moderator on 127.0.0.1...
npm run moderator
