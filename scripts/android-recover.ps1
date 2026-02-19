param(
    [int[]]$Ports = @(8081, 8082, 8083, 8084),
    [string]$AppId = "com.barrietransit.planner",
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"

function Write-Status {
    param([string]$Message)
    if (-not $Quiet) {
        Write-Output "[android:recover] $Message"
    }
}

function Stop-ProcessSafe {
    param([int]$ProcessId, [string]$Reason)

    try {
        Stop-Process -Id $ProcessId -Force -ErrorAction Stop
        Write-Status "Stopped PID $ProcessId ($Reason)"
    } catch {
        Write-Status "Could not stop PID $ProcessId ($Reason): $($_.Exception.Message)"
    }
}

function Get-AdbPath {
    $cmd = Get-Command adb -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Path) {
        return $cmd.Path
    }

    $candidates = @(
        "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
        "C:\Android\platform-tools\adb.exe"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    return $null
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Write-Status "Project root: $projectRoot"

# 1) Stop listeners on known Metro ports.
foreach ($port in $Ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
        Stop-ProcessSafe -ProcessId $connection.OwningProcess -Reason "port $port listener"
    }
}

# 2) Stop known Node processes launched from this repo.
$repoPathRegex = [Regex]::Escape($projectRoot)
$nodeProcesses = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue
foreach ($proc in $nodeProcesses) {
    $commandLine = [string]$proc.CommandLine
    if (-not $commandLine) {
        continue
    }

    $isRepoProcess = $commandLine -match $repoPathRegex
    $isExpoStart = $commandLine -match "expo[\\/]bin[\\/]cli" -and $commandLine -match "\sstart(\s|$)"
    $isMetroProxy = $commandLine -match "\.tmp-metro-proxy\.js" -or $commandLine -match "metro-proxy" -or $commandLine -match "metro-dev-proxy"
    $isApiProxy = $commandLine -match "proxy-server\.js"

    if ($isRepoProcess -and ($isExpoStart -or $isMetroProxy -or $isApiProxy)) {
        Stop-ProcessSafe -ProcessId $proc.ProcessId -Reason "repo node process"
    }
}

# 3) Reset adb reverse ports and optionally stop app process.
$adb = Get-AdbPath
if ($adb) {
    try {
        & $adb start-server | Out-Null
        & $adb reverse --remove-all | Out-Null
        Write-Status "Cleared adb reverse mappings"
    } catch {
        Write-Status "adb reverse cleanup failed: $($_.Exception.Message)"
    }

    try {
        & $adb shell am force-stop $AppId | Out-Null
        Write-Status "Force-stopped $AppId"
    } catch {
        Write-Status "Could not force-stop ${AppId}: $($_.Exception.Message)"
    }
} else {
    Write-Status "adb not found; skipped adb cleanup"
}

Write-Status "Recovery complete"
