@echo off
setlocal
cd /d "%~dp0"

echo This will update coordinates in Supabase after creating a backup.
echo Run preview-coordinate-fixes.cmd first and review the suggestions.
echo.
set /p CONFIRM=Type APPLY to continue: 
if not "%CONFIRM%"=="APPLY" (
  echo Cancelled. No database changes were made.
  exit /b 1
)

npm run coordinates:fix -- %*
