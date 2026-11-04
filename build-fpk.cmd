@echo off
setlocal enabledelayedexpansion
rem ============================================================
rem  Those / fnOS one-click build launcher (Windows)
rem  All messages kept ASCII to avoid codepage issues.
rem  Args are passed through to fnos/build-fpk.sh, e.g.:
rem      build-fpk.cmd --skip-web
rem      build-fpk.cmd --version 1.0.1
rem ============================================================
set "HERE=%~dp0"
set "BASH="

if exist "%ProgramFiles%\Git\bin\bash.exe" set "BASH=%ProgramFiles%\Git\bin\bash.exe"
if not defined BASH if exist "%ProgramFiles(x86)%\Git\bin\bash.exe" set "BASH=%ProgramFiles(x86)%\Git\bin\bash.exe"
if not defined BASH if exist "%LOCALAPPDATA%\Programs\Git\bin\bash.exe" set "BASH=%LOCALAPPDATA%\Programs\Git\bin\bash.exe"
if not defined BASH if exist "%LOCALAPPDATA%\Programs\WorkBuddy\resources\vendor\PortableGit\bin\bash.exe" set "BASH=%LOCALAPPDATA%\Programs\WorkBuddy\resources\vendor\PortableGit\bin\bash.exe"
if not defined BASH for %%i in (bash.exe) do if not "%%~$PATH:i"=="" set "BASH=%%~$PATH:i"

if not defined BASH (
  echo.
  echo   [ERROR] bash not found. Please install Git for Windows first.
  echo   Download: https://git-scm.com/download/win
  echo.
  pause
  exit /b 1
)

echo   bash: %BASH%
echo.
"%BASH%" "%HERE%fnos\build-fpk.sh" %*
set "CODE=%ERRORLEVEL%"
echo.
if not "%CODE%"=="0" (
  echo   [FAILED] exit code %CODE% - scroll up for details.
) else (
  echo   [DONE] fpk generated in the out\ folder.
)
pause
exit /b %CODE%
