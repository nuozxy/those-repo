@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
rem ============================================================
rem  Those · fnOS 一键出包（Windows 双击即可）
rem  参数会原样传给 fnos/build-fpk.sh，例如：
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
  echo   [错误] 没有找到 bash，需要先安装 Git for Windows。
  echo   下载：https://git-scm.com/download/win
  echo.
  pause
  exit /b 1
)

echo   使用 bash: %BASH%
echo.
"%BASH%" "%HERE%fnos\build-fpk.sh" %*
set "CODE=%ERRORLEVEL%"
echo.
if not "%CODE%"=="0" (
  echo   [失败] 退出码 %CODE%，往上翻看红字提示。
) else (
  echo   [完成] 产物在 out\ 目录。
)
pause
exit /b %CODE%
