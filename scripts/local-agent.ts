/**
 * Threads 수익화 — 로컬 PC 에이전트 데몬
 *
 * 역할:
 * - Discord Bot (Gateway WebSocket) 연결 — 공개 URL 불필요
 * - node-cron으로 로컬 Cron 스케줄 실행
 * - 슬래시 커맨드로 수동 제어
 * - Claude API로 콘텐츠 생성 (Gemini 폴백)
 *
 * 시작: npm run agent
 * 자동시작: start.bat → Windows 작업 스케줄러에 등록
 */

import 'dotenv/config'
import {
  Client,
  GatewayIntentBits,
  Events,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActivityType,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js'
import cron from 'node-cron'
import path from 'path'

// ── 경로 별칭 설정 (tsconfig paths) ─────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('tsconfig-paths/register')

// ── 환경변수 ─────────────────────────────────────────────────────────────────
const BOT_TOKEN        = process.env.DISCORD_BOT_TOKEN ?? ''
const CLIENT_ID        = process.env.DISCORD_CLIENT_ID ?? ''
const GUILD_ID         = process.env.DISCORD_GUILD_ID ?? ''
const THREADS_CHANNEL_ID = process.env.DISCORD_THREADS_CHANNEL_ID ?? ''  // #jh-스레드-자동화
const CRON_SECRET      = process.env.CRON_SECRET ?? ''
const DASHBOARD_URL    = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

if (!BOT_TOKEN) {
  console.error('[Agent] DISCORD_BOT_TOKEN 미설정. .env 확인 후 재시작하세요.')
  process.exit(1)
}

// ── Discord 클라이언트 ───────────────────────────────────────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
})

// ── 슬래시 커맨드 정의 ───────────────────────────────────────────────────────
const COMMANDS = [
  new SlashCommandBuilder().setName('상태').setDescription('Threads 에이전트 및 시스템 상태 조회'),
  new SlashCommandBuilder().setName('실행').setDescription('Threads 사이클 수동 실행 (게시 포함)'),
  new SlashCommandBuilder().setName('dry-run').setDescription('게시 없이 파이프라인 테스트'),
  new SlashCommandBuilder().setName('수익').setDescription('수익 현황 및 정산 요약'),
  new SlashCommandBuilder().setName('계정').setDescription('Threads 계정 현황'),
  new SlashCommandBuilder().setName('도움말').setDescription('사용 가능한 커맨드 목록'),
].map(cmd => cmd.toJSON())

// ── 커맨드 등록 함수 ─────────────────────────────────────────────────────────
async function registerCommands(): Promise<void> {
  if (!CLIENT_ID) {
    console.warn('[Agent] DISCORD_CLIENT_ID 미설정 — 커맨드 등록 건너뜀')
    return
  }
  const rest = new REST().setToken(BOT_TOKEN)
  try {
    const url = GUILD_ID
      ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
      : Routes.applicationCommands(CLIENT_ID)
    await rest.put(url, { body: COMMANDS })
    console.log(`[Agent] 슬래시 커맨드 ${COMMANDS.length}개 등록 완료 (${GUILD_ID ? 'Guild' : 'Global'})`)
  } catch (err) {
    console.error('[Agent] 커맨드 등록 실패:', err)
  }
}

