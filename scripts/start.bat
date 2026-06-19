@echo off
title Threads 수익화 에이전트
echo [시작] Threads 수익화 로컬 에이전트 + 대시보드 실행 중...

:: 프로젝트 경로로 이동
cd /d "%~dp0.."

:: 대시보드 (Next.js) 백그라운드 실행
start "Threads Dashboard" cmd /c "npm run dev"

:: 2초 대기 후 에이전트 데몬 실행
timeout /t 2 /nobreak >nul
echo [Agent] Discord 봇 + Cron 데몬 시작...
npm run agent

pause
