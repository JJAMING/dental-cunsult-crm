@echo off
setlocal
set "PROJECT_DIR=%~dp0.."
pushd "%PROJECT_DIR%"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 or later is required to run the Dental Consult CRM local server.
  exit /b 1
)

node "scripts\dentweb-local-api-server.cjs" >> "dentweb-current.log" 2>> "dentweb-current.err.log"
popd
