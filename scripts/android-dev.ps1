param(
    [int]$Port = 8083,
    [int]$MetroPort = 8084,
    [string]$AppId = "com.barrietransit.planner",
    [switch]$NoRecover,
    [switch]$NoLaunch,
    [switch]$Direct
)

$ErrorActionPreference = "Stop"

function Write-Status {
    param([string]$Message)
    Write-Output "[android:dev] $Message"
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
$env:INIT_CWD = $projectRoot
$expoCli = Join-Path $projectRoot "node_modules\expo\bin\cli"
$expoCliArg = "`"$expoCli`""

if (-not (Test-Path $expoCli)) {
    throw "Expo CLI not found at $expoCli. Run npm install first."
}

if (-not $NoRecover) {
    Write-Status "Running recovery first"
    & $recoverScript -Ports @($Port, $MetroPort, 8081, 8082) -AppId $AppId
}

$metroOutLog = Join-Path $projectRoot ".logs-expo-dev-metro-$MetroPort.out.txt"
$metroErrLog = Join-Path $projectRoot ".logs-expo-dev-metro-$MetroPort.err.txt"
Remove-Item $metroOutLog, $metroErrLog -ErrorAction SilentlyContinue

$metroListenPort = $Port
$proxyProcess = $null

if ($Direct) {
    Write-Status "Starting Metro directly on port $Port"
    $metroProcess = Start-Process `
        -FilePath "node.exe" `
        -ArgumentList @($expoCliArg, "start", "--dev-client", "--port", $Port, "--clear") `
        -WorkingDirectory $projectRoot `
        -RedirectStandardOutput $metroOutLog `
        -RedirectStandardError $metroErrLog `
        -WindowStyle Hidden `
        -PassThru
} else {
    $metroListenPort = $MetroPort
    Write-Status "Starting Metro on port $MetroPort (proxy mode)"
    $metroProcess = Start-Process `
        -FilePath "node.exe" `
        -ArgumentList @($expoCliArg, "start", "--dev-client", "--port", $MetroPort, "--clear") `
        -WorkingDirectory $projectRoot `
        -RedirectStandardOutput $metroOutLog `
        -RedirectStandardError $metroErrLog `
        -WindowStyle Hidden `
        -PassThru

    $proxyOutLog = Join-Path $projectRoot ".logs-expo-dev-proxy-$Port.out.txt"
    $proxyErrLog = Join-Path $projectRoot ".logs-expo-dev-proxy-$Port.err.txt"
    Remove-Item $proxyOutLog, $proxyErrLog -ErrorAction SilentlyContinue

    $proxyProcess = Start-Process `
        -FilePath "node.exe" `
        -ArgumentList @("scripts/metro-dev-proxy.js") `
        -WorkingDirectory $projectRoot `
        -RedirectStandardOutput $proxyOutLog `
        -RedirectStandardError $proxyErrLog `
        -WindowStyle Hidden `
        -PassThru
}

$isListening = $false
for ($i = 0; $i -lt 120; $i++) {
    Start-Sleep -Seconds 1
    $listener = Get-NetTCPConnection -LocalPort $metroListenPort -State Listen -ErrorAction SilentlyContinue
    if ($listener) {
        if ($Direct) {
            $isListening = $true
            break
        }
        $proxyListener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if ($proxyListener) {
            $isListening = $true
            break
        }
    }
    if ($metroProcess.HasExited) {
        throw "Metro process exited early (code $($metroProcess.ExitCode)). Check $metroErrLog"
    }
    if ($proxyProcess -and $proxyProcess.HasExited) {
        throw "Proxy process exited early (code $($proxyProcess.ExitCode)). Check .logs-expo-dev-proxy-$Port.err.txt"
    }
}

if (-not $isListening) {
    if ($Direct) {
        throw "Metro did not start listening on port $Port. Check $metroErrLog"
    } else {
        throw "Metro/proxy did not start listening on ports $MetroPort/$Port. Check .logs-expo-dev-metro-$MetroPort.err.txt and .logs-expo-dev-proxy-$Port.err.txt"
    }
}

if ($Direct) {
    Write-Status "Metro is listening on port $Port"
} else {
    Write-Status "Metro is listening on $MetroPort and proxy is listening on $Port"
}
Write-Status "Metro logs: $metroOutLog"

if ($NoLaunch) {
    Write-Status "Skipping app launch (-NoLaunch)"
    exit 0
}

$adb = Get-AdbPath
if (-not $adb) {
    throw "adb not found. Install Android platform-tools or add adb to PATH."
}

Write-Status "Launching $AppId on emulator/device"
& $adb wait-for-device | Out-Null
& $adb reverse "tcp:$Port" "tcp:$Port" | Out-Null
& $adb shell am force-stop $AppId | Out-Null
& $adb shell monkey -p $AppId -c android.intent.category.LAUNCHER 1 | Out-Null

Write-Status "Done"
