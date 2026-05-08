param(
    [string]$AvdName = "BTTP_Emulator",
    [int]$BootTimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"

function Write-Status {
    param([string]$Message)
    Write-Output "[android:emulator] $Message"
}

function Get-AdbPath {
    $cmd = Get-Command adb -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Path) {
        return $cmd.Path
    }

    $candidate = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
    if (Test-Path $candidate) {
        return $candidate
    }

    return $null
}

function Get-EmulatorPath {
    $cmd = Get-Command emulator -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Path) {
        return $cmd.Path
    }

    $candidate = "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe"
    if (Test-Path $candidate) {
        return $candidate
    }

    return $null
}

function Get-ReadyDevice {
    param([string]$AdbPath)

    $lines = & $AdbPath devices 2>$null
    foreach ($line in $lines) {
        if ($line -match "^(emulator-\d+)\s+device\b") {
            return $Matches[1]
        }
    }

    return $null
}

function Invoke-AdbText {
    param(
        [string]$AdbPath,
        [string[]]$Arguments
    )

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = & $AdbPath @Arguments 2>$null
        if ($LASTEXITCODE -ne 0) {
            return $null
        }

        return ($output | Out-String).Trim()
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}

$adb = Get-AdbPath
if (-not $adb) {
    throw "adb not found. Install Android platform-tools or add adb to PATH."
}

$emulator = Get-EmulatorPath
if (-not $emulator) {
    throw "Android emulator not found. Install Android Studio emulator tools."
}

& $adb start-server | Out-Null
$existingDevice = Get-ReadyDevice -AdbPath $adb
if ($existingDevice) {
    Write-Status "Using already-running emulator $existingDevice"
} else {
    Write-Status "Starting AVD $AvdName"
    Start-Process -FilePath $emulator -ArgumentList @("-avd", $AvdName) -WorkingDirectory (Split-Path $emulator)
}

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$serial = $existingDevice
while (-not $serial -and $stopwatch.Elapsed.TotalSeconds -lt $BootTimeoutSeconds) {
    Start-Sleep -Seconds 2
    $serial = Get-ReadyDevice -AdbPath $adb
}

if (-not $serial) {
    throw "No ready emulator appeared within $BootTimeoutSeconds seconds."
}

Write-Status "Waiting for Android boot on $serial"
while ($stopwatch.Elapsed.TotalSeconds -lt $BootTimeoutSeconds) {
    $bootCompleted = Invoke-AdbText -AdbPath $adb -Arguments @("-s", $serial, "shell", "getprop", "sys.boot_completed")
    $bootAnim = Invoke-AdbText -AdbPath $adb -Arguments @("-s", $serial, "shell", "getprop", "init.svc.bootanim")

    if ($bootCompleted -eq "1" -and $bootAnim -eq "stopped") {
        break
    }

    Start-Sleep -Seconds 2
}

if ($stopwatch.Elapsed.TotalSeconds -ge $BootTimeoutSeconds) {
    throw "Emulator $serial did not finish booting within $BootTimeoutSeconds seconds."
}

Invoke-AdbText -AdbPath $adb -Arguments @("-s", $serial, "shell", "input", "keyevent", "KEYCODE_WAKEUP") | Out-Null
Invoke-AdbText -AdbPath $adb -Arguments @("-s", $serial, "shell", "wm", "dismiss-keyguard") | Out-Null
Invoke-AdbText -AdbPath $adb -Arguments @("-s", $serial, "shell", "settings", "put", "global", "window_animation_scale", "0") | Out-Null
Invoke-AdbText -AdbPath $adb -Arguments @("-s", $serial, "shell", "settings", "put", "global", "transition_animation_scale", "0") | Out-Null
Invoke-AdbText -AdbPath $adb -Arguments @("-s", $serial, "shell", "settings", "put", "global", "animator_duration_scale", "0") | Out-Null

Write-Status "Ready: $serial booted in $([Math]::Round($stopwatch.Elapsed.TotalSeconds, 1))s"
