@echo off
cd /d "C:\Dental Consult CRM"
"C:\Program Files\nodejs\node.exe" "scripts\dentweb-local-api-server.cjs" >> "dentweb-current.log" 2>> "dentweb-current.err.log"
