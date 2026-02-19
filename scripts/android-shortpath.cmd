@echo off
setlocal EnableDelayedExpansion

set "PROJECT_DIR=%~dp0.."
for %%I in ("%PROJECT_DIR%") do set "PROJECT_DIR=%%~fI"
set "SHORT_DIR=%PUBLIC%\btp_shortlink"
set "EXPO_CLI=%PROJECT_DIR%\node_modules\expo\bin\cli"

if not exist "%EXPO_CLI%" (
  echo [android-shortpath] Expo CLI not found at "%EXPO_CLI%".
  echo [android-shortpath] Run npm install in "%PROJECT_DIR%" first.
  exit /b 1
)

set "CURRENT_TARGET="
if exist "%SHORT_DIR%" (
  for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "$item = Get-Item -LiteralPath '%SHORT_DIR%' -ErrorAction SilentlyContinue; if ($item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { $target = $item.Target; if ($target -is [Array]) { $target = $target[0] }; if ($target) { [IO.Path]::GetFullPath($target) } }"`) do set "CURRENT_TARGET=%%T"

  if /I "!CURRENT_TARGET!"=="%PROJECT_DIR%" (
    echo [android-shortpath] Using existing junction "%SHORT_DIR%"
  ) else (
    if defined CURRENT_TARGET (
      echo [android-shortpath] Resetting stale junction "%SHORT_DIR%" -^> "!CURRENT_TARGET!"
      rmdir "%SHORT_DIR%" >nul 2>&1
      if exist "%SHORT_DIR%" (
        echo [android-shortpath] Could not remove stale junction "%SHORT_DIR%".
        exit /b 1
      )
    ) else (
      echo [android-shortpath] "%SHORT_DIR%" exists and is not a junction.
      echo [android-shortpath] Remove or rename it, then run again.
      exit /b 1
    )
  )
)

if not exist "%SHORT_DIR%" (
  echo [android-shortpath] Creating junction "%SHORT_DIR%" -^> "%PROJECT_DIR%"
  mklink /J "%SHORT_DIR%" "%PROJECT_DIR%" >nul
  if errorlevel 1 (
    echo [android-shortpath] Failed to create junction at "%SHORT_DIR%".
    echo [android-shortpath] Run this once manually in an elevated terminal:
    echo mklink /J "%SHORT_DIR%" "%PROJECT_DIR%"
    exit /b 1
  )
)

pushd "%SHORT_DIR%"
if errorlevel 1 (
  echo [android-shortpath] Failed to access "%SHORT_DIR%".
  exit /b 1
)

set "INIT_CWD=%CD%"

set "HAS_PORT_FLAG=0"
for %%A in (%*) do (
  if /I "%%~A"=="--port" set "HAS_PORT_FLAG=1"
  if /I "%%~A"=="-p" set "HAS_PORT_FLAG=1"
)

if "%HAS_PORT_FLAG%"=="1" (
  call node "%EXPO_CLI%" run:android %*
) else (
  set "EXPO_PORT="
  for %%P in (8081 8082 8083 8084 8085 8086 8087 8088 8089 8090) do (
    call :is_port_in_use %%P
    if errorlevel 1 if not defined EXPO_PORT set "EXPO_PORT=%%P"
  )
  if not defined EXPO_PORT set "EXPO_PORT=8081"
  echo [android-shortpath] Using Metro port !EXPO_PORT!
  call node "%EXPO_CLI%" run:android --port !EXPO_PORT! %*
)

set "EXIT_CODE=%ERRORLEVEL%"

popd
exit /b %EXIT_CODE%

:is_port_in_use
set "PORT=%~1"
netstat -ano -p tcp | findstr /R /C:":%PORT% .*LISTENING" >nul
if errorlevel 1 (
  exit /b 1
)
exit /b 0
