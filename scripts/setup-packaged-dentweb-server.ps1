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

  [string]$AppPath
)

$ErrorActionPreference = "Stop"
$taskName = "Dental Consult CRM Server Agent"
$runtimePath = Join-Path (Join-Path $env:APPDATA "Dental Consult CRM") "agent"
$configPath = Join-Path $runtimePath "server-config.json"
$secretsPath = Join-Path $runtimePath "server-secrets.env"

function ConvertTo-PlainText([System.Security.SecureString]$Value) {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)

  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Find-InstalledApp([string]$ProvidedPath) {
  $candidates = @(
    $ProvidedPath,
    (Join-Path $env:LOCALAPPDATA "Programs\Dental Consult CRM\Dental Consult CRM.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\dental-consult-crm\Dental Consult CRM.exe"),
    (Join-Path $env:ProgramFiles "Dental Consult CRM\Dental Consult CRM.exe")
  ) | Where-Object { $_ }

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  throw "Dental Consult CRM desktop app could not be found. Install the desktop app first, or pass -AppPath with the installed Dental Consult CRM.exe path."
}

$desktopAppPath = Find-InstalledApp $AppPath
New-Item -ItemType Directory -Path $runtimePath -Force | Out-Null

if (-not $PairingCode) {
  $PairingCode = (Get-Random -Minimum 100000 -Maximum 999999).ToString()
}

$existingConfig = $null
if (Test-Path -LiteralPath $configPath) {
  try {
    $existingConfig = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  } catch {
    $existingConfig = $null
  }
}

$serverConfig = @{
  clinicId = $ClinicId.Trim()
  clinicName = $ClinicName.Trim()
  mode = "server"
  host = "0.0.0.0"
  port = $Port
  pairingCode = $PairingCode
  autoDiscoveryEnabled = $true
  dentwebSourcePath = if ($existingConfig -and $null -ne $existingConfig.dentwebSourcePath) { [string]$existingConfig.dentwebSourcePath } else { "" }
  dentwebSourceMapping = if ($existingConfig) { $existingConfig.dentwebSourceMapping } else { $null }
}

$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($configPath, ($serverConfig | ConvertTo-Json -Depth 12), $utf8WithoutBom)

Write-Host "Enter the Supabase service role key for this server PC only." -ForegroundColor Cyan
$serviceRoleKey = ConvertTo-PlainText (Read-Host -AsSecureString "Service role key")
if (-not $serviceRoleKey) {
  throw "A Supabase service role key is required."
}

$secretsContent = @(
  "DENTAL_CONSULT_SUPABASE_URL=$SupabaseUrl",
  "DENTAL_CONSULT_SUPABASE_SERVICE_ROLE_KEY=$serviceRoleKey"
) -join [Environment]::NewLine
[System.IO.File]::WriteAllText($secretsPath, "$secretsContent$([Environment]::NewLine)", $utf8WithoutBom)

try {
  $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls $secretsPath /inheritance:r /grant:r "${currentUser}:(R,W)" | Out-Null
} catch {
  Write-Warning "Could not tighten the server secret file permissions. Confirm only the server operator can read: $secretsPath"
}

$action = New-ScheduledTaskAction -Execute $desktopAppPath -Argument "--agent" -WorkingDirectory (Split-Path -Parent $desktopAppPath)
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Description "Dental Consult CRM packaged local server agent" -Force | Out-Null

try {
  $isAdministrator = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if ($isAdministrator) {
    $ruleName = "Dental Consult CRM Server Agent - Private LAN"
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
  # A new task has no running instance yet.
}

Start-ScheduledTask -TaskName $taskName

$healthUrl = "http://127.0.0.1:$Port/health"
$deadline = (Get-Date).AddSeconds(15)
$health = $null
while ((Get-Date) -lt $deadline -and -not $health) {
  Start-Sleep -Milliseconds 750
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
  } catch {
    # The packaged agent can take a moment to start.
  }
}

if (-not $health.ok) {
  throw "Server configuration was saved but the packaged local API did not respond: $healthUrl"
}

$lanAddresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
  Select-Object -ExpandProperty IPAddress

Write-Host ""
Write-Host "Dental Consult CRM server agent is ready." -ForegroundColor Green
Write-Host "Clinic: $ClinicName ($ClinicId)"
Write-Host "Local API: $healthUrl"
Write-Host "Pairing code: $PairingCode" -ForegroundColor Yellow
if ($lanAddresses) {
  $lanAddresses | ForEach-Object { Write-Host "Client URL: http://${_}:$Port" }
}
Write-Host "Next: Open the desktop app on this server PC and run Dentweb discovery." -ForegroundColor Cyan
