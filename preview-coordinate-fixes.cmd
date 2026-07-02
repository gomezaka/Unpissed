@echo off
setlocal
cd /d "%~dp0"

echo Previewing coordinate fixes. This is dry-run only.
npm run coordinates:dry-run -- %*
