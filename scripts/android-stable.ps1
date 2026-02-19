param(
    [string]$AppId = "com.barrietransit.planner",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Write-Status {
    param([string]$Message)
    Write-Output "[android:stable] $Message"
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
$recoverScript = Join-Path $PSScriptRoot "android-recover.ps1"
$shortpathCmd = Join-Path $PSScriptRoot "android-shortpath.cmd"
$env:INIT_CWD = $projectRoot

& $recoverScript -Ports @(8081, 8082, 8083, 8084) -AppId $AppId

$adb = Get-AdbPath
if (-not $adb) {
    throw "adb not found. Install Android platform-tools or add adb to PATH."
}

& $adb wait-for-device | Out-Null

if (-not $SkipBuild) {
    Write-Status "Building/installing Android release variant"
    Push-Location $projectRoot
    try {
        & cmd.exe /c "`"$shortpathCmd`" --variant release"
        if ($LASTEXITCODE -ne 0) {
            throw "Release build failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Status "Skipping build (-SkipBuild)"
}

Write-Status "Launching $AppId"
& $adb shell am force-stop $AppId | Out-Null
& $adb shell monkey -p $AppId -c android.intent.category.LAUNCHER 1 | Out-Null

Write-Status "Done"
