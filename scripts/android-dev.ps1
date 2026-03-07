param(
    [int]$Port = 8084,
    [int]$MetroPort = 8084,
    [string]$AppId = "com.barrietransit.planner",
    [string]$Scheme,
    [string]$ManifestHost = "127.0.0.1",
    [switch]$NoRecover,
    [switch]$NoLaunch,
    [switch]$Direct,
    [switch]$Proxy
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

function Get-LocalApiProxyPort {
    param([string]$ProjectRoot)

    $proxyUrl = $env:EXPO_PUBLIC_API_PROXY_URL
    if (-not $proxyUrl) {
        $proxyUrl = Get-EnvFileValue -ProjectRoot $ProjectRoot -Name "EXPO_PUBLIC_API_PROXY_URL"
    }

    if (-not $proxyUrl) {
        return $null
    }

    try {
        $uri = [System.Uri]$proxyUrl
    } catch {
        Write-Status "Could not parse EXPO_PUBLIC_API_PROXY_URL='$proxyUrl'; skipping local API proxy startup"
        return $null
    }

    if ($uri.Host -notin @("localhost", "127.0.0.1")) {
        return $null
    }

    if ($uri.Port -le 0) {
        return $null
    }

    return $uri.Port
}

function Warm-ExpoAndroidBundle {
    param([string]$BaseUrl)

    $bundleUrl = "${BaseUrl}/node_modules/expo/AppEntry.bundle?platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.routerRoot=app&unstable_transformProfile=hermes-stable"
    Write-Status "Priming Android bundle at $bundleUrl"

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $bundleUrl -TimeoutSec 180
        if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
            throw "Unexpected status code $($response.StatusCode)"
        }
    } catch {
        throw "Expo Android bundle warmup failed at $bundleUrl. $($_.Exception.Message)"
    }
}

function Wake-AndroidDevice {
    param([string]$AdbPath)

    & $AdbPath shell input keyevent KEYCODE_WAKEUP | Out-Null
    & $AdbPath shell wm dismiss-keyguard | Out-Null
    & $AdbPath shell input keyevent 82 | Out-Null
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$recoverScript = Join-Path $PSScriptRoot "android-recover.ps1"
$env:INIT_CWD = $projectRoot
$expoCli = Join-Path $projectRoot "node_modules\expo\bin\cli"
$expoCliArg = "`"$expoCli`""
$useProxy = $Proxy -or (($Port -ne $MetroPort) -and -not $Direct)

if (-not (Test-Path $expoCli)) {
    throw "Expo CLI not found at $expoCli. Run npm install first."
}

if ($Direct -and $Proxy) {
    throw "Use either -Direct or -Proxy, not both."
}

if (-not $useProxy -and $Port -ne $MetroPort) {
    Write-Status "Direct mode uses one Metro port; normalizing MetroPort from $MetroPort to $Port"
    $MetroPort = $Port
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
$apiProxyPort = Get-LocalApiProxyPort -ProjectRoot $projectRoot
$apiProxyProcess = $null
$env:REACT_NATIVE_PACKAGER_HOSTNAME = $ManifestHost
Remove-Item Env:EXPO_PACKAGER_PROXY_URL -ErrorAction SilentlyContinue

if ($apiProxyPort) {
    $apiProxyOutLog = Join-Path $projectRoot ".logs-expo-dev-api-proxy-$apiProxyPort.out.txt"
    $apiProxyErrLog = Join-Path $projectRoot ".logs-expo-dev-api-proxy-$apiProxyPort.err.txt"
    Remove-Item $apiProxyOutLog, $apiProxyErrLog -ErrorAction SilentlyContinue

    Write-Status "Starting local API proxy on port $apiProxyPort"
    $apiProxyProcess = Start-Process `
        -FilePath "node.exe" `
        -ArgumentList @("proxy-server.js") `
        -WorkingDirectory $projectRoot `
        -RedirectStandardOutput $apiProxyOutLog `
        -RedirectStandardError $apiProxyErrLog `
        -WindowStyle Hidden `
        -PassThru

    $apiProxyUrl = "http://127.0.0.1:$apiProxyPort/api/health"
    $apiProxyReady = $false
    for ($i = 0; $i -lt 20; $i++) {
        if (Test-HttpReady -Url $apiProxyUrl) {
            $apiProxyReady = $true
            break
        }
        Start-Sleep -Seconds 1
    }

    if (-not $apiProxyReady) {
        throw "Local API proxy did not become ready at $apiProxyUrl. Check $apiProxyErrLog"
    }

    Write-Status "Local API proxy is responding at $apiProxyUrl"
}

