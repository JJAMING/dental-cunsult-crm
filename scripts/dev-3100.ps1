Set-Location -LiteralPath "C:\Dental Consult CRM"

$logPath = "C:\Dental Consult CRM\dev-3100.script.log"
"[$(Get-Date -Format o)] starting next dev on 127.0.0.1:3100, pid=$PID" | Out-File -FilePath $logPath -Encoding utf8

try {
  & "C:\Program Files\nodejs\node.exe" "node_modules\next\dist\bin\next" dev -p 3100 -H 127.0.0.1 *>> $logPath
  "[$(Get-Date -Format o)] next dev exited with code $LASTEXITCODE" | Out-File -FilePath $logPath -Append -Encoding utf8
} catch {
  "[$(Get-Date -Format o)] next dev failed: $($_.Exception.Message)" | Out-File -FilePath $logPath -Append -Encoding utf8
}
