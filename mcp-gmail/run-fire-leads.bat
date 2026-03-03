@echo off
:: Fire Leads Processor — scheduled task wrapper
:: Runs the processor and logs output

set LOGFILE=%USERPROFILE%\fire-leads-processor.log

echo. >> "%LOGFILE%"
echo ============================================================ >> "%LOGFILE%"
echo [%date% %time%] Starting fire leads processor >> "%LOGFILE%"
echo ============================================================ >> "%LOGFILE%"

cd /d "%USERPROFILE%\mcp-gmail"
node fire-leads-processor.js >> "%LOGFILE%" 2>&1

echo [%date% %time%] Finished (exit code: %ERRORLEVEL%) >> "%LOGFILE%"