if (-not $useProxy) {
    Write-Status "Starting Metro on port $Port for Expo dev client"
    $metroProcess = Start-Process `
        -FilePath "node.exe" `
        -ArgumentList @($expoCliArg, "start", "--dev-client", "--port", $Port, "--host", "localhost", "--clear") `
        -WorkingDirectory $projectRoot `
        -RedirectStandardOutput $metroOutLog `
        -RedirectStandardError $metroErrLog `
        -WindowStyle Hidden `
        -PassThru
} else {
    $metroListenPort = $MetroPort
    Write-Status "Starting Metro on port $MetroPort (legacy proxy mode)"
    $metroProcess = Start-Process `
        -FilePath "node.exe" `
        -ArgumentList @($expoCliArg, "start", "--dev-client", "--port", $MetroPort, "--host", "localhost", "--clear") `
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
        if (-not $useProxy) {
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
    if ($apiProxyProcess -and $apiProxyProcess.HasExited) {
        throw "API proxy process exited early (code $($apiProxyProcess.ExitCode)). Check .logs-expo-dev-api-proxy-$apiProxyPort.err.txt"
    }
}

if (-not $isListening) {
    if (-not $useProxy) {
        throw "Metro did not start listening on port $Port. Check $metroErrLog"
    } else {
        throw "Metro/proxy did not start listening on ports $MetroPort/$Port. Check .logs-expo-dev-metro-$MetroPort.err.txt and .logs-expo-dev-proxy-$Port.err.txt"
    }
}

if (-not $useProxy) {
    Write-Status "Metro is listening on port $Port"
} else {
    Write-Status "Metro is listening on $MetroPort and proxy is listening on $Port"
}
Write-Status "Metro logs: $metroOutLog"

if (-not $useProxy) {
    $manifestUrl = "http://${ManifestHost}:$Port"
    $httpReady = $false

    for ($i = 0; $i -lt 30; $i++) {
        if (Test-HttpReady -Url $manifestUrl) {
            $httpReady = $true
            break
        }
        Start-Sleep -Seconds 2
    }

    if (-not $httpReady) {
        throw "Expo dev server did not start responding at $manifestUrl. Check $metroErrLog"
    }

    # Let Expo finish its first round of initialization before the dev client asks for the project URL.
    Start-Sleep -Seconds 3
    Warm-ExpoAndroidBundle -BaseUrl $manifestUrl
    Write-Status "Expo dev server is responding at $manifestUrl"
}

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
Wake-AndroidDevice -AdbPath $adb
& $adb reverse "tcp:$Port" "tcp:$Port" | Out-Null
if ($MetroPort -ne $Port) {
    & $adb reverse "tcp:$MetroPort" "tcp:$MetroPort" | Out-Null
}
if ($apiProxyPort) {
    & $adb reverse "tcp:$apiProxyPort" "tcp:$apiProxyPort" | Out-Null
}
& $adb shell am force-stop $AppId | Out-Null

if (-not $useProxy) {
    $resolvedScheme = Get-DevClientScheme -ProjectRoot $projectRoot -ExplicitScheme $Scheme
    $devClientUrl = "${resolvedScheme}://expo-development-client/?url=$([System.Uri]::EscapeDataString($manifestUrl))"
    Write-Status "Opening Expo dev client URL $devClientUrl"
    $launchResult = & $adb shell am start -W -a android.intent.action.VIEW -d $devClientUrl $AppId 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0 -or $launchResult -match "Error:" -or $launchResult -match "unable to resolve Intent") {
        throw "Failed to open dev client URL. adb output: $launchResult"
    }
} else {
    Write-Status "Using launcher intent in proxy mode"
    & $adb shell monkey -p $AppId -c android.intent.category.LAUNCHER 1 | Out-Null
}

Write-Status "Done"
