[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ClinicId,

  [Parameter(Mandatory = $true)]
  [string]$ClinicName,

  [string]$SupabaseUrl = "https://bcbzfqbzlotyghowpyai.supabase.co",

  [ValidateRange(1024, 65535)]
  [int]$Port = 34254,

  [string]$PairingCode,

  [string]$DentwebSqlServer,

  [ValidateRange(1, 65535)]
  [int]$DentwebSqlPort = 1436,

  [string]$DentwebSqlDatabase = "DentWeb",

  [string]$DentwebSqlUser = "dwpublic"
)

$ErrorActionPreference = "Stop"
$projectPath = Split-Path -Parent $PSScriptRoot
$runtimePath = Join-Path $projectPath ".dentweb-local"
$apiScriptPath = Join-Path $PSScriptRoot "dentweb-local-api-server.cjs"
$configPath = Join-Path $runtimePath "server-config.json"
$secretsPath = Join-Path $runtimePath "server-secrets.env"
$taskName = "Dental Consult CRM Local API"

function ConvertTo-PlainText([System.Security.SecureString]$Value) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)

  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

if (-not (Test-Path -LiteralPath $apiScriptPath)) {
  throw "Local API script was not found: $apiScriptPath"
}

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  throw "Node.js 24 or later must be installed before server setup."
}

$nodeVersion = (& $nodeCommand.Source --version).Trim()
if ($nodeVersion -notmatch '^v(2[4-9]|[3-9][0-9])\.') {
  throw "Node.js 24 or later is required. Current version: $nodeVersion"
}

New-Item -ItemType Directory -Path $runtimePath -Force | Out-Null

if (-not $PairingCode) {
  $PairingCode = (Get-Random -Minimum 100000 -Maximum 999999).ToString()
}

$existingConfig = @{}
if (Test-Path -LiteralPath $configPath) {
  try {
    $existingConfig = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  } catch {
    $existingConfig = @{}
  }
}

$dentwebSourcePath = ""
if ($null -ne $existingConfig.dentwebSourcePath) {
  $dentwebSourcePath = [string]$existingConfig.dentwebSourcePath
}

$serverConfig = @{
  clinicId = $ClinicId.Trim()
  clinicName = $ClinicName.Trim()
  mode = "server"
  host = "0.0.0.0"
  port = $Port
  pairingCode = $PairingCode
  autoDiscoveryEnabled = $true
  dentwebSourcePath = $dentwebSourcePath
  dentwebSourceMapping = $existingConfig.dentwebSourceMapping
  dentwebSqlServer = if ($DentwebSqlServer) {
    @{
      server = $DentwebSqlServer.Trim()
      port = $DentwebSqlPort
      database = $DentwebSqlDatabase.Trim()
      user = $DentwebSqlUser.Trim()
      encrypt = $false
      trustServerCertificate = $true
    }
  } elseif ($null -ne $existingConfig.dentwebSqlServer) {
    $existingConfig.dentwebSqlServer
  } else {
    $null
  }
}

$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
$serverConfigJson = $serverConfig | ConvertTo-Json -Depth 12
[System.IO.File]::WriteAllText($configPath, $serverConfigJson, $utf8WithoutBom)

Write-Host "Enter the Supabase service role key for this server PC only." -ForegroundColor Cyan
$serviceRoleKey = ConvertTo-PlainText (Read-Host -AsSecureString "Service role key")
if (-not $serviceRoleKey) {
  throw "A Supabase service role key is required."
}

$dentwebSqlPassword = ""
if ($DentwebSqlServer) {
  Write-Host "Enter the Dentweb read-only SQL password for this server PC only." -ForegroundColor Cyan
  $dentwebSqlPassword = ConvertTo-PlainText (Read-Host -AsSecureString "Dentweb SQL password")
  if (-not $dentwebSqlPassword) {
    throw "A Dentweb SQL password is required when -DentwebSqlServer is supplied."
  }
}

$secretsLines = @(
  "DENTAL_CONSULT_SUPABASE_URL=$SupabaseUrl",
  "DENTAL_CONSULT_SUPABASE_SERVICE_ROLE_KEY=$serviceRoleKey",
  $(if ($dentwebSqlPassword) { "DENTWEB_SQL_PASSWORD=$dentwebSqlPassword" })
) | Where-Object { $_ }
$secretsContent = $secretsLines -join [Environment]::NewLine
[System.IO.File]::WriteAllText($secretsPath, "$secretsContent$([Environment]::NewLine)", $utf8WithoutBom)

try {
  $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls $secretsPath /inheritance:r /grant:r "${currentUser}:(R,W)" | Out-Null
} catch {
  Write-Warning "Could not tighten the server secrets file permissions. Confirm that only the server operator can read: $secretsPath"
}

$action = New-ScheduledTaskAction -Execute $nodeCommand.Source -Argument ('"{0}"' -f $apiScriptPath) -WorkingDirectory $projectPath
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Description "Dental Consult CRM local server" -Force | Out-Null

try {
  $isAdministrator = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if ($isAdministrator) {
    $ruleName = "Dental Consult CRM Local API - Private LAN"
    Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Private -RemoteAddress LocalSubnet | Out-Null
  } else {
    Write-Warning "Run this script once as Administrator to add the Private LAN firewall rule for port $Port."
  }
} catch {
  Write-Warning "Firewall rule was not added automatically. Allow TCP $Port only on the Private profile and LocalSubnet."
}

try {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
} catch {
  # The task may not have a running instance yet.
}

Start-ScheduledTask -TaskName $taskName

$healthUrl = "http://127.0.0.1:$Port/health"
$deadline = (Get-Date).AddSeconds(12)
$health = $null

while ((Get-Date) -lt $deadline -and -not $health) {
  Start-Sleep -Milliseconds 750
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
  } catch {
    # The Node process may still be starting.
  }
}

if (-not $health.ok) {
  throw "Server setup completed but the local API health check failed: $healthUrl"
}

$lanAddresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
  Select-Object -ExpandProperty IPAddress

Write-Host ""
Write-Host "Dental Consult CRM server setup complete." -ForegroundColor Green
Write-Host "Clinic: $ClinicName ($ClinicId)"
Write-Host "Local API: $healthUrl"
Write-Host "Pairing code: $PairingCode" -ForegroundColor Yellow
if ($lanAddresses) {
  $lanAddresses | ForEach-Object { Write-Host "Client URL: http://${_}:$Port" }
}
if ($DentwebSqlServer) {
  Write-Host "Dentweb SQL: $DentwebSqlServer`:$DentwebSqlPort / $DentwebSqlDatabase (read-only)" -ForegroundColor Cyan
  Write-Host "Next: In the desktop app, run the Dentweb read-only connection test and sync." -ForegroundColor Cyan
} else {
  Write-Host "Next: Open Admin Mode on the server PC, select Server Mode, then run Dentweb server discovery." -ForegroundColor Cyan
}
