@echo off
:: Threads 수익화 에이전트 — Windows 작업 스케줄러 등록
:: 관리자 권한으로 실행하세요

set PROJECT_DIR=%~dp0..
set TASK_NAME=ThreadsMonetizationAgent
set SCRIPT_PATH=%PROJECT_DIR%\scripts\start.bat

echo [작업 스케줄러] Threads 에이전트 자동시작 등록 중...

:: 기존 작업 삭제 (있으면)
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

:: PC 시작 시 자동 실행 등록 (로그인 후 5분 뒤)
schtasks /create ^
  /tn "%TASK_NAME%" ^
  /tr "\"%SCRIPT_PATH%\"" ^
  /sc ONLOGON ^
  /delay 0005:00 ^
  /ru "%USERNAME%" ^
  /rl HIGHEST ^
  /f

if %ERRORLEVEL% EQU 0 (
  echo [성공] '%TASK_NAME%' 작업이 등록되었습니다.
  echo PC 로그인 후 5분 뒤 자동으로 에이전트가 시작됩니다.
) else (
  echo [실패] 작업 등록에 실패했습니다. 관리자 권한으로 다시 실행하세요.
)

pause
