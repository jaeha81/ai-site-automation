/**
 * Discord 슬래시 커맨드 등록 스크립트
 * 최초 1회 또는 커맨드 변경 시 실행: npm run discord:setup
 *
 * ⚠️ 신규 앱 생성 불필요 — 기존 Obsidian Brain System 봇에 커맨드 추가
 * .env에 기존 봇의 DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID 입력
 * 채널: 기존 서버에 '#jh-스레드-자동화' 채널 생성 후 ID → DISCORD_THREADS_CHANNEL_ID
 */

import 'dotenv/config'
import { REST, Routes, SlashCommandBuilder } from 'discord.js'

const TOKEN     = process.env.DISCORD_BOT_TOKEN ?? ''
const CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? ''
const GUILD_ID  = process.env.DISCORD_GUILD_ID ?? ''

if (!TOKEN || !CLIENT_ID) {
  console.error('DISCORD_BOT_TOKEN 또는 DISCORD_CLIENT_ID가 설정되지 않았습니다.')
  process.exit(1)
}

const COMMANDS = [
  new SlashCommandBuilder().setName('상태').setDescription('시스템 및 에이전트 상태 조회'),
  new SlashCommandBuilder().setName('실행').setDescription('Threads 사이클 즉시 실행 (실제 게시)'),
  new SlashCommandBuilder().setName('dry-run').setDescription('게시 없이 파이프라인 테스트'),
  new SlashCommandBuilder().setName('수익').setDescription('정산 현황 및 세금 요약'),
  new SlashCommandBuilder().setName('계정').setDescription('Threads 계정 목록 조회'),
  new SlashCommandBuilder().setName('도움말').setDescription('커맨드 사용법'),
].map(cmd => cmd.toJSON())

async function main() {
  const rest = new REST().setToken(TOKEN)
  const url = GUILD_ID
    ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)  // 즉시 반영
    : Routes.applicationCommands(CLIENT_ID)                  // 전역 (최대 1시간)

  console.log(`슬래시 커맨드 ${COMMANDS.length}개 등록 중...`)
  const result = await rest.put(url, { body: COMMANDS }) as unknown[]
  console.log(`✅ 등록 완료: ${result.length}개 커맨드 (${GUILD_ID ? 'Guild-scoped' : 'Global'})`)
  console.log('등록된 커맨드:', COMMANDS.map(c => `/${c.name}`).join(', '))
}

main().catch(err => {
  console.error('등록 실패:', err)
  process.exit(1)
})
