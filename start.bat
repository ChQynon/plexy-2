@echo off
echo ===================================
echo PLEXY Bot - Starting...
echo ===================================
echo.

REM Build TypeScript files
call npm run build

REM Start the bot
call npm start

echo.
echo ===================================
echo PLEXY Bot - Stopped
echo ===================================
pause 