param(
    [int]$Port = 8081,
    [int]$ApiProxyPort = 3001,
    [string]$AppId = "com.barrietransit.planner",
    [string]$Scheme,
    [string]$ManifestHost = "127.0.0.1"
)

$ErrorActionPreference = "Stop"

function Write-Status {
    param([string]$Message)
    Write-Output "[android:dev:launch] $Message"
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

function Get-DevClientScheme {
    param(
        [string]$ProjectRoot,
        [string]$ExplicitScheme
    )

    if ($ExplicitScheme) {
        return $ExplicitScheme
    }

    $configPath = Join-Path $ProjectRoot "app.base.json"
    if (Test-Path $configPath) {
        try {
            $config = Get-Content -Path $configPath -Raw | ConvertFrom-Json
            if ($config.expo.slug) {
                return "exp+$($config.expo.slug)"
            }
        } catch {
            Write-Status "Could not parse app.base.json for slug; using fallback dev-client scheme"
        }
    }

    return "exp+barrie-transit-planner"
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

function Wake-AndroidDevice {
    param([string]$AdbPath)

    & $AdbPath shell input keyevent KEYCODE_WAKEUP | Out-Null
    & $AdbPath shell wm dismiss-keyguard | Out-Null
    & $AdbPath shell input keyevent 82 | Out-Null
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$manifestUrl = "http://${ManifestHost}:$Port"

if (-not (Test-HttpReady -Url $manifestUrl)) {
    throw "Expo dev server is not responding at $manifestUrl. Start it first with npm run android:dev or npm start -- --dev-client --port $Port."
}

$adb = Get-AdbPath
if (-not $adb) {
    throw "adb not found. Install Android platform-tools or add adb to PATH."
}

Write-Status "Launching $AppId against existing Expo server at $manifestUrl"
& $adb wait-for-device | Out-Null
Wake-AndroidDevice -AdbPath $adb
& $adb reverse "tcp:$Port" "tcp:$Port" | Out-Null
if ($ApiProxyPort -gt 0) {
    & $adb reverse "tcp:$ApiProxyPort" "tcp:$ApiProxyPort" | Out-Null
}
& $adb shell am force-stop $AppId | Out-Null

$resolvedScheme = Get-DevClientScheme -ProjectRoot $projectRoot -ExplicitScheme $Scheme
$devClientUrl = "${resolvedScheme}://expo-development-client/?url=$([System.Uri]::EscapeDataString($manifestUrl))"
$launchResult = & $adb shell am start -W -a android.intent.action.VIEW -d $devClientUrl $AppId 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -or $launchResult -match "Error:" -or $launchResult -match "unable to resolve Intent") {
    throw "Failed to open dev client URL. adb output: $launchResult"
}

Write-Status "Done"
