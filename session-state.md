# Session State — ai-site-automation (쓰레드 수익화)

**마지막 세션**: 2026-06-19  
**PC**: 사무실 PC (whoami=설계4)  
**GitHub**: https://github.com/jaeha81/ai-site-automation  
**로컬 경로**: `C:\ai프로젝트\threads-monetization`

---

## 완료된 것 (커밋: 42c618f)

### 1. dry_run 검증 ✅
- USE_MOCK_DATA=true, 로컬 SQLite 사용
- `/api/cron/threads-daily` dry_run → 200 OK

### 2. 수익 관리 시스템 ✅
- `src/app/api/revenue/payout/route.ts` — 정산 내역 GET/POST
- `src/app/api/revenue/tax-summary/route.ts` — 연간 세금 현황
- `src/app/api/revenue/bank-account/route.ts` — 계좌 등록/조회/삭제
- DB 테이블: bank_accounts, payout_records, income_tracker
- 대시보드 4탭: 개요/정산 내역/세금 현황/계좌 관리

### 3. 로컬 PC Discord 에이전트 ✅
- `scripts/local-agent.ts` — 단일 채널(DISCORD_THREADS_CHANNEL_ID) 방식
  - 슬래시 커맨드: /상태 /실행 /dry-run /수익 /계정 /도움말
  - Cron KST 10:00 / 21:00 자동 실행
- `scripts/setup-discord.ts` — 기존 Obsidian Brain System 봇에 커맨드 등록
- `scripts/start.bat` — 원클릭 시작
- `scripts/register-task-scheduler.bat` — Windows 작업 스케줄러 등록

---

## 집 PC에서 해야 할 것 (우선순위)

### P1 — Vercel 배포 (사무실 PC 디스크 부족으로 미완료)
```powershell
cd C:\ai프로젝트\threads-monetization   # 또는 집 PC 경로
npm install -g vercel
vercel login
vercel --prod
```
> Vercel 환경변수 설정 필요:
> - GEMINI_API_KEY, COUPANG_ACCESS_KEY, COUPANG_SECRET_KEY, COUPANG_CHANNEL_ID
> - CRON_SECRET (32자 랜덤값)
> - USE_MOCK_DATA=false (운영 시)

### P2 — Discord 채널 생성 + 봇 연결
1. 기존 Discord 서버 → `#jh-스레드-자동화` 채널 생성
2. 채널 우클릭 → ID 복사 (개발자 모드 필요)
3. Obsidian Brain System 봇 토큰 확인 (G:\내 드라이브\obsidian-agent-brain-system\.env)
4. `.env` 입력:
   ```
   DISCORD_BOT_TOKEN=<기존 봇 토큰>
   DISCORD_CLIENT_ID=<앱 CLIENT_ID>
   DISCORD_GUILD_ID=<서버 ID>
   DISCORD_THREADS_CHANNEL_ID=<채널 ID>
   ```
5. `npm run discord:setup` → 슬래시 커맨드 등록
6. `npm run agent` → 봇 온라인 확인
7. `#jh-스레드-자동화`에서 `/dry-run` 테스트

### P3 — Meta Threads API 연동
1. Meta 개발자 콘솔 → Threads API 앱 등록
2. `.env` THREADS_APP_SECRET 설정
3. `POST /api/threads/accounts` 계정 등록
4. USE_MOCK_DATA=false 전환

### P4 — Windows 자동시작 (집 PC)
```
scripts/register-task-scheduler.bat  관리자 권한 실행
```

---

## 기술 스택

| 항목 | 값 |
|------|-----|
| Framework | Next.js 14.2.35 + TypeScript |
| DB | LibSQL/Turso (로컬: SQLite data/shorts.db) |
| AI | Google Gemini 2.5 Flash + Anthropic Claude |
| Threads API | Meta Graph API (graph.threads.net/v1.0) |
| Discord | discord.js v14 (단일 채널: #jh-스레드-자동화) |
| 쿠팡 | Partners API HMAC-SHA256 + 3.3% 원천징수 |

## 환경변수 현황

| 변수 | 상태 |
|------|------|
| TURSO_DATABASE_URL | 주석처리 → 로컬 SQLite |
| GEMINI_API_KEY | 설정됨 |
| COUPANG_ACCESS_KEY | 설정됨 |
| THREADS_APP_SECRET | ❌ 미설정 |
| DISCORD_BOT_TOKEN | ❌ 미설정 (집 PC에서 Obsidian Brain System 봇 토큰 입력) |
| DISCORD_CLIENT_ID | ❌ 미설정 |
| DISCORD_GUILD_ID | ❌ 미설정 |
| DISCORD_THREADS_CHANNEL_ID | ❌ 미설정 (#jh-스레드-자동화 생성 후 입력) |
| CRON_SECRET | your-random-secret-32chars (변경 필요) |
| USE_MOCK_DATA | true |

## Git 상태
- Branch: master
- 마지막 커밋: 42c618f
- Remote: https://github.com/jaeha81/ai-site-automation.git