// ── API 헬퍼 — 로컬 Next.js 호출 ────────────────────────────────────────────
async function callLocalApi(path: string, method = 'GET', body?: object): Promise<Response> {
  return fetch(`${DASHBOARD_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CRON_SECRET}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

// ── 임베드 빌더 헬퍼 ────────────────────────────────────────────────────────
function embed(title: string, color: number): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: `Threads 수익화 · ${new Date().toLocaleString('ko-KR')}` })
}

const COLOR = {
  blue:   0x5865f2,
  green:  0x57f287,
  yellow: 0xfee75c,
  red:    0xed4245,
  purple: 0x9b59b6,
} as const

// ── 채널로 메시지 전송 ───────────────────────────────────────────────────────
async function sendToChannel(channelId: string, embeds: EmbedBuilder[]): Promise<void> {
  if (!channelId) return
  try {
    const channel = await client.channels.fetch(channelId)
    if (channel?.isTextBased()) {
      await (channel as import('discord.js').TextChannel).send({ embeds })
    }
  } catch (err) {
    console.error('[Agent] 채널 전송 실패:', err)
  }
}

// ── Threads 사이클 실행 ──────────────────────────────────────────────────────
async function runCycle(dryRun = false): Promise<object> {
  const res = await callLocalApi('/api/cron/threads-daily', 'POST', {
    dry_run: dryRun,
    topic_count: 3,
  })
  if (!res.ok) throw new Error(`API 오류 ${res.status}: ${await res.text()}`)
  return res.json()
}

// ── 상태 조회 ────────────────────────────────────────────────────────────────
async function getStatus(): Promise<object> {
  const res = await callLocalApi('/api/diagnostics')
  return res.json()
}

// ── 수익 조회 ────────────────────────────────────────────────────────────────
async function getRevenue(): Promise<object> {
  const [payoutRes, taxRes] = await Promise.all([
    callLocalApi('/api/revenue/payout').then(r => r.json()),
    callLocalApi('/api/revenue/tax-summary').then(r => r.json()),
  ])
  return { payout: payoutRes, tax: taxRes }
}

// ── 계정 조회 ────────────────────────────────────────────────────────────────
async function getAccounts(): Promise<object[]> {
  const res = await callLocalApi('/api/threads/accounts')
  const data = await res.json() as { accounts?: object[] }
  return data.accounts ?? []
}

// ── 슬래시 커맨드 핸들러 ────────────────────────────────────────────────────
async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const cmd = interaction.commandName

  if (cmd === '상태') {
    await interaction.deferReply()
    const status = await getStatus() as Record<string, unknown>
    await interaction.editReply({
      embeds: [
        embed('📊 시스템 상태', COLOR.blue)
          .addFields(
            { name: '환경', value: String(status.environment ?? '-'), inline: true },
            { name: 'Mock 모드', value: status.mock_mode ? '✅ ON' : '❌ OFF', inline: true },
            { name: 'Threads 설정', value: status.threads_configured ? '✅' : '❌ 미설정', inline: true },
            { name: 'Gemini', value: status.gemini_configured ? '✅' : '❌', inline: true },
            { name: '쿠팡 API', value: status.coupang_configured ? '✅' : '❌', inline: true },
            { name: 'DB', value: status.turso_configured ? '☁️ Turso' : '💾 로컬', inline: true },
          )
          .setDescription(`대시보드: [${DASHBOARD_URL}](${DASHBOARD_URL})`)
      ],
    })
  }

  else if (cmd === '실행') {
    await interaction.deferReply()
    try {
      const result = await runCycle(false) as Record<string, unknown>
      const r = result as { result?: Record<string, unknown> }
      const data = r.result ?? result
      await interaction.editReply({
        embeds: [
          embed('✅ Threads 사이클 완료', COLOR.green)
            .addFields(
              { name: '주제 발굴', value: String(data.topics_found ?? 0), inline: true },
              { name: '상품 매칭', value: String(data.products_matched ?? 0), inline: true },
              { name: '콘텐츠 생성', value: String(data.posts_generated ?? 0), inline: true },
              { name: '게시 완료', value: String(data.posts_published ?? 0), inline: true },
            )
        ],
      })
      await sendToChannel(THREADS_CHANNEL_ID, [
        embed('🔄 자동 사이클 실행됨', COLOR.blue)
          .setDescription(`사용자 수동 실행\n게시: ${data.posts_published ?? 0}건`)
      ])
    } catch (err) {
      await interaction.editReply(`❌ 실행 실패: ${String(err).slice(0, 200)}`)
      await sendToChannel(THREADS_CHANNEL_ID, [
        embed('🚨 사이클 실행 오류', COLOR.red).setDescription(String(err))
      ])
    }
  }

  else if (cmd === 'dry-run') {
    await interaction.deferReply()
    try {
      const result = await runCycle(true) as Record<string, unknown>
      const r = result as { result?: Record<string, unknown> }
      const data = r.result ?? result
      await interaction.editReply({
        embeds: [
          embed('🧪 Dry-Run 완료 (게시 없음)', COLOR.yellow)
            .addFields(
              { name: '주제 발굴', value: String(data.topics_found ?? 0), inline: true },
              { name: '상품 매칭', value: String(data.products_matched ?? 0), inline: true },
              { name: '콘텐츠 생성', value: String(data.posts_generated ?? 0), inline: true },
              { name: '실제 게시', value: '0 (dry-run)', inline: true },
            )
            .setDescription('실제 Threads 게시는 하지 않았습니다.')
        ],
      })
    } catch (err) {
      await interaction.editReply(`❌ Dry-run 실패: ${String(err).slice(0, 200)}`)
    }
  }

  else if (cmd === '수익') {
    await interaction.deferReply()
    const rev = await getRevenue() as {
      payout: { summary: { total_gross: number; total_net: number; total_tax_withheld: number } }
      tax: { current_year: number; estimated_annual_gross: number; tax_info: { filing_deadline: string } }
    }
    await interaction.editReply({
      embeds: [
        embed('💰 수익 현황', COLOR.yellow)
          .addFields(
            { name: `${rev.tax.current_year}년 예상 총수입`, value: `₩${(rev.tax.estimated_annual_gross ?? 0).toLocaleString()}`, inline: true },
            { name: '정산 실수령 합계', value: `₩${(rev.payout.summary?.total_net ?? 0).toLocaleString()}`, inline: true },
            { name: '원천징수 합계', value: `₩${(rev.payout.summary?.total_tax_withheld ?? 0).toLocaleString()}`, inline: true },
            { name: '세금신고 기한', value: rev.tax.tax_info?.filing_deadline ?? '-', inline: true },
          )
          .setDescription(`자세히 보기: [수익 대시보드](${DASHBOARD_URL}/revenue)`)
      ],
    })
  }

  else if (cmd === '계정') {
    await interaction.deferReply()
    const accounts = await getAccounts() as Array<{ username: string; daily_post_count: number; is_active: number }>
    const active = accounts.filter(a => a.is_active === 1)
    await interaction.editReply({
      embeds: [
        embed('👤 Threads 계정 현황', COLOR.purple)
          .setDescription(
            active.length === 0
              ? '등록된 계정이 없습니다.\n`POST /api/threads/accounts`로 계정을 등록하세요.'
              : active.slice(0, 10).map((a, i) =>
                  `**${i + 1}.** @${a.username} — 오늘 ${a.daily_post_count}회 게시`
                ).join('\n')
          )
          .addFields({ name: '활성 계정', value: `${active.length}개`, inline: true })
      ],
    })
  }

  else if (cmd === '도움말') {
    await interaction.reply({
      embeds: [
        embed('❓ 커맨드 목록', COLOR.blue)
          .addFields(
            { name: '/상태', value: '시스템 및 환경변수 설정 현황' },
            { name: '/실행', value: '🚀 Threads 사이클 즉시 실행 (실제 게시)' },
            { name: '/dry-run', value: '🧪 게시 없이 파이프라인 테스트' },
            { name: '/수익', value: '💰 정산 내역 및 세금 현황' },
            { name: '/계정', value: '👤 Threads 계정 목록 및 일일 게시 현황' },
            { name: '/도움말', value: '이 메시지' },
          )
          .setDescription(`대시보드: [${DASHBOARD_URL}](${DASHBOARD_URL})`)
      ],
    })
  }
}

// ── Cron: 일일 자동 실행 (KST 10:00 = UTC 01:00) ─────────────────────────────
cron.schedule('0 1 * * *', async () => {
  console.log('[Cron] KST 10:00 — Threads 사이클 시작')
  try {
    const result = await runCycle(false) as { result?: Record<string, unknown> }
    const data = result.result ?? result as Record<string, unknown>
    await sendToChannel(THREADS_CHANNEL_ID, [
      embed('🌅 KST 10:00 자동 실행 완료', COLOR.green)
        .addFields(
          { name: '게시 완료', value: String(data.posts_published ?? 0), inline: true },
          { name: '콘텐츠 생성', value: String(data.posts_generated ?? 0), inline: true },
        )
    ])
  } catch (err) {
    console.error('[Cron] 오전 사이클 실패:', err)
    await sendToChannel(THREADS_CHANNEL_ID, [
      embed('🚨 오전 사이클 실패', COLOR.red).setDescription(String(err))
    ])
  }
}, { timezone: 'UTC' })

// ── Cron: 일일 자동 실행 (KST 21:00 = UTC 12:00) ─────────────────────────────
cron.schedule('0 12 * * *', async () => {
  console.log('[Cron] KST 21:00 — Threads 사이클 시작')
  try {
    const result = await runCycle(false) as { result?: Record<string, unknown> }
    const data = result.result ?? result as Record<string, unknown>
    await sendToChannel(THREADS_CHANNEL_ID, [
      embed('🌙 KST 21:00 자동 실행 완료', COLOR.green)
        .addFields(
          { name: '게시 완료', value: String(data.posts_published ?? 0), inline: true },
          { name: '콘텐츠 생성', value: String(data.posts_generated ?? 0), inline: true },
        )
    ])
  } catch (err) {
    console.error('[Cron] 저녁 사이클 실패:', err)
    await sendToChannel(THREADS_CHANNEL_ID, [
      embed('🚨 저녁 사이클 실패', COLOR.red).setDescription(String(err))
    ])
  }
}, { timezone: 'UTC' })

// ── Cron: 일일 수익 리포트 (KST 09:00 = UTC 00:00) ───────────────────────────
cron.schedule('0 0 * * *', async () => {
  console.log('[Cron] 일일 수익 리포트 전송')
  try {
    const rev = await getRevenue() as {
      payout: { summary: { total_gross: number; total_net: number } }
      tax: { current_year: number; estimated_annual_gross: number }
    }
    await sendToChannel(THREADS_CHANNEL_ID, [
      embed(`📈 ${new Date().toLocaleDateString('ko-KR')} 수익 리포트`, COLOR.yellow)
        .addFields(
          { name: `${rev.tax.current_year}년 예상 총수입`, value: `₩${(rev.tax.estimated_annual_gross ?? 0).toLocaleString()}`, inline: true },
          { name: '누적 실수령', value: `₩${(rev.payout.summary?.total_net ?? 0).toLocaleString()}`, inline: true },
        )
        .setDescription(`[대시보드에서 자세히 보기](${DASHBOARD_URL}/revenue)`)
    ])
  } catch (err) {
    console.error('[Cron] 수익 리포트 실패:', err)
  }
}, { timezone: 'UTC' })

// ── Discord 이벤트 ───────────────────────────────────────────────────────────
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`[Agent] ✅ Discord Bot 연결: ${readyClient.user.tag}`)
  readyClient.user.setPresence({
    activities: [{ name: 'Threads 수익화 자동화', type: ActivityType.Watching }],
    status: 'online',
  })
  await registerCommands()

  // 시작 알림
  if (THREADS_CHANNEL_ID) {
    await sendToChannel(THREADS_CHANNEL_ID, [
      embed('🚀 에이전트 데몬 시작', COLOR.green)
        .setDescription('Threads 수익화 로컬 에이전트가 시작됐습니다.')
        .addFields(
          { name: 'Cron 스케줄', value: 'KST 10:00 / 21:00 자동 실행', inline: true },
          { name: '대시보드', value: `[${DASHBOARD_URL}](${DASHBOARD_URL})`, inline: true },
        )
    ])
  }
})

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return
  try {
    await handleCommand(interaction)
  } catch (err) {
    console.error('[Agent] 커맨드 처리 실패:', err)
    const msg = `❌ 처리 중 오류: ${String(err).slice(0, 200)}`
    if (interaction.deferred) {
      await interaction.editReply(msg).catch(() => undefined)
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => undefined)
    }
  }
})

client.on(Events.Error, (err) => {
  console.error('[Agent] Discord 오류:', err)
})

// ── 시작 ─────────────────────────────────────────────────────────────────────
console.log('[Agent] Threads 수익화 로컬 에이전트 시작 중...')
client.login(BOT_TOKEN)
