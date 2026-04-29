param(
    [int]$Port = 3002,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

function Write-Status {
    param([string]$Message)
    Write-Output "[detour:dev] $Message"
}

function Get-EnvFileValue {
    param(
        [string]$ProjectRoot,
        [string]$Name
    )

    $envPath = Join-Path $ProjectRoot ".env"
    if (-not (Test-Path $envPath)) {
        return $null
    }

    $line = Get-Content $envPath | Where-Object {
        $_ -match "^\s*$([Regex]::Escape($Name))\s*="
    } | Select-Object -First 1

    if (-not $line) {
        return $null
    }

    return ($line -split "=", 2)[1].Trim()
}

function Test-HttpReady {
    param([string]$Url)

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    } catch {
        return $false
    }
}

function Get-ApiHealth {
    param([string]$Url)

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
        return $response.Content | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Set-ProcessEnvTemporarily {
    param([hashtable]$Values)

    $previous = @{}
    foreach ($key in $Values.Keys) {
        $previous[$key] = [Environment]::GetEnvironmentVariable($key, "Process")
        [Environment]::SetEnvironmentVariable($key, [string]$Values[$key], "Process")
    }
    return $previous
}

function Restore-ProcessEnv {
    param([hashtable]$Previous)

    foreach ($key in $Previous.Keys) {
        [Environment]::SetEnvironmentVariable($key, $Previous[$key], "Process")
    }
}

function Assert-FirebaseAdminCredentials {
    param([string]$ProjectRoot)

    $inlineJson = $env:FIREBASE_SERVICE_ACCOUNT_JSON
    if (-not $inlineJson) {
        $inlineJson = Get-EnvFileValue -ProjectRoot $ProjectRoot -Name "FIREBASE_SERVICE_ACCOUNT_JSON"
    }

    if ($inlineJson) {
        try {
            $inlineJson | ConvertFrom-Json | Out-Null
            return
        } catch {
            throw "FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON."
        }
    }

    $credentialsPath = $env:GOOGLE_APPLICATION_CREDENTIALS
    if (-not $credentialsPath) {
        $credentialsPath = Get-EnvFileValue -ProjectRoot $ProjectRoot -Name "GOOGLE_APPLICATION_CREDENTIALS"
    }

    if ($credentialsPath) {
        $expandedPath = [Environment]::ExpandEnvironmentVariables($credentialsPath)
        if (Test-Path -LiteralPath $expandedPath -PathType Leaf) {
            return
        }

        throw "GOOGLE_APPLICATION_CREDENTIALS points to a missing file: $credentialsPath"
    }

    throw "Firebase Admin credentials are required for rider-visible detour testing. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS in .env."
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$apiProxyRoot = Join-Path $projectRoot "api-proxy"
$healthUrl = "http://127.0.0.1:$Port/api/health"

if (-not (Test-Path (Join-Path $apiProxyRoot "index.js"))) {
    throw "api-proxy/index.js not found. Cannot start the local detour worker."
}

$devWorkerSwitch = Get-EnvFileValue -ProjectRoot $projectRoot -Name "DETOUR_DEV_WORKER_ENABLED"
if ($devWorkerSwitch -and $devWorkerSwitch.ToLowerInvariant() -eq "false" -and -not $Force) {
    Write-Status "Skipped because DETOUR_DEV_WORKER_ENABLED=false"
    exit 0
}

$clientFlag = Get-EnvFileValue -ProjectRoot $projectRoot -Name "EXPO_PUBLIC_ENABLE_AUTO_DETOURS"
$legacyClientFlag = Get-EnvFileValue -ProjectRoot $projectRoot -Name "EXPO_PUBLIC_ENABLE_DETOUR_GEOMETRY_UI"
$clientEnabled = (
    ($clientFlag -and $clientFlag.ToLowerInvariant() -eq "true") -or
    ($legacyClientFlag -and $legacyClientFlag.ToLowerInvariant() -eq "true")
)

if (-not $clientEnabled -and -not $Force) {
    Write-Status "Skipped because auto-detour UI is not enabled in .env"
    exit 0
}

Assert-FirebaseAdminCredentials -ProjectRoot $projectRoot

if (Test-HttpReady -Url $healthUrl) {
    $health = Get-ApiHealth -Url $healthUrl
    if ($health -and $health.service -eq "api-proxy" -and $health.features.detourWorkerEnabled) {
        Write-Status "Using existing local detour worker at $healthUrl"
        exit 0
    }

    throw "Port $Port is already responding, but it is not an enabled api-proxy detour worker."
}

$outLog = Join-Path $projectRoot ".logs-detour-dev-worker-$Port.out.txt"
$errLog = Join-Path $projectRoot ".logs-detour-dev-worker-$Port.err.txt"
Remove-Item $outLog, $errLog -ErrorAction SilentlyContinue

Write-Status "Starting local auto-detour worker on port $Port"
$previousEnv = Set-ProcessEnvTemporarily @{
    PORT = $Port
    DETOUR_WORKER_ENABLED = "true"
    DETOUR_WORKER_MODE = "interval"
    DETOUR_HISTORY_ENABLED = "true"
}

try {
    $process = Start-Process `
        -FilePath "node.exe" `
        -ArgumentList @("index.js") `
        -WorkingDirectory $apiProxyRoot `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog `
        -WindowStyle Hidden `
        -PassThru
} finally {
    Restore-ProcessEnv -Previous $previousEnv
}

for ($i = 0; $i -lt 30; $i++) {
    if ($process.HasExited) {
        throw "Local detour worker exited early (code $($process.ExitCode)). Check $errLog"
    }

    $health = Get-ApiHealth -Url $healthUrl
    if ($health -and $health.service -eq "api-proxy" -and $health.features.detourWorkerEnabled) {
        Write-Status "Local auto-detour worker is responding at $healthUrl"
        Write-Status "Logs: $outLog"
        exit 0
    }

    Start-Sleep -Seconds 1
}

throw "Local detour worker did not become ready at $healthUrl. Check $errLog"
