import { generateJSON, USE_MOCK, mockDelay } from '@/lib/claude-client'
import { execute } from '@/lib/db'

const CONTENT_CATEGORIES = [
  { name: '생활꿀팁', keywords: ['꿀팁', '생활', '주방', '정리', '절약'], coupang_category: '생활용품' },
  { name: '유머', keywords: ['웃긴', '공감', '이런거', '진짜야', '레전드'], coupang_category: '생활용품' },
  { name: '육아꿀팁', keywords: ['육아', '아기', '엄마', '아빠', '이유식'], coupang_category: '유아' },
  { name: '뷰티', keywords: ['피부', '화장품', '스킨케어', '미용', '뷰티'], coupang_category: '뷰티' },
  { name: '홈트레이닝', keywords: ['홈트', '다이어트', '운동', '스쿼트', '헬스'], coupang_category: '스포츠' },
  { name: '먹방', keywords: ['맛있는', '음식', '간식', '레시피', '요리'], coupang_category: '식품' },
]

interface DiscoveredContent {
  category: string
  hook_keywords: string[]
  trending_angle: string
  coupang_category: string
  estimated_engagement: number
}

interface DiscoveryResult {
  contents: DiscoveredContent[]
  today_trend_summary: string
}

const SYSTEM_PROMPT = `당신은 Threads 바이럴 콘텐츠 발굴 전문가입니다.

목표: 쿠팡 파트너스 제휴 링크 클릭을 유도할 수 있는 Threads 게시글 주제를 발굴합니다.

발굴 전략:
1. 현재 SNS에서 화제가 될 만한 일상/공감 콘텐츠 주제 선정
2. 해당 주제와 자연스럽게 연결될 수 있는 쿠팡 상품 카테고리 매핑
3. '광고같지 않은' 자연스러운 추천 형태로 기획
4. Threads 알고리즘에 유리한 공감/리플 유도 앵글 선택

반드시 JSON 형식으로만 응답:
{
  "contents": [
    {
      "category": "카테고리명",
      "hook_keywords": ["키워드1", "키워드2"],
      "trending_angle": "어떤 관점으로 접근할지 (예: 공감형, 꿀팁형, 비교형)",
      "coupang_category": "쿠팡 검색 카테고리",
      "estimated_engagement": 85
    }
  ],
  "today_trend_summary": "오늘의 트렌드 요약"
}`

const MOCK_RESULT: DiscoveryResult = {
  contents: [
    { category: '생활꿀팁', hook_keywords: ['주방정리', '수납'], trending_angle: '꿀팁형', coupang_category: '생활용품', estimated_engagement: 88 },
    { category: '육아꿀팁', hook_keywords: ['이유식', '아기용품'], trending_angle: '공감형', coupang_category: '유아', estimated_engagement: 92 },
    { category: '홈트레이닝', hook_keywords: ['홈트', '저항밴드'], trending_angle: '비교형', coupang_category: '스포츠', estimated_engagement: 82 },
  ],
  today_trend_summary: '여름철 생활꿀팁 + 육아 공감 콘텐츠 높은 반응',
}

export interface ContentTopic {
  category: string
  hook_keywords: string[]
  trending_angle: string
  coupang_category: string
  estimated_engagement: number
}

export async function runContentDiscoveryAgent(count = 3): Promise<ContentTopic[]> {
  if (USE_MOCK) {
    await mockDelay()
    return MOCK_RESULT.contents.slice(0, count)
  }

  const userPrompt = `오늘 Threads에서 화제가 될 만한 콘텐츠 주제 ${count}개를 발굴해주세요.

카테고리별 우선순위 (쿠팡 수수료율 기준):
${CONTENT_CATEGORIES.map(c => `- ${c.name} (${c.coupang_category})`).join('\n')}

조건:
- 광고처럼 보이지 않고 자연스럽게 제품을 언급할 수 있는 주제
- Threads 특성상 짧고 임팩트 있는 훅이 가능한 주제
- 쿠팡 파트너스 커미션이 높은 카테고리 우선 (유아 7%, 스포츠 6%, 뷰티 5%)`

  try {
    await execute(
      `UPDATE agent_states SET status = 'running', current_task = '콘텐츠 주제 발굴 중', last_run_at = datetime('now') WHERE agent_name = 'threads_discovery_agent'`
    )

    const result = await generateJSON<DiscoveryResult>(SYSTEM_PROMPT, userPrompt)
    const topics = result.contents.slice(0, count)

    await execute(
      `UPDATE agent_states SET status = 'idle', last_result = ?, total_runs = total_runs + 1, success_runs = success_runs + 1 WHERE agent_name = 'threads_discovery_agent'`,
      [JSON.stringify({ count: topics.length, summary: result.today_trend_summary })]
    )

    return topics
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await execute(
      `UPDATE agent_states SET status = 'error', last_result = ? WHERE agent_name = 'threads_discovery_agent'`,
      [msg]
    )
    // Fallback to predefined categories
    return MOCK_RESULT.contents.slice(0, count)
  }
}
